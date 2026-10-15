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

from repository import ProjectRepository


@pytest.fixture
def repo(conn):
    return ProjectRepository(lambda: conn)


def project_ids(rows):
    return [r["id"] for r in rows]


# ---- listing and reading ------------------------------------------------------------

def test_projects_by_user_with_search_and_archive_filter(repo):
    assert project_ids(repo.find_projects_by_user_id(4)) == [1, 3]
    assert project_ids(repo.find_projects_by_user_id(4, "design")) == [1]  # milestone title match
    assert project_ids(repo.find_projects_by_user_id(4, "mobile")) == [3]  # project title match
    assert repo.find_projects_by_user_id(4, "zzz") == []
    assert repo.find_projects_by_user_id(1) == []  # admin
    repo.set_project_archived(3, True)
    assert project_ids(repo.find_projects_by_user_id(4, include_archived=False)) == [1]
    assert project_ids(repo.find_projects_by_user_id(4, include_archived=True)) == [1, 3]


def test_find_all_projects(repo):
    assert set(project_ids(repo.find_all_projects())) >= {1, 2, 3, 4}
    assert project_ids(repo.find_all_projects("warehouse")) == [2]


def test_find_project_by_id(repo):
    row = repo.find_project_by_id(1)
    assert row["title"] == "Customer Portal Redesign"
    assert row["budget"] == Decimal("12000.00")
    assert repo.find_project_by_id(99999) is None


def test_find_all_milestone_dates(repo):
    rows = repo.find_all_milestone_dates(1)
    assert [r["title"] for r in rows] == ["Discovery & Research", "Design System", "Build & Launch"]


def test_find_milestones_for_projects_skips_archived(repo, conn):
    assert repo.find_milestones_for_projects([]) == []
    rows = repo.find_milestones_for_projects([3, 1])
    assert [r["id"] for r in rows] == [1, 2, 3, 6, 7]
    with conn.cursor() as cur:
        cur.execute("UPDATE milestones SET archived_at = now() WHERE id = 7")
    assert [r["id"] for r in repo.find_milestones_for_projects([3])] == [6]


def test_members_and_milestones_views(repo):
    members = repo.find_members_with_milestones(1)
    maria = [r for r in members if r["username"] == "maria"]
    assert len(maria) == 1 and maria[0]["milestone_id"] is None
    priya = [r["milestone_name"] for r in members if r["username"] == "priya"]
    assert priya == ["Design System", "Build & Launch"]

    rows = repo.find_milestones_with_assignees(1)
    discovery = [r for r in rows if r["milestone_id"] == 1]
    assert len(discovery) == 1 and discovery[0]["employee_id"] is None
    assert {r["username"] for r in rows if r["milestone_id"] == 2} == {"priya", "james"}

    assert [r["username"] for r in repo.find_members_without_milestones(1)] == ["maria"]


def test_project_cost_and_time_entry_counts(repo):
    cost = repo.find_project_cost(1, 2080)
    assert cost["hours"] >= Decimal("79.5")  # priya 46.5 + james 33 on Design System
    assert cost["cost"] > 0
    assert cost["employees_without_salary"] == 0
    empty = repo.find_project_cost(4, 2080)
    assert (empty["hours"], empty["cost"], empty["employees_without_salary"]) == (0, 0, 0)
    assert repo.count_project_time_entries(1) >= 13
    assert repo.count_project_time_entries(4) == 0
    assert repo.count_milestone_entries(3, 2) >= 8
    assert repo.count_milestone_entries(3, 3) == 0
    assert repo.count_project_entries(3, 1) >= 8
    assert repo.count_project_entries(3, 2) == 0


def test_dependencies_and_membership(repo):
    deps = repo.find_project_dependencies(1)
    assert [(d["milestone_id"], d["depends_on_milestone_id"]) for d in deps] == [(2, 1), (3, 2)]
    assert repo.is_project_member(1, 4) is True
    assert repo.is_project_member(2, 4) is False
    assert repo.find_employee_id_by_user(4) == 3
    assert repo.find_employee_id_by_user(1) is None


# ---- writing ------------------------------------------------------------------------

def test_insert_update_archive_delete_project(repo):
    created = repo.insert_project("Temp", date(2026, 1, 1), date(2026, 6, 30), 100)
    assert created["archived_at"] is None and created["completed_at"] is None
    updated = repo.update_project(created["id"], "Temp 2", None, None, None)
    assert (updated["title"], updated["start_date"], updated["budget"]) == ("Temp 2", None, None)
    archived = repo.set_project_archived(created["id"], True)
    assert archived["archived_at"] is not None
    assert repo.set_project_archived(created["id"], True)["archived_at"] == archived["archived_at"]
    assert repo.set_project_archived(created["id"], False)["archived_at"] is None
    assert repo.delete_project(created["id"]) is True
    assert repo.delete_project(created["id"]) is False


def test_insert_milestone_inside_project_dates(repo):
    row = repo.insert_milestone(1, "Hardening", "desc", date(2026, 11, 1), date(2026, 11, 30))
    assert row["project_id"] == 1 and row["completed_at"] is None
    assert "Hardening" in [m["title"] for m in repo.find_all_milestone_dates(1)]


def test_schema_rejects_milestones_outside_project_and_narrowing_project(repo, conn):
    with pytest.raises(errors.CheckViolation):
        with conn.transaction():
            repo.insert_milestone(1, "Too early", None, date(2026, 1, 1), date(2026, 2, 1))
    with pytest.raises(errors.CheckViolation):
        with conn.transaction():
            repo.insert_milestone(1, "Too late", None, date(2026, 12, 1), date(2027, 2, 1))
    with pytest.raises(errors.CheckViolation):
        with conn.transaction():
            repo.update_project(1, "Narrowed", date(2026, 9, 1), date(2026, 12, 31), None)
    with pytest.raises(errors.CheckViolation):
        with conn.transaction():
            repo.update_project(1, "Negative", date(2026, 7, 1), date(2026, 12, 31), -5)
    with pytest.raises(errors.CheckViolation):
        with conn.transaction():
            repo.insert_project("Reversed", date(2026, 7, 1), date(2026, 6, 1), None)
    assert repo.find_project_by_id(1)["title"] == "Customer Portal Redesign"


# ---- team ---------------------------------------------------------------------------

def test_team_rows_with_hours(repo):
    team = repo.find_team(1)
    priya = [r for r in team if r["username"] == "priya"]
    assert [r["milestone_name"] for r in priya] == ["Design System", "Build & Launch"]
    assert priya[0]["hours_logged"] >= Decimal("46.5")
    maria = [r for r in team if r["username"] == "maria"]
    assert len(maria) == 1 and maria[0]["milestone_id"] is None and maria[0]["hours_logged"] == 0


def test_non_members_and_pools(repo):
    everyone = {r["username"] for r in repo.find_non_members(1)}
    assert {"david", "sofia"} <= everyone
    assert not {"maria", "priya", "james", "kenji"} & everyone
    # All of maria's seeded people are already on project 1; anything left is an account
    # a later test run created under her, and it must still be in her pool
    marias = repo.find_non_members(1, pool_of_user_id=2)
    assert {"maria", "priya", "james", "kenji", "david", "sofia"}.isdisjoint(r["username"] for r in marias)
    assert all(repo.is_in_pool_of(r["employee_id"], 2) for r in marias)
    davids = {r["username"] for r in repo.find_non_members(1, pool_of_user_id=3)}
    assert {"david", "sofia"} <= davids and "priya" not in davids
    assert repo.is_in_pool_of(3, 2) is True  # priya reports to maria
    assert repo.is_in_pool_of(6, 2) is True  # kenji shares project 1 with maria
    assert repo.is_in_pool_of(5, 2) is False  # sofia does not
    assert repo.is_in_pool_of(1, 2) is True  # maria herself


def test_employee_summary(repo):
    row = repo.find_employee_summary(3)
    assert (row["username"], row["title"], row["role"]) == ("priya", "Senior UX Designer", "employee")
    assert repo.find_employee_summary(99999) is None


def test_membership_and_assignment_lifecycle(repo):
    assert repo.is_member(1, 5) is False
    repo.insert_member(1, 5)
    assert repo.is_member(1, 5) is True
    assert repo.find_project_milestone(1, 2)["title"] == "Design System"
    assert repo.find_project_milestone(2, 2) is None
    assert repo.is_assigned(5, 2) is False
    repo.insert_assignment(5, 2)
    assert repo.is_assigned(5, 2) is True
    assert repo.delete_member_assignments(1, 5) == 1
    assert repo.is_assigned(5, 2) is False
    repo.insert_assignment(5, 2)
    assert repo.delete_assignment(5, 2) is True
    assert repo.delete_assignment(5, 2) is False
    assert repo.delete_member(1, 5) is True
    assert repo.delete_member(1, 5) is False


def test_schema_rejects_duplicate_membership(repo, conn):
    with pytest.raises(errors.UniqueViolation):
        with conn.transaction():
            repo.insert_member(1, 3)
    with pytest.raises(errors.UniqueViolation):
        with conn.transaction():
            repo.insert_assignment(3, 2)
