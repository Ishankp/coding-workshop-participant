"""
Authoring service: creating projects and milestones.

Managers and admins can create projects; a manager who creates one becomes a
member of it, so they can see and manage it. Milestones can be added by admins
and by managers who are members of the project, and must fit inside the
project's dates.
"""

from datetime import date
from decimal import Decimal

from repository import ProjectRepository
from shared.errors import ForbiddenError, NotFoundError, ValidationError
from shared.tokens import CurrentUser
from shared.validation import milestone_date_errors


class AuthoringService:
    """Creates projects and milestones for managers and admins."""

    def __init__(self, repository: ProjectRepository) -> None:
        self._repository = repository

    def create_project(  # pylint: disable=too-many-arguments
        self, user: CurrentUser, title: str, start_date: date | None, end_date: date | None, budget: Decimal | None,
    ) -> dict:
        """
        Create a project. The creating manager is added as a member.

        Returns:
            dict: {projectId, title, startDate, endDate, budget, archivedAt, completedAt}

        Raises:
            ForbiddenError: employees can't create projects.
            ValidationError: end date before start date.
        """
        if not (user.is_admin or user.is_manager):
            raise ForbiddenError("Only managers and admins can create projects")
        if start_date and end_date and end_date < start_date:
            raise ValidationError("Invalid dates", {"endDate": "Must be on or after the start date"})

        project = self._repository.insert_project(title, start_date, end_date, budget)
        if user.is_manager:
            employee_id = self._repository.find_employee_id_by_user(user.id)
            if employee_id is not None:
                self._repository.insert_member(project["id"], employee_id)

        return {
            "projectId": project["id"],
            "title": project["title"],
            "startDate": project["start_date"],
            "endDate": project["end_date"],
            "budget": project["budget"],
            "archivedAt": project["archived_at"],
            "completedAt": project["completed_at"],
        }

    def update_project(  # pylint: disable=too-many-arguments
        self, user: CurrentUser, project_id: int, title: str, start_date: date | None, end_date: date | None,
        budget: Decimal | None,
    ) -> dict:
        """
        Change a project's title, dates and budget.

        Raises:
            NotFoundError: no such project.
            ForbiddenError: not an admin or a manager who is a member of the project.
            ValidationError: end before start, or the new dates would leave a milestone outside the project.
        """
        self._load_managed_project(user, project_id)
        errors: dict[str, str] = {}
        if start_date and end_date and end_date < start_date:
            errors["endDate"] = "Must be on or after the start date"
        for m in self._repository.find_all_milestone_dates(project_id):
            first, last = m["start_date"] or m["end_date"], m["end_date"] or m["start_date"]
            if start_date and first and first < start_date:
                errors.setdefault("startDate", f"Milestone \"{m['title']}\" starts on {first.isoformat()}; move it first")
            if end_date and last and last > end_date:
                errors.setdefault("endDate", f"Milestone \"{m['title']}\" ends on {last.isoformat()}; move it first")
        if errors:
            raise ValidationError("Invalid project dates", errors)

        project = self._repository.update_project(project_id, title, start_date, end_date, budget)
        return {
            "projectId": project["id"],
            "title": project["title"],
            "startDate": project["start_date"],
            "endDate": project["end_date"],
            "budget": project["budget"],
            "archivedAt": project["archived_at"],
            "completedAt": project["completed_at"],
        }

    def set_project_archived(self, user: CurrentUser, project_id: int, archived: bool) -> dict:
        """
        Archive (hide from employees and progress) or restore a project.

        Raises:
            NotFoundError: no such project.
            ForbiddenError: not an admin or a manager who is a member of the project.
        """
        self._load_managed_project(user, project_id)
        project = self._repository.set_project_archived(project_id, archived)
        return {
            "projectId": project["id"],
            "title": project["title"],
            "archivedAt": project["archived_at"],
        }

    def create_milestone(  # pylint: disable=too-many-arguments
        self, user: CurrentUser, project_id: int, title: str, description: str | None,
        start_date: date | None, end_date: date | None,
    ) -> dict:
        """
        Create a milestone in a project. Dates must fall within the project's dates.

        Returns:
            dict: {milestoneId, projectId, name, description, startDate, endDate, completedAt}

        Raises:
            NotFoundError: no such project.
            ForbiddenError: not an admin or a manager who is a member of the project.
            ValidationError: dates outside the project, or end before start.
        """
        project = self._load_managed_project(user, project_id)
        errors = milestone_date_errors(project, start_date, end_date)
        if errors:
            raise ValidationError("Milestone dates must fit inside the project", errors)

        milestone = self._repository.insert_milestone(project_id, title, description, start_date, end_date)
        return {
            "milestoneId": milestone["id"],
            "projectId": milestone["project_id"],
            "name": milestone["title"],
            "description": milestone["description"],
            "startDate": milestone["start_date"],
            "endDate": milestone["end_date"],
            "completedAt": milestone["completed_at"],
        }

    def _load_managed_project(self, user: CurrentUser, project_id: int) -> dict:
        project = self._repository.find_project_by_id(project_id)
        if project is None:
            raise NotFoundError(f"Project {project_id} not found")
        if not user.is_admin:
            if not self._repository.is_project_member(project_id, user.id):
                raise ForbiddenError("You are not a member of this project")
            if not user.is_manager:
                raise ForbiddenError("Only managers of this project or admins can change it")
        return project
