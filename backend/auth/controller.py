"""
Auth controller: HTTP route for logging in.

Validates the request body, calls the service, and builds the response.
"""

from service import AuthService
from shared.errors import ValidationError
from shared.http_utils import Request, json_response

_MAX_USERNAME_LENGTH = 100  # users.username is VARCHAR(100)
_MAX_PASSWORD_BYTES = 72  # bcrypt only uses the first 72 bytes


class AuthController:
    """Routes: POST /auth/login."""

    def __init__(self, service: AuthService) -> None:
        self._service = service

    def login(self, request: Request) -> dict:
        """POST /auth/login  body: {"username", "password"} -> 200 {userId, token, user} | 400 | 401"""
        body = request.json()
        username = body.get("username")
        password = body.get("password")

        fields = {}
        if not isinstance(username, str) or not username.strip():
            fields["username"] = "Username is required"
        elif len(username.strip()) > _MAX_USERNAME_LENGTH:
            fields["username"] = f"Must be at most {_MAX_USERNAME_LENGTH} characters"
        if not isinstance(password, str) or not password:
            fields["password"] = "Password is required"
        elif len(password.encode()) > _MAX_PASSWORD_BYTES:
            fields["password"] = f"Must be at most {_MAX_PASSWORD_BYTES} bytes"
        if fields:
            raise ValidationError("Missing or invalid fields", fields)

        return json_response(200, self._service.login(username.strip(), password))
