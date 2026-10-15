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

from psycopg import errors

from repository import MilestoneRepository


@pytest.fixture
def repo(conn):
    return MilestoneRepository(lambda: conn)


def test_find_milestone_by_id_includes_its_project(repo):
    row = repo.find_milestone_by_id(2)
    assert row["title"] == "Design System"
    assert row["project_id"] == 1
    assert row["project_archived_at"] is None
    assert (row["project_start_date"], row["project_end_date"]) == (date(2026, 7, 1), date(2026, 12, 31))
    assert row["completed_at"] is None
    assert repo.find_milestone_by_id(99999) is None


def test_complete_and_reopen(repo):
    done = repo.set_completed(2, True)
    assert done["completed_at"] is not None
    assert repo.set_completed(2, True)["completed_at"] == done["completed_at"]
    assert repo.set_completed(2, False)["completed_at"] is None


def test_archive_and_restore(repo):
    assert repo.set_archived(2, True)["archived_at"] is not None
    assert repo.set_archived(2, False)["archived_at"] is None


def test_update_milestone(repo):
    row = repo.update_milestone(2, "Design System v2", None, date(2026, 8, 20), date(2026, 10, 10))
    assert row["title"] == "Design System v2"
    assert row["description"] is None
    assert (row["start_date"], row["end_date"]) == (date(2026, 8, 20), date(2026, 10, 10))


def test_schema_rejects_dates_outside_the_project_or_reversed(repo, conn):
    with pytest.raises(errors.CheckViolation):
        with conn.transaction():
            repo.update_milestone(2, "Too early", None, date(2026, 1, 1), date(2026, 2, 1))
    with pytest.raises(errors.CheckViolation):
        with conn.transaction():
            repo.update_milestone(2, "Reversed", None, date(2026, 10, 1), date(2026, 9, 1))
    assert repo.find_milestone_by_id(2)["title"] == "Design System"


def test_count_time_entries(repo):
    assert repo.count_time_entries(2) >= 13
    assert repo.count_time_entries(3) == 0


def test_delete_milestone(repo, conn):
    with conn.cursor() as cur:
        cur.execute("INSERT INTO milestones (project_id, title) VALUES (1, 'Temp') RETURNING id")
        new_id = cur.fetchone()["id"]
    assert repo.delete_milestone(new_id) is True
    assert repo.delete_milestone(new_id) is False


def test_find_time_entries_newest_first_with_who_logged_them(repo):
    rows = repo.find_time_entries(2)
    assert len(rows) >= 13
    dates = [r["work_date"] for r in rows]
    assert dates == sorted(dates, reverse=True)
    by_maria = next(r for r in rows if r["cb_username"] == "maria")
    assert by_maria["username"] == "priya"
    assert by_maria["cb_role"] == "manager"
    assert by_maria["employee_user_id"] == 4
    assert repo.find_time_entries(3) == []


def test_project_dependencies(repo):
    deps = repo.find_project_dependencies(1)
    assert [(d["milestone_id"], d["depends_on_milestone_id"]) for d in deps] == [(2, 1), (3, 2)]


def test_insert_and_delete_dependency(repo):
    repo.insert_dependency(3, 1)
    assert (3, 1) in [(d["milestone_id"], d["depends_on_milestone_id"]) for d in repo.find_project_dependencies(1)]
    assert repo.delete_dependency(3, 1) is True
    assert repo.delete_dependency(3, 1) is False


def test_schema_rejects_self_and_duplicate_dependencies(repo, conn):
    with pytest.raises(errors.CheckViolation):
        with conn.transaction():
            repo.insert_dependency(2, 2)
    with pytest.raises(errors.UniqueViolation):
        with conn.transaction():
            repo.insert_dependency(2, 1)


def test_is_project_member(repo):
    assert repo.is_project_member(1, 4) is True
    assert repo.is_project_member(2, 4) is False
    assert repo.is_project_member(1, 1) is False  # admin has no employee record
