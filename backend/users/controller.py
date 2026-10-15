"""
Users controller: HTTP routes for admin account management.

Validates the create-user body field by field, then calls the service.
"""

import re

from service import ROLES, UserService
from shared.errors import ValidationError
from shared.forms import parse_optional_money, parse_optional_text
from shared.http_utils import Request, json_response
from shared.tokens import require_user

_USERNAME = re.compile(r"^[A-Za-z0-9._-]{3,100}$")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MIN_PASSWORD = 8
_MAX_PASSWORD_BYTES = 72  # bcrypt limit


def _parse_new_user(body: dict) -> dict:
    fields: dict = {}

    username = body.get("username")
    if not isinstance(username, str) or not _USERNAME.match(username.strip()):
        fields["username"] = "3-100 letters, digits, dots, dashes or underscores"
    else:
        username = username.strip()

    email = body.get("email")
    if not isinstance(email, str) or not _EMAIL.match(email.strip()) or len(email.strip()) > 255:
        fields["email"] = "Must be a valid email address"
    else:
        email = email.strip().lower()

    role = body.get("role")
    if role not in ROLES:
        fields["role"] = "Must be admin, manager or employee"

    password = body.get("password")
    if not isinstance(password, str) or len(password) < _MIN_PASSWORD:
        fields["password"] = f"At least {_MIN_PASSWORD} characters"
    elif len(password.encode()) > _MAX_PASSWORD_BYTES:
        fields["password"] = f"At most {_MAX_PASSWORD_BYTES} bytes"

    first_name = parse_optional_text(body, "firstName", 100, fields)
    last_name = parse_optional_text(body, "lastName", 100, fields)
    title = parse_optional_text(body, "title", 255, fields)
    salary = parse_optional_money(body, "salary", fields)

    manager_id = body.get("managerId")
    if manager_id in (None, ""):
        manager_id = None
    elif isinstance(manager_id, bool) or not isinstance(manager_id, int) or manager_id < 1:
        fields["managerId"] = "Choose a manager"

    if fields:
        raise ValidationError("Invalid user", fields)
    return {
        "username": username, "email": email, "first_name": first_name, "last_name": last_name,
        "role": role, "password": password, "title": title, "salary": salary, "manager_id": manager_id,
    }


def _parse_update(body: dict) -> dict:
    fields: dict = {}
    email = body.get("email")
    if not isinstance(email, str) or not _EMAIL.match(email.strip()) or len(email.strip()) > 255:
        fields["email"] = "Must be a valid email address"
    else:
        email = email.strip().lower()
    role = body.get("role")
    if role not in ROLES:
        fields["role"] = "Must be admin, manager or employee"
    first_name = parse_optional_text(body, "firstName", 100, fields)
    last_name = parse_optional_text(body, "lastName", 100, fields)
    title = parse_optional_text(body, "title", 255, fields)
    salary = parse_optional_money(body, "salary", fields)
    if fields:
        raise ValidationError("Invalid account", fields)
    return {"email": email, "first_name": first_name, "last_name": last_name, "role": role, "title": title, "salary": salary}


def _parse_password(body: dict) -> str:
    password = body.get("password")
    if not isinstance(password, str) or len(password) < _MIN_PASSWORD:
        raise ValidationError("Invalid password", {"password": f"At least {_MIN_PASSWORD} characters"})
    if len(password.encode()) > _MAX_PASSWORD_BYTES:
        raise ValidationError("Invalid password", {"password": f"At most {_MAX_PASSWORD_BYTES} bytes"})
    return password


class UserController:
    """Routes (admins only): GET/POST /users, PUT /users/{id}, POST /users/{id}/password|deactivate|reactivate."""

    def __init__(self, service: UserService) -> None:
        self._service = service

    def list_users(self, request: Request) -> dict:
        """GET /users -> 200 [account] | 401 | 403"""
        user = require_user(request)
        return json_response(200, self._service.list_users(user))

    def create_user(self, request: Request) -> dict:
        """
        POST /users  body: {username, email, role, password, firstName?, lastName?, title?, salary?, managerId?}
        -> 201 {userId, employeeId, username, email, name, role} | 400 | 401 | 403 | 409
        """
        user = require_user(request)
        return json_response(201, self._service.create_user(user, _parse_new_user(request.json())))

    def update_user(self, request: Request) -> dict:
        """PUT /users/{userId}  body: {email, role, firstName?, lastName?, title?, salary?} -> 200 | 400 | 401 | 403 | 404 | 409"""
        user = require_user(request)
        user_id = request.id_param("user_id", "userId")
        return json_response(200, self._service.update_user(user, user_id, _parse_update(request.json())))

    def set_password(self, request: Request) -> dict:
        """POST /users/{userId}/password  body: {password} -> 204 | 400 | 401 | 403 | 404"""
        user = require_user(request)
        user_id = request.id_param("user_id", "userId")
        self._service.set_password(user, user_id, _parse_password(request.json()))
        return json_response(204)

    def deactivate_user(self, request: Request) -> dict:
        """POST /users/{userId}/deactivate -> 200 {userId, deactivatedAt} | 400 | 401 | 403 | 404"""
        user = require_user(request)
        user_id = request.id_param("user_id", "userId")
        return json_response(200, self._service.set_deactivated(user, user_id, True))

    def reactivate_user(self, request: Request) -> dict:
        """POST /users/{userId}/reactivate -> 200 {userId, deactivatedAt: null} | 400 | 401 | 403 | 404"""
        user = require_user(request)
        user_id = request.id_param("user_id", "userId")
        return json_response(200, self._service.set_deactivated(user, user_id, False))
