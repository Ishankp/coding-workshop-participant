"""
Employees controller: HTTP routes for employee profiles.

Reads the logged-in user from the session token, parses path parameters,
calls the service, and builds the response.
"""

from service import EmployeeService
from shared.http_utils import Request, json_response
from shared.tokens import require_user


class EmployeeController:
    """Routes: GET /employees, GET /employees/{employeeId}."""

    def __init__(self, service: EmployeeService) -> None:
        self._service = service

    def list_employees(self, request: Request) -> dict:
        """GET /employees -> 200 [{employeeId, name, username, title, role}] (everyone for admins) | 401"""
        user = require_user(request)
        return json_response(200, self._service.list_employees(user))

    def get_employee(self, request: Request) -> dict:
        """GET /employees/{employeeId} -> 200 employee profile | 400 | 401 | 403 | 404"""
        user = require_user(request)
        employee_id = request.id_param("employee_id", "employeeId")
        return json_response(200, self._service.get_employee(user, employee_id))
