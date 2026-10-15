"""
Unit tests for the time log: access rules, validation, adding/removing entries and routing.

Both repositories are replaced with in-memory fakes, so no database is needed.
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
from shared import tokens
from shared.errors import ForbiddenError, NotFoundError, ValidationError
from shared.http_utils import Router
from shared.tokens import CurrentUser
from time_entries_controller import TimeEntryController, _parse_entry
from time_entries_service import TimeEntryService

TODAY = date(2026, 10, 14)

# Users: Maria (employee 1) manages Priya (employee 3) and James (employee 4); David manages nobody here
PRIYA = CurrentUser(id=4, role="employee")
JAMES = CurrentUser(id=5, role="employee")
MARIA = CurrentUser(id=2, role="manager")
DAVID = CurrentUser(id=3, role="manager")
ADMIN = CurrentUser(id=1, role="admin")

EMPLOYEES = {
    1: {"employee_id": 1, "user_id": 2, "manager_id": None, "first_name": "Maria", "last_name": "Gonzalez",
        "username": "maria"},
    3: {"employee_id": 3, "user_id": 4, "manager_id": 1, "first_name": "Priya", "last_name": "Patel",
        "username": "priya"},
    4: {"employee_id": 4, "user_id": 5, "manager_id": 1, "first_name": "James", "last_name": "Smith",
        "username": "james"},
}
USERS = {1: ("Alice", "Admin", "admin", "admin"), 2: ("Maria", "Gonzalez", "maria", "manager"),
         4: ("Priya", "Patel", "priya", "employee"), 5: ("James", "Smith", "james", "employee")}
ASSIGNMENTS = {
    3: [(2, "Design System", 1, "Portal"), (6, "Beta Release", 3, "Mobile")],
    4: [(2, "Design System", 1, "Portal")],
}
MANAGER_OF = {2: 1}  # user id -> employee id, for users who manage someone


class FakeEmployeeRepository:
    """Just enough of EmployeeRepository for the time log."""

    def find_employee_by_id(self, employee_id):
        return dict(EMPLOYEES[employee_id]) if employee_id in EMPLOYEES else None

    def is_manager_of(self, employee_id, user_id):
        return EMPLOYEES[employee_id]["manager_id"] == MANAGER_OF.get(user_id)


class FakeTimeEntryRepository:
    """In-memory stand-in for TimeEntryRepository."""

    def __init__(self):
        self.rows = []
        self.next_id = 1
        self.insert_entry(3, 2, date(2026, 10, 1), Decimal("6.00"), None, 4)
        self.insert_entry(3, 6, date(2026, 9, 15), Decimal("7.00"), "Mockups", 4)
        self.insert_entry(3, 2, date(2026, 9, 29), Decimal("2.00"), "Added by manager", 2)

    def find_assignments(self, employee_id):
        return [{"milestone_id": m, "milestone_name": mn, "project_id": p, "project_title": pt}
                for m, mn, p, pt in ASSIGNMENTS.get(employee_id, [])]

    def is_assigned(self, employee_id, milestone_id):
        return any(m == milestone_id for m, *_ in ASSIGNMENTS.get(employee_id, []))

    def insert_entry(self, employee_id, milestone_id, work_date, hours, note, created_by_user_id):  # pylint: disable=too-many-arguments
        milestone = next(a for a in ASSIGNMENTS[employee_id] if a[0] == milestone_id)
        first, last, username, role = USERS[created_by_user_id]
        row = {
            "id": self.next_id, "employee_id": employee_id, "work_date": work_date, "hours": hours, "note": note,
            "created_at": datetime(2026, 10, 14, 9, 0, self.next_id), "created_by_user_id": created_by_user_id,
            "milestone_id": milestone[0], "milestone_name": milestone[1],
            "project_id": milestone[2], "project_title": milestone[3],
            "cb_first_name": first, "cb_last_name": last, "cb_username": username, "cb_role": role,
        }
        self.rows.append(row)
        self.next_id += 1
        return row["id"]

    def find_entry(self, entry_id, employee_id):
        return next((dict(r) for r in self.rows if r["id"] == entry_id and r["employee_id"] == employee_id), None)

    def find_entries_by_employee(self, employee_id):
        rows = [dict(r) for r in self.rows if r["employee_id"] == employee_id]
        return sorted(rows, key=lambda r: (r["work_date"], r["created_at"], r["id"]), reverse=True)

    def update_entry(self, entry_id, employee_id, milestone_id, work_date, hours, note):  # pylint: disable=too-many-arguments
        row = next((r for r in self.rows if r["id"] == entry_id and r["employee_id"] == employee_id), None)
        if row is None:
            return False
        milestone = next(a for a in ASSIGNMENTS[employee_id] if a[0] == milestone_id)
        row.update({"milestone_id": milestone[0], "milestone_name": milestone[1], "project_id": milestone[2],
                    "project_title": milestone[3], "work_date": work_date, "hours": hours, "note": note})
        return True

    def delete_entry(self, entry_id, employee_id):
        before = len(self.rows)
        self.rows = [r for r in self.rows if not (r["id"] == entry_id and r["employee_id"] == employee_id)]
        return len(self.rows) < before


@pytest.fixture(name="entries")
def fixture_entries():
    return FakeTimeEntryRepository()


@pytest.fixture(name="service")
def fixture_service(entries):
    return TimeEntryService(FakeEmployeeRepository(), entries, today=lambda: TODAY)


def valid_entry(**overrides):
    data = {"milestone_id": 2, "work_date": date(2026, 10, 13), "hours": Decimal("7.5"), "note": "Review"}
    return {**data, **overrides}


# Viewing

@pytest.mark.parametrize("user,can_add,can_delete", [
    (PRIYA, True, False),   # own log: add only
    (MARIA, True, True),    # direct manager
    (ADMIN, True, True),
])
def test_log_permissions(service, user, can_add, can_delete):
    log = service.get_log(user, 3)
    assert log["permissions"] == {"canAdd": can_add, "canDelete": can_delete}
    assert log["employee"]["isSelf"] is (user is PRIYA)


@pytest.mark.parametrize("user", [DAVID, JAMES])
def test_other_managers_and_teammates_cannot_view_log(service, user):
    with pytest.raises(ForbiddenError):
        service.get_log(user, 3)


def test_log_contents_newest_first_with_total_and_assignments(service):
    log = service.get_log(PRIYA, 3)
    assert log["totalHours"] == Decimal("15.00")
    assert [e["workDate"] for e in log["entries"]] == [date(2026, 10, 1), date(2026, 9, 29), date(2026, 9, 15)]
    assert log["entries"][2]["note"] == "Mockups"
    assert log["entries"][0]["project"]["title"] == "Portal"
    assert log["entries"][0]["loggedBy"] == {"userId": 4, "name": "Priya Patel", "role": "employee"}
    assert [a["milestoneName"] for a in log["assignments"]] == ["Design System", "Beta Release"]


def test_entries_mark_who_logged_them_and_their_role(service):
    entries = {e["note"]: e for e in service.get_log(PRIYA, 3)["entries"]}
    manager_entry, own_entry = entries["Added by manager"], entries["Mockups"]
    assert manager_entry["loggedBy"] == {"userId": 2, "name": "Maria Gonzalez", "role": "manager"}
    assert manager_entry["loggedBySelf"] is False
    assert own_entry["loggedBy"]["role"] == "employee" and own_entry["loggedBySelf"] is True


def test_employee_sees_manager_added_hours_in_their_total(service):
    service.add_entry(MARIA, 3, **valid_entry())
    log = service.get_log(PRIYA, 3)
    assert len(log["entries"]) == 4 and log["totalHours"] == Decimal("22.50")


def test_log_missing_employee_is_404(service):
    with pytest.raises(NotFoundError):
        service.get_log(ADMIN, 404)


# Adding

def test_employee_adds_to_own_log(service, entries):
    entry = service.add_entry(PRIYA, 3, **valid_entry())
    assert entry["hours"] == Decimal("7.5") and entry["loggedBy"]["name"] == "Priya Patel"
    assert len(entries.find_entries_by_employee(3)) == 4


def test_manager_adds_for_report_and_is_recorded_as_logger(service):
    entry = service.add_entry(MARIA, 3, **valid_entry())
    assert entry["loggedBy"] == {"userId": 2, "name": "Maria Gonzalez", "role": "manager"}
    assert entry["loggedBySelf"] is False


def test_admin_adds_for_anyone(service):
    assert service.add_entry(ADMIN, 4, **valid_entry())["project"]["title"] == "Portal"


@pytest.mark.parametrize("user,employee_id", [
    (PRIYA, 4),   # employee logging for a teammate
    (JAMES, 3),
    (DAVID, 3),   # manager, but not this employee's manager
])
def test_cannot_add_to_someone_elses_log(service, user, employee_id):
    with pytest.raises(ForbiddenError):
        service.add_entry(user, employee_id, **valid_entry())


def test_add_rejects_future_date_and_unassigned_milestone(service):
    with pytest.raises(ValidationError) as exc:
        service.add_entry(PRIYA, 3, **valid_entry(work_date=date(2026, 10, 15), milestone_id=99))
    assert set(exc.value.fields) == {"workDate", "milestoneId"}


def test_add_allows_today(service):
    assert service.add_entry(PRIYA, 3, **valid_entry(work_date=TODAY))["workDate"] == TODAY


# Changing

def test_manager_edits_an_entry(service, entries):
    updated = service.update_entry(MARIA, 3, 1, **valid_entry(hours=Decimal("5"), note="Corrected"))
    assert updated["entryId"] == 1 and updated["hours"] == Decimal("5") and updated["note"] == "Corrected"
    assert entries.find_entry(1, 3)["hours"] == Decimal("5")


def test_admin_edits_an_entry(service):
    assert service.update_entry(ADMIN, 3, 1, **valid_entry(milestone_id=6))["milestone"]["name"] == "Beta Release"


def test_employee_cannot_edit_own_entries(service, entries):
    with pytest.raises(ForbiddenError):
        service.update_entry(PRIYA, 3, 1, **valid_entry(hours=Decimal("1")))
    assert entries.find_entry(1, 3)["hours"] == Decimal("6.00")


def test_edit_validates_like_add(service):
    with pytest.raises(ValidationError) as exc:
        service.update_entry(MARIA, 3, 1, **valid_entry(work_date=date(2026, 10, 15), milestone_id=99))
    assert set(exc.value.fields) == {"workDate", "milestoneId"}


def test_edit_missing_entry_is_404(service):
    with pytest.raises(NotFoundError):
        service.update_entry(MARIA, 3, 999, **valid_entry())


# Removing

def test_employee_cannot_remove_own_entries(service):
    with pytest.raises(ForbiddenError):
        service.delete_entry(PRIYA, 3, 1)


@pytest.mark.parametrize("user", [MARIA, ADMIN])
def test_manager_and_admin_remove_entries(service, entries, user):
    service.delete_entry(user, 3, 1)
    assert entries.find_entry(1, 3) is None
    assert service.get_log(user, 3)["totalHours"] == Decimal("9.00")


def test_remove_missing_entry_is_404(service):
    with pytest.raises(NotFoundError):
        service.delete_entry(MARIA, 3, 999)


def test_remove_entry_of_another_employee_is_404(service):
    # Entry 1 belongs to Priya (3); asking for it under James (4) must not delete it
    with pytest.raises(NotFoundError):
        service.delete_entry(MARIA, 4, 1)


# Controller validation

@pytest.mark.parametrize("body,bad_fields", [
    ({}, {"milestoneId", "workDate", "hours"}),
    ({"milestoneId": "2", "workDate": "2026-10-13", "hours": 8}, {"milestoneId"}),
    ({"milestoneId": True, "workDate": "2026-10-13", "hours": 8}, {"milestoneId"}),
    ({"milestoneId": 2, "workDate": "13/10/2026", "hours": 8}, {"workDate"}),
    ({"milestoneId": 2, "workDate": "2026-10-13", "hours": 0}, {"hours"}),
    ({"milestoneId": 2, "workDate": "2026-10-13", "hours": 24.5}, {"hours"}),
    ({"milestoneId": 2, "workDate": "2026-10-13", "hours": 1.234}, {"hours"}),
    ({"milestoneId": 2, "workDate": "2026-10-13", "hours": "8"}, {"hours"}),
    ({"milestoneId": 2, "workDate": "2026-10-13", "hours": 8, "note": "x" * 501}, {"note"}),
    ({"milestoneId": 2, "workDate": "2026-10-13", "hours": 8, "note": 123}, {"note"}),
])
def test_parse_entry_names_bad_fields(body, bad_fields):
    with pytest.raises(ValidationError) as exc:
        _parse_entry(body)
    assert set(exc.value.fields) == bad_fields


def test_parse_entry_normalizes_values():
    data = _parse_entry({"milestoneId": 2, "workDate": "2026-10-13", "hours": 7.5, "note": "  Review  "})
    assert data == {"milestone_id": 2, "work_date": date(2026, 10, 13), "hours": Decimal("7.5"), "note": "Review"}
    assert _parse_entry({"milestoneId": 2, "workDate": "2026-10-13", "hours": 8, "note": "   "})["note"] is None


# Handler

@pytest.fixture(name="handler")
def fixture_handler(monkeypatch, service):
    controller = TimeEntryController(service)
    router = Router()
    router.add("GET", "/{employee_id}/time-entries", controller.get_log)
    router.add("POST", "/{employee_id}/time-entries", controller.add_entry)
    router.add("PUT", "/{employee_id}/time-entries/{entry_id}", controller.update_entry)
    router.add("DELETE", "/{employee_id}/time-entries/{entry_id}", controller.delete_entry)
    monkeypatch.setattr(function, "router", router)
    return function.handler


def event(method, path, user=None, body=None):
    headers = {"Authorization": f"Bearer {tokens.create_token(user.id, user.role)}"} if user else {}
    return {"rawPath": path, "requestContext": {"http": {"method": method}}, "headers": headers,
            "body": json.dumps(body) if body is not None else None}


VALID_BODY = {"milestoneId": 2, "workDate": "2026-10-13", "hours": 7.5}


def test_handler_get_log(handler):
    response = handler(event("GET", "/api/employees/3/time-entries", PRIYA))
    assert response["statusCode"] == 200
    assert json.loads(response["body"])["totalHours"] == 15.0


def test_handler_add_returns_201_with_entry(handler):
    response = handler(event("POST", "/3/time-entries", PRIYA, VALID_BODY))
    assert response["statusCode"] == 201
    body = json.loads(response["body"])
    assert body["workDate"] == "2026-10-13" and body["hours"] == 7.5 and body["milestone"]["name"] == "Design System"


def test_handler_delete_returns_204_without_body(handler):
    response = handler(event("DELETE", "/3/time-entries/1", MARIA))
    assert response["statusCode"] == 204 and "body" not in response


@pytest.mark.parametrize("ev,status", [
    (event("GET", "/3/time-entries"), 401),
    (event("GET", "/3/time-entries", JAMES), 403),
    (event("POST", "/4/time-entries", PRIYA, VALID_BODY), 403),
    (event("POST", "/3/time-entries", PRIYA, {}), 400),
    (event("POST", "/3/time-entries", PRIYA), 400),
    (event("DELETE", "/3/time-entries/1", PRIYA), 403),
    (event("DELETE", "/3/time-entries/abc", MARIA), 400),
    (event("DELETE", "/3/time-entries/999", MARIA), 404),
    (event("PUT", "/3/time-entries", MARIA, VALID_BODY), 405),
    (event("PUT", "/3/time-entries/1", MARIA, VALID_BODY), 200),
    (event("PUT", "/3/time-entries/1", PRIYA, VALID_BODY), 403),
    (event("PUT", "/3/time-entries/1", MARIA, {}), 400),
    (event("PUT", "/3/time-entries/999", MARIA, VALID_BODY), 404),
])
def test_handler_statuses(handler, ev, status):
    assert handler(ev)["statusCode"] == status
