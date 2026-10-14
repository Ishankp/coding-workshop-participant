"""
Time entry service: business rules for an employee's time log.

Who can do what with employee E's log:
  - E themselves: view it and add to it (never remove entries)
  - E's direct manager (role manager): view, add and remove
  - admins: view, add and remove, for anyone
Everyone else gets 403, including teammates. Every entry records who logged
it and their role, so hours a manager adds on E's behalf are visibly marked.
Hours can only be logged on milestones E is assigned to, and not for days in
the future.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Callable

from repository import EmployeeRepository
from shared.errors import ForbiddenError, NotFoundError, ValidationError
from shared.timeline import full_name
from shared.tokens import CurrentUser
from time_entries_repository import TimeEntryRepository


@dataclass(frozen=True)
class _Access:
    can_view: bool
    can_add: bool
    can_delete: bool


class TimeEntryService:
    """Reads and changes employees' time logs."""

    def __init__(
        self, employees: EmployeeRepository, entries: TimeEntryRepository, today: Callable[[], date] = date.today,
    ) -> None:
        self._employees = employees
        self._entries = entries
        self._today = today

    def get_log(self, user: CurrentUser, employee_id: int) -> dict:
        """
        Return an employee's full time log.

        Returns:
            dict: {employee: {employeeId, name, isSelf}, totalHours,
                   permissions: {canAdd, canDelete},
                   assignments: [{milestoneId, milestoneName, projectId, projectTitle}],  # for the add form
                   entries: [{entryId, workDate, hours, note, milestone: {milestoneId, name},
                              project: {projectId, title},
                              loggedBy: {userId, name, role} | None,   # who entered it
                              loggedBySelf,                           # False when a manager/admin added it
                              createdAt}]}

        Raises:
            NotFoundError: no such employee.
            ForbiddenError: viewer isn't the employee, their manager or an admin.
        """
        employee, access = self._load(user, employee_id)
        if not access.can_view:
            raise ForbiddenError("You can only view your own time log or those of your direct reports")

        entries = [_entry(row, employee["user_id"]) for row in self._entries.find_entries_by_employee(employee_id)]
        return {
            "employee": {
                "employeeId": employee["employee_id"],
                "name": full_name(employee["first_name"], employee["last_name"], employee["username"]),
                "isSelf": employee["user_id"] == user.id,
            },
            "totalHours": sum((e["hours"] for e in entries), Decimal(0)),
            "permissions": {"canAdd": access.can_add, "canDelete": access.can_delete},
            "assignments": [
                {
                    "milestoneId": row["milestone_id"],
                    "milestoneName": row["milestone_name"],
                    "projectId": row["project_id"],
                    "projectTitle": row["project_title"],
                }
                for row in self._entries.find_assignments(employee_id)
            ],
            "entries": entries,
        }

    def add_entry(  # pylint: disable=too-many-arguments
        self, user: CurrentUser, employee_id: int, milestone_id: int, work_date: date, hours: Decimal,
        note: str | None,
    ) -> dict:
        """
        Add an entry to an employee's log and return it.

        Raises:
            NotFoundError: no such employee.
            ForbiddenError: viewer may not add to this log.
            ValidationError: future date, or the employee isn't assigned to the milestone.
        """
        employee, access = self._load(user, employee_id)
        if not access.can_add:
            raise ForbiddenError("You can only log hours for yourself or your direct reports")

        fields = {}
        if work_date > self._today():
            fields["workDate"] = "Cannot be in the future"
        if not self._entries.is_assigned(employee_id, milestone_id):
            fields["milestoneId"] = "Employee is not assigned to this milestone"
        if fields:
            raise ValidationError("Invalid time entry", fields)

        entry_id = self._entries.insert_entry(employee_id, milestone_id, work_date, hours, note, user.id)
        return _entry(self._entries.find_entry(entry_id, employee_id), employee["user_id"])

    def delete_entry(self, user: CurrentUser, employee_id: int, entry_id: int) -> None:
        """
        Remove an entry from an employee's log.

        Raises:
            NotFoundError: no such employee, or no such entry in their log.
            ForbiddenError: viewer isn't the employee's manager or an admin.
        """
        _, access = self._load(user, employee_id)
        if not access.can_delete:
            raise ForbiddenError("Only the employee's manager or an admin can remove time entries")
        if not self._entries.delete_entry(entry_id, employee_id):
            raise NotFoundError(f"Time entry {entry_id} not found")

    def _load(self, user: CurrentUser, employee_id: int) -> tuple[dict, _Access]:
        employee = self._employees.find_employee_by_id(employee_id)
        if employee is None:
            raise NotFoundError(f"Employee {employee_id} not found")

        is_self = employee["user_id"] == user.id
        manages = (
            not user.is_admin and not is_self and user.is_manager
            and self._employees.is_manager_of(employee_id, user.id)
        )
        return employee, _Access(
            can_view=user.is_admin or is_self or manages,
            can_add=user.is_admin or is_self or manages,
            can_delete=user.is_admin or manages,
        )


def _entry(row: dict, employee_user_id: int) -> dict:
    logged_by = None
    if row["created_by_user_id"] is not None:
        logged_by = {
            "userId": row["created_by_user_id"],
            "name": full_name(row["cb_first_name"], row["cb_last_name"], row["cb_username"] or ""),
            "role": row["cb_role"],
        }
    return {
        "entryId": row["id"],
        "workDate": row["work_date"],
        "hours": row["hours"],
        "note": row["note"],
        "milestone": {"milestoneId": row["milestone_id"], "name": row["milestone_name"]},
        "project": {"projectId": row["project_id"], "title": row["project_title"]},
        "loggedBy": logged_by,
        "loggedBySelf": row["created_by_user_id"] == employee_user_id,
        "createdAt": row["created_at"],
    }
