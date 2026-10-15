"""
Time entries controller: HTTP routes for an employee's time log.

Validates request input, calls the service, and builds the response.
"""

import math
from datetime import date
from decimal import Decimal

from shared.errors import ValidationError
from shared.http_utils import Request, json_response
from shared.tokens import require_user
from time_entries_service import TimeEntryService

_MAX_HOURS = 24
_MAX_NOTE_LENGTH = 500


def _parse_entry(body: dict) -> dict:
    """Validate a POST body and return the service arguments, or raise a 400 naming each bad field."""
    fields = {}

    milestone_id = body.get("milestoneId")
    if isinstance(milestone_id, bool) or not isinstance(milestone_id, int) or milestone_id < 1:
        fields["milestoneId"] = "Choose a milestone"

    work_date = None
    raw_date = body.get("workDate")
    if not isinstance(raw_date, str) or not raw_date:
        fields["workDate"] = "Date is required"
    else:
        try:
            work_date = date.fromisoformat(raw_date)
        except ValueError:
            fields["workDate"] = "Must be a date in YYYY-MM-DD format"

    hours = None
    raw_hours = body.get("hours")
    if isinstance(raw_hours, bool) or not isinstance(raw_hours, (int, float)) or not math.isfinite(raw_hours):
        fields["hours"] = "Hours are required"
    else:
        hours = Decimal(str(raw_hours))
        if hours <= 0 or hours > _MAX_HOURS:
            fields["hours"] = f"Must be more than 0 and at most {_MAX_HOURS}"
        elif hours != hours.quantize(Decimal("0.01")):
            fields["hours"] = "Use at most 2 decimal places"

    note = body.get("note")
    if note is not None:
        if not isinstance(note, str):
            fields["note"] = "Must be text"
        else:
            note = note.strip() or None
            if note and len(note) > _MAX_NOTE_LENGTH:
                fields["note"] = f"Must be at most {_MAX_NOTE_LENGTH} characters"

    if fields:
        raise ValidationError("Invalid time entry", fields)
    return {"milestone_id": milestone_id, "work_date": work_date, "hours": hours, "note": note}


class TimeEntryController:
    """Routes: GET/POST /employees/{employeeId}/time-entries, DELETE /employees/{employeeId}/time-entries/{entryId}."""

    def __init__(self, service: TimeEntryService) -> None:
        self._service = service

    def get_log(self, request: Request) -> dict:
        """GET /employees/{employeeId}/time-entries -> 200 log | 400 | 401 | 403 | 404"""
        user = require_user(request)
        employee_id = request.id_param("employee_id", "employeeId")
        return json_response(200, self._service.get_log(user, employee_id))

    def add_entry(self, request: Request) -> dict:
        """
        POST /employees/{employeeId}/time-entries
        body: {"milestoneId": int, "workDate": "YYYY-MM-DD", "hours": number, "note"?: str}
        -> 201 entry | 400 | 401 | 403 | 404
        """
        user = require_user(request)
        employee_id = request.id_param("employee_id", "employeeId")
        data = _parse_entry(request.json())
        return json_response(201, self._service.add_entry(user, employee_id, **data))

    def update_entry(self, request: Request) -> dict:
        """
        PUT /employees/{employeeId}/time-entries/{entryId}
        body: {"milestoneId": int, "workDate": "YYYY-MM-DD", "hours": number, "note"?: str}
        -> 200 entry | 400 | 401 | 403 | 404
        """
        user = require_user(request)
        employee_id = request.id_param("employee_id", "employeeId")
        entry_id = request.id_param("entry_id", "entryId")
        data = _parse_entry(request.json())
        return json_response(200, self._service.update_entry(user, employee_id, entry_id, **data))

    def delete_entry(self, request: Request) -> dict:
        """DELETE /employees/{employeeId}/time-entries/{entryId} -> 204 | 400 | 401 | 403 | 404"""
        user = require_user(request)
        employee_id = request.id_param("employee_id", "employeeId")
        entry_id = request.id_param("entry_id", "entryId")
        self._service.delete_entry(user, employee_id, entry_id)
        return json_response(204)
