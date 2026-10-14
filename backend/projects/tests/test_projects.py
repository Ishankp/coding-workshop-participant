"""
Unit tests for the projects service: service rules, controller and handler routing.

The repository is replaced with an in-memory fake, so no database is needed.
Run from backend/projects (after ./bin/sync-shared.sh):  python3 -m pytest tests -q
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
from controller import ProjectController
from service import ProjectService, milestone_completion
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


def project_milestone(mid, project_id, title, start, end, completed_at=None):
    return {"id": mid, "project_id": project_id, "title": title, "start_date": start, "end_date": end,
            "completed_at": completed_at}


# Project 1 (today Oct 14): a 10-day milestone done (10%), a 30-day one a third of the way
# through (30% x 1/3 = 10%), a 60-day one not started -> 20% complete
PROJECT_MILESTONES = [
    project_milestone(1, 1, "Discovery", date(2026, 7, 1), date(2026, 7, 11), datetime(2026, 7, 10, 12)),
    project_milestone(2, 1, "Design", date(2026, 10, 4), date(2026, 11, 3)),
    project_milestone(3, 1, "Build", date(2026, 11, 3), date(2027, 1, 2)),
    project_milestone(4, 2, "Mapping", date(2026, 9, 1), date(2026, 9, 11), datetime(2026, 9, 10)),
]


def milestone_row(milestone_id, name, start, end, employee_id=None, first=None, last=None, username=None,
                  completed_at=None):
    return {"milestone_id": milestone_id, "milestone_name": name, "start_date": start, "end_date": end,
            "completed_at": completed_at,
            "employee_id": employee_id, "first_name": first, "last_name": last, "username": username}


MILESTONE_ROWS = [
    milestone_row(1, "Halfway", date(2026, 10, 4), date(2026, 10, 24), 3, "Priya", "Patel", "priya"),
    milestone_row(1, "Halfway", date(2026, 10, 4), date(2026, 10, 24), 4, "James", "Smith", "james"),
    milestone_row(2, "Upcoming", date(2026, 11, 1), date(2026, 12, 1)),
    milestone_row(3, "Overdue", date(2026, 9, 1), date(2026, 10, 1), 6, None, None, "kenji"),
    milestone_row(4, "Unscheduled", None, None, 3, "Priya", "Patel", "priya"),
    milestone_row(5, "Nearly done", date(2026, 9, 14), date(2026, 10, 24)),
    milestone_row(6, "Finished", date(2026, 8, 1), date(2026, 9, 1), completed_at=datetime(2026, 8, 30, 12)),
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

    def find_projects_by_user_id(self, user_id, query=None):
        self.calls.append(("find_projects_by_user_id", query))
        rows = [dict(self.project)] if user_id == MEMBER.id else []
        return [r for r in rows if query is None or query.lower() in r["title"].lower()]

    def find_project_by_id(self, project_id):
        self.calls.append("find_project_by_id")
        return dict(self.project) if project_id == 1 else None

    def is_project_member(self, project_id, user_id):
        self.calls.append("is_project_member")
        return project_id == 1 and user_id == MEMBER.id

    def find_members_with_milestones(self, project_id):
        self.calls.append("find_members_with_milestones")
        return [dict(r) for r in MEMBER_ROWS] if project_id == 1 else []

    def find_milestones_for_projects(self, project_ids):
        self.calls.append(("find_milestones_for_projects", tuple(project_ids)))
        return [dict(m) for m in PROJECT_MILESTONES if m["project_id"] in project_ids]

    def find_milestones_with_assignees(self, project_id):
        self.calls.append("find_milestones_with_assignees")
        return [dict(r) for r in MILESTONE_ROWS] if project_id == 1 else []

    def find_all_projects(self, query=None):
        self.calls.append(("find_all_projects", query))
        rows = [dict(self.project), {**PROJECT, "id": 2, "title": "Warehouse", "end_date": date(2026, 12, 31)}]
        return [r for r in rows if query is None or query.lower() in r["title"].lower()]

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
    [project] = service.list_projects_for_user(MEMBER)
    completion = project.pop("completion")
    assert project == {
        "projectId": 1, "title": "Portal", "startDate": date(2026, 7, 1), "endDate": None,
        "archivedAt": None, "completedAt": None, "timeElapsedPercent": None, "daysLeft": None,
    }
    assert completion["percent"] == 20 and completion["completedMilestones"] == 1


def test_list_projects_loads_milestones_for_all_projects_in_one_query(service, repo):
    projects = service.list_projects_for_user(ADMIN)
    assert ("find_milestones_for_projects", (1, 2)) in repo.calls
    assert [p["completion"]["percent"] for p in projects] == [20, 100]


def test_project_detail_includes_completion(service):
    completion = service.get_project(MEMBER, 1)["completion"]
    assert completion["percent"] == 20 and completion["totalMilestones"] == 3
    assert [(s["name"], s["weightPercent"], s["completed"], s["progressPercent"], s["status"])
            for s in completion["segments"]] == [
        ("Discovery", 10.0, True, 100, "completed"),
        ("Design", 30.0, False, 33, "in_progress"),
        ("Build", 60.0, False, 0, "not_started"),
    ]


# Milestone-weighted completion

def test_completion_without_milestones_is_none():
    assert milestone_completion([], TODAY) == {
        "percent": None, "completedMilestones": 0, "totalMilestones": 0, "segments": [],
    }


def test_completion_reaches_100_only_when_all_done():
    done = datetime(2026, 1, 1)
    rows = [project_milestone(1, 1, "A", date(2026, 1, 1), date(2026, 1, 11), done),
            project_milestone(2, 1, "B", date(2026, 1, 11), date(2026, 1, 21), done)]
    assert milestone_completion(rows, TODAY)["percent"] == 100
    # B's schedule is long past, so it's 99% along, but unfinished: the project must stay below 100
    rows[1]["completed_at"] = None
    result = milestone_completion(rows, TODAY)
    assert result["percent"] == 99
    assert result["segments"][1] == {"milestoneId": 2, "name": "B", "weightPercent": 50.0, "completed": False,
                                     "progressPercent": 99, "status": "past_end_date"}


def test_completion_in_progress_milestone_contributes_its_elapsed_share():
    # Two equal 20-day milestones; the second is half way through -> 50% + 25% = 75%
    rows = [project_milestone(1, 1, "A", date(2026, 9, 4), date(2026, 9, 24), datetime(2026, 9, 24)),
            project_milestone(2, 1, "B", date(2026, 10, 4), date(2026, 10, 24))]
    result = milestone_completion(rows, TODAY)
    assert result["percent"] == 75
    assert result["segments"][1]["progressPercent"] == 50 and result["segments"][1]["status"] == "in_progress"


def test_completion_weights_by_duration_not_count():
    done = datetime(2026, 1, 1)
    rows = [project_milestone(1, 1, "Short", date(2026, 1, 1), date(2026, 1, 2), done),      # 1 day, done
            project_milestone(2, 1, "Long", date(2026, 11, 1), date(2026, 11, 20))]        # 19 days, not started
    assert milestone_completion(rows, TODAY)["percent"] == 5


def test_completion_undated_milestone_gets_average_share_but_no_progress():
    rows = [project_milestone(1, 1, "A", date(2026, 1, 1), date(2026, 1, 11), datetime(2026, 1, 1)),  # 10 days
            project_milestone(2, 1, "B", date(2026, 11, 1), date(2026, 12, 1)),                        # 30 days
            project_milestone(3, 1, "No dates", None, None)]                                            # avg = 20
    result = milestone_completion(rows, TODAY)
    assert [s["weightPercent"] for s in result["segments"]] == [16.7, 50.0, 33.3]
    assert result["segments"][2]["progressPercent"] == 0 and result["segments"][2]["status"] == "unscheduled"
    assert result["percent"] == 17


def test_completion_all_undated_is_equal_shares():
    rows = [project_milestone(i, 1, f"M{i}", None, None, datetime(2026, 1, 1) if i == 1 else None)
            for i in (1, 2, 3, 4)]
    assert milestone_completion(rows, TODAY)["percent"] == 25


def test_list_projects_includes_schedule_progress(service):
    warehouse = service.list_projects_for_user(ADMIN)[1]
    # Jul 1 -> Dec 31 (183 days), 105 elapsed by Oct 14
    assert warehouse["timeElapsedPercent"] == 57 and warehouse["daysLeft"] == 78


def test_project_detail_includes_schedule_progress(service, repo):
    repo.project.update({"start_date": date(2026, 10, 4), "end_date": date(2026, 10, 24)})
    project = service.get_project(MEMBER, 1)
    assert project["timeElapsedPercent"] == 50 and project["daysLeft"] == 10


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
    body = json.loads(response["body"])
    assert [p["title"] for p in body] == ["Portal"] and body[0]["startDate"] == "2026-07-01"


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
    def boom(_user_id, _query=None):
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


def test_completed_milestone_is_completed_whatever_its_dates():
    assert milestone_timeline(date(2026, 9, 1), date(2026, 10, 1), TODAY, completed=True)["status"] == "completed"
    assert milestone_timeline(date(2026, 11, 1), date(2026, 12, 1), TODAY, completed=True)["status"] == "completed"
    assert milestone_timeline(None, None, TODAY, completed=True)["status"] == "completed"


def test_project_milestones_carry_completed_status(service):
    by_name = {m["name"]: m for m in service.get_project_milestones(MEMBER, 1)["milestones"]}
    assert by_name["Finished"]["status"] == "completed"
    assert by_name["Finished"]["completedAt"] == datetime(2026, 8, 30, 12)
    assert by_name["Overdue"]["status"] == "past_end_date" and by_name["Overdue"]["completedAt"] is None


def test_milestones_sorted_by_time_elapsed_then_end_date(service):
    names = [m["name"] for m in service.get_project_milestones(MEMBER, 1)["milestones"]]
    # Finished and Overdue 100% (earlier end date first), Nearly done 75%, Halfway 50%, Upcoming 0%, Unscheduled last
    assert names == ["Finished", "Overdue", "Nearly done", "Halfway", "Upcoming", "Unscheduled"]


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
    assert first["name"] == "Finished" and first["startDate"] == "2026-08-01"
    assert first["status"] == "completed" and first["completedAt"] == "2026-08-30T12:00:00"
    assert handler(get("/1/milestones", OUTSIDER))["statusCode"] == 403


def test_milestones_lists_members_without_a_milestone(service):
    result = service.get_project_milestones(MEMBER, 1)
    assert result["unassignedEmployees"] == [{"employeeId": 1, "name": "Maria Gonzalez", "username": "maria"}]


# Admins see everything

def test_admin_lists_all_projects(service, repo):
    assert [p["title"] for p in service.list_projects_for_user(ADMIN)] == ["Portal", "Warehouse"]
    assert not any(c[0] == "find_projects_by_user_id" for c in repo.calls if isinstance(c, tuple))


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


# Search

def test_search_is_passed_to_the_right_query(service, repo):
    assert [p["title"] for p in service.list_projects_for_user(ADMIN, "ware")] == ["Warehouse"]
    assert ("find_all_projects", "ware") in repo.calls
    assert service.list_projects_for_user(MEMBER, "ware") == []
    assert ("find_projects_by_user_id", "ware") in repo.calls


def test_search_query_param_is_trimmed_and_blank_means_no_filter(handler, repo):
    def get_q(q):
        ev = get("/", ADMIN)
        ev["queryStringParameters"] = {"q": q}
        return handler(ev)

    assert [p["title"] for p in json.loads(get_q("  port ")["body"])] == ["Portal"]
    assert ("find_all_projects", "port") in repo.calls
    assert len(json.loads(get_q("   ")["body"])) == 2
    assert ("find_all_projects", None) in repo.calls


def test_search_query_too_long_is_400(handler):
    ev = get("/", ADMIN)
    ev["queryStringParameters"] = {"q": "x" * 101}
    response = handler(ev)
    assert response["statusCode"] == 400
    assert "q" in json.loads(response["body"])["error"]["fields"]
