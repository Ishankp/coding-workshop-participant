"""
Repository tests against a real PostgreSQL database loaded with schema.sql + seed.sql.

Every test runs inside one transaction that is rolled back afterwards, so the
database is left exactly as it was. Skipped when PostgreSQL is not reachable
(set PG_TEST_DSN to point somewhere else).
"""

import os

import psycopg
import pytest
from psycopg.rows import dict_row

DSN = os.getenv(
    "PG_TEST_DSN",
    "host=172.17.0.1 port=5432 user=postgres password=postgres123 dbname=postgres connect_timeout=3",
)


@pytest.fixture
def conn():
    try:
        connection = psycopg.connect(DSN, row_factory=dict_row, autocommit=False)
    except psycopg.OperationalError as exc:  # pragma: no cover - depends on the environment
        pytest.skip(f"PostgreSQL not reachable: {exc}")
    try:
        # One outer transaction that is always rolled back; the repositories' own
        # transaction() blocks become savepoints inside it instead of committing
        with connection.transaction(force_rollback=True):
            yield connection
    finally:
        connection.close()

from datetime import date
from decimal import Decimal

from psycopg import errors

from repository import EmployeeRepository
from time_entries_repository import TimeEntryRepository


@pytest.fixture
def repo(conn):
    return EmployeeRepository(lambda: conn)


@pytest.fixture
def entries(conn):
    return TimeEntryRepository(lambda: conn)


def ids(rows):
    return {r["employee_id"] for r in rows}


def test_find_all_employees_and_search(repo):
    everyone = repo.find_all_employees()
    assert ids(everyone) >= {1, 2, 3, 4, 5, 6}
    assert everyone[0]["last_name"] <= everyone[1]["last_name"]
    assert ids(repo.find_all_employees("engineer")) >= {1, 4, 5, 6}
    assert repo.find_all_employees("zzz-no-such-person") == []


def test_find_employees_visible_to_each_role(repo):
    assert ids(repo.find_employees_visible_to(4)) == {1, 3, 4, 6}  # priya: self + project 1 and 3 members
    marias = ids(repo.find_employees_visible_to(2))  # maria: self, reports, project 1 (plus any later reports)
    assert marias >= {1, 3, 4, 6} and not marias & {2, 5}
    assert ids(repo.find_employees_visible_to(3)) == {2, 5, 6}  # david: self, reports, project 2
    assert ids(repo.find_employees_visible_to(4, "kenji")) == {6}
    assert repo.find_employees_visible_to(1) == []  # admin has no employee record


def test_find_employee_by_id_with_manager(repo):
    row = repo.find_employee_by_id(3)
    assert row["username"] == "priya"
    assert row["title"] == "Senior UX Designer"
    assert (row["manager_first_name"], row["manager_username"]) == ("Maria", "maria")
    assert "salary" not in row
    assert repo.find_employee_by_id(1)["manager_username"] is None
    assert repo.find_employee_by_id(99999) is None


def test_relationship_checks(repo):
    assert repo.shares_project_with_user(4, 4) is True  # james and priya share project 1
    assert repo.shares_project_with_user(5, 4) is False  # sofia and priya do not
    assert repo.is_manager_of(3, 2) is True
    assert repo.is_manager_of(3, 3) is False


def test_find_projects_with_milestones_for_the_employee(repo):
    rows = repo.find_projects_with_milestones(3, None)
    assert {r["project_id"] for r in rows} == {1, 3}
    design = next(r for r in rows if r["milestone_id"] == 2)
    assert design["hours_spent"] >= Decimal("46.5")
    assert design["project_title"] == "Customer Portal Redesign"
    # Only the projects the viewer shares: sofia (user 6) shares none with priya
    assert repo.find_projects_with_milestones(3, 6) == []
    # james (user 5) shares both
    assert {r["project_id"] for r in repo.find_projects_with_milestones(3, 5)} == {1, 3}


def test_find_projects_with_milestones_can_hide_archived(repo, conn):
    with conn.cursor() as cur:
        cur.execute("UPDATE projects SET archived_at = now() WHERE id = 3")
        cur.execute("UPDATE milestones SET archived_at = now() WHERE id = 3")
    rows = repo.find_projects_with_milestones(3, None, include_archived=False)
    assert {r["project_id"] for r in rows} == {1}
    assert {r["milestone_id"] for r in rows} == {2}
    rows = repo.find_projects_with_milestones(3, None, include_archived=True)
    assert {r["project_id"] for r in rows} == {1, 3}
    # A member of a project with no milestones still gets one row
    maria = [r for r in repo.find_projects_with_milestones(1, None) if r["project_id"] == 1]
    assert [(r["project_id"], r["milestone_id"]) for r in maria] == [(1, None)]


def test_time_entries_for_an_employee(entries):
    rows = entries.find_entries_by_employee(3)
    assert len(rows) >= 12
    dates = [r["work_date"] for r in rows]
    assert dates == sorted(dates, reverse=True)
    first = rows[0]
    assert entries.find_entry(first["id"], 3)["id"] == first["id"]
    assert entries.find_entry(first["id"], 4) is None
    assert entries.find_entries_by_employee(1) == []


def test_assignments_and_is_assigned(entries, conn):
    rows = entries.find_assignments(3)
    assert [(r["project_title"], r["milestone_name"]) for r in rows] == [
        ("Customer Portal Redesign", "Design System"),
        ("Customer Portal Redesign", "Build & Launch"),
        ("Mobile App Launch", "Beta Release"),
    ]
    assert entries.is_assigned(3, 2) is True
    assert entries.is_assigned(3, 4) is False
    with conn.cursor() as cur:
        cur.execute("UPDATE milestones SET archived_at = now() WHERE id = 2")
    assert entries.is_assigned(3, 2) is False
    assert "Design System" not in [r["milestone_name"] for r in entries.find_assignments(3)]


def test_insert_update_delete_entry(entries):
    entry_id = entries.insert_entry(3, 3, date(2026, 10, 20), Decimal("1.5"), "note", 4)
    row = entries.find_entry(entry_id, 3)
    assert (row["milestone_id"], row["hours"], row["note"]) == (3, Decimal("1.5"), "note")
    assert entries.update_entry(entry_id, 3, 2, date(2026, 10, 21), Decimal("2"), None) is True
    row = entries.find_entry(entry_id, 3)
    assert (row["milestone_id"], row["work_date"], row["note"]) == (2, date(2026, 10, 21), None)
    assert entries.update_entry(entry_id, 4, 2, date(2026, 10, 21), Decimal("2"), None) is False
    assert entries.delete_entry(entry_id, 4) is False
    assert entries.delete_entry(entry_id, 3) is True
    assert entries.find_entry(entry_id, 3) is None


def test_schema_guards_hours_and_assignment(entries, conn):
    with pytest.raises(errors.CheckViolation):
        with conn.transaction():
            entries.insert_entry(3, 3, date(2026, 10, 20), Decimal("25"), None, 4)
    with pytest.raises(errors.CheckViolation):
        with conn.transaction():
            entries.insert_entry(3, 3, date(2026, 10, 20), Decimal("0"), None, 4)
    with pytest.raises(errors.ForeignKeyViolation):
        with conn.transaction():
            entries.insert_entry(3, 4, date(2026, 10, 20), Decimal("1"), None, 4)  # not assigned to milestone 4
