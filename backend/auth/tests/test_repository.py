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

from repository import AuthRepository


@pytest.fixture
def repo(conn):
    return AuthRepository(lambda: conn)


def test_find_user_by_username_is_case_insensitive_and_includes_employee(repo):
    row = repo.find_user_by_username("PRIYA")
    assert row["id"] == 4
    assert row["username"] == "priya"
    assert row["role"] == "employee"
    assert row["employee_id"] == 3
    assert row["password_hashed"].startswith("$2")
    assert row["deactivated_at"] is None


def test_admin_has_no_employee_record(repo):
    row = repo.find_user_by_username("admin")
    assert row["role"] == "admin"
    assert row["employee_id"] is None


def test_unknown_username_is_none(repo):
    assert repo.find_user_by_username("nobody") is None
