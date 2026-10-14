"""
Unit tests for the employees service: access rules, profile shaping and routing.

The repository is replaced with an in-memory fake, so no database is needed.
Run from backend/employees (after ./bin/sync-shared.sh):  python3 -m pytest tests -q
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
from controller import EmployeeController
from service import EmployeeService
from shared import tokens
from shared.errors import ForbiddenError, NotFoundError
from shared.http_utils import Router
from shared.tokens import CurrentUser

TODAY = date(2026, 10, 14)
PRIYA_USER = CurrentUser(id=4, role="employee")
TEAMMATE_USER = CurrentUser(id=5, role="employee")
STRANGER_USER = CurrentUser(id=99, role="manager")
MANAGER_USER = CurrentUser(id=2, role="manager")  # Maria, Priya's manager (employee 1)
ADMIN = CurrentUser(id=1, role="admin")

PRIYA = {
    "employee_id": 3, "user_id": PRIYA_USER.id, "title": "Senior UX Designer",
    "username": "priya", "email": "priya@example.com", "first_name": "Priya", "last_name": "Patel", "role": "employee",
    "manager_id": 1, "manager_first_name": "Maria", "manager_last_name": "Gonzalez", "manager_username": "maria",
}
NO_MANAGER = {**PRIYA, "employee_id": 7, "user_id": 70, "manager_id": None,
              "manager_first_name": None, "manager_last_name": None, "manager_username": None}

LIST_ROW = {"employee_id": 3, "title": "Senior UX Designer", "username": "priya",
            "first_name": "Priya", "last_name": "Patel", "role": "employee"}

PROJECT_ROWS = [
    {"project_id": 1, "project_title": "Portal", "archived_at": None, "completed_at": None,
     "hours_spent": Decimal("120.50"), "milestone_id": 2, "milestone_name": "Design",
     "start_date": date(2026, 10, 4), "end_date": date(2026, 10, 24), "milestone_completed_at": None},
    {"project_id": 1, "project_title": "Portal", "archived_at": None, "completed_at": None,
     "hours_spent": Decimal("30.25"), "milestone_id": 3, "milestone_name": "Build",
     "start_date": date(2026, 11, 1), "end_date": date(2026, 12, 1),
     "milestone_completed_at": datetime(2026, 10, 10, 9)},
    {"project_id": 3, "project_title": "Mobile", "archived_at": None, "completed_at": datetime(2026, 6, 28),
     "hours_spent": None, "milestone_id": None, "milestone_name": None,
     "start_date": None, "end_date": None, "milestone_completed_at": None},
]


class FakeEmployeeRepository:
    """In-memory stand-in for EmployeeRepository that records calls."""

    def __init__(self):
        self.calls = []

    def find_employee_by_id(self, employee_id):
        self.calls.append("find_employee_by_id")
        return {3: dict(PRIYA), 7: dict(NO_MANAGER)}.get(employee_id)

    def shares_project_with_user(self, employee_id, user_id):
        self.calls.append("shares_project_with_user")
        return user_id == TEAMMATE_USER.id

    def find_projects_with_milestones(self, employee_id, visible_to_user_id):
        self.calls.append(("find_projects_with_milestones", visible_to_user_id))
        return [dict(r) for r in PROJECT_ROWS] if employee_id == 3 else []

    def find_all_employees(self, query=None):
        self.calls.append(("find_all_employees", query))
        rows = [LIST_ROW, {**LIST_ROW, "employee_id": 9, "username": "loner", "first_name": "Lone"}]
        return [r for r in rows if query is None or query.lower() in r["first_name"].lower()]

    def find_employees_visible_to(self, user_id, query=None):
        self.calls.append(("find_employees_visible_to", query))
        return [LIST_ROW] if query is None or query.lower() in LIST_ROW["first_name"].lower() else []

    def is_manager_of(self, employee_id, user_id):
        self.calls.append("is_manager_of")
        return employee_id == 3 and user_id == MANAGER_USER.id


@pytest.fixture(name="repo")
def fixture_repo():
    return FakeEmployeeRepository()


@pytest.fixture(name="service")
def fixture_service(repo):
    return EmployeeService(repo, today=lambda: TODAY)


# Service: access rules

def test_teammate_can_view_profile(service):
    profile = service.get_employee(TEAMMATE_USER, 3)
    assert profile["name"] == "Priya Patel" and profile["isSelf"] is False


def test_self_can_view_without_share_check(service, repo):
    assert service.get_employee(PRIYA_USER, 3)["isSelf"] is True
    assert "shares_project_with_user" not in repo.calls


def test_stranger_is_403_and_loads_no_projects(service, repo):
    with pytest.raises(ForbiddenError):
        service.get_employee(STRANGER_USER, 3)
    assert not any(c[0] == "find_projects_with_milestones" for c in repo.calls if isinstance(c, tuple))


def test_missing_employee_is_404(service):
    with pytest.raises(NotFoundError):
        service.get_employee(TEAMMATE_USER, 404)


# Service: profile shape

def test_profile_fields_and_manager(service):
    profile = service.get_employee(TEAMMATE_USER, 3)
    assert profile["title"] == "Senior UX Designer" and profile["email"] == "priya@example.com"
    assert profile["manager"] == {"employeeId": 1, "name": "Maria Gonzalez"}
    assert "salary" not in profile


def test_no_manager_is_none(service):
    assert service.get_employee(CurrentUser(id=70, role="employee"), 7)["manager"] is None


def test_projects_grouped_with_milestones_and_progress(service):
    projects = service.get_employee(TEAMMATE_USER, 3)["projects"]
    assert [p["title"] for p in projects] == ["Portal", "Mobile"]

    portal, mobile = projects
    assert portal["status"] == "active"
    assert [m["name"] for m in portal["milestones"]] == ["Design", "Build"]
    assert portal["milestones"][0]["timeElapsedPercent"] == 50
    # Build is marked complete even though its dates are in the future
    assert portal["milestones"][1]["status"] == "completed"
    assert portal["milestones"][1]["completedAt"] == datetime(2026, 10, 10, 9)

    assert mobile["status"] == "completed" and mobile["milestones"] == []


# Handler

@pytest.fixture(name="handler")
def fixture_handler(monkeypatch, service):
    router = Router()
    controller = EmployeeController(service)
    router.add("GET", "/", controller.list_employees)
    router.add("GET", "/{employee_id}", controller.get_employee)
    monkeypatch.setattr(function, "router", router)
    return function.handler


def get(path, user=None):
    headers = {"Authorization": f"Bearer {tokens.create_token(user.id, user.role)}"} if user else {}
    return {"rawPath": path, "requestContext": {"http": {"method": "GET"}}, "headers": headers}


@pytest.mark.parametrize("event,status", [
    (get("/api/employees/3", TEAMMATE_USER), 200),
    (get("/3"), 401),
    (get("/3", STRANGER_USER), 403),
    (get("/3", ADMIN), 200),
    (get("/", TEAMMATE_USER), 200),
    (get("/"), 401),
    (get("/404", TEAMMATE_USER), 404),
    (get("/abc", TEAMMATE_USER), 400),
])
def test_handler_statuses(handler, event, status):
    assert handler(event)["statusCode"] == status


def test_handler_json(handler):
    body = json.loads(handler(get("/3", TEAMMATE_USER))["body"])
    assert body["totalHours"] == 150.75 and body["projects"][0]["hoursSpent"] == 150.75
    assert body["projects"][0]["milestones"][0]["hoursSpent"] == 120.5
    assert body["projects"][0]["milestones"][0]["startDate"] == "2026-10-04"


def test_non_admin_projects_are_filtered_to_the_viewer(service, repo):
    service.get_employee(TEAMMATE_USER, 3)
    assert ("find_projects_with_milestones", TEAMMATE_USER.id) in repo.calls


# Admins see everyone

def test_admin_views_anyone_with_all_projects(service, repo):
    profile = service.get_employee(ADMIN, 3)
    assert profile["isSelf"] is False and profile["role"] == "employee"
    assert "shares_project_with_user" not in repo.calls
    assert ("find_projects_with_milestones", None) in repo.calls


def test_admin_still_gets_404(service):
    with pytest.raises(NotFoundError):
        service.get_employee(ADMIN, 404)


# Employee list

def test_admin_lists_all_employees(service):
    assert [e["username"] for e in service.list_employees(ADMIN)] == ["priya", "loner"]


def test_non_admin_lists_people_sharing_a_project(service, repo):
    assert service.list_employees(TEAMMATE_USER) == [
        {"employeeId": 3, "name": "Priya Patel", "username": "priya", "title": "Senior UX Designer", "role": "employee"},
    ]
    assert not any(c[0] == "find_all_employees" for c in repo.calls if isinstance(c, tuple))


# Hours

def test_hours_per_milestone_summed_per_project_and_total(service):
    profile = service.get_employee(TEAMMATE_USER, 3)
    portal, mobile = profile["projects"]
    assert [m["hoursSpent"] for m in portal["milestones"]] == [Decimal("120.50"), Decimal("30.25")]
    assert portal["hoursSpent"] == Decimal("150.75")
    assert mobile["hoursSpent"] == 0  # no milestones in this project, so no hours
    assert profile["totalHours"] == Decimal("150.75")


def test_total_hours_zero_without_projects(service):
    assert service.get_employee(CurrentUser(id=70, role="employee"), 7)["totalHours"] == 0


# Managers and their direct reports

def test_manager_views_report_without_shared_project_and_sees_all_projects(service, repo):
    profile = service.get_employee(MANAGER_USER, 3)
    assert profile["canViewTimeLog"] is True
    assert "shares_project_with_user" not in repo.calls
    assert ("find_projects_with_milestones", None) in repo.calls


def test_manager_of_someone_else_is_still_limited(service):
    with pytest.raises(ForbiddenError):
        service.get_employee(MANAGER_USER, 7)


@pytest.mark.parametrize("user,can_view", [(PRIYA_USER, True), (ADMIN, True), (TEAMMATE_USER, False)])
def test_can_view_time_log_flag(service, user, can_view):
    assert service.get_employee(user, 3)["canViewTimeLog"] is can_view


# Search

def test_search_people_respects_visibility(service, repo):
    assert [e["username"] for e in service.list_employees(ADMIN, "lone")] == ["loner"]
    assert ("find_all_employees", "lone") in repo.calls
    assert service.list_employees(TEAMMATE_USER, "lone") == []
    assert ("find_employees_visible_to", "lone") in repo.calls


def test_search_people_route(handler):
    ev = get("/", TEAMMATE_USER)
    ev["queryStringParameters"] = {"q": "pri"}
    assert [e["username"] for e in json.loads(handler(ev)["body"])] == ["priya"]
    ev["queryStringParameters"] = {"q": "zzz"}
    assert json.loads(handler(ev)["body"]) == []
