"""
Users repository: reading accounts and creating new ones (with their employee record).

One SQL statement per method except create_user, which inserts the user and
their employee record in one transaction.
"""

from typing import Callable

from psycopg import Connection


class UserRepository:
    """Reads and creates users and employee records."""

    def __init__(self, get_connection: Callable[[], Connection]) -> None:
        self._get_connection = get_connection

    def find_all_users(self) -> list[dict]:
        """Return every account with its employee record (if any) and manager's name."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT u.id AS user_id, u.username, u.email, u.first_name, u.last_name, u.role, u.deactivated_at, "
                "       e.id AS employee_id, e.title, e.salary, e.manager_id, "
                "       mu.first_name AS manager_first_name, mu.last_name AS manager_last_name, "
                "       mu.username AS manager_username "
                "FROM users u "
                "LEFT JOIN employees e ON e.user_id = u.id "
                "LEFT JOIN employees mgr ON mgr.id = e.manager_id "
                "LEFT JOIN users mu ON mu.id = mgr.user_id "
                "ORDER BY u.role, u.last_name, u.first_name, u.id"
            )
            return cur.fetchall()

    def find_user(self, user_id: int) -> dict | None:
        """Return one account with its employee id and how many people report to it, or None."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT u.id AS user_id, u.username, u.email, u.first_name, u.last_name, u.role, u.deactivated_at, "
                "       e.id AS employee_id, e.title, e.salary, "
                "       (SELECT count(*) FROM employees r WHERE r.manager_id = e.id) AS direct_reports "
                "FROM users u LEFT JOIN employees e ON e.user_id = u.id WHERE u.id = %s",
                (user_id,),
            )
            return cur.fetchone()

    def update_user(  # pylint: disable=too-many-arguments
        self, user_id: int, email: str, first_name: str | None, last_name: str | None, role: str,
        employee: dict | None,
    ) -> None:
        """Change an account's details and, when `employee` is given ({title, salary}), its employee record."""
        conn = self._get_connection()
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE users SET email = %s, first_name = %s, last_name = %s, role = %s WHERE id = %s",
                    (email, first_name, last_name, role, user_id),
                )
                if employee is not None:
                    cur.execute(
                        "UPDATE employees SET title = %s, salary = %s WHERE user_id = %s",
                        (employee["title"], employee["salary"], user_id),
                    )

    def set_password(self, user_id: int, password_hash: str) -> None:
        """Replace an account's password hash."""
        with self._get_connection().cursor() as cur:
            cur.execute("UPDATE users SET password_hashed = %s WHERE id = %s", (password_hash, user_id))

    def set_deactivated(self, user_id: int, deactivated: bool) -> dict:
        """Deactivate or reactivate an account; return {deactivated_at}."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "UPDATE users SET deactivated_at = CASE WHEN %s THEN COALESCE(deactivated_at, now()) ELSE NULL END "
                "WHERE id = %s RETURNING deactivated_at",
                (deactivated, user_id),
            )
            return cur.fetchone()

    def email_taken_by_other(self, email: str, user_id: int) -> bool:
        """Case-insensitive check that another account doesn't already use the email."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(%s) AND id <> %s) AS ok", (email, user_id)
            )
            return cur.fetchone()["ok"]

    def username_taken(self, username: str) -> bool:
        """Case-insensitive username check."""
        with self._get_connection().cursor() as cur:
            cur.execute("SELECT EXISTS (SELECT 1 FROM users WHERE lower(username) = lower(%s)) AS ok", (username,))
            return cur.fetchone()["ok"]

    def email_taken(self, email: str) -> bool:
        """Case-insensitive email check."""
        with self._get_connection().cursor() as cur:
            cur.execute("SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(%s)) AS ok", (email,))
            return cur.fetchone()["ok"]

    def count_time_entries_for_user(self, user_id: int) -> int:
        """How many time entries the account's employee record has logged (0 for admins)."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT count(*) AS n FROM time_entries t JOIN employees e ON e.id = t.employee_id WHERE e.user_id = %s",
                (user_id,),
            )
            return cur.fetchone()["n"]

    def delete_user(self, user_id: int) -> bool:
        """Delete an account; its employee record, memberships and assignments cascade. Return whether it existed."""
        with self._get_connection().cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            return cur.rowcount == 1

    def find_employee_role(self, employee_id: int) -> str | None:
        """Return the role of the user behind an employee record, or None if there is no such employee."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT u.role FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = %s", (employee_id,)
            )
            row = cur.fetchone()
            return row["role"] if row else None

    def create_user(  # pylint: disable=too-many-arguments
        self, username: str, email: str, first_name: str | None, last_name: str | None, role: str,
        password_hash: str, employee: dict | None,
    ) -> dict:
        """
        Insert a user and, when `employee` is given ({title, salary, manager_id}), their
        employee record, atomically. Return {user_id, employee_id}.
        """
        conn = self._get_connection()
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO users (username, email, first_name, last_name, role, password_hashed) "
                    "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
                    (username, email, first_name, last_name, role, password_hash),
                )
                user_id = cur.fetchone()["id"]
                employee_id = None
                if employee is not None:
                    cur.execute(
                        "INSERT INTO employees (user_id, title, salary, manager_id) VALUES (%s, %s, %s, %s) RETURNING id",
                        (user_id, employee["title"], employee["salary"], employee["manager_id"]),
                    )
                    employee_id = cur.fetchone()["id"]
        return {"user_id": user_id, "employee_id": employee_id}
