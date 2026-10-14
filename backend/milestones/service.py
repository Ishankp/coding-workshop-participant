"""
Milestone service: business logic for reading milestones.

Admins can see every milestone; anyone else only sees milestones in
projects they are members of.
"""

from repository import MilestoneRepository
from shared.errors import ForbiddenError, NotFoundError
from shared.tokens import CurrentUser


class MilestoneService:
    """Returns milestone details for the logged-in user."""

    def __init__(self, repository: MilestoneRepository) -> None:
        self._repository = repository

    def get_milestone(self, user: CurrentUser, milestone_id: int) -> dict:
        """
        Return a milestone's details.

        Raises:
            NotFoundError: no such milestone.
            ForbiddenError: the user isn't an admin or a member of the milestone's project.
        """
        milestone = self._repository.find_milestone_by_id(milestone_id)
        if milestone is None:
            raise NotFoundError(f"Milestone {milestone_id} not found")
        if not user.is_admin and not self._repository.is_project_member(milestone["project_id"], user.id):
            raise ForbiddenError("You are not a member of this milestone's project")

        return {
            "milestoneId": milestone["id"],
            "projectId": milestone["project_id"],
            "name": milestone["title"],
            "description": milestone["description"],
            "startDate": milestone["start_date"],
            "endDate": milestone["end_date"],
            "completedAt": milestone["completed_at"],
        }
