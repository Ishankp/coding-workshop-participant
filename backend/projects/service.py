"""
Project service: business logic for reading projects.

Admins can see every project. Managers and employees can only see projects
they are members of, so every project read checks membership first using
the user taken from the session token. Budgets and costs are only shown to
managers and admins.
"""

from datetime import date
from decimal import Decimal
from typing import Callable

from repository import ProjectRepository
from shared.errors import ForbiddenError, NotFoundError
from shared.timeline import elapsed_fraction, full_name, milestone_timeline
from shared.tokens import CurrentUser

# Converts an annual salary into an hourly rate: 52 weeks × 40 hours
HOURS_PER_YEAR = 2080


class ProjectService:
    """Lists projects, project details, members and milestones for the logged-in user."""

    def __init__(self, repository: ProjectRepository, today: Callable[[], date] = date.today) -> None:
        self._repository = repository
        self._today = today

    def list_projects_for_user(self, user: CurrentUser) -> list[dict]:
        """
        Return the projects the user can see as [{projectId, title}]: every project
        for admins, otherwise the user's own. An empty list is a normal result.
        """
        if user.is_admin:
            rows = self._repository.find_all_projects()
        else:
            rows = self._repository.find_projects_by_user_id(user.id)
        return [{"projectId": row["id"], "title": row["title"]} for row in rows]

    def get_project(self, user: CurrentUser, project_id: int) -> dict:
        """
        Return a project's details. The budget is only included for managers and admins.

        Raises:
            NotFoundError: no such project.
            ForbiddenError: the user isn't an admin or a member of it.
        """
        project = self._load_visible_project(user, project_id)
        return {
            "projectId": project["id"],
            "title": project["title"],
            "startDate": project["start_date"],
            "endDate": project["end_date"],
            "budget": project["budget"] if (user.is_admin or user.is_manager) else None,
            "archivedAt": project["archived_at"],
            "completedAt": project["completed_at"],
        }

    def get_project_members(self, user: CurrentUser, project_id: int) -> list[dict]:
        """
        Return the project's members, each once, with their milestones in this project.

        Returns:
            list: [{employeeId, name, username, milestones: [{milestoneId, name}]}]

        Raises:
            NotFoundError: no such project.
            ForbiddenError: the user isn't an admin or a member of it.
        """
        self._load_visible_project(user, project_id)

        members: dict[int, dict] = {}
        for row in self._repository.find_members_with_milestones(project_id):
            member = members.setdefault(row["employee_id"], {
                "employeeId": row["employee_id"],
                "name": full_name(row["first_name"], row["last_name"], row["username"]),
                "username": row["username"],
                "milestones": [],
            })
            if row["milestone_id"] is not None:
                member["milestones"].append({"milestoneId": row["milestone_id"], "name": row["milestone_name"]})
        return list(members.values())

    def get_project_milestones(self, user: CurrentUser, project_id: int) -> dict:
        """
        Return the project's milestones with their schedule and assigned employees,
        plus the project members who aren't assigned to any of its milestones.

        Milestones are sorted by time elapsed, highest first (closest to or past
        their end date on top); ties go to the earlier end date. Milestones
        without both dates go last.

        Returns:
            dict: {
                "milestones": [{milestoneId, name, startDate, endDate, timeElapsedPercent,
                                daysLeft, status, employees: [{employeeId, name, username}]}],
                "unassignedEmployees": [{employeeId, name, username}],
            }

        Raises:
            NotFoundError: no such project.
            ForbiddenError: the user isn't an admin or a member of it.
        """
        self._load_visible_project(user, project_id)
        today = self._today()

        milestones: dict[int, dict] = {}
        for row in self._repository.find_milestones_with_assignees(project_id):
            milestone = milestones.get(row["milestone_id"])
            if milestone is None:
                milestone = milestones[row["milestone_id"]] = {
                    "milestoneId": row["milestone_id"],
                    "name": row["milestone_name"],
                    "startDate": row["start_date"],
                    "endDate": row["end_date"],
                    **milestone_timeline(row["start_date"], row["end_date"], today),
                    "employees": [],
                }
            if row["employee_id"] is not None:
                milestone["employees"].append(_employee(row))

        def sort_key(m: dict) -> tuple:
            percent = m["timeElapsedPercent"]
            return (percent is None, -(percent or 0), m["endDate"] or date.max, m["name"])

        return {
            "milestones": sorted(milestones.values(), key=sort_key),
            "unassignedEmployees": [
                _employee(row) for row in self._repository.find_members_without_milestones(project_id)
            ],
        }

    def get_project_budget(self, user: CurrentUser, project_id: int) -> dict:
        """
        Compare what a project has cost so far with its budget, and project the final cost.

        Spent = every hour logged on the project's milestones × that employee's hourly rate
        (annual salary / HOURS_PER_YEAR). The projection assumes spending continues at the
        average rate so far: projected = spent / share of the schedule elapsed.

        Returns:
            dict: {budget, spent, remaining, spentPercent, hoursLogged, timeElapsedPercent,
                   projectedCost,                      # None before the start date or without dates
                   variance: {amount, percent, direction: "over" | "under" | "on_budget"} | None,
                   assumptions: {hoursPerYear, employeesWithoutSalary}}
            Percentages are relative to the budget and None when there is no budget.

        Raises:
            NotFoundError: no such project.
            ForbiddenError: not an admin or manager, or not a member of the project.
        """
        project = self._load_visible_project(user, project_id)
        if not (user.is_admin or user.is_manager):
            raise ForbiddenError("Only managers and admins can view project budgets")

        cost = self._repository.find_project_cost(project_id, HOURS_PER_YEAR)
        budget = project["budget"]
        spent = _money(cost["cost"])

        fraction = elapsed_fraction(project["start_date"], project["end_date"], self._today())
        projected = _money(spent / Decimal(str(fraction))) if fraction else None

        variance = None
        if projected is not None and budget:
            amount = _money(projected - budget)
            variance = {
                "amount": amount,
                "percent": _percent(amount / budget),
                "direction": "over" if amount > 0 else "under" if amount < 0 else "on_budget",
            }

        return {
            "budget": budget,
            "spent": spent,
            "remaining": _money(budget - spent) if budget is not None else None,
            "spentPercent": _percent(spent / budget) if budget else None,
            "hoursLogged": cost["hours"],
            "timeElapsedPercent": None if fraction is None else round(fraction * 100),
            "projectedCost": projected,
            "variance": variance,
            "assumptions": {
                "hoursPerYear": HOURS_PER_YEAR,
                "employeesWithoutSalary": cost["employees_without_salary"],
            },
        }

    def _load_visible_project(self, user: CurrentUser, project_id: int) -> dict:
        project = self._repository.find_project_by_id(project_id)
        if project is None:
            raise NotFoundError(f"Project {project_id} not found")
        if not user.is_admin and not self._repository.is_project_member(project_id, user.id):
            raise ForbiddenError("You are not a member of this project")
        return project


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def _percent(ratio: Decimal) -> float:
    return round(float(ratio) * 100, 1)


def _employee(row: dict) -> dict:
    return {
        "employeeId": row["employee_id"],
        "name": full_name(row["first_name"], row["last_name"], row["username"]),
        "username": row["username"],
    }
