"""
Milestones controller: HTTP routes for milestones and their dependencies.

Reads the logged-in user from the session token, parses path parameters and
bodies, calls the service, and builds the response.
"""

from service import MilestoneService
from shared.errors import ValidationError
from shared.http_utils import Request, json_response
from shared.tokens import require_user


class MilestoneController:
    """Routes: GET /milestones/{id}, POST /milestones/{id}/dependencies, DELETE /milestones/{id}/dependencies/{id}."""

    def __init__(self, service: MilestoneService) -> None:
        self._service = service

    def get_milestone(self, request: Request) -> dict:
        """GET /milestones/{milestoneId} -> 200 milestone | 400 | 401 | 403 | 404"""
        user = require_user(request)
        milestone_id = request.id_param("milestone_id", "milestoneId")
        return json_response(200, self._service.get_milestone(user, milestone_id))

    def add_dependency(self, request: Request) -> dict:
        """
        POST /milestones/{milestoneId}/dependencies  body: {"dependsOnMilestoneId": int}
        -> 201 dependency | 400 | 401 | 403 | 404
        """
        user = require_user(request)
        milestone_id = request.id_param("milestone_id", "milestoneId")
        depends_on = request.json().get("dependsOnMilestoneId")
        if isinstance(depends_on, bool) or not isinstance(depends_on, int) or depends_on < 1:
            raise ValidationError("Choose a milestone", {"dependsOnMilestoneId": "Choose a milestone"})
        return json_response(201, self._service.add_dependency(user, milestone_id, depends_on))

    def archive_milestone(self, request: Request) -> dict:
        """POST /milestones/{milestoneId}/archive -> 200 {milestoneId, name, archivedAt} | 400 | 401 | 403 | 404"""
        user = require_user(request)
        milestone_id = request.id_param("milestone_id", "milestoneId")
        return json_response(200, self._service.set_archived(user, milestone_id, True))

    def unarchive_milestone(self, request: Request) -> dict:
        """POST /milestones/{milestoneId}/unarchive -> 200 {milestoneId, name, archivedAt: null} | 400 | 401 | 403 | 404"""
        user = require_user(request)
        milestone_id = request.id_param("milestone_id", "milestoneId")
        return json_response(200, self._service.set_archived(user, milestone_id, False))

    def remove_dependency(self, request: Request) -> dict:
        """DELETE /milestones/{milestoneId}/dependencies/{dependsOnMilestoneId} -> 204 | 400 | 401 | 403 | 404"""
        user = require_user(request)
        milestone_id = request.id_param("milestone_id", "milestoneId")
        depends_on = request.id_param("depends_on_id", "dependsOnMilestoneId")
        self._service.remove_dependency(user, milestone_id, depends_on)
        return json_response(204)
