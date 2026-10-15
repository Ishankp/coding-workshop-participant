"""
Session tokens (signed JWTs).

The auth service issues tokens; every other service uses `require_user`
to find out who is calling and what role they have.
"""

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt

from .errors import AppError, AuthenticationError, ForbiddenError
from .http_utils import Request

TOKEN_TTL = timedelta(hours=1)
_ALGORITHM = "HS256"
_DEV_SECRET = "local-dev-secret-change-me"


def _secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if secret:
        return secret
    if os.getenv("IS_LOCAL", "false") == "true":
        return _DEV_SECRET
    # Fail closed in the cloud rather than sign tokens with a known secret
    raise AppError("JWT_SECRET is not configured")


def create_token(user_id: int, role: str) -> str:
    """Issue a signed session token for a user."""
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "role": role, "iat": now, "exp": now + TOKEN_TTL}
    return jwt.encode(payload, _secret(), algorithm=_ALGORITHM)


def decode_token(token: str) -> dict:
    """Verify a token's signature and expiry and return its claims."""
    try:
        return jwt.decode(token, _secret(), algorithms=[_ALGORITHM], options={"require": ["sub", "exp"]})
    except jwt.ExpiredSignatureError as e:
        raise AuthenticationError("Session has expired, please log in again") from e
    except jwt.InvalidTokenError as e:
        raise AuthenticationError("Invalid session token") from e


@dataclass(frozen=True)
class CurrentUser:
    """The logged-in user, as recorded in their session token."""

    id: int
    role: str

    @property
    def is_admin(self) -> bool:
        """Admins can see every project, milestone and employee."""
        return self.role == "admin"

    @property
    def is_manager(self) -> bool:
        """Managers see budgets and manage the time logs of their direct reports."""
        return self.role == "manager"


def require_user(request: Request) -> CurrentUser:
    """Return the logged-in user from the request's bearer token, or raise 401."""
    token = request.bearer_token()
    if not token:
        raise AuthenticationError("Not logged in")
    claims = decode_token(token)
    return CurrentUser(id=int(claims["sub"]), role=claims.get("role", ""))


def require_role(user: CurrentUser, *roles: str, message: str = "This action needs a manager or admin account") -> None:
    """
    Raise 403 unless the user has one of the given roles.

    Controllers call this right after require_user and BEFORE parsing the body,
    so a user who may never perform the action gets a plain 403 instead of
    validation hints about a request they are not allowed to make. Services
    still do the full check (membership, manager pool, admin bypass).
    """
    if user.role not in roles:
        raise ForbiddenError(message)
