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

from repository import SqlRepository


@pytest.fixture
def repo(conn):
    return SqlRepository(lambda: conn)


def test_lists_the_application_tables(repo):
    tables = repo.list_tables()
    for expected in ["users", "employees", "projects", "milestones", "employee_projects", "employee_milestones",
                     "milestone_dependencies", "time_entries"]:
        assert expected in tables


def test_counts_rows_in_a_table(repo):
    assert repo.count_rows("projects") >= 4
    assert repo.count_rows("users") >= 7


def test_reports_the_server_version(repo):
    assert repo.server_version()[0].isdigit()


def test_runs_a_whole_script(repo, conn):
    repo.run_script("CREATE TEMP TABLE dbsetup_probe (n int); INSERT INTO dbsetup_probe VALUES (1), (2);")
    assert repo.count_rows("dbsetup_probe") == 2
