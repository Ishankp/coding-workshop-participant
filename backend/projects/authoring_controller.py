"""
Authoring controller: HTTP routes for creating projects and milestones.

Validates the request bodies field by field, then calls the service.
"""

import math
from datetime import date
from decimal import Decimal

from authoring_service import AuthoringService
from shared.errors import ValidationError
from shared.http_utils import Request, json_response
from shared.tokens import require_user

_MAX_TITLE = 255
_MAX_DESCRIPTION = 5000
_MAX_BUDGET = Decimal("999999999999.99")  # DECIMAL(14,2)


def _title(body: dict, fields: dict) -> str | None:
    value = body.get("title")
    if not isinstance(value, str) or not value.strip():
        fields["title"] = "Title is required"
        return None
    if len(value.strip()) > _MAX_TITLE:
        fields["title"] = f"Must be at most {_MAX_TITLE} characters"
        return None
    return value.strip()


def _optional_date(body: dict, name: str, fields: dict) -> date | None:
    value = body.get(name)
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        fields[name] = "Must be a date in YYYY-MM-DD format"
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        fields[name] = "Must be a date in YYYY-MM-DD format"
        return None


def _optional_budget(body: dict, fields: dict) -> Decimal | None:
    value = body.get("budget")
    if value is None or value == "":
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        fields["budget"] = "Must be a number"
        return None
    budget = Decimal(str(value))
    if budget < 0:
        fields["budget"] = "Can't be negative"
    elif budget > _MAX_BUDGET:
        fields["budget"] = "Too large"
    elif budget != budget.quantize(Decimal("0.01")):
        fields["budget"] = "Use at most 2 decimal places"
    return budget


def _optional_text(body: dict, name: str, limit: int, fields: dict) -> str | None:
    value = body.get(name)
    if value is None:
        return None
    if not isinstance(value, str):
        fields[name] = "Must be text"
        return None
    value = value.strip()
    if len(value) > limit:
        fields[name] = f"Must be at most {limit} characters"
    return value or None


class AuthoringController:
    """Routes: POST /projects, POST /projects/{projectId}/milestones, POST /projects/{projectId}/archive|unarchive."""

    def __init__(self, service: AuthoringService) -> None:
        self._service = service

    def create_project(self, request: Request) -> dict:
        """POST /projects  body: {title, startDate?, endDate?, budget?} -> 201 project | 400 | 401 | 403"""
        user = require_user(request)
        body = request.json()
        fields: dict = {}
        title = _title(body, fields)
        start = _optional_date(body, "startDate", fields)
        end = _optional_date(body, "endDate", fields)
        budget = _optional_budget(body, fields)
        if fields:
            raise ValidationError("Invalid project", fields)
        return json_response(201, self._service.create_project(user, title, start, end, budget))

    def archive_project(self, request: Request) -> dict:
        """POST /projects/{projectId}/archive -> 200 {projectId, title, archivedAt} | 400 | 401 | 403 | 404"""
        user = require_user(request)
        project_id = request.id_param("project_id", "projectId")
        return json_response(200, self._service.set_project_archived(user, project_id, True))

    def unarchive_project(self, request: Request) -> dict:
        """POST /projects/{projectId}/unarchive -> 200 {projectId, title, archivedAt: null} | 400 | 401 | 403 | 404"""
        user = require_user(request)
        project_id = request.id_param("project_id", "projectId")
        return json_response(200, self._service.set_project_archived(user, project_id, False))

    def create_milestone(self, request: Request) -> dict:
        """
        POST /projects/{projectId}/milestones  body: {title, description?, startDate?, endDate?}
        -> 201 milestone | 400 | 401 | 403 | 404
        """
        user = require_user(request)
        project_id = request.id_param("project_id", "projectId")
        body = request.json()
        fields: dict = {}
        title = _title(body, fields)
        description = _optional_text(body, "description", _MAX_DESCRIPTION, fields)
        start = _optional_date(body, "startDate", fields)
        end = _optional_date(body, "endDate", fields)
        if fields:
            raise ValidationError("Invalid milestone", fields)
        return json_response(201, self._service.create_milestone(user, project_id, title, description, start, end))
