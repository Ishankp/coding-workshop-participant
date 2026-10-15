"""
Time entries repository: database queries for an employee's time log.

One SQL query per method, returning plain dicts (or None / bool); no business rules.
"""

from datetime import date
from decimal import Decimal
from typing import Callable

from psycopg import Connection

_ENTRY_SELECT = (
    "SELECT t.id, t.work_date, t.hours, t.note, t.created_at, t.created_by_user_id, "
    "       m.id AS milestone_id, m.title AS milestone_name, p.id AS project_id, p.title AS project_title, "
    "       cb.first_name AS cb_first_name, cb.last_name AS cb_last_name, cb.username AS cb_username, "
    "       cb.role AS cb_role "
    "FROM time_entries t "
    "JOIN milestones m ON m.id = t.milestone_id "
    "JOIN projects p ON p.id = m.project_id "
    "LEFT JOIN users cb ON cb.id = t.created_by_user_id "
)


class TimeEntryRepository:
    """Reads and writes time_entries."""

    def __init__(self, get_connection: Callable[[], Connection]) -> None:
        self._get_connection = get_connection

    def find_entries_by_employee(self, employee_id: int) -> list[dict]:
        """Return the employee's entries, newest work date first; may be empty."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                _ENTRY_SELECT + "WHERE t.employee_id = %s ORDER BY t.work_date DESC, t.created_at DESC, t.id DESC",
                (employee_id,),
            )
            return cur.fetchall()

    def find_entry(self, entry_id: int, employee_id: int) -> dict | None:
        """Return one of the employee's entries, or None."""
        with self._get_connection().cursor() as cur:
            cur.execute(_ENTRY_SELECT + "WHERE t.id = %s AND t.employee_id = %s", (entry_id, employee_id))
            return cur.fetchone()

    def find_assignments(self, employee_id: int) -> list[dict]:
        """Return the active milestones (with their project) the employee is assigned to; may be empty."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT m.id AS milestone_id, m.title AS milestone_name, p.id AS project_id, p.title AS project_title "
                "FROM employee_milestones em "
                "JOIN milestones m ON m.id = em.milestone_id "
                "JOIN projects p ON p.id = m.project_id "
                "WHERE em.employee_id = %s AND m.archived_at IS NULL AND p.archived_at IS NULL "
                "ORDER BY p.title, m.start_date NULLS LAST, m.title",
                (employee_id,),
            )
            return cur.fetchall()

    def is_assigned(self, employee_id: int, milestone_id: int) -> bool:
        """Return True if the employee is assigned to the milestone and neither it nor its project is archived."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "SELECT EXISTS ("
                "  SELECT 1 FROM employee_milestones em"
                "  JOIN milestones m ON m.id = em.milestone_id JOIN projects p ON p.id = m.project_id"
                "  WHERE em.employee_id = %s AND em.milestone_id = %s"
                "    AND m.archived_at IS NULL AND p.archived_at IS NULL"
                ") AS ok",
                (employee_id, milestone_id),
            )
            return cur.fetchone()["ok"]

    def insert_entry(  # pylint: disable=too-many-arguments
        self, employee_id: int, milestone_id: int, work_date: date, hours: Decimal, note: str | None,
        created_by_user_id: int,
    ) -> int:
        """Insert an entry and return its id."""
        with self._get_connection().cursor() as cur:
            cur.execute(
                "INSERT INTO time_entries (employee_id, milestone_id, work_date, hours, note, created_by_user_id) "
                "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
                (employee_id, milestone_id, work_date, hours, note, created_by_user_id),
            )
            return cur.fetchone()["id"]

    def delete_entry(self, entry_id: int, employee_id: int) -> bool:
        """Delete one of the employee's entries; return whether it existed."""
        with self._get_connection().cursor() as cur:
            cur.execute("DELETE FROM time_entries WHERE id = %s AND employee_id = %s", (entry_id, employee_id))
            return cur.rowcount == 1
