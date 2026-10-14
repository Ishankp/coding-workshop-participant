"""
Project membership query, shared by the projects and milestones repositories.

A user is a member of a project when their employee record is assigned to it
in employee_projects.
"""

from typing import Callable

from psycopg import Connection


def is_project_member(get_connection: Callable[[], Connection], project_id: int, user_id: int) -> bool:
    """Return True if the user's employee record is assigned to the project."""
    with get_connection().cursor() as cur:
        cur.execute(
            "SELECT EXISTS ("
            "  SELECT 1 FROM employee_projects ep"
            "  JOIN employees e ON e.id = ep.employee_id"
            "  WHERE ep.project_id = %s AND e.user_id = %s"
            ") AS is_member",
            (project_id, user_id),
        )
        return cur.fetchone()["is_member"]
