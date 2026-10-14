"""
Milestones repository: database queries for milestones.

One SQL query per method, returning plain dicts (or None / bool); no business rules.
"""

from typing import Callable

from psycopg import Connection

from shared import membership


class MilestoneRepository:
    """Reads milestones and project membership from PostgreSQL."""

    def __init__(self, get_connection: Callable[[], Connection]) -> None:
        self._get_connection = get_connection

    def find_milestone_by_id(self, milestone_id: int) -> dict | None:
        """Return the milestone's details including its project_id, or None."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT id, project_id, title, description, start_date, end_date "
                "FROM milestones WHERE id = %s",
                (milestone_id,),
            )
            return cur.fetchone()

    def is_project_member(self, project_id: int, user_id: int) -> bool:
        """Return True if the user is assigned to the project."""
        return membership.is_project_member(self._get_connection, project_id, user_id)
