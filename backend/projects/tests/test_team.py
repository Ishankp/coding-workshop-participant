"""
Unit tests for team management: membership, milestone assignment, the hours guard and routing.

The repository is replaced with an in-memory fake, so no database is needed.
Run from backend/projects (after ./bin/sync-shared.sh):  python3 -m pytest tests -q
"""

import json
import os
import sys
from decimal import Decimal

import pytest

os.environ.setdefault("IS_LOCAL", "true")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=wrong-import-position
import function
from shared import tokens
from shared.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from shared.http_utils import Router
from shared.tokens import CurrentUser
from team_controller import TeamController
from team_service import TeamService

MANAGER = CurrentUser(id=2, role="manager")     # Maria, member of project 1
EMPLOYEE = CurrentUser(id=4, role="employee")   # Priya, member of project 1
OUTSIDER = CurrentUser(id=3, role="manager")    # David, not on project 1
ADMIN = CurrentUser(id=1, role="admin")

PEOPLE = {
    1: ("Maria", "Gonzalez", "maria", "Engineering Manager", "manager"),
    3: ("Priya", "Patel", "priya", "Senior UX Designer", "employee"),
    5: ("Sofia", "Rossi", "sofia", "Data Engineer", "employee"),
    6: ("Kenji", "Tanaka", "kenji", "Backend Engineer", "employee"),
    7: ("Nina", "Okafor", "nina", "New hire", "employee"),
}
# Maria's people: herself, Priya (project-mate), Kenji (shares another project), Nina (direct report).
# Sofia only works under David.
MARIA_POOL = {1, 3, 6, 7}
MILESTONES = {2: "Design System", 3: "Build & Launch"}   # both in project 1


def person_row(eid):
    first, last, username, title, role = PEOPLE[eid]
    return {"employee_id": eid, "first_name": first, "last_name": last, "username": username, "title": title,
            "role": role}


class FakeProjectRepository:
    """Only the team-related parts of ProjectRepository."""

    def __init__(self):
        self.members = {1: {1, 3}}                       # project -> employee ids
        self.assignments = {(3, 2)}                      # (employee, milestone)
        self.entries = {(3, 2): 2}                       # (employee, milestone) -> time entries logged
        self.archived = {}                               # milestone id -> archived_at

    def find_project_by_id(self, project_id):
        return {"id": 1, "title": "Portal"} if project_id == 1 else None

    def is_project_member(self, project_id, user_id):
        return project_id == 1 and user_id in (MANAGER.id, EMPLOYEE.id)

    def find_team(self, project_id):
        rows = []
        for eid in sorted(self.members.get(project_id, ())):
            hours = Decimal(sum(2 for (e, m), n in self.entries.items() if e == eid for _ in range(n)))
            mine = sorted(m for (e, m) in self.assignments if e == eid)
            for m in mine or [None]:
                rows.append({**person_row(eid), "milestone_id": m, "milestone_name": MILESTONES.get(m),
                             "hours_logged": hours})
        return rows

    def find_non_members(self, project_id, pool_of_user_id=None):
        return [person_row(eid) for eid in sorted(PEOPLE) if eid not in self.members.get(project_id, ())
                and (pool_of_user_id is None or eid in MARIA_POOL)]

    def is_in_pool_of(self, employee_id, user_id):
        return user_id == MANAGER.id and employee_id in MARIA_POOL

    def find_employee_summary(self, employee_id):
        return person_row(employee_id) if employee_id in PEOPLE else None

    def is_member(self, project_id, employee_id):
        return employee_id in self.members.get(project_id, ())

    def insert_member(self, project_id, employee_id):
        self.members.setdefault(project_id, set()).add(employee_id)

    def delete_member(self, project_id, employee_id):
        try:
            self.members[project_id].remove(employee_id)
            return True
        except KeyError:
            return False

    def delete_member_assignments(self, project_id, employee_id):
        before = len(self.assignments)
        self.assignments = {(e, m) for (e, m) in self.assignments if e != employee_id}
        return before - len(self.assignments)

    def find_project_milestone(self, project_id, milestone_id):
        if project_id != 1 or milestone_id not in MILESTONES:
            return None
        return {"id": milestone_id, "title": MILESTONES[milestone_id], "archived_at": self.archived.get(milestone_id)}

    def is_assigned(self, employee_id, milestone_id):
        return (employee_id, milestone_id) in self.assignments

    def insert_assignment(self, employee_id, milestone_id):
        self.assignments.add((employee_id, milestone_id))

    def delete_assignment(self, employee_id, milestone_id):
        existed = (employee_id, milestone_id) in self.assignments
        self.assignments.discard((employee_id, milestone_id))
        return existed

    def count_milestone_entries(self, employee_id, milestone_id):
        return self.entries.get((employee_id, milestone_id), 0)

    def count_project_entries(self, employee_id, project_id):
        return sum(n for (e, _), n in self.entries.items() if e == employee_id)


@pytest.fixture(name="repo")
def fixture_repo():
    return FakeProjectRepository()


@pytest.fixture(name="service")
def fixture_service(repo):
    return TeamService(repo)


# Reading the team

def test_team_lists_members_with_milestones_and_candidates(service):
    team = service.get_team(MANAGER, 1)
    assert [(m["name"], [x["name"] for x in m["milestones"]], m["hoursLogged"]) for m in team["members"]] == [
        ("Maria Gonzalez", [], 0), ("Priya Patel", ["Design System"], 4),
    ]
    assert [c["name"] for c in team["candidates"]] == ["Kenji Tanaka", "Nina Okafor"]   # Sofia isn't Maria's


def test_admin_can_add_anyone(service):
    assert [c["name"] for c in service.get_team(ADMIN, 1)["candidates"]] == ["Sofia Rossi", "Kenji Tanaka", "Nina Okafor"]
    assert service.add_member(ADMIN, 1, 5)["name"] == "Sofia Rossi"


def test_manager_cannot_add_or_assign_someone_elses_employee(service, repo):
    with pytest.raises(ForbiddenError, match="Sofia Rossi isn't one of your people"):
        service.add_member(MANAGER, 1, 5)
    with pytest.raises(ForbiddenError, match="isn't one of your people"):
        service.assign_milestone(MANAGER, 1, 2, 5)
    assert 5 not in repo.members[1] and (5, 2) not in repo.assignments


def test_manager_can_add_a_direct_report_with_no_project_yet(service, repo):
    assert service.add_member(MANAGER, 1, 7)["name"] == "Nina Okafor"
    assert 7 in repo.members[1]


@pytest.mark.parametrize("user,message", [
    (EMPLOYEE, "Only managers of this project or admins"),
    (OUTSIDER, "not a member"),
])
def test_only_project_managers_and_admins_manage_the_team(service, user, message):
    with pytest.raises(ForbiddenError, match=message):
        service.get_team(user, 1)
    with pytest.raises(ForbiddenError):
        service.add_member(user, 1, 6)


def test_admin_manages_without_membership(service):
    assert service.get_team(ADMIN, 1)["members"]


# Project membership

def test_add_member_without_a_milestone(service, repo):
    result = service.add_member(MANAGER, 1, 6)
    assert result["name"] == "Kenji Tanaka" and 6 in repo.members[1]
    assert [m["name"] for m in service.get_team(MANAGER, 1)["members"]] == ["Maria Gonzalez", "Priya Patel", "Kenji Tanaka"]


def test_add_member_twice_is_a_conflict(service):
    with pytest.raises(ConflictError, match="already on this project"):
        service.add_member(MANAGER, 1, 3)


def test_add_unknown_employee_is_a_field_error(service):
    with pytest.raises(ValidationError) as exc:
        service.add_member(MANAGER, 1, 404)
    assert exc.value.fields == {"employeeId": "No such employee"}


def test_remove_member_without_hours_also_drops_their_assignments(service, repo):
    service.assign_milestone(MANAGER, 1, 3, 6)   # Kenji joins via a milestone, logs nothing
    service.remove_member(MANAGER, 1, 6)
    assert 6 not in repo.members[1] and (6, 3) not in repo.assignments


def test_remove_member_with_hours_is_refused(service, repo):
    with pytest.raises(ConflictError, match="Priya Patel has 2 time entries on this project; remove those first"):
        service.remove_member(MANAGER, 1, 3)
    assert 3 in repo.members[1]


def test_remove_non_member_is_404(service):
    with pytest.raises(NotFoundError):
        service.remove_member(MANAGER, 1, 6)


# Milestone assignment

def test_assign_existing_member_to_milestone(service, repo):
    result = service.assign_milestone(MANAGER, 1, 3, 3)
    assert result == {"employeeId": 3, "name": "Priya Patel", "milestoneId": 3, "milestoneName": "Build & Launch",
                      "addedToProject": False}
    assert (3, 3) in repo.assignments


def test_assign_non_member_adds_them_to_the_project(service, repo):
    result = service.assign_milestone(MANAGER, 1, 2, 6)
    assert result["addedToProject"] is True
    assert 6 in repo.members[1] and (6, 2) in repo.assignments


def test_assign_twice_is_a_conflict(service):
    with pytest.raises(ConflictError, match="already assigned to Design System"):
        service.assign_milestone(MANAGER, 1, 2, 3)


def test_assign_to_archived_milestone_is_refused(service, repo):
    repo.archived[3] = "2026-10-01"
    with pytest.raises(ConflictError, match="Build & Launch is archived"):
        service.assign_milestone(MANAGER, 1, 3, 3)


def test_assign_to_milestone_of_another_project_is_404(service):
    with pytest.raises(NotFoundError):
        service.assign_milestone(MANAGER, 1, 99, 3)


def test_unassign_without_hours(service, repo):
    service.assign_milestone(MANAGER, 1, 3, 3)
    service.unassign_milestone(MANAGER, 1, 3, 3)
    assert (3, 3) not in repo.assignments and 3 in repo.members[1]   # still on the project


def test_unassign_with_hours_is_refused(service, repo):
    with pytest.raises(ConflictError, match="Priya Patel has 2 time entries on Design System"):
        service.unassign_milestone(MANAGER, 1, 2, 3)
    assert (3, 2) in repo.assignments


def test_unassign_when_not_assigned_is_404(service):
    with pytest.raises(NotFoundError):
        service.unassign_milestone(MANAGER, 1, 3, 3)


# Handler

@pytest.fixture(name="handler")
def fixture_handler(monkeypatch, service):
    controller = TeamController(service)
    router = Router()
    router.add("GET", "/{project_id}/team", controller.get_team)
    router.add("POST", "/{project_id}/members", controller.add_member)
    router.add("DELETE", "/{project_id}/members/{employee_id}", controller.remove_member)
    router.add("POST", "/{project_id}/milestones/{milestone_id}/assignees", controller.assign_milestone)
    router.add("DELETE", "/{project_id}/milestones/{milestone_id}/assignees/{employee_id}", controller.unassign_milestone)
    monkeypatch.setattr(function, "router", router)
    return function.handler


def event(method, path, user=None, body=None):
    headers = {"Authorization": f"Bearer {tokens.create_token(user.id, user.role)}"} if user else {}
    return {"rawPath": path, "requestContext": {"http": {"method": method}}, "headers": headers,
            "body": json.dumps(body) if body is not None else None}


@pytest.mark.parametrize("ev,status,code", [
    (event("GET", "/api/projects/1/team", MANAGER), 200, None),
    (event("GET", "/1/team", EMPLOYEE), 403, "forbidden"),
    (event("POST", "/1/members", MANAGER, {"employeeId": 6}), 201, None),
    (event("POST", "/1/members", MANAGER, {"employeeId": 5}), 403, "forbidden"),
    (event("POST", "/1/members", MANAGER, {"employeeId": 3}), 409, "conflict"),
    (event("POST", "/1/members", MANAGER, {"employeeId": "5"}), 400, "validation_error"),
    (event("POST", "/1/members", MANAGER), 400, "validation_error"),
    (event("DELETE", "/1/members/3", MANAGER), 409, "conflict"),
    (event("DELETE", "/1/members/6", MANAGER), 404, "not_found"),
    (event("POST", "/1/milestones/3/assignees", MANAGER, {"employeeId": 6}), 201, None),
    (event("DELETE", "/1/milestones/2/assignees/3", MANAGER), 409, "conflict"),
    (event("DELETE", "/1/milestones/2/assignees/3", ADMIN), 409, "conflict"),
    (event("POST", "/1/members", None, {"employeeId": 6}), 401, "unauthorized"),
])
def test_handler_statuses(handler, ev, status, code):
    response = handler(ev)
    assert response["statusCode"] == status
    if code:
        assert json.loads(response["body"])["error"]["code"] == code


def test_handler_assign_reports_added_to_project(handler):
    response = handler(event("POST", "/1/milestones/2/assignees", MANAGER, {"employeeId": 6}))
    assert response["statusCode"] == 201
    assert json.loads(response["body"])["addedToProject"] is True


# Role boundary: an employee gets 403 on every team write route before the body is even looked at.
@pytest.mark.parametrize("method,path", [
    ("POST", "/api/projects/1/members"),
    ("DELETE", "/api/projects/1/members/3"),
    ("POST", "/api/projects/1/milestones/2/assignees"),
    ("DELETE", "/api/projects/1/milestones/2/assignees/3"),
])
def test_employee_is_refused_before_validation_on_every_team_write(handler, method, path):
    response = handler(event(method, path, EMPLOYEE, {}))
    assert response["statusCode"] == 403
    assert json.loads(response["body"])["error"]["code"] == "forbidden"
