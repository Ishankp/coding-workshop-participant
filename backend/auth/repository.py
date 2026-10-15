"""
Auth repository: database queries for logging in.

One SQL query per method, returning plain dicts (or None); no business rules.
"""

from typing import Callable

from psycopg import Connection


class AuthRepository:
    """Reads users from PostgreSQL."""

    def __init__(self, get_connection: Callable[[], Connection]) -> None:
        self._get_connection = get_connection

    def find_user_by_username(self, username: str) -> dict | None:
        """
        Return the user (including password hash and their employee id, if any)
        with this username, case-insensitive, or None.
        """
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT u.id, u.username, u.first_name, u.last_name, u.role, u.password_hashed, u.deactivated_at, "
                "       e.id AS employee_id "
                "FROM users u LEFT JOIN employees e ON e.user_id = u.id "
                "WHERE lower(u.username) = lower(%s)",
                (username,),
            )
            return cur.fetchone()
