"""
Projects controller: HTTP routes for projects.

Reads the logged-in user from the session token, parses path parameters,
calls the service, and builds the response.
"""

from service import ProjectService
from shared.http_utils import Request, json_response
from shared.tokens import require_user


class ProjectController:
    """Routes: GET /projects, /projects/{projectId}, and its /members, /milestones and /budget."""

    def __init__(self, service: ProjectService) -> None:
        self._service = service

    def list_projects(self, request: Request) -> dict:
        """GET /projects -> 200 [{projectId, title}] (all projects for admins) | 401"""
        user = require_user(request)
        return json_response(200, self._service.list_projects_for_user(user))

    def get_project(self, request: Request) -> dict:
        """GET /projects/{projectId} -> 200 project | 400 | 401 | 403 | 404"""
        user = require_user(request)
        project_id = request.id_param("project_id", "projectId")
        return json_response(200, self._service.get_project(user, project_id))

    def get_project_members(self, request: Request) -> dict:
        """GET /projects/{projectId}/members -> 200 [member] | 400 | 401 | 403 | 404"""
        user = require_user(request)
        project_id = request.id_param("project_id", "projectId")
        return json_response(200, self._service.get_project_members(user, project_id))

    def get_project_milestones(self, request: Request) -> dict:
        """GET /projects/{projectId}/milestones -> 200 {milestones, unassignedEmployees} | 400 | 401 | 403 | 404"""
        user = require_user(request)
        project_id = request.id_param("project_id", "projectId")
        return json_response(200, self._service.get_project_milestones(user, project_id))

    def get_project_budget(self, request: Request) -> dict:
        """GET /projects/{projectId}/budget -> 200 budget vs spent + projection | 400 | 401 | 403 | 404"""
        user = require_user(request)
        project_id = request.id_param("project_id", "projectId")
        return json_response(200, self._service.get_project_budget(user, project_id))
