"""
HTTP plumbing for Lambda Function URL events.

Turns the raw Lambda event into a Request, matches it against a Router, and
converts results and errors into JSON responses in one consistent shape.
"""

import base64
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Callable

from . import db
from .errors import AppError, MethodNotAllowedError, NotFoundError, ValidationError

JSON_HEADERS = {"Content-Type": "application/json"}

logger = logging.getLogger()


@dataclass
class Request:
    """The parts of a Lambda event that controllers care about."""

    method: str
    path: str
    headers: dict = field(default_factory=dict)
    query: dict = field(default_factory=dict)
    raw_body: str = ""
    path_params: dict = field(default_factory=dict)

    def json(self) -> dict:
        """Parse the body as a JSON object, raising ValidationError if it isn't one."""
        if not self.raw_body:
            raise ValidationError("Request body is required")
        try:
            data = json.loads(self.raw_body)
        except json.JSONDecodeError as e:
            raise ValidationError("Request body must be valid JSON") from e
        if not isinstance(data, dict):
            raise ValidationError("Request body must be a JSON object")
        return data

    def bearer_token(self) -> str | None:
        """Return the token from an 'Authorization: Bearer <token>' header, or None."""
        scheme, _, token = self.headers.get("authorization", "").partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            return None
        return token.strip()

    def id_param(self, name: str, label: str) -> int:
        """Return a path parameter as a positive int, or raise a 400 naming it as `label`."""
        value = self.path_params.get(name, "")
        if not value.isdigit() or int(value) < 1:
            raise ValidationError(f"{label} must be a positive integer", {label: "Must be a positive integer"})
        return int(value)


Action = Callable[[Request], dict]


class Router:
    """Maps (method, path pattern) to controller actions. Patterns look like '/{project_id}/members'."""

    def __init__(self) -> None:
        self._routes: list[tuple[re.Pattern, dict[str, Action]]] = []

    def add(self, method: str, pattern: str, action: Action) -> None:
        """Register an action for a method and path pattern."""
        regex = re.compile("^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", pattern.rstrip("/") or "/") + "$")
        for existing, methods in self._routes:
            if existing.pattern == regex.pattern:
                methods[method.upper()] = action
                return
        self._routes.append((regex, {method.upper(): action}))

    def dispatch(self, request: Request) -> dict:
        """Call the matching action, raising 404/405 if there is none."""
        for regex, methods in self._routes:
            match = regex.match(request.path)
            if match:
                action = methods.get(request.method)
                if action is None:
                    raise MethodNotAllowedError(f"{request.method} is not allowed on {request.path}")
                request.path_params = match.groupdict()
                return action(request)
        raise NotFoundError(f"No route for {request.path}")


def parse_event(event: dict | None, service_name: str) -> Request:
    """
    Build a Request from a Lambda Function URL (payload v2) event.

    The path is made relative to the service, because it arrives as '/123'
    locally (via the dev proxy) but as '/api/<service>/123' through CloudFront.
    """
    event = event or {}
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET").upper()

    path = event.get("rawPath") or "/"
    prefix = f"/api/{service_name}"
    if path == prefix or path.startswith(prefix + "/"):
        path = path[len(prefix):]
    path = "/" + path.strip("/")

    body = event.get("body") or ""
    if body and event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")

    return Request(
        method=method,
        path=path,
        headers={k.lower(): v for k, v in (event.get("headers") or {}).items()},
        query=event.get("queryStringParameters") or {},
        raw_body=body,
    )


def _json_default(value: object) -> object:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def json_response(status: int, data: object = None) -> dict:
    """Build a Lambda response; 204 responses have no body."""
    response = {"statusCode": status, "headers": JSON_HEADERS}
    if status != 204:
        response["body"] = json.dumps(data, default=_json_default)
    return response


def error_response(status: int, code: str, message: str, fields: dict | None = None) -> dict:
    """Build an error response in the shared shape: {"error": {code, message, fields?}}."""
    error = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return json_response(status, {"error": error})


def handle(event: dict | None, service_name: str, router: Router) -> dict:
    """Route one Lambda event and map any error to a consistent JSON response."""
    request = parse_event(event, service_name)
    logger.info("%s %s", request.method, request.path)

    try:
        return router.dispatch(request)

    except AppError as e:
        if e.status >= 500:
            logger.error("Server error on %s %s: %s", request.method, request.path, e.message)
            return error_response(e.status, e.code, "Internal server error")
        return error_response(e.status, e.code, e.message, e.fields)

    except Exception:  # pylint: disable=broad-except
        # Unexpected failure (e.g. database down): log details, return a generic message,
        # and drop the connection so the next invocation reconnects cleanly
        logger.exception("Unhandled error on %s %s", request.method, request.path)
        db.reset_connection()
        return error_response(500, "internal_error", "Internal server error")
