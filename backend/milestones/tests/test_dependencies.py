"""
Unit tests for milestone dependencies: loop detection, the start-date rule,
permissions, alerts and routing.

The repository is replaced with an in-memory fake, so no database is needed.
Run from backend/milestones (after ./bin/sync-shared.sh):  python3 -m pytest tests -q
"""

import json
import os
import sys
from datetime import date, datetime

import pytest

os.environ.setdefault("IS_LOCAL", "true")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=wrong-import-position
import function
from controller import MilestoneController
from service import MilestoneService
from shared import tokens
from shared.dependencies import prerequisite_alert, would_create_cycle
from shared.errors import ForbiddenError, NotFoundError, ValidationError
from shared.http_utils import Router
from shared.tokens import CurrentUser

TODAY = date(2026, 10, 14)
MANAGER = CurrentUser(id=2, role="manager")      # member of project 1
EMPLOYEE = CurrentUser(id=4, role="employee")    # member of project 1
OUTSIDER = CurrentUser(id=3, role="manager")     # not a member of project 1
ADMIN = CurrentUser(id=1, role="admin")


def milestone(mid, project_id, title, start, end, completed_at=None):
    return {"id": mid, "project_id": project_id, "title": title, "description": None,
            "start_date": start, "end_date": end, "completed_at": completed_at,
            "archived_at": None, "project_archived_at": None}


MILESTONES = {
    1: milestone(1, 1, "Discovery", date(2026, 7, 1), date(2026, 8, 15), datetime(2026, 8, 14)),
    2: milestone(2, 1, "Design", date(2026, 8, 16), date(2026, 10, 15)),
    3: milestone(3, 1, "Build", date(2026, 10, 16), date(2026, 12, 31)),
    8: milestone(8, 1, "Late review", date(2026, 9, 1), date(2026, 9, 30)),   # past due, not complete
    9: milestone(9, 1, "Someday", None, None),
    4: milestone(4, 2, "Mapping", date(2026, 9, 1), date(2026, 11, 30)),
}


class FakeMilestoneRepository:
    """In-memory stand-in for MilestoneRepository."""

    def __init__(self):
        self.edges = [(2, 1), (3, 2)]  # Design depends on Discovery, Build depends on Design

    def find_milestone_by_id(self, milestone_id):
        return dict(MILESTONES[milestone_id]) if milestone_id in MILESTONES else None

    def is_project_member(self, project_id, user_id):
        return project_id == 1 and user_id in (MANAGER.id, EMPLOYEE.id)

    def find_project_dependencies(self, project_id):
        rows = []
        for m_id, d_id in self.edges:
            m, d = MILESTONES[m_id], MILESTONES[d_id]
            if m["project_id"] != project_id:
                continue
            rows.append({
                "milestone_id": m_id, "milestone_name": m["title"], "milestone_start_date": m["start_date"],
                "depends_on_milestone_id": d_id, "depends_on_name": d["title"],
                "depends_on_start_date": d["start_date"], "depends_on_end_date": d["end_date"],
                "depends_on_completed_at": d["completed_at"],
            })
        return rows

    def find_time_entries(self, milestone_id):
        return []

    def insert_dependency(self, milestone_id, depends_on_milestone_id):
        self.edges.append((milestone_id, depends_on_milestone_id))

    def delete_dependency(self, milestone_id, depends_on_milestone_id):
        before = len(self.edges)
        self.edges = [e for e in self.edges if e != (milestone_id, depends_on_milestone_id)]
        return len(self.edges) < before


@pytest.fixture(name="repo")
def fixture_repo():
    return FakeMilestoneRepository()


@pytest.fixture(name="service")
def fixture_service(repo):
    return MilestoneService(repo, today=lambda: TODAY)


def fields_of(exc):
    return exc.value.fields["dependsOnMilestoneId"]


# Loop detection (pure)

def test_cycle_detection():
    edges = [(2, 1), (3, 2)]
    assert would_create_cycle(edges, 1, 3) == [3, 2, 1]      # Discovery -> Build -> Design -> Discovery
    assert would_create_cycle(edges, 2, 3) == [3, 2]
    assert would_create_cycle(edges, 5, 5) == [5]
    assert would_create_cycle(edges, 3, 1) is None           # Build also depending on Discovery is fine
    assert would_create_cycle(edges, 8, 3) is None


# Adding

def test_manager_adds_dependency(service, repo):
    result = service.add_dependency(MANAGER, 3, 8)
    assert result == {"milestoneId": 3, "milestoneName": "Build", "dependsOnMilestoneId": 8, "dependsOnName": "Late review"}
    assert (3, 8) in repo.edges


def test_admin_adds_dependency_without_membership(service, repo):
    service.add_dependency(ADMIN, 3, 8)
    assert (3, 8) in repo.edges


@pytest.mark.parametrize("user,error", [(EMPLOYEE, ForbiddenError), (OUTSIDER, ForbiddenError)])
def test_employees_and_other_managers_cannot_add(service, repo, user, error):
    with pytest.raises(error):
        service.add_dependency(user, 3, 8)
    assert (3, 8) not in repo.edges


def test_loop_is_refused_with_the_chain_named(service, repo):
    with pytest.raises(ValidationError) as exc:
        service.add_dependency(MANAGER, 1, 3)
    assert fields_of(exc) == "Would create a loop: Discovery → Build → Design → Discovery"
    assert (1, 3) not in repo.edges


def test_self_dependency_is_refused(service):
    with pytest.raises(ValidationError) as exc:
        service.add_dependency(MANAGER, 2, 2)
    assert "itself" in fields_of(exc)


def test_cross_project_dependency_is_refused(service):
    with pytest.raises(ValidationError) as exc:
        service.add_dependency(MANAGER, 3, 4)
    assert "same project" in fields_of(exc)


def test_unknown_prerequisite_is_a_field_error(service):
    with pytest.raises(ValidationError) as exc:
        service.add_dependency(MANAGER, 3, 404)
    assert fields_of(exc) == "No such milestone"


def test_duplicate_dependency_is_refused(service):
    with pytest.raises(ValidationError) as exc:
        service.add_dependency(MANAGER, 2, 1)
    assert fields_of(exc) == "Design already depends on Discovery"


def test_dependent_cannot_start_before_its_prerequisite(service, repo):
    # Design starts Aug 16, Late review starts Sep 1
    with pytest.raises(ValidationError) as exc:
        service.add_dependency(MANAGER, 2, 8)
    assert fields_of(exc) == "Design starts on 2026-08-16, before Late review (2026-09-01)"
    assert (2, 8) not in repo.edges


def test_start_date_rule_skipped_when_a_date_is_missing(service, repo):
    service.add_dependency(MANAGER, 9, 3)   # "Someday" has no dates
    assert (9, 3) in repo.edges


def test_missing_milestone_is_404(service):
    with pytest.raises(NotFoundError):
        service.add_dependency(MANAGER, 404, 1)


# Alerts

def test_alert_when_prerequisite_is_past_due_and_incomplete():
    row = {"depends_on_name": "Late review", "depends_on_end_date": date(2026, 9, 30), "depends_on_completed_at": None}
    assert prerequisite_alert(row, TODAY) == "Late review is 14 days past its end date and not complete"
    assert prerequisite_alert({**row, "depends_on_completed_at": datetime(2026, 9, 29)}, TODAY) is None
    assert prerequisite_alert({**row, "depends_on_end_date": date(2026, 10, 20)}, TODAY) is None
    assert prerequisite_alert({**row, "depends_on_end_date": None}, TODAY) is None


def test_milestone_detail_shows_dependencies_and_alerts(service):
    service.add_dependency(MANAGER, 3, 8)
    build = service.get_milestone(EMPLOYEE, 3)
    assert [(d["name"], d["completed"], d["alert"]) for d in build["dependsOn"]] == [
        ("Design", False, None),
        ("Late review", False, "Late review is 14 days past its end date and not complete"),
    ]
    design = service.get_milestone(EMPLOYEE, 2)
    assert design["dependsOn"][0]["name"] == "Discovery" and design["dependsOn"][0]["completed"] is True
    assert design["requiredBy"] == [{"milestoneId": 3, "name": "Build"}]


# Removing

def test_manager_removes_dependency(service, repo):
    service.remove_dependency(MANAGER, 3, 2)
    assert (3, 2) not in repo.edges


def test_remove_missing_dependency_is_404(service):
    with pytest.raises(NotFoundError):
        service.remove_dependency(MANAGER, 3, 1)


def test_employee_cannot_remove(service, repo):
    with pytest.raises(ForbiddenError):
        service.remove_dependency(EMPLOYEE, 3, 2)
    assert (3, 2) in repo.edges


# Handler

@pytest.fixture(name="handler")
def fixture_handler(monkeypatch, service):
    controller = MilestoneController(service)
    router = Router()
    router.add("GET", "/{milestone_id}", controller.get_milestone)
    router.add("POST", "/{milestone_id}/dependencies", controller.add_dependency)
    router.add("DELETE", "/{milestone_id}/dependencies/{depends_on_id}", controller.remove_dependency)
    monkeypatch.setattr(function, "router", router)
    return function.handler


def event(method, path, user=None, body=None):
    headers = {"Authorization": f"Bearer {tokens.create_token(user.id, user.role)}"} if user else {}
    return {"rawPath": path, "requestContext": {"http": {"method": method}}, "headers": headers,
            "body": json.dumps(body) if body is not None else None}


def test_handler_add_returns_201(handler):
    response = handler(event("POST", "/api/milestones/3/dependencies", MANAGER, {"dependsOnMilestoneId": 8}))
    assert response["statusCode"] == 201
    assert json.loads(response["body"])["dependsOnName"] == "Late review"


@pytest.mark.parametrize("ev,status,field_hint", [
    (event("POST", "/3/dependencies", MANAGER, {}), 400, "Choose a milestone"),
    (event("POST", "/3/dependencies", MANAGER, {"dependsOnMilestoneId": "8"}), 400, "Choose a milestone"),
    (event("POST", "/1/dependencies", MANAGER, {"dependsOnMilestoneId": 3}), 400, "loop"),
    (event("POST", "/3/dependencies", EMPLOYEE, {"dependsOnMilestoneId": 8}), 403, None),
    (event("POST", "/3/dependencies", None, {"dependsOnMilestoneId": 8}), 401, None),
    (event("DELETE", "/3/dependencies/2", MANAGER), 204, None),
    (event("DELETE", "/3/dependencies/1", MANAGER), 404, None),
    (event("DELETE", "/3/dependencies/x", MANAGER), 400, None),
])
def test_handler_statuses(handler, ev, status, field_hint):
    response = handler(ev)
    assert response["statusCode"] == status
    if field_hint:
        assert field_hint in json.loads(response["body"])["error"]["fields"]["dependsOnMilestoneId"]
