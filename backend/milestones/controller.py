"""
Milestones controller: HTTP routes for milestones.

Reads the logged-in user from the session token, parses path parameters,
calls the service, and builds the response.
"""

from service import MilestoneService
from shared.http_utils import Request, json_response
from shared.tokens import require_user


class MilestoneController:
    """Routes: GET /milestones/{milestoneId}."""

    def __init__(self, service: MilestoneService) -> None:
        self._service = service

    def get_milestone(self, request: Request) -> dict:
        """GET /milestones/{milestoneId} -> 200 milestone | 400 | 401 | 403 | 404"""
        user = require_user(request)
        milestone_id = request.id_param("milestone_id", "milestoneId")
        return json_response(200, self._service.get_milestone(user, milestone_id))
