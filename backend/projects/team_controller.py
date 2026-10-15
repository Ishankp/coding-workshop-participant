"""
Team controller: HTTP routes for a project's members and milestone assignments.
"""

from shared.errors import ValidationError
from shared.http_utils import Request, json_response
from shared.tokens import require_user
from team_service import TeamService


def _employee_id(body: dict) -> int:
    value = body.get("employeeId")
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValidationError("Choose an employee", {"employeeId": "Choose an employee"})
    return value


class TeamController:
    """Routes under /projects/{projectId}: GET /team, POST/DELETE /members, POST/DELETE /milestones/{id}/assignees."""

    def __init__(self, service: TeamService) -> None:
        self._service = service

    def get_team(self, request: Request) -> dict:
        """GET /projects/{projectId}/team -> 200 {members, candidates} | 400 | 401 | 403 | 404"""
        user = require_user(request)
        project_id = request.id_param("project_id", "projectId")
        return json_response(200, self._service.get_team(user, project_id))

    def add_member(self, request: Request) -> dict:
        """POST /projects/{projectId}/members  body: {"employeeId": int} -> 201 | 400 | 401 | 403 | 404 | 409"""
        user = require_user(request)
        project_id = request.id_param("project_id", "projectId")
        employee_id = _employee_id(request.json())
        return json_response(201, self._service.add_member(user, project_id, employee_id))

    def remove_member(self, request: Request) -> dict:
        """DELETE /projects/{projectId}/members/{employeeId} -> 204 | 400 | 401 | 403 | 404 | 409"""
        user = require_user(request)
        project_id = request.id_param("project_id", "projectId")
        employee_id = request.id_param("employee_id", "employeeId")
        self._service.remove_member(user, project_id, employee_id)
        return json_response(204)

    def assign_milestone(self, request: Request) -> dict:
        """
        POST /projects/{projectId}/milestones/{milestoneId}/assignees  body: {"employeeId": int}
        -> 201 {..., addedToProject} | 400 | 401 | 403 | 404 | 409
        """
        user = require_user(request)
        project_id = request.id_param("project_id", "projectId")
        milestone_id = request.id_param("milestone_id", "milestoneId")
        employee_id = _employee_id(request.json())
        return json_response(201, self._service.assign_milestone(user, project_id, milestone_id, employee_id))

    def unassign_milestone(self, request: Request) -> dict:
        """DELETE /projects/{projectId}/milestones/{milestoneId}/assignees/{employeeId} -> 204 | 400 | 401 | 403 | 404 | 409"""
        user = require_user(request)
        project_id = request.id_param("project_id", "projectId")
        milestone_id = request.id_param("milestone_id", "milestoneId")
        employee_id = request.id_param("employee_id", "employeeId")
        self._service.unassign_milestone(user, project_id, milestone_id, employee_id)
        return json_response(204)
