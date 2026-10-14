"""
Projects repository: database queries for projects and their members.

One SQL query per method, returning plain dicts (or None / bool); no business rules.
"""

from typing import Callable

from psycopg import Connection

from shared import membership


class ProjectRepository:
    """Reads projects, membership and project members from PostgreSQL."""

    def __init__(self, get_connection: Callable[[], Connection]) -> None:
        self._get_connection = get_connection

    def find_projects_by_user_id(self, user_id: int) -> list[dict]:
        """Return {id, title} for every project the user is assigned to; may be empty."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT p.id, p.title FROM projects p "
                "JOIN employee_projects ep ON ep.project_id = p.id "
                "JOIN employees e ON e.id = ep.employee_id "
                "WHERE e.user_id = %s "
                "ORDER BY p.title",
                (user_id,),
            )
            return cur.fetchall()

    def find_all_projects(self) -> list[dict]:
        """Return {id, title} for every project; may be empty."""
        with self._get_connection().cursor() as cur:
            cur.execute("SELECT id, title FROM projects ORDER BY title")
            return cur.fetchall()

    def find_project_by_id(self, project_id: int) -> dict | None:
        """Return the project's details, or None."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT id, title, start_date, end_date, budget, archived_at, completed_at "
                "FROM projects WHERE id = %s",
                (project_id,),
            )
            return cur.fetchone()

    def is_project_member(self, project_id: int, user_id: int) -> bool:
        """Return True if the user is assigned to the project."""
        return membership.is_project_member(self._get_connection, project_id, user_id)

    def find_members_with_milestones(self, project_id: int) -> list[dict]:
        """
        Return one row per (member, milestone) for the project.

        Only milestones belonging to this project are included, even if the
        employee is also assigned to milestones in other projects. Members with
        no milestones in this project still get one row, with milestone_id and
        milestone_name set to None.
        """
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT e.id AS employee_id, u.first_name, u.last_name, u.username, "
                "       m.id AS milestone_id, m.title AS milestone_name "
                "FROM employee_projects ep "
                "JOIN employees e ON e.id = ep.employee_id "
                "JOIN users u ON u.id = e.user_id "
                "LEFT JOIN (employee_milestones em JOIN milestones m ON m.id = em.milestone_id) "
                "       ON em.employee_id = e.id AND m.project_id = ep.project_id "
                "WHERE ep.project_id = %s "
                "ORDER BY u.last_name, u.first_name, e.id, m.start_date NULLS LAST, m.title",
                (project_id,),
            )
            return cur.fetchall()

    def find_milestones_with_assignees(self, project_id: int) -> list[dict]:
        """
        Return one row per (milestone, assigned employee) for the project.

        Only employees who are members of the project are included. Milestones
        with nobody assigned still get one row, with employee columns set to None.
        """
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT m.id AS milestone_id, m.title AS milestone_name, m.start_date, m.end_date, "
                "       e.id AS employee_id, u.first_name, u.last_name, u.username "
                "FROM milestones m "
                "LEFT JOIN (employee_milestones em "
                "           JOIN employees e ON e.id = em.employee_id "
                "           JOIN users u ON u.id = e.user_id "
                "           JOIN employee_projects ep ON ep.employee_id = e.id) "
                "       ON em.milestone_id = m.id AND ep.project_id = m.project_id "
                "WHERE m.project_id = %s "
                "ORDER BY m.id, u.last_name, u.first_name, e.id",
                (project_id,),
            )
            return cur.fetchall()

    def find_project_cost(self, project_id: int, hours_per_year: int) -> dict:
        """
        Return {hours, cost, employees_without_salary} for all hours logged on the project's
        milestones, costing each hour at the employee's salary / hours_per_year.
        Employees without a salary contribute hours but no cost; they're counted separately.
        """
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT COALESCE(SUM(t.hours), 0) AS hours, "
                "       COALESCE(SUM(t.hours * e.salary / %s), 0) AS cost, "
                "       COUNT(DISTINCT e.id) FILTER (WHERE e.salary IS NULL) AS employees_without_salary "
                "FROM time_entries t "
                "JOIN milestones m ON m.id = t.milestone_id "
                "JOIN employees e ON e.id = t.employee_id "
                "WHERE m.project_id = %s",
                (hours_per_year, project_id),
            )
            return cur.fetchone()

    def find_members_without_milestones(self, project_id: int) -> list[dict]:
        """Return the project's members who aren't assigned to any of its milestones; may be empty."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT e.id AS employee_id, u.first_name, u.last_name, u.username "
                "FROM employee_projects ep "
                "JOIN employees e ON e.id = ep.employee_id "
                "JOIN users u ON u.id = e.user_id "
                "WHERE ep.project_id = %s "
                "  AND NOT EXISTS ("
                "    SELECT 1 FROM employee_milestones em"
                "    JOIN milestones m ON m.id = em.milestone_id"
                "    WHERE em.employee_id = e.id AND m.project_id = ep.project_id"
                "  ) "
                "ORDER BY u.last_name, u.first_name, e.id",
                (project_id,),
            )
            return cur.fetchall()
