"""
Application errors.

Raised by any layer and converted into a consistent JSON error response by
the request handler, so controllers and services never build error
responses by hand.
"""


class AppError(Exception):
    """Base error carrying an HTTP status and a machine-readable code."""

    status = 500
    code = "internal_error"

    def __init__(self, message: str, fields: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.fields = fields or {}


class ValidationError(AppError):
    """Request is malformed or fails field validation."""

    status = 400
    code = "validation_error"


class AuthenticationError(AppError):
    """Session token is missing, invalid or expired (not logged in)."""

    status = 401
    code = "unauthorized"


class InvalidCredentialsError(AuthenticationError):
    """Username or password is wrong."""

    code = "invalid_credentials"


class ForbiddenError(AppError):
    """Logged in, but not allowed to see this resource (e.g. not a project member)."""

    status = 403
    code = "forbidden"


class NotFoundError(AppError):
    """Requested resource or route does not exist."""

    status = 404
    code = "not_found"


class MethodNotAllowedError(AppError):
    """Route exists but not for this HTTP method."""

    status = 405
    code = "method_not_allowed"
