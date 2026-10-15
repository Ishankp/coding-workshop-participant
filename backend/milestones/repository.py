"""
Milestones repository: database queries for milestones.

One SQL query per method, returning plain dicts (or None / bool); no business rules.
"""

from typing import Callable

from psycopg import Connection

from shared import dependencies, membership


class MilestoneRepository:
    """Reads milestones and project membership from PostgreSQL."""

    def __init__(self, get_connection: Callable[[], Connection]) -> None:
        self._get_connection = get_connection

    def find_milestone_by_id(self, milestone_id: int) -> dict | None:
        """Return the milestone's details including its project_id and whether its project is archived, or None."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT m.id, m.project_id, m.title, m.description, m.start_date, m.end_date, m.completed_at, "
                "       m.archived_at, p.archived_at AS project_archived_at, "
                "       p.start_date AS project_start_date, p.end_date AS project_end_date "
                "FROM milestones m JOIN projects p ON p.id = m.project_id WHERE m.id = %s",
                (milestone_id,),
            )
            return cur.fetchone()

    def set_completed(self, milestone_id: int, completed: bool) -> dict:
        """Mark a milestone complete or reopen it; return {id, title, completed_at}."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "UPDATE milestones SET completed_at = CASE WHEN %s THEN COALESCE(completed_at, now()) ELSE NULL END "
                "WHERE id = %s RETURNING id, title, completed_at",
                (completed, milestone_id),
            )
            return cur.fetchone()

    def update_milestone(self, milestone_id: int, title: str, description, start_date, end_date) -> dict:
        """Change a milestone's title, description and dates; return its row."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "UPDATE milestones SET title = %s, description = %s, start_date = %s, end_date = %s WHERE id = %s "
                "RETURNING id, project_id, title, description, start_date, end_date, completed_at, archived_at",
                (title, description, start_date, end_date, milestone_id),
            )
            return cur.fetchone()

    def set_archived(self, milestone_id: int, archived: bool) -> dict:
        """Archive or restore a milestone; return {id, title, archived_at}."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "UPDATE milestones SET archived_at = CASE WHEN %s THEN COALESCE(archived_at, now()) ELSE NULL END "
                "WHERE id = %s RETURNING id, title, archived_at",
                (archived, milestone_id),
            )
            return cur.fetchone()

    def find_time_entries(self, milestone_id: int) -> list[dict]:
        """Return every time entry logged on the milestone, newest work date first, with who worked and who logged it."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT t.id, t.work_date, t.hours, t.note, t.created_at, t.created_by_user_id, "
                "       e.id AS employee_id, e.user_id AS employee_user_id, "
                "       u.first_name, u.last_name, u.username, "
                "       cb.first_name AS cb_first_name, cb.last_name AS cb_last_name, cb.username AS cb_username, "
                "       cb.role AS cb_role "
                "FROM time_entries t "
                "JOIN employees e ON e.id = t.employee_id "
                "JOIN users u ON u.id = e.user_id "
                "LEFT JOIN users cb ON cb.id = t.created_by_user_id "
                "WHERE t.milestone_id = %s "
                "ORDER BY t.work_date DESC, t.created_at DESC, t.id DESC",
                (milestone_id,),
            )
            return cur.fetchall()

    def find_project_dependencies(self, project_id: int) -> list[dict]:
        """Return the dependencies between the project's milestones (see shared.dependencies)."""
        return dependencies.find_project_dependencies(self._get_connection, project_id)

    def insert_dependency(self, milestone_id: int, depends_on_milestone_id: int) -> None:
        """Record that milestone_id depends on depends_on_milestone_id."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "INSERT INTO milestone_dependencies (milestone_id, depends_on_milestone_id) VALUES (%s, %s)",
                (milestone_id, depends_on_milestone_id),
            )

    def delete_dependency(self, milestone_id: int, depends_on_milestone_id: int) -> bool:
        """Remove a dependency; return whether it existed."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "DELETE FROM milestone_dependencies WHERE milestone_id = %s AND depends_on_milestone_id = %s",
                (milestone_id, depends_on_milestone_id),
            )
            return cur.rowcount == 1

    def is_project_member(self, project_id: int, user_id: int) -> bool:
        """Return True if the user is assigned to the project."""
        return membership.is_project_member(self._get_connection, project_id, user_id)
