"""
Unit tests for creating projects and milestones: permissions, validation and routing.

The repository is replaced with an in-memory fake, so no database is needed.
Run from backend/projects (after ./bin/sync-shared.sh):  python3 -m pytest tests -q
"""

import json
import os
import sys
from datetime import date
from decimal import Decimal

import pytest

os.environ.setdefault("IS_LOCAL", "true")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=wrong-import-position
import function
from authoring_controller import AuthoringController
from authoring_service import AuthoringService
from shared import tokens
from shared.errors import ForbiddenError, NotFoundError, ValidationError
from shared.http_utils import Router
from shared.tokens import CurrentUser

MANAGER = CurrentUser(id=2, role="manager")     # Maria, employee 1, member of project 1
EMPLOYEE = CurrentUser(id=4, role="employee")   # Priya, member of project 1
OUTSIDER = CurrentUser(id=3, role="manager")    # David, not on project 1
ADMIN = CurrentUser(id=1, role="admin")

PROJECT = {"id": 1, "title": "Portal", "start_date": date(2026, 7, 1), "end_date": date(2026, 12, 31),
           "budget": Decimal("12000"), "archived_at": None, "completed_at": None}


class FakeProjectRepository:
    """Only the parts AuthoringService uses."""

    def __init__(self):
        self.projects = {1: dict(PROJECT)}
        self.milestones = []
        self.members = {1: {1, 3}}
        self.next_id = 100

    def find_project_by_id(self, project_id):
        return dict(self.projects[project_id]) if project_id in self.projects else None

    def is_project_member(self, project_id, user_id):
        return project_id == 1 and user_id in (MANAGER.id, EMPLOYEE.id)

    def insert_project(self, title, start_date, end_date, budget):
        row = {"id": self.next_id, "title": title, "start_date": start_date, "end_date": end_date,
               "budget": budget, "archived_at": None, "completed_at": None}
        self.projects[self.next_id] = row
        self.next_id += 1
        return dict(row)

    def insert_milestone(self, project_id, title, description, start_date, end_date):
        row = {"id": self.next_id, "project_id": project_id, "title": title, "description": description,
               "start_date": start_date, "end_date": end_date, "completed_at": None}
        self.milestones.append(row)
        self.next_id += 1
        return dict(row)

    def find_employee_id_by_user(self, user_id):
        return {2: 1, 3: 2, 4: 3}.get(user_id)

    def insert_member(self, project_id, employee_id):
        self.members.setdefault(project_id, set()).add(employee_id)

    def set_project_archived(self, project_id, archived):
        row = self.projects[project_id]
        row["archived_at"] = date(2026, 10, 14) if archived else None
        return dict(row)


@pytest.fixture(name="repo")
def fixture_repo():
    return FakeProjectRepository()


@pytest.fixture(name="service")
def fixture_service(repo):
    return AuthoringService(repo)


# Projects

def test_manager_creates_project_and_becomes_a_member(service, repo):
    project = service.create_project(MANAGER, "Intranet", date(2027, 1, 1), date(2027, 6, 30), Decimal("5000"))
    assert project["projectId"] == 100 and project["title"] == "Intranet" and project["budget"] == Decimal("5000")
    assert repo.members[100] == {1}


def test_admin_creates_project_without_membership(service, repo):
    project = service.create_project(ADMIN, "Audit", None, None, None)
    assert project["startDate"] is None and 100 not in repo.members


def test_employee_cannot_create_project(service, repo):
    with pytest.raises(ForbiddenError):
        service.create_project(EMPLOYEE, "Nope", None, None, None)
    assert 100 not in repo.projects


def test_project_end_before_start_is_refused(service):
    with pytest.raises(ValidationError) as exc:
        service.create_project(MANAGER, "Backwards", date(2027, 2, 1), date(2027, 1, 1), None)
    assert exc.value.fields == {"endDate": "Must be on or after the start date"}


# Milestones

def test_manager_member_adds_milestone(service, repo):
    milestone = service.create_milestone(MANAGER, 1, "QA", "Test everything", date(2026, 11, 1), date(2026, 11, 30))
    assert milestone["milestoneId"] == 100 and milestone["projectId"] == 1 and milestone["name"] == "QA"
    assert milestone["completedAt"] is None and len(repo.milestones) == 1


def test_admin_adds_milestone_anywhere(service):
    assert service.create_milestone(ADMIN, 1, "Audit", None, None, None)["name"] == "Audit"


@pytest.mark.parametrize("user,message", [
    (EMPLOYEE, "Only managers of this project or admins"),
    (OUTSIDER, "not a member"),
])
def test_only_project_managers_and_admins_add_milestones(service, repo, user, message):
    with pytest.raises(ForbiddenError, match=message):
        service.create_milestone(user, 1, "Nope", None, None, None)
    assert repo.milestones == []


def test_milestone_outside_project_dates_is_refused(service, repo):
    with pytest.raises(ValidationError) as exc:
        service.create_milestone(MANAGER, 1, "Early", None, date(2026, 6, 1), date(2027, 1, 15))
    assert exc.value.fields == {"startDate": "Can't be before the project starts (2026-07-01)",
                                "endDate": "Can't be after the project ends (2026-12-31)"}
    assert repo.milestones == []


def test_milestone_in_unknown_project_is_404(service):
    with pytest.raises(NotFoundError):
        service.create_milestone(ADMIN, 404, "X", None, None, None)


# Archiving

def test_manager_archives_and_restores_project(service, repo):
    assert service.set_project_archived(MANAGER, 1, True)["archivedAt"] == date(2026, 10, 14)
    assert repo.projects[1]["archived_at"] is not None
    assert service.set_project_archived(MANAGER, 1, False)["archivedAt"] is None


@pytest.mark.parametrize("user", [EMPLOYEE, OUTSIDER])
def test_only_project_managers_and_admins_archive(service, repo, user):
    with pytest.raises(ForbiddenError):
        service.set_project_archived(user, 1, True)
    assert repo.projects[1]["archived_at"] is None


def test_admin_archives_any_project(service):
    assert service.set_project_archived(ADMIN, 1, True)["archivedAt"] is not None


# Handler + body validation

@pytest.fixture(name="handler")
def fixture_handler(monkeypatch, service):
    controller = AuthoringController(service)
    router = Router()
    router.add("POST", "/", controller.create_project)
    router.add("POST", "/{project_id}/milestones", controller.create_milestone)
    router.add("POST", "/{project_id}/archive", controller.archive_project)
    router.add("POST", "/{project_id}/unarchive", controller.unarchive_project)
    monkeypatch.setattr(function, "router", router)
    return function.handler


def post(path, user, body):
    headers = {"Authorization": f"Bearer {tokens.create_token(user.id, user.role)}"} if user else {}
    return {"rawPath": path, "requestContext": {"http": {"method": "POST"}}, "headers": headers,
            "body": json.dumps(body) if body is not None else None}


def test_handler_creates_project(handler):
    response = handler(post("/api/projects", MANAGER, {"title": "  Intranet ", "startDate": "2027-01-01",
                                                       "endDate": "2027-06-30", "budget": 5000.5}))
    assert response["statusCode"] == 201
    body = json.loads(response["body"])
    assert body["title"] == "Intranet" and body["startDate"] == "2027-01-01" and body["budget"] == 5000.5


def test_handler_creates_milestone(handler):
    response = handler(post("/1/milestones", MANAGER, {"title": "QA", "startDate": "2026-11-01", "endDate": "2026-11-30"}))
    assert response["statusCode"] == 201
    assert json.loads(response["body"])["name"] == "QA"


@pytest.mark.parametrize("path,body,bad_fields", [
    ("/", {}, {"title"}),
    ("/", {"title": "   "}, {"title"}),
    ("/", {"title": "x" * 256}, {"title"}),
    ("/", {"title": "A", "startDate": "01/02/2027"}, {"startDate"}),
    ("/", {"title": "A", "budget": -1}, {"budget"}),
    ("/", {"title": "A", "budget": "5000"}, {"budget"}),
    ("/", {"title": "A", "budget": 1.234}, {"budget"}),
    ("/", {"title": "A", "startDate": "2027-02-01", "endDate": "2027-01-01"}, {"endDate"}),
    ("/1/milestones", {"title": "", "endDate": "nope"}, {"title", "endDate"}),
    ("/1/milestones", {"title": "M", "description": 5}, {"description"}),
    ("/1/milestones", {"title": "M", "startDate": "2026-06-01"}, {"startDate"}),
])
def test_handler_validation_names_fields(handler, path, body, bad_fields):
    response = handler(post(path, MANAGER, body))
    assert response["statusCode"] == 400
    assert set(json.loads(response["body"])["error"]["fields"]) == bad_fields


@pytest.mark.parametrize("path,user,body,status", [
    ("/", EMPLOYEE, {"title": "A"}, 403),
    ("/", None, {"title": "A"}, 401),
    ("/1/milestones", EMPLOYEE, {"title": "A"}, 403),
    ("/404/milestones", ADMIN, {"title": "A"}, 404),
    ("/1/archive", MANAGER, None, 200),
    ("/1/unarchive", MANAGER, None, 200),
    ("/1/archive", EMPLOYEE, None, 403),
    ("/404/archive", ADMIN, None, 404),
    ("/", MANAGER, None, 400),
])
def test_handler_statuses(handler, path, user, body, status):
    assert handler(post(path, user, body))["statusCode"] == status
