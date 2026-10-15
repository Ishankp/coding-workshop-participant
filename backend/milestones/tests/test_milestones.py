"""
Unit tests for the milestones service: service rules and handler routing.

The repository is replaced with an in-memory fake, so no database is needed.
Run from backend/milestones (after ./bin/sync-shared.sh):  python3 -m pytest tests -q
"""

import json
import os
import sys
from datetime import date, datetime
from decimal import Decimal

import pytest

os.environ.setdefault("IS_LOCAL", "true")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=wrong-import-position
import function
from controller import MilestoneController
from service import MilestoneService
from shared import tokens
from shared.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from shared.http_utils import Router
from shared.tokens import CurrentUser

MEMBER = CurrentUser(id=10, role="employee")
OUTSIDER = CurrentUser(id=99, role="manager")
ADMIN = CurrentUser(id=1, role="admin")
MILESTONE = {"id": 5, "project_id": 2, "title": "Migration", "description": "Move data",
             "start_date": None, "end_date": None, "completed_at": None,
             "archived_at": None, "project_archived_at": None,
             "project_start_date": date(2026, 9, 1), "project_end_date": date(2027, 3, 31)}
MANAGER = CurrentUser(id=10, role="manager")   # same person as MEMBER, as a manager


def entry_row(eid, work_date, hours, note, employee, created_by, cb):
    first, last, username, user_id = employee
    cb_first, cb_last, cb_username, cb_role = cb
    return {"id": eid, "work_date": work_date, "hours": Decimal(hours), "note": note,
            "created_at": datetime(2026, 10, 14, 9, 0, eid), "created_by_user_id": created_by,
            "employee_id": {"sofia": 5, "kenji": 6}[username], "employee_user_id": user_id,
            "first_name": first, "last_name": last, "username": username,
            "cb_first_name": cb_first, "cb_last_name": cb_last, "cb_username": cb_username, "cb_role": cb_role}


SOFIA = ("Sofia", "Rossi", "sofia", 6)
KENJI = ("Kenji", "Tanaka", "kenji", 7)
DAVID_LOGGER = ("David", "Chen", "david", "manager")
ENTRY_ROWS = [
    entry_row(31, date(2026, 10, 12), "6.5", None, SOFIA, 6, ("Sofia", "Rossi", "sofia", "employee")),
    entry_row(28, date(2026, 10, 7), "5", "Mapped orders", KENJI, 7, ("Kenji", "Tanaka", "kenji", "employee")),
    entry_row(30, date(2026, 10, 5), "8", None, SOFIA, 3, DAVID_LOGGER),
]


class FakeMilestoneRepository:
    """In-memory stand-in for MilestoneRepository."""

    def __init__(self):
        self.milestone = dict(MILESTONE)
        self.entries = 3
        self.deleted = False

    def find_milestone_by_id(self, milestone_id):
        return dict(self.milestone) if milestone_id == 5 else None

    def set_archived(self, milestone_id, archived):
        self.milestone["archived_at"] = datetime(2026, 10, 14) if archived else None
        return {"id": 5, "title": "Migration", "archived_at": self.milestone["archived_at"]}

    def count_time_entries(self, milestone_id):
        return self.entries

    def delete_milestone(self, milestone_id):
        if milestone_id != 5 or self.deleted:
            return False
        self.deleted = True
        return True

    def set_completed(self, milestone_id, completed):
        self.milestone["completed_at"] = datetime(2026, 10, 14, 15) if completed else None
        return {"id": 5, "title": "Migration", "completed_at": self.milestone["completed_at"]}

    def update_milestone(self, milestone_id, title, description, start_date, end_date):
        self.milestone.update({"title": title, "description": description, "start_date": start_date, "end_date": end_date})
        return dict(self.milestone)

    def is_project_member(self, project_id, user_id):
        return project_id == 2 and user_id == MEMBER.id

    def find_project_dependencies(self, project_id):
        return []

    def find_time_entries(self, milestone_id):
        return [dict(r) for r in ENTRY_ROWS] if milestone_id == 5 else []


@pytest.fixture(name="repo")
def fixture_repo():
    return FakeMilestoneRepository()


@pytest.fixture(name="service")
def fixture_service(repo):
    return MilestoneService(repo)


# Deleting (admins only)

def test_admin_deletes_milestone_without_hours(service, repo):
    repo.entries = 0
    service.delete_milestone(ADMIN, 5)
    assert repo.deleted


def test_delete_milestone_refused_while_hours_are_logged(service, repo):
    with pytest.raises(ConflictError, match="3 time entries logged on it; archive it instead"):
        service.delete_milestone(ADMIN, 5)
    assert not repo.deleted


@pytest.mark.parametrize("user", [MANAGER, MEMBER])
def test_only_admins_delete_milestones(service, repo, user):
    repo.entries = 0
    with pytest.raises(ForbiddenError):
        service.delete_milestone(user, 5)
    assert not repo.deleted


# Completing

def test_manager_completes_and_reopens(service, repo):
    assert service.set_completed(MANAGER, 5, True)["completedAt"] == datetime(2026, 10, 14, 15)
    assert repo.milestone["completed_at"] is not None
    assert service.set_completed(MANAGER, 5, False)["completedAt"] is None


def test_completing_archived_milestone_is_refused(service, repo):
    repo.milestone["archived_at"] = datetime(2026, 10, 1)
    with pytest.raises(ConflictError, match="restore it before"):
        service.set_completed(MANAGER, 5, True)


@pytest.mark.parametrize("user", [MEMBER, OUTSIDER])
def test_employees_and_non_members_cannot_complete(service, repo, user):
    with pytest.raises(ForbiddenError):
        service.set_completed(user, 5, True)
    assert repo.milestone["completed_at"] is None


# Editing

def test_manager_edits_milestone(service, repo):
    result = service.update_milestone(MANAGER, 5, "Migration v2", None, date(2026, 10, 1), date(2026, 12, 1))
    assert result["name"] == "Migration v2" and result["startDate"] == date(2026, 10, 1)
    assert repo.milestone["description"] is None


def test_edit_keeps_milestone_inside_project(service):
    with pytest.raises(ValidationError) as exc:
        service.update_milestone(MANAGER, 5, "Migration", None, date(2026, 8, 1), date(2027, 4, 30))
    assert set(exc.value.fields) == {"startDate", "endDate"}


def test_edit_cannot_start_before_a_prerequisite(service, repo):
    repo.find_project_dependencies = lambda project_id: [{
        "milestone_id": 5, "milestone_name": "Migration", "milestone_start_date": None,
        "depends_on_milestone_id": 4, "depends_on_name": "Mapping", "depends_on_start_date": date(2026, 10, 1),
        "depends_on_end_date": date(2026, 11, 30), "depends_on_completed_at": None}]
    with pytest.raises(ValidationError) as exc:
        service.update_milestone(MANAGER, 5, "Migration", None, date(2026, 9, 15), None)
    assert exc.value.fields == {"startDate": "Can't start before Mapping (2026-10-01), which it depends on"}


def test_edit_cannot_leave_a_dependent_starting_earlier(service, repo):
    repo.find_project_dependencies = lambda project_id: [{
        "milestone_id": 9, "milestone_name": "Cutover", "milestone_start_date": date(2026, 12, 1),
        "depends_on_milestone_id": 5, "depends_on_name": "Migration", "depends_on_start_date": None,
        "depends_on_end_date": None, "depends_on_completed_at": None}]
    with pytest.raises(ValidationError) as exc:
        service.update_milestone(MANAGER, 5, "Migration", None, date(2026, 12, 15), None)
    assert exc.value.fields == {"startDate": "Cutover depends on this milestone and starts on 2026-12-01"}


def test_employee_cannot_edit_milestone(service):
    with pytest.raises(ForbiddenError):
        service.update_milestone(MEMBER, 5, "X", None, None, None)


# Archiving

def test_manager_archives_and_employee_loses_access(service, repo):
    assert service.set_archived(MANAGER, 5, True)["archivedAt"] == datetime(2026, 10, 14)
    with pytest.raises(ForbiddenError, match="archived"):
        service.get_milestone(MEMBER, 5)
    assert service.get_milestone(MANAGER, 5)["archivedAt"] is not None
    assert service.get_milestone(ADMIN, 5)["name"] == "Migration"
    assert service.set_archived(MANAGER, 5, False)["archivedAt"] is None
    assert service.get_milestone(MEMBER, 5)["archivedAt"] is None


def test_milestone_of_archived_project_hidden_from_employees(service, repo):
    repo.milestone["project_archived_at"] = datetime(2026, 9, 1)
    with pytest.raises(ForbiddenError, match="archived"):
        service.get_milestone(MEMBER, 5)
    assert service.get_milestone(MANAGER, 5)["projectArchivedAt"] is not None


@pytest.mark.parametrize("user", [MEMBER, OUTSIDER])
def test_employees_and_non_members_cannot_archive(service, repo, user):
    with pytest.raises(ForbiddenError):
        service.set_archived(user, 5, True)
    assert repo.milestone["archived_at"] is None


def test_member_gets_milestone_with_project_id(service):
    milestone = service.get_milestone(MEMBER, 5)
    assert milestone["milestoneId"] == 5 and milestone["projectId"] == 2 and milestone["name"] == "Migration"
    assert milestone["completedAt"] is None
    assert milestone["dependsOn"] == [] and milestone["requiredBy"] == []


def test_milestone_work_log_lists_everyones_entries_with_totals(service):
    milestone = service.get_milestone(MEMBER, 5)
    assert milestone["totalHours"] == Decimal("19.5")
    assert [(p["name"], p["hours"]) for p in milestone["hoursByEmployee"]] == [
        ("Sofia Rossi", Decimal("14.5")), ("Kenji Tanaka", Decimal("5")),
    ]
    assert [(e["workDate"], e["employee"]["name"], e["hours"], e["note"]) for e in milestone["entries"]] == [
        (date(2026, 10, 12), "Sofia Rossi", Decimal("6.5"), None),
        (date(2026, 10, 7), "Kenji Tanaka", Decimal("5"), "Mapped orders"),
        (date(2026, 10, 5), "Sofia Rossi", Decimal("8"), None),
    ]
    manager_logged = milestone["entries"][2]
    assert manager_logged["loggedBySelf"] is False and manager_logged["loggedBy"]["role"] == "manager"
    assert milestone["entries"][0]["loggedBySelf"] is True


def test_milestone_without_entries_has_empty_work_log(service):
    service_repo = FakeMilestoneRepository()
    service_repo.find_time_entries = lambda milestone_id: []
    milestone = MilestoneService(service_repo).get_milestone(MEMBER, 5)
    assert milestone["totalHours"] == 0 and milestone["hoursByEmployee"] == [] and milestone["entries"] == []


def test_missing_milestone_is_404(service):
    with pytest.raises(NotFoundError):
        service.get_milestone(MEMBER, 404)


def test_admin_sees_any_milestone(service):
    assert service.get_milestone(ADMIN, 5)["milestoneId"] == 5


def test_admin_still_gets_404(service):
    with pytest.raises(NotFoundError):
        service.get_milestone(ADMIN, 404)


def test_non_member_of_its_project_is_403(service):
    with pytest.raises(ForbiddenError):
        service.get_milestone(OUTSIDER, 5)


@pytest.fixture(name="handler")
def fixture_handler(monkeypatch, service):
    router = Router()
    controller = MilestoneController(service)
    router.add("GET", "/{milestone_id}", controller.get_milestone)
    router.add("PUT", "/{milestone_id}", controller.update_milestone)
    router.add("DELETE", "/{milestone_id}", controller.delete_milestone)
    router.add("POST", "/{milestone_id}/complete", controller.complete_milestone)
    router.add("POST", "/{milestone_id}/reopen", controller.reopen_milestone)
    router.add("POST", "/{milestone_id}/archive", controller.archive_milestone)
    router.add("POST", "/{milestone_id}/unarchive", controller.unarchive_milestone)
    monkeypatch.setattr(function, "router", router)
    return function.handler


def get(path, user=None, method="GET"):
    headers = {"Authorization": f"Bearer {tokens.create_token(user.id, user.role)}"} if user else {}
    return {"rawPath": path, "requestContext": {"http": {"method": method}}, "headers": headers}


@pytest.mark.parametrize("event,status", [
    (get("/api/milestones/5", MEMBER), 200),
    (get("/5"), 401),
    (get("/5", OUTSIDER), 403),
    (get("/5", ADMIN), 200),
    (get("/404", MEMBER), 404),
    (get("/x", MEMBER), 400),
    (get("/", MEMBER), 404),
    (get("/5/archive", MANAGER, "POST"), 200),
    (get("/5/archive", MEMBER, "POST"), 403),
    (get("/404/unarchive", ADMIN, "POST"), 404),
    (get("/5/complete", MANAGER, "POST"), 200),
    (get("/5/reopen", MANAGER, "POST"), 200),
    (get("/5/complete", MEMBER, "POST"), 403),
    (get("/5", MANAGER, "DELETE"), 403),
    (get("/5", ADMIN, "DELETE"), 409),
])

def test_handler_statuses(handler, event, status):
    assert handler(event)["statusCode"] == status


def test_handler_body(handler):
    body = json.loads(handler(get("/5", MEMBER))["body"])
    assert body["milestoneId"] == 5 and body["projectId"] == 2


def test_handler_edit_milestone_validates_body(handler):
    ev = get("/5", MANAGER, "PUT")
    ev["body"] = json.dumps({"title": "Migration v2", "startDate": "2026-10-01", "endDate": "2026-12-01"})
    assert handler(ev)["statusCode"] == 200
    ev["body"] = json.dumps({"title": "", "endDate": "bad"})
    response = handler(ev)
    assert response["statusCode"] == 400
    assert set(json.loads(response["body"])["error"]["fields"]) == {"title", "endDate"}
