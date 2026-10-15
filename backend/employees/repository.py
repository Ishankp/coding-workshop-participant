"""
Employees repository: database queries for employee profiles.

One SQL query per method, returning plain dicts (or None / bool); no business rules.
"""

from typing import Callable

from psycopg import Connection

from shared.search import contains_pattern

_LIST_COLUMNS = "e.id AS employee_id, e.title, u.username, u.first_name, u.last_name, u.role"

# An employee matches a search when their full name, username or job title contains the text
# (The ::text casts let Postgres type the parameter when it's NULL.)
_EMPLOYEE_MATCHES = (
    "(%(pattern)s::text IS NULL"
    " OR concat_ws(' ', u.first_name, u.last_name) ILIKE %(pattern)s::text"
    " OR u.username ILIKE %(pattern)s::text OR e.title ILIKE %(pattern)s::text)"
)


class EmployeeRepository:
    """Reads employees, their manager, and their project and milestone assignments."""

    def __init__(self, get_connection: Callable[[], Connection]) -> None:
        self._get_connection = get_connection

    def find_all_employees(self, query: str | None = None) -> list[dict]:
        """Return every employee with their role; may be empty. With query, only matching employees."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                f"SELECT {_LIST_COLUMNS} FROM employees e "  # nosec B608 - query text is built from module constants; values are bound as parameters
                "JOIN users u ON u.id = e.user_id "
                "WHERE u.deactivated_at IS NULL AND " + _EMPLOYEE_MATCHES + " "
                "ORDER BY u.last_name, u.first_name, e.id",
                {"pattern": contains_pattern(query) if query else None},
            )
            return cur.fetchall()

    def find_employees_visible_to(self, user_id: int, query: str | None = None) -> list[dict]:
        """
        Return the user's own employee record, everyone in at least one of their
        projects, and (if they manage anyone) their direct reports. With query,
        only those whose name, username or title contain it.
        """
        with self._get_connection().cursor() as cur:
            cur.execute(
                f"SELECT {_LIST_COLUMNS} FROM employees e "  # nosec B608 - query text is built from module constants; values are bound as parameters
                "JOIN users u ON u.id = e.user_id "
                "WHERE u.deactivated_at IS NULL AND (e.user_id = %(user_id)s "
                "   OR e.manager_id = (SELECT id FROM employees WHERE user_id = %(user_id)s) "
                "   OR EXISTS ("
                "     SELECT 1 FROM employee_projects ep"
                "     JOIN employee_projects vp ON vp.project_id = ep.project_id"
                "     JOIN employees ve ON ve.id = vp.employee_id"
                "     WHERE ep.employee_id = e.id AND ve.user_id = %(user_id)s"
                "   )) "
                "  AND " + _EMPLOYEE_MATCHES + " "
                "ORDER BY u.last_name, u.first_name, e.id",
                {"user_id": user_id, "pattern": contains_pattern(query) if query else None},
            )
            return cur.fetchall()

    def find_employee_by_id(self, employee_id: int) -> dict | None:
        """Return the employee's profile and their manager's name, or None. Salary is not selected."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT e.id AS employee_id, e.user_id, e.title, e.manager_id, "
                "       u.username, u.email, u.first_name, u.last_name, u.role, "
                "       mu.first_name AS manager_first_name, mu.last_name AS manager_last_name, "
                "       mu.username AS manager_username "
                "FROM employees e "
                "JOIN users u ON u.id = e.user_id "
                "LEFT JOIN employees mgr ON mgr.id = e.manager_id "
                "LEFT JOIN users mu ON mu.id = mgr.user_id "
                "WHERE e.id = %s",
                (employee_id,),
            )
            return cur.fetchone()

    def shares_project_with_user(self, employee_id: int, user_id: int) -> bool:
        """Return True if the employee and the user are members of at least one common project."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT EXISTS ("
                "  SELECT 1 FROM employee_projects ep"
                "  JOIN employee_projects vp ON vp.project_id = ep.project_id"
                "  JOIN employees ve ON ve.id = vp.employee_id"
                "  WHERE ep.employee_id = %s AND ve.user_id = %s"
                ") AS shares",
                (employee_id, user_id),
            )
            return cur.fetchone()["shares"]

    def is_manager_of(self, employee_id: int, user_id: int) -> bool:
        """Return True if the user's employee record is the employee's direct manager."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT EXISTS ("
                "  SELECT 1 FROM employees e"
                "  JOIN employees mgr ON mgr.id = e.manager_id"
                "  WHERE e.id = %s AND mgr.user_id = %s"
                ") AS manages",
                (employee_id, user_id),
            )
            return cur.fetchone()["manages"]

    def find_projects_with_milestones(
        self, employee_id: int, visible_to_user_id: int | None, include_archived: bool = True,
    ) -> list[dict]:
        """
        Return one row per (project, milestone) for the employee's projects, with
        the hours the employee has logged on each milestone (summed from time_entries).

        If visible_to_user_id is given, only projects that user is also a member
        of are included; None means all of the employee's projects. Unless
        include_archived, archived projects and milestones are left out. Projects
        where the employee has no milestones still get one row, with milestone
        columns set to None.
        """
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT p.id AS project_id, p.title AS project_title, p.archived_at, p.completed_at, "
                "       m.id AS milestone_id, m.title AS milestone_name, m.start_date, m.end_date, "
                "       m.completed_at AS milestone_completed_at, "
                "       (SELECT COALESCE(SUM(t.hours), 0) FROM time_entries t"
                "         WHERE t.employee_id = em.employee_id AND t.milestone_id = em.milestone_id) AS hours_spent "
                "FROM employee_projects ep "
                "JOIN projects p ON p.id = ep.project_id "
                "LEFT JOIN (employee_milestones em JOIN milestones m ON m.id = em.milestone_id) "
                "       ON em.employee_id = ep.employee_id AND m.project_id = ep.project_id "
                "      AND (%(include_archived)s OR m.archived_at IS NULL) "
                "WHERE ep.employee_id = %(employee_id)s "
                "  AND (%(include_archived)s OR p.archived_at IS NULL) "
                "  AND (%(viewer)s::int IS NULL OR EXISTS ("
                "    SELECT 1 FROM employee_projects vp"
                "    JOIN employees ve ON ve.id = vp.employee_id"
                "    WHERE vp.project_id = ep.project_id AND ve.user_id = %(viewer)s::int"
                "  )) "
                "ORDER BY p.title, p.id, m.start_date NULLS LAST, m.title",
                {"employee_id": employee_id, "viewer": visible_to_user_id, "include_archived": include_archived},
            )
            return cur.fetchall()
