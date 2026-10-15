"""
Authoring controller: HTTP routes for creating, editing and archiving projects,
and creating milestones.

Validates the request bodies field by field, then calls the service.
"""

from authoring_service import AuthoringService
from shared.errors import ValidationError
from shared.forms import MAX_DESCRIPTION, parse_optional_date, parse_optional_money, parse_optional_text, parse_title
from shared.http_utils import Request, json_response
from shared.tokens import require_role, require_user


def _project_fields(body: dict) -> dict:
    fields: dict = {}
    data = {
        "title": parse_title(body, fields),
        "start_date": parse_optional_date(body, "startDate", fields),
        "end_date": parse_optional_date(body, "endDate", fields),
        "budget": parse_optional_money(body, "budget", fields),
    }
    if fields:
        raise ValidationError("Invalid project", fields)
    return data


class AuthoringController:
    """Routes: POST /projects, PUT /projects/{id}, POST /projects/{id}/milestones, POST /projects/{id}/archive|unarchive."""

    def __init__(self, service: AuthoringService) -> None:
        self._service = service

    def create_project(self, request: Request) -> dict:
        """POST /projects  body: {title, startDate?, endDate?, budget?} -> 201 project | 400 | 401 | 403"""
        user = require_user(request)
        require_role(user, "manager", "admin")
        return json_response(201, self._service.create_project(user, **_project_fields(request.json())))

    def update_project(self, request: Request) -> dict:
        """PUT /projects/{projectId}  body: {title, startDate?, endDate?, budget?} -> 200 project | 400 | 401 | 403 | 404"""
        user = require_user(request)
        require_role(user, "manager", "admin")
        project_id = request.id_param("project_id", "projectId")
        return json_response(200, self._service.update_project(user, project_id, **_project_fields(request.json())))

    def delete_project(self, request: Request) -> dict:
        """DELETE /projects/{projectId} -> 204 | 400 | 401 | 403 | 404 | 409 (admins only)"""
        user = require_user(request)
        require_role(user, "manager", "admin")
        project_id = request.id_param("project_id", "projectId")
        self._service.delete_project(user, project_id)
        return json_response(204)

    def archive_project(self, request: Request) -> dict:
        """POST /projects/{projectId}/archive -> 200 {projectId, title, archivedAt} | 400 | 401 | 403 | 404"""
        user = require_user(request)
        require_role(user, "manager", "admin")
        project_id = request.id_param("project_id", "projectId")
        return json_response(200, self._service.set_project_archived(user, project_id, True))

    def unarchive_project(self, request: Request) -> dict:
        """POST /projects/{projectId}/unarchive -> 200 {projectId, title, archivedAt: null} | 400 | 401 | 403 | 404"""
        user = require_user(request)
        require_role(user, "manager", "admin")
        project_id = request.id_param("project_id", "projectId")
        return json_response(200, self._service.set_project_archived(user, project_id, False))

    def create_milestone(self, request: Request) -> dict:
        """
        POST /projects/{projectId}/milestones  body: {title, description?, startDate?, endDate?}
        -> 201 milestone | 400 | 401 | 403 | 404
        """
        user = require_user(request)
        require_role(user, "manager", "admin")
        project_id = request.id_param("project_id", "projectId")
        body = request.json()
        fields: dict = {}
        title = parse_title(body, fields)
        description = parse_optional_text(body, "description", MAX_DESCRIPTION, fields)
        start = parse_optional_date(body, "startDate", fields)
        end = parse_optional_date(body, "endDate", fields)
        if fields:
            raise ValidationError("Invalid milestone", fields)
        return json_response(201, self._service.create_milestone(user, project_id, title, description, start, end))
