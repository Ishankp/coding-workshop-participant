"""
Projects repository: database queries for projects and their members.

One SQL query per method, returning plain dicts (or None / bool); no business rules.
"""

from typing import Callable

from psycopg import Connection

from shared import dependencies, membership
from shared.search import contains_pattern

_LIST_COLUMNS = "p.id, p.title, p.start_date, p.end_date, p.archived_at, p.completed_at"

# Employee e is in the pool of the manager whose user id is %(user_id)s when e is that manager,
# reports to them, or shares a project with them
_IN_POOL_OF_USER = (
    "EXISTS (SELECT 1 FROM employees mgr WHERE mgr.user_id = %(user_id)s::int AND ("
    "  e.id = mgr.id OR e.manager_id = mgr.id OR EXISTS ("
    "    SELECT 1 FROM employee_projects a JOIN employee_projects b ON b.project_id = a.project_id"
    "    WHERE a.employee_id = e.id AND b.employee_id = mgr.id)))"
)

# A project matches a search when its title or one of its milestone titles contains the text
# (The ::text casts let Postgres type the parameter when it's NULL.)
_PROJECT_MATCHES = (
    "(%(pattern)s::text IS NULL OR p.title ILIKE %(pattern)s::text "
    " OR EXISTS (SELECT 1 FROM milestones sm WHERE sm.project_id = p.id AND sm.title ILIKE %(pattern)s::text))"
)


class ProjectRepository:
    """Reads projects, membership and project members from PostgreSQL."""

    def __init__(self, get_connection: Callable[[], Connection]) -> None:
        self._get_connection = get_connection

    def find_projects_by_user_id(
        self, user_id: int, query: str | None = None, include_archived: bool = True,
    ) -> list[dict]:
        """
        Return every project the user is assigned to, with its dates and status timestamps;
        may be empty. With query, only projects whose title or milestone titles contain it.
        Archived projects are left out unless include_archived.
        """
        with self._get_connection().cursor() as cur:
            cur.execute(
                f"SELECT {_LIST_COLUMNS} FROM projects p "
                "JOIN employee_projects ep ON ep.project_id = p.id "
                "JOIN employees e ON e.id = ep.employee_id "
                "WHERE e.user_id = %(user_id)s AND " + _PROJECT_MATCHES + " "
                "  AND (%(include_archived)s OR p.archived_at IS NULL) "
                "ORDER BY p.title",
                {"user_id": user_id, "pattern": contains_pattern(query) if query else None,
                 "include_archived": include_archived},
            )
            return cur.fetchall()

    def update_project(self, project_id: int, title: str, start_date, end_date, budget) -> dict:
        """Change a project's title, dates and budget; return its row."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "UPDATE projects SET title = %s, start_date = %s, end_date = %s, budget = %s WHERE id = %s "
                "RETURNING id, title, start_date, end_date, budget, archived_at, completed_at",
                (title, start_date, end_date, budget, project_id),
            )
            return cur.fetchone()

    def find_all_milestone_dates(self, project_id: int) -> list[dict]:
        """Return {title, start_date, end_date} for every milestone of the project, archived ones included."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT title, start_date, end_date FROM milestones WHERE project_id = %s ORDER BY start_date NULLS LAST, title",
                (project_id,),
            )
            return cur.fetchall()

    def count_project_time_entries(self, project_id: int) -> int:
        """How many time entries exist on any of the project's milestones."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT count(*) AS n FROM time_entries t JOIN milestones m ON m.id = t.milestone_id "
                "WHERE m.project_id = %s",
                (project_id,),
            )
            return cur.fetchone()["n"]

    def delete_project(self, project_id: int) -> bool:
        """Delete a project (its milestones, memberships and dependencies cascade); return whether it existed."""
        with self._get_connection().cursor() as cur:
            cur.execute("DELETE FROM projects WHERE id = %s", (project_id,))
            return cur.rowcount == 1

    def set_project_archived(self, project_id: int, archived: bool) -> dict:
        """Archive or restore a project; return its row."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "UPDATE projects SET archived_at = CASE WHEN %s THEN COALESCE(archived_at, now()) ELSE NULL END "
                "WHERE id = %s RETURNING id, title, start_date, end_date, budget, archived_at, completed_at",
                (archived, project_id),
            )
            return cur.fetchone()

    def find_all_projects(self, query: str | None = None) -> list[dict]:
        """Return every project with its dates and status timestamps; may be empty. With query, only matches."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                f"SELECT {_LIST_COLUMNS} FROM projects p WHERE " + _PROJECT_MATCHES + " ORDER BY p.title",
                {"pattern": contains_pattern(query) if query else None},
            )
            return cur.fetchall()

    # ---- creating ---------------------------------------------------------------

    def insert_project(self, title: str, start_date, end_date, budget) -> dict:
        """Create a project and return its row."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "INSERT INTO projects (title, start_date, end_date, budget) VALUES (%s, %s, %s, %s) "
                "RETURNING id, title, start_date, end_date, budget, archived_at, completed_at",
                (title, start_date, end_date, budget),
            )
            return cur.fetchone()

    def insert_milestone(self, project_id: int, title: str, description, start_date, end_date) -> dict:
        """Create a milestone in a project and return its row."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "INSERT INTO milestones (project_id, title, description, start_date, end_date) "
                "VALUES (%s, %s, %s, %s, %s) "
                "RETURNING id, project_id, title, description, start_date, end_date, completed_at",
                (project_id, title, description, start_date, end_date),
            )
            return cur.fetchone()

    def find_employee_id_by_user(self, user_id: int) -> int | None:
        """Return the employee id for a user, or None (admins have no employee record)."""
        with self._get_connection().cursor() as cur:
            cur.execute("SELECT id FROM employees WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            return row["id"] if row else None

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
                "SELECT m.id AS milestone_id, m.title AS milestone_name, m.start_date, m.end_date, m.completed_at, "
                "       m.archived_at, e.id AS employee_id, u.first_name, u.last_name, u.username "
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

    def find_project_dependencies(self, project_id: int) -> list[dict]:
        """Return the dependencies between the project's milestones (see shared.dependencies)."""
        return dependencies.find_project_dependencies(self._get_connection, project_id)

    def find_milestones_for_projects(self, project_ids: list[int]) -> list[dict]:
        """
        Return every non-archived milestone of the given projects (id, project_id, title,
        dates, completed_at), ordered by project then start date; may be empty. Archived
        milestones are left out because they don't count towards progress.
        """
        if not project_ids:
            return []
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT id, project_id, title, start_date, end_date, completed_at "
                "FROM milestones WHERE project_id = ANY(%s) AND archived_at IS NULL "
                "ORDER BY project_id, start_date NULLS LAST, title, id",
                (project_ids,),
            )
            return cur.fetchall()

    # ---- team management -----------------------------------------------------------

    def find_team(self, project_id: int) -> list[dict]:
        """
        Return one row per (member, milestone assignment in this project), with the member's
        hours logged on the project. Members with no milestone still get one row with
        milestone columns set to None.
        """
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT e.id AS employee_id, e.title, u.username, u.first_name, u.last_name, u.role, "
                "       m.id AS milestone_id, m.title AS milestone_name, "
                "       (SELECT COALESCE(SUM(t.hours), 0) FROM time_entries t"
                "         JOIN milestones tm ON tm.id = t.milestone_id"
                "         WHERE t.employee_id = e.id AND tm.project_id = ep.project_id) AS hours_logged "
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

    def find_non_members(self, project_id: int, pool_of_user_id: int | None = None) -> list[dict]:
        """
        Return employees who are not members of the project; may be empty.
        With pool_of_user_id, only that manager's people (see is_in_pool_of).
        """
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT e.id AS employee_id, e.title, u.username, u.first_name, u.last_name, u.role "
                "FROM employees e JOIN users u ON u.id = e.user_id "
                "WHERE u.deactivated_at IS NULL "
                "  AND NOT EXISTS (SELECT 1 FROM employee_projects ep"
                "                  WHERE ep.project_id = %(project_id)s AND ep.employee_id = e.id) "
                "  AND (%(user_id)s::int IS NULL OR " + _IN_POOL_OF_USER + ") "
                "ORDER BY u.last_name, u.first_name, e.id",
                {"project_id": project_id, "user_id": pool_of_user_id},
            )
            return cur.fetchall()

    def is_in_pool_of(self, employee_id: int, user_id: int) -> bool:
        """
        Return True if the employee is one of the manager's people: themselves, a direct
        report, or a member of a project the manager is also a member of.
        """
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT 1 FROM employees e WHERE e.id = %(employee_id)s AND " + _IN_POOL_OF_USER + ") AS ok",
                {"employee_id": employee_id, "user_id": user_id},
            )
            return cur.fetchone()["ok"]

    def find_employee_summary(self, employee_id: int) -> dict | None:
        """Return an employee's id, title, username, names and role, or None."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT e.id AS employee_id, e.title, u.username, u.first_name, u.last_name, u.role "
                "FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = %s",
                (employee_id,),
            )
            return cur.fetchone()

    def is_member(self, project_id: int, employee_id: int) -> bool:
        """Return True if the employee is a member of the project."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT 1 FROM employee_projects WHERE project_id = %s AND employee_id = %s) AS ok",
                (project_id, employee_id),
            )
            return cur.fetchone()["ok"]

    def insert_member(self, project_id: int, employee_id: int) -> None:
        """Add an employee to a project."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "INSERT INTO employee_projects (employee_id, project_id) VALUES (%s, %s)", (employee_id, project_id)
            )

    def delete_member(self, project_id: int, employee_id: int) -> bool:
        """Remove an employee from a project; return whether they were a member."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "DELETE FROM employee_projects WHERE project_id = %s AND employee_id = %s", (project_id, employee_id)
            )
            return cur.rowcount == 1

    def delete_member_assignments(self, project_id: int, employee_id: int) -> int:
        """Remove the employee's milestone assignments within the project; return how many."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "DELETE FROM employee_milestones em USING milestones m "
                "WHERE m.id = em.milestone_id AND m.project_id = %s AND em.employee_id = %s",
                (project_id, employee_id),
            )
            return cur.rowcount

    def find_project_milestone(self, project_id: int, milestone_id: int) -> dict | None:
        """Return {id, title, archived_at} if the milestone belongs to the project, else None."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT id, title, archived_at FROM milestones WHERE id = %s AND project_id = %s",
                (milestone_id, project_id),
            )
            return cur.fetchone()

    def is_assigned(self, employee_id: int, milestone_id: int) -> bool:
        """Return True if the employee is assigned to the milestone."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT EXISTS (SELECT 1 FROM employee_milestones WHERE employee_id = %s AND milestone_id = %s) AS ok",
                (employee_id, milestone_id),
            )
            return cur.fetchone()["ok"]

    def insert_assignment(self, employee_id: int, milestone_id: int) -> None:
        """Assign an employee to a milestone."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "INSERT INTO employee_milestones (employee_id, milestone_id) VALUES (%s, %s)", (employee_id, milestone_id)
            )

    def delete_assignment(self, employee_id: int, milestone_id: int) -> bool:
        """Unassign an employee from a milestone; return whether they were assigned."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "DELETE FROM employee_milestones WHERE employee_id = %s AND milestone_id = %s", (employee_id, milestone_id)
            )
            return cur.rowcount == 1

    def count_milestone_entries(self, employee_id: int, milestone_id: int) -> int:
        """How many time entries the employee has logged on the milestone."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT count(*) AS n FROM time_entries WHERE employee_id = %s AND milestone_id = %s",
                (employee_id, milestone_id),
            )
            return cur.fetchone()["n"]

    def count_project_entries(self, employee_id: int, project_id: int) -> int:
        """How many time entries the employee has logged on any of the project's milestones."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT count(*) AS n FROM time_entries t JOIN milestones m ON m.id = t.milestone_id "
                "WHERE t.employee_id = %s AND m.project_id = %s",
                (employee_id, project_id),
            )
            return cur.fetchone()["n"]

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
                "    WHERE em.employee_id = e.id AND m.project_id = ep.project_id AND m.archived_at IS NULL"
                "  ) "
                "ORDER BY u.last_name, u.first_name, e.id",
                (project_id,),
            )
            return cur.fetchall()
