"""
Employee service: business logic for viewing employees.

Admins can see every employee and all of their projects, and so can a
manager for their direct reports. Anyone else can see themselves and
employees they share at least one project with, and then the profile only
lists projects the viewer is also a member of, so it never reveals a project
the viewer couldn't open.
"""

from datetime import date
from decimal import Decimal
from typing import Callable

from repository import EmployeeRepository
from shared.errors import ForbiddenError, NotFoundError
from shared.timeline import full_name, milestone_timeline
from shared.tokens import CurrentUser


def _project_status(archived_at: object, completed_at: object) -> str:
    if archived_at:
        return "archived"
    if completed_at:
        return "completed"
    return "active"


class EmployeeService:
    """Lists employees and returns employee profiles with their projects and milestones."""

    def __init__(self, repository: EmployeeRepository, today: Callable[[], date] = date.today) -> None:
        self._repository = repository
        self._today = today

    def list_employees(self, user: CurrentUser, query: str | None = None) -> list[dict]:
        """
        Return the employees the user can see: everyone for admins, otherwise
        themselves, the people they share a project with, and their direct reports.
        With query, only those whose name, username or job title contain it.

        Returns:
            list: [{employeeId, name, username, title, role}]
        """
        if user.is_admin:
            rows = self._repository.find_all_employees(query)
        else:
            rows = self._repository.find_employees_visible_to(user.id, query)
        return [
            {
                "employeeId": row["employee_id"],
                "name": full_name(row["first_name"], row["last_name"], row["username"]),
                "username": row["username"],
                "title": row["title"],
                "role": row["role"],
            }
            for row in rows
        ]

    def get_employee(self, user: CurrentUser, employee_id: int) -> dict:
        """
        Return an employee's profile, the projects the viewer may see, and their milestones.

        Returns:
            dict: {employeeId, name, username, email, title, role, isSelf,
                   canViewTimeLog,                   # self, their manager, or an admin
                   manager: {employeeId, name} | None,
                   totalHours,                       # sum over the projects returned
                   projects: [{projectId, title, status, hoursSpent,   # sum over its milestones
                               milestones: [{milestoneId, name, startDate, endDate, completedAt, hoursSpent,
                                             timeElapsedPercent, daysLeft, status}]}]}

        Raises:
            NotFoundError: no such employee.
            ForbiddenError: not an admin, not the viewer, not their manager, and they share no project.
        """
        employee = self._repository.find_employee_by_id(employee_id)
        if employee is None:
            raise NotFoundError(f"Employee {employee_id} not found")

        is_self = employee["user_id"] == user.id
        manages = (
            not user.is_admin and not is_self and user.is_manager
            and self._repository.is_manager_of(employee_id, user.id)
        )
        if not (user.is_admin or is_self or manages or self._repository.shares_project_with_user(employee_id, user.id)):
            raise ForbiddenError("You can only view employees who share a project with you")

        manager = None
        if employee["manager_id"] is not None:
            manager = {
                "employeeId": employee["manager_id"],
                "name": full_name(
                    employee["manager_first_name"], employee["manager_last_name"], employee["manager_username"]
                ),
            }

        # Admins and the employee's manager see all of their projects; others only the ones they share
        visible_to = None if (user.is_admin or manages) else user.id
        projects = self._group_projects(self._repository.find_projects_with_milestones(employee_id, visible_to))
        return {
            "employeeId": employee["employee_id"],
            "name": full_name(employee["first_name"], employee["last_name"], employee["username"]),
            "username": employee["username"],
            "email": employee["email"],
            "title": employee["title"],
            "role": employee["role"],
            "isSelf": is_self,
            "canViewTimeLog": user.is_admin or is_self or manages,
            "manager": manager,
            "totalHours": sum((p["hoursSpent"] for p in projects), Decimal(0)),
            "projects": projects,
        }

    def _group_projects(self, rows: list[dict]) -> list[dict]:
        today = self._today()
        projects: dict[int, dict] = {}
        for row in rows:
            project = projects.setdefault(row["project_id"], {
                "projectId": row["project_id"],
                "title": row["project_title"],
                "status": _project_status(row["archived_at"], row["completed_at"]),
                "hoursSpent": Decimal(0),
                "milestones": [],
            })
            if row["milestone_id"] is not None:
                project["hoursSpent"] += row["hours_spent"]
                project["milestones"].append({
                    "milestoneId": row["milestone_id"],
                    "name": row["milestone_name"],
                    "startDate": row["start_date"],
                    "endDate": row["end_date"],
                    "completedAt": row["milestone_completed_at"],
                    "hoursSpent": row["hours_spent"],
                    **milestone_timeline(
                        row["start_date"], row["end_date"], today, bool(row["milestone_completed_at"])
                    ),
                })
        return list(projects.values())
