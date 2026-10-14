"""
Unit tests for the projects service: service rules, controller and handler routing.

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
from controller import ProjectController
from service import ProjectService
from shared import tokens
from shared.errors import ForbiddenError, NotFoundError
from shared.http_utils import Router
from shared.timeline import milestone_timeline
from shared.tokens import CurrentUser

MEMBER = CurrentUser(id=10, role="employee")
MANAGER = CurrentUser(id=10, role="manager")  # same person as MEMBER, with the manager role
OUTSIDER = CurrentUser(id=99, role="manager")
ADMIN = CurrentUser(id=1, role="admin")
PROJECT = {
    "id": 1, "title": "Portal", "start_date": date(2026, 7, 1), "end_date": None,
    "budget": Decimal("1000.50"), "archived_at": None, "completed_at": None,
}
MEMBER_ROWS = [
    {"employee_id": 3, "first_name": "Priya", "last_name": "Patel", "username": "priya",
     "milestone_id": 2, "milestone_name": "Design"},
    {"employee_id": 3, "first_name": "Priya", "last_name": "Patel", "username": "priya",
     "milestone_id": 3, "milestone_name": "Build"},
    {"employee_id": 6, "first_name": None, "last_name": None, "username": "kenji",
     "milestone_id": None, "milestone_name": None},
]

TODAY = date(2026, 10, 14)


def milestone_row(milestone_id, name, start, end, employee_id=None, first=None, last=None, username=None):
    return {"milestone_id": milestone_id, "milestone_name": name, "start_date": start, "end_date": end,
            "employee_id": employee_id, "first_name": first, "last_name": last, "username": username}


MILESTONE_ROWS = [
    milestone_row(1, "Halfway", date(2026, 10, 4), date(2026, 10, 24), 3, "Priya", "Patel", "priya"),
    milestone_row(1, "Halfway", date(2026, 10, 4), date(2026, 10, 24), 4, "James", "Smith", "james"),
    milestone_row(2, "Upcoming", date(2026, 11, 1), date(2026, 12, 1)),
    milestone_row(3, "Overdue", date(2026, 9, 1), date(2026, 10, 1), 6, None, None, "kenji"),
    milestone_row(4, "Unscheduled", None, None, 3, "Priya", "Patel", "priya"),
    milestone_row(5, "Nearly done", date(2026, 9, 14), date(2026, 10, 24)),
]


class FakeProjectRepository:
    """In-memory stand-in for ProjectRepository that counts queries."""

    def __init__(self):
        self.calls = []
        self.project = dict(PROJECT)
        self.cost = {"hours": Decimal("20"), "cost": Decimal("500.00"), "employees_without_salary": 0}

    def find_project_cost(self, project_id, hours_per_year):
        self.calls.append(("find_project_cost", hours_per_year))
        return dict(self.cost)

    def find_projects_by_user_id(self, user_id):
        self.calls.append("find_projects_by_user_id")
        return [{"id": 1, "title": "Portal"}] if user_id == MEMBER.id else []

    def find_project_by_id(self, project_id):
        self.calls.append("find_project_by_id")
        return dict(self.project) if project_id == 1 else None

    def is_project_member(self, project_id, user_id):
        self.calls.append("is_project_member")
        return project_id == 1 and user_id == MEMBER.id

    def find_members_with_milestones(self, project_id):
        self.calls.append("find_members_with_milestones")
        return [dict(r) for r in MEMBER_ROWS] if project_id == 1 else []

    def find_milestones_with_assignees(self, project_id):
        self.calls.append("find_milestones_with_assignees")
        return [dict(r) for r in MILESTONE_ROWS] if project_id == 1 else []

    def find_all_projects(self):
        self.calls.append("find_all_projects")
        return [{"id": 1, "title": "Portal"}, {"id": 2, "title": "Warehouse"}]

    def find_members_without_milestones(self, project_id):
        self.calls.append("find_members_without_milestones")
        return [{"employee_id": 1, "first_name": "Maria", "last_name": "Gonzalez", "username": "maria"}]


@pytest.fixture(name="repo")
def fixture_repo():
    return FakeProjectRepository()


@pytest.fixture(name="service")
def fixture_service(repo):
    return ProjectService(repo, today=lambda: TODAY)


# Service

def test_list_projects_shapes_rows(service):
    assert service.list_projects_for_user(MEMBER) == [{"projectId": 1, "title": "Portal"}]


def test_list_projects_empty_is_not_an_error(service):
    assert service.list_projects_for_user(OUTSIDER) == []


def test_get_project_returns_details_for_member(service):
    project = service.get_project(MEMBER, 1)
    assert project["projectId"] == 1 and project["startDate"] == date(2026, 7, 1)


def test_get_project_missing_is_404_before_membership(service, repo):
    with pytest.raises(NotFoundError):
        service.get_project(MEMBER, 404)
    assert "is_project_member" not in repo.calls


def test_get_project_non_member_is_403(service):
    with pytest.raises(ForbiddenError):
        service.get_project(OUTSIDER, 1)


def test_members_grouped_by_employee_with_milestones(service):
    members = service.get_project_members(MEMBER, 1)
    assert members == [
        {"employeeId": 3, "name": "Priya Patel", "username": "priya",
         "milestones": [{"milestoneId": 2, "name": "Design"}, {"milestoneId": 3, "name": "Build"}]},
        {"employeeId": 6, "name": "kenji", "username": "kenji", "milestones": []},
    ]


def test_members_uses_at_most_three_queries(service, repo):
    service.get_project_members(MEMBER, 1)
    assert len(repo.calls) == 3


def test_members_non_member_is_403_and_loads_no_members(service, repo):
    with pytest.raises(ForbiddenError):
        service.get_project_members(OUTSIDER, 1)
    assert "find_members_with_milestones" not in repo.calls


# Handler (routing, auth, path params, error mapping, JSON encoding)

@pytest.fixture(name="handler")
def fixture_handler(monkeypatch, service):
    controller = ProjectController(service)
    router = Router()
    router.add("GET", "/", controller.list_projects)
    router.add("GET", "/{project_id}", controller.get_project)
    router.add("GET", "/{project_id}/members", controller.get_project_members)
    router.add("GET", "/{project_id}/milestones", controller.get_project_milestones)
    router.add("GET", "/{project_id}/budget", controller.get_project_budget)
    monkeypatch.setattr(function, "router", router)
    return function.handler


def get(path, user=None, token=None):
    headers = {}
    if user is not None:
        token = tokens.create_token(user.id, user.role)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return {"rawPath": path, "requestContext": {"http": {"method": "GET"}}, "headers": headers}


@pytest.mark.parametrize("path", ["/", "", "/api/projects", "/api/projects/"])
def test_list_route_local_and_cloudfront_paths(handler, path):
    response = handler(get(path, MEMBER))
    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == [{"projectId": 1, "title": "Portal"}]


def test_project_json_encodes_dates_and_decimals(handler):
    body = json.loads(handler(get("/api/projects/1", MANAGER))["body"])
    assert body["startDate"] == "2026-07-01" and body["budget"] == 1000.5


def test_budget_hidden_from_employees(service):
    assert service.get_project(MEMBER, 1)["budget"] is None
    assert service.get_project(MANAGER, 1)["budget"] == Decimal("1000.50")
    assert service.get_project(ADMIN, 1)["budget"] == Decimal("1000.50")


def test_members_route(handler):
    response = handler(get("/1/members", MEMBER))
    assert response["statusCode"] == 200
    assert len(json.loads(response["body"])) == 2


@pytest.mark.parametrize("event,status,code", [
    (get("/"), 401, "unauthorized"),
    (get("/", token="garbage"), 401, "unauthorized"),
    (get("/1", OUTSIDER), 403, "forbidden"),
    (get("/1/members", OUTSIDER), 403, "forbidden"),
    (get("/404", MEMBER), 404, "not_found"),
    (get("/abc", MEMBER), 400, "validation_error"),
    (get("/0", MEMBER), 400, "validation_error"),
    (get("/1/unknown", MEMBER), 404, "not_found"),
])
def test_errors_are_consistent(handler, event, status, code):
    response = handler(event)
    assert response["statusCode"] == status
    assert json.loads(response["body"])["error"]["code"] == code


def test_expired_token_is_401(handler, monkeypatch):
    monkeypatch.setattr(tokens, "TOKEN_TTL", tokens.TOKEN_TTL * -1)
    response = handler(get("/", MEMBER))
    assert response["statusCode"] == 401
    assert "expired" in json.loads(response["body"])["error"]["message"]


def test_unexpected_error_is_generic_500(handler, repo, monkeypatch):
    def boom(_user_id):
        raise RuntimeError("db exploded: secret details")
    monkeypatch.setattr(repo, "find_projects_by_user_id", boom)
    response = handler(get("/", MEMBER))
    assert response["statusCode"] == 500
    assert "secret" not in response["body"]


# Milestone timeline (time elapsed percentage)

@pytest.mark.parametrize("start,end,percent,days_left,status", [
    (date(2026, 10, 4), date(2026, 10, 24), 50, 10, "in_progress"),
    (date(2026, 10, 14), date(2026, 10, 24), 0, 10, "in_progress"),      # starts today
    (date(2026, 10, 4), date(2026, 10, 14), 100, 0, "in_progress"),      # ends today
    (date(2026, 11, 1), date(2026, 12, 1), 0, 48, "not_started"),
    (date(2026, 9, 1), date(2026, 10, 1), 100, -13, "past_end_date"),
    (date(2026, 10, 14), date(2026, 10, 14), 100, 0, "in_progress"),     # single day
    (None, date(2026, 10, 24), None, 10, "unscheduled"),
    (date(2026, 10, 4), None, None, None, "unscheduled"),
])
def test_milestone_timeline(start, end, percent, days_left, status):
    assert milestone_timeline(start, end, TODAY) == {
        "timeElapsedPercent": percent, "daysLeft": days_left, "status": status,
    }


def test_milestones_sorted_by_time_elapsed_then_end_date(service):
    names = [m["name"] for m in service.get_project_milestones(MEMBER, 1)["milestones"]]
    # Overdue 100%, Nearly done 75%, Halfway 50% (same end date as Nearly done), Upcoming 0%, Unscheduled last
    assert names == ["Overdue", "Nearly done", "Halfway", "Upcoming", "Unscheduled"]


def test_milestones_grouped_with_employees(service):
    by_name = {m["name"]: m for m in service.get_project_milestones(MEMBER, 1)["milestones"]}
    assert by_name["Halfway"]["employees"] == [
        {"employeeId": 3, "name": "Priya Patel", "username": "priya"},
        {"employeeId": 4, "name": "James Smith", "username": "james"},
    ]
    assert by_name["Overdue"]["employees"] == [{"employeeId": 6, "name": "kenji", "username": "kenji"}]
    assert by_name["Upcoming"]["employees"] == []
    assert by_name["Halfway"]["timeElapsedPercent"] == 50


def test_milestones_non_member_is_403_and_loads_nothing(service, repo):
    with pytest.raises(ForbiddenError):
        service.get_project_milestones(OUTSIDER, 1)
    assert "find_milestones_with_assignees" not in repo.calls


def test_milestones_route(handler):
    response = handler(get("/api/projects/1/milestones", MEMBER))
    assert response["statusCode"] == 200
    first = json.loads(response["body"])["milestones"][0]
    assert first["name"] == "Overdue" and first["startDate"] == "2026-09-01"
    assert handler(get("/1/milestones", OUTSIDER))["statusCode"] == 403


def test_milestones_lists_members_without_a_milestone(service):
    result = service.get_project_milestones(MEMBER, 1)
    assert result["unassignedEmployees"] == [{"employeeId": 1, "name": "Maria Gonzalez", "username": "maria"}]


# Admins see everything

def test_admin_lists_all_projects(service, repo):
    assert [p["title"] for p in service.list_projects_for_user(ADMIN)] == ["Portal", "Warehouse"]
    assert "find_projects_by_user_id" not in repo.calls


def test_admin_skips_membership_check(service, repo):
    assert service.get_project(ADMIN, 1)["projectId"] == 1
    assert service.get_project_members(ADMIN, 1)
    assert service.get_project_milestones(ADMIN, 1)["milestones"]
    assert "is_project_member" not in repo.calls


def test_admin_still_gets_404_for_missing_project(service):
    with pytest.raises(NotFoundError):
        service.get_project(ADMIN, 404)


def test_manager_is_limited_like_employees(service):
    with pytest.raises(ForbiddenError):
        service.get_project(OUTSIDER, 1)


@pytest.mark.parametrize("path", ["/1", "/1/members", "/1/milestones"])
def test_admin_routes_return_200_without_membership(handler, path):
    assert handler(get(path, ADMIN))["statusCode"] == 200


def test_project_milestones_do_not_expose_hours(service):
    result = service.get_project_milestones(MEMBER, 1)
    assert all("totalHours" not in m for m in result["milestones"])
    assert all("hoursSpent" not in e for m in result["milestones"] for e in m["employees"])


# Budget vs spend

@pytest.fixture(name="budget_repo")
def fixture_budget_repo(repo):
    # Project halfway through its schedule (Oct 4 → Oct 24, today Oct 14) with an $800 budget
    repo.project.update({"start_date": date(2026, 10, 4), "end_date": date(2026, 10, 24), "budget": Decimal("800")})
    return repo


def test_budget_requires_manager_or_admin(service, budget_repo):  # pylint: disable=unused-argument
    with pytest.raises(ForbiddenError):
        service.get_project_budget(MEMBER, 1)
    with pytest.raises(ForbiddenError):
        service.get_project_budget(OUTSIDER, 1)  # manager, but not a member
    assert service.get_project_budget(ADMIN, 1)["spent"] == Decimal("500.00")


def test_budget_projection_over(service, budget_repo):
    result = service.get_project_budget(MANAGER, 1)
    assert result["budget"] == Decimal("800") and result["spent"] == Decimal("500.00")
    assert result["remaining"] == Decimal("300.00") and result["spentPercent"] == 62.5
    assert result["hoursLogged"] == Decimal("20") and result["timeElapsedPercent"] == 50
    # Half the schedule used, $500 spent -> $1000 projected, 25% over an $800 budget
    assert result["projectedCost"] == Decimal("1000.00")
    assert result["variance"] == {"amount": Decimal("200.00"), "percent": 25.0, "direction": "over"}
    assert result["assumptions"] == {"hoursPerYear": 2080, "employeesWithoutSalary": 0}
    assert ("find_project_cost", 2080) in budget_repo.calls


def test_budget_projection_under(service, budget_repo):
    budget_repo.cost["cost"] = Decimal("300")
    variance = service.get_project_budget(MANAGER, 1)["variance"]
    assert variance == {"amount": Decimal("-200.00"), "percent": -25.0, "direction": "under"}


def test_budget_without_dates_has_no_projection(service, budget_repo):
    budget_repo.project.update({"start_date": None, "end_date": None})
    result = service.get_project_budget(MANAGER, 1)
    assert result["projectedCost"] is None and result["variance"] is None and result["timeElapsedPercent"] is None
    assert result["spent"] == Decimal("500.00")


def test_budget_before_start_has_no_projection(service, budget_repo):
    budget_repo.project.update({"start_date": date(2026, 11, 1), "end_date": date(2026, 12, 1)})
    result = service.get_project_budget(MANAGER, 1)
    assert result["timeElapsedPercent"] == 0 and result["projectedCost"] is None


def test_budget_after_end_projects_what_was_spent(service, budget_repo):
    budget_repo.project.update({"start_date": date(2026, 1, 1), "end_date": date(2026, 2, 1)})
    result = service.get_project_budget(MANAGER, 1)
    assert result["timeElapsedPercent"] == 100 and result["projectedCost"] == result["spent"]


def test_budget_missing_budget_still_projects(service, budget_repo):
    budget_repo.project["budget"] = None
    result = service.get_project_budget(MANAGER, 1)
    assert result["projectedCost"] == Decimal("1000.00")
    assert result["remaining"] is None and result["spentPercent"] is None and result["variance"] is None


def test_budget_route(handler, budget_repo):  # pylint: disable=unused-argument
    response = handler(get("/api/projects/1/budget", MANAGER))
    assert response["statusCode"] == 200
    assert json.loads(response["body"])["variance"]["direction"] == "over"
    assert handler(get("/1/budget", MEMBER))["statusCode"] == 403
