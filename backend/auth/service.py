"""
Auth service: business logic for logging in.

Knows nothing about HTTP or SQL. Checks the password against the stored
bcrypt hash and issues a session token.
"""

import bcrypt

from repository import AuthRepository
from shared import tokens
from shared.errors import InvalidCredentialsError

# Checked against when the username doesn't exist, so a wrong username takes as
# long as a wrong password and response timing doesn't reveal which one it was
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt(12))


def _password_matches(password: str, password_hash: str | None) -> bool:
    hashed = password_hash.encode() if password_hash else _DUMMY_HASH
    try:
        return bcrypt.checkpw(password.encode(), hashed)
    except ValueError:
        # Stored value isn't a valid bcrypt hash
        return False


class AuthService:
    """Logs users in."""

    def __init__(self, repository: AuthRepository) -> None:
        self._repository = repository

    def login(self, username: str, password: str) -> dict:
        """
        Check credentials and create a session token.

        Returns:
            dict: {"userId", "token", "user": {"username", "firstName", "lastName", "role", "employeeId"}}

        Raises:
            InvalidCredentialsError: no such user, or the password doesn't match.
        """
        user = self._repository.find_user_by_username(username)
        matches = _password_matches(password, user["password_hashed"] if user else None)
        if user is None or not matches:
            raise InvalidCredentialsError("Invalid username or password")

        return {
            "userId": user["id"],
            "token": tokens.create_token(user["id"], user["role"]),
            # Profile for the UI header, so the frontend doesn't need another request
            "user": {
                "username": user["username"],
                "firstName": user["first_name"],
                "lastName": user["last_name"],
                "role": user["role"],
                # None for accounts without an employee record (the admin)
                "employeeId": user["employee_id"],
            },
        }
