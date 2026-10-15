"""
Unit tests for the auth service: service, controller and handler routing.

The repository is replaced with an in-memory fake, so no database is needed.
Run from backend/auth (after ./bin/sync-shared.sh):  python3 -m pytest tests -q
"""

import json
import os
import sys

import bcrypt
import pytest

os.environ.setdefault("IS_LOCAL", "true")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=wrong-import-position
import function
from controller import AuthController
from service import AuthService
from shared import tokens
from shared.errors import AuthenticationError, InvalidCredentialsError, ValidationError
from shared.http_utils import Request, Router

PASSWORD = "Password123!"
ADMIN = {
    "id": 1, "username": "admin", "first_name": "Alice", "last_name": "Admin", "role": "admin", "employee_id": None,
    "deactivated_at": None,
    "password_hashed": bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(4)).decode(),
}


class FakeAuthRepository:
    """In-memory stand-in for AuthRepository."""

    def find_user_by_username(self, username):
        return dict(ADMIN) if username.lower() == ADMIN["username"] else None


@pytest.fixture(name="service")
def fixture_service():
    return AuthService(FakeAuthRepository())


@pytest.fixture(name="handler")
def fixture_handler(monkeypatch, service):
    router = Router()
    router.add("POST", "/login", AuthController(service).login)
    monkeypatch.setattr(function, "router", router)
    return function.handler


def login_event(body, path="/login", method="POST"):
    return {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "body": json.dumps(body) if body is not None else None,
    }


# Service

def test_login_returns_user_id_token_and_profile(service):
    result = service.login("admin", PASSWORD)
    assert result["userId"] == 1
    assert result["user"] == {
        "username": "admin", "firstName": "Alice", "lastName": "Admin", "role": "admin", "employeeId": None,
    }
    claims = tokens.decode_token(result["token"])
    assert claims["sub"] == "1" and claims["role"] == "admin"


def test_login_username_is_case_insensitive(service):
    assert service.login("ADMIN", PASSWORD)["userId"] == 1


@pytest.mark.parametrize("username,password", [("admin", "wrong"), ("nobody", PASSWORD)])
def test_wrong_username_or_password_share_one_error(service, username, password):
    with pytest.raises(InvalidCredentialsError, match="Invalid username or password"):
        service.login(username, password)


def test_deactivated_account_cannot_log_in(monkeypatch):
    repo = FakeAuthRepository()
    monkeypatch.setattr(repo, "find_user_by_username", lambda u: {**ADMIN, "deactivated_at": "2026-10-01"})
    with pytest.raises(AuthenticationError, match="deactivated"):
        AuthService(repo).login("admin", PASSWORD)


# Controller

@pytest.mark.parametrize("body,field", [
    ({"password": PASSWORD}, "username"),
    ({"username": "   ", "password": PASSWORD}, "username"),
    ({"username": "a" * 101, "password": PASSWORD}, "username"),
    ({"username": "admin"}, "password"),
    ({"username": "admin", "password": 123}, "password"),
])
def test_login_validation_names_the_field(service, body, field):
    request = Request(method="POST", path="/login", raw_body=json.dumps(body))
    with pytest.raises(ValidationError) as exc:
        AuthController(service).login(request)
    assert field in exc.value.fields


# Handler (routing + error mapping)

@pytest.mark.parametrize("path", ["/login", "/api/auth/login"])
def test_handler_login_on_local_and_cloudfront_paths(handler, path):
    response = handler(login_event({"username": "admin", "password": PASSWORD}, path=path))
    assert response["statusCode"] == 200
    assert set(json.loads(response["body"])) == {"userId", "token", "user"}


@pytest.mark.parametrize("event,status,code", [
    (login_event({"username": "admin", "password": "nope"}), 401, "invalid_credentials"),
    (login_event({}), 400, "validation_error"),
    (login_event(None), 400, "validation_error"),
    (login_event(None, method="GET"), 405, "method_not_allowed"),
    (login_event(None, path="/logout"), 404, "not_found"),
])
def test_handler_errors_are_consistent(handler, event, status, code):
    response = handler(event)
    assert response["statusCode"] == status
    assert json.loads(response["body"])["error"]["code"] == code
