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

from psycopg import errors

from repository import UserRepository


@pytest.fixture
def repo(conn):
    return UserRepository(lambda: conn)


def by_username(rows, username):
    return next(r for r in rows if r["username"] == username)


def test_find_all_users_joins_employee_and_manager(repo):
    rows = repo.find_all_users()
    admin = by_username(rows, "admin")
    assert admin["employee_id"] is None and admin["title"] is None
    priya = by_username(rows, "priya")
    assert priya["employee_id"] == 3
    assert priya["title"] == "Senior UX Designer"
    assert priya["manager_id"] == 1
    assert (priya["manager_first_name"], priya["manager_last_name"]) == ("Maria", "Gonzalez")
    assert rows[0]["role"] == "admin"  # ordered by role first


def test_find_user_counts_direct_reports(repo):
    assert repo.find_user(4)["direct_reports"] == 0
    assert repo.find_user(2)["direct_reports"] >= 2  # priya and james, plus any accounts later runs created
    assert repo.find_user(1)["employee_id"] is None
    assert repo.find_user(99999) is None


def test_update_user_with_and_without_employee_record(repo):
    repo.update_user(4, "new@example.com", "P", "Q", "manager", {"title": "Lead", "salary": 1})
    row = repo.find_user(4)
    assert (row["email"], row["first_name"], row["last_name"], row["role"]) == ("new@example.com", "P", "Q", "manager")
    assert (row["title"], row["salary"]) == ("Lead", 1)

    repo.update_user(1, "root@example.com", None, None, "admin", None)
    assert repo.find_user(1)["email"] == "root@example.com"


def test_set_password(repo, conn):
    repo.set_password(4, "$2b$12$replacement")
    with conn.cursor() as cur:
        cur.execute("SELECT password_hashed FROM users WHERE id = 4")
        assert cur.fetchone()["password_hashed"] == "$2b$12$replacement"


def test_deactivate_keeps_the_first_timestamp_and_reactivate_clears_it(repo):
    first = repo.set_deactivated(5, True)["deactivated_at"]
    assert first is not None
    assert repo.set_deactivated(5, True)["deactivated_at"] == first
    assert repo.set_deactivated(5, False)["deactivated_at"] is None


def test_uniqueness_checks_are_case_insensitive(repo):
    assert repo.username_taken("PRIYA") is True
    assert repo.username_taken("nobody") is False
    assert repo.email_taken("Priya@Example.com") is True
    assert repo.email_taken("free@example.com") is False
    assert repo.email_taken_by_other("priya@example.com", 4) is False
    assert repo.email_taken_by_other("priya@example.com", 5) is True


def test_find_employee_role(repo):
    assert repo.find_employee_role(1) == "manager"
    assert repo.find_employee_role(3) == "employee"
    assert repo.find_employee_role(99999) is None


def test_create_user_with_employee_record(repo):
    before = repo.find_user(2)["direct_reports"]
    created = repo.create_user("newbie", "newbie@example.com", "New", "Bie", "employee", "$2b$12$x",
                               {"title": "Intern", "salary": 1000, "manager_id": 1})
    row = repo.find_user(created["user_id"])
    assert row["employee_id"] == created["employee_id"]
    assert row["title"] == "Intern"
    assert repo.find_employee_role(created["employee_id"]) == "employee"
    assert repo.find_user(2)["direct_reports"] == before + 1


def test_create_admin_without_employee_record(repo):
    created = repo.create_user("root2", "root2@example.com", None, None, "admin", "$2b$12$x", None)
    assert created["employee_id"] is None
    assert repo.find_user(created["user_id"])["employee_id"] is None


def test_schema_rejects_duplicate_usernames_and_negative_salaries(repo, conn):
    with pytest.raises(errors.UniqueViolation):
        with conn.transaction():
            repo.create_user("priya", "other@example.com", None, None, "employee", "$2b$12$x", None)
    with pytest.raises(errors.CheckViolation):
        with conn.transaction():
            repo.create_user("neg", "neg@example.com", None, None, "employee", "$2b$12$x",
                             {"title": None, "salary": -1, "manager_id": None})
    # The failed statements rolled back to their savepoints; the connection still works
    assert repo.username_taken("neg") is False
