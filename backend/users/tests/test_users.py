"""
Unit tests for admin user management: permissions, validation, uniqueness and routing.

The repository is replaced with an in-memory fake, so no database is needed.
Run from backend/users (after ./bin/sync-shared.sh):  python3 -m pytest tests -q
"""

import json
import os
import sys
from decimal import Decimal

import bcrypt
import pytest

os.environ.setdefault("IS_LOCAL", "true")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=wrong-import-position
import function
from controller import UserController, _parse_new_user
from service import UserService
from shared import tokens
from shared.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from shared.http_utils import Router
from shared.tokens import CurrentUser

ADMIN = CurrentUser(id=1, role="admin")
MANAGER = CurrentUser(id=2, role="manager")
EMPLOYEE = CurrentUser(id=4, role="employee")


class FakeUserRepository:
    """In-memory stand-in for UserRepository."""

    def __init__(self):
        base = {"deactivated_at": None, "salary": None, "manager_id": None,
                "manager_first_name": None, "manager_last_name": None, "manager_username": None}
        self.users = [
            {**base, "user_id": 1, "username": "admin", "email": "admin@example.com", "first_name": "Alice",
             "last_name": "Admin", "role": "admin", "employee_id": None, "title": None},
            {**base, "user_id": 2, "username": "maria", "email": "maria@example.com", "first_name": "Maria",
             "last_name": "Gonzalez", "role": "manager", "employee_id": 1, "title": "Engineering Manager",
             "salary": Decimal("145000")},
            {**base, "user_id": 4, "username": "priya", "email": "priya@example.com", "first_name": "Priya",
             "last_name": "Patel", "role": "employee", "employee_id": 3, "title": "Senior UX Designer",
             "salary": Decimal("115000"), "manager_id": 1, "manager_first_name": "Maria",
             "manager_last_name": "Gonzalez", "manager_username": "maria"},
        ]
        self.created = []
        self.passwords = {}
        self.reports = {1: 1}   # employee id -> number of direct reports

    def find_all_users(self):
        return [dict(u) for u in self.users]

    def username_taken(self, username):
        return any(u["username"].lower() == username.lower() for u in self.users)

    def email_taken(self, email):
        return any(u["email"].lower() == email.lower() for u in self.users)

    def find_employee_role(self, employee_id):
        return {1: "manager", 3: "employee"}.get(employee_id)

    def find_user(self, user_id):
        row = next((u for u in self.users if u["user_id"] == user_id), None)
        return {**row, "direct_reports": self.reports.get(row["employee_id"], 0)} if row else None

    def update_user(self, user_id, email, first_name, last_name, role, employee):  # pylint: disable=too-many-arguments
        row = next(u for u in self.users if u["user_id"] == user_id)
        row.update({"email": email, "first_name": first_name, "last_name": last_name, "role": role})
        if employee is not None:
            row.update({"title": employee["title"], "salary": employee["salary"]})

    def set_password(self, user_id, password_hash):
        self.passwords[user_id] = password_hash

    def set_deactivated(self, user_id, deactivated):
        row = next(u for u in self.users if u["user_id"] == user_id)
        row["deactivated_at"] = "2026-10-14" if deactivated else None
        return {"deactivated_at": row["deactivated_at"]}

    def email_taken_by_other(self, email, user_id):
        return any(u["email"].lower() == email.lower() and u["user_id"] != user_id for u in self.users)

    def create_user(self, username, email, first_name, last_name, role, password_hash, employee):  # pylint: disable=too-many-arguments
        self.created.append({"username": username, "email": email, "role": role, "hash": password_hash, "employee": employee})
        return {"user_id": 100, "employee_id": 50 if employee is not None else None}


@pytest.fixture(name="repo")
def fixture_repo():
    return FakeUserRepository()


@pytest.fixture(name="service")
def fixture_service(repo):
    return UserService(repo)


def new_user(**overrides):
    data = {"username": "nina", "email": "nina@example.com", "first_name": "Nina", "last_name": "Okafor",
            "role": "employee", "password": "Welcome123!", "title": "Analyst", "salary": Decimal("90000"),
            "manager_id": 1}
    return {**data, **overrides}


# Permissions

@pytest.mark.parametrize("user", [MANAGER, EMPLOYEE])
def test_only_admins_manage_users(service, repo, user):
    with pytest.raises(ForbiddenError):
        service.list_users(user)
    with pytest.raises(ForbiddenError):
        service.create_user(user, new_user())
    assert repo.created == []


# Listing

def test_list_users_includes_admins_and_managers(service):
    users = service.list_users(ADMIN)
    assert [(u["username"], u["role"], u["employeeId"]) for u in users] == [
        ("admin", "admin", None), ("maria", "manager", 1), ("priya", "employee", 3),
    ]
    assert users[2]["manager"] == {"employeeId": 1, "name": "Maria Gonzalez"}
    assert users[0]["manager"] is None and users[0]["name"] == "Alice Admin"
    assert users[2]["salary"] == Decimal("115000") and users[2]["deactivatedAt"] is None


# Creating

def test_create_employee_with_employee_record_and_hashed_password(service, repo):
    result = service.create_user(ADMIN, new_user())
    assert result == {"userId": 100, "employeeId": 50, "username": "nina", "email": "nina@example.com",
                      "name": "Nina Okafor", "role": "employee"}
    created = repo.created[0]
    assert created["employee"] == {"title": "Analyst", "salary": Decimal("90000"), "manager_id": 1}
    assert created["hash"] != "Welcome123!" and bcrypt.checkpw(b"Welcome123!", created["hash"].encode())


def test_create_manager_without_a_manager(service, repo):
    result = service.create_user(ADMIN, new_user(role="manager", manager_id=None, username="lee", email="lee@example.com"))
    assert result["employeeId"] == 50 and repo.created[0]["employee"]["manager_id"] is None


def test_create_admin_has_no_employee_record(service, repo):
    result = service.create_user(ADMIN, new_user(role="admin", title=None, salary=None, manager_id=None,
                                                 username="root", email="root@example.com"))
    assert result["employeeId"] is None and repo.created[0]["employee"] is None


def test_admin_with_employee_details_is_refused(service):
    with pytest.raises(ValidationError) as exc:
        service.create_user(ADMIN, new_user(role="admin", username="root", email="root@example.com"))
    assert set(exc.value.fields) == {"title", "salary", "managerId"}


@pytest.mark.parametrize("field,value,message", [
    ("username", "Priya", "already taken"),          # case-insensitive
    ("email", "PRIYA@example.com", "already uses"),
])
def test_duplicate_username_or_email_is_a_conflict(service, repo, field, value, message):
    with pytest.raises(ConflictError, match=message):
        service.create_user(ADMIN, new_user(**{field: value}))
    assert repo.created == []


def test_manager_must_be_a_manager(service):
    with pytest.raises(ValidationError) as exc:
        service.create_user(ADMIN, new_user(manager_id=3))    # Priya is an employee
    assert exc.value.fields == {"managerId": "That person isn't a manager"}
    with pytest.raises(ValidationError) as exc:
        service.create_user(ADMIN, new_user(manager_id=404))
    assert exc.value.fields == {"managerId": "No such employee"}


# Editing accounts

def edit_data(**overrides):
    return {**{"email": "priya@example.com", "first_name": "Priya", "last_name": "Patel-Singh", "role": "employee",
               "title": "Lead UX Designer", "salary": Decimal("125000")}, **overrides}


def test_admin_edits_account_and_employee_record(service, repo):
    result = service.update_user(ADMIN, 4, edit_data())
    assert result == {"userId": 4, "username": "priya", "email": "priya@example.com", "name": "Priya Patel-Singh",
                      "role": "employee"}
    row = repo.find_user(4)
    assert row["title"] == "Lead UX Designer" and row["salary"] == Decimal("125000")


def test_edit_email_must_not_collide(service):
    with pytest.raises(ConflictError, match="already uses"):
        service.update_user(ADMIN, 4, edit_data(email="MARIA@example.com"))


def test_role_can_move_between_manager_and_employee(service, repo):
    service.update_user(ADMIN, 4, edit_data(role="manager"))
    assert repo.find_user(4)["role"] == "manager"


def test_role_cannot_move_to_or_from_admin(service):
    with pytest.raises(ValidationError) as exc:
        service.update_user(ADMIN, 4, edit_data(role="admin"))
    assert "role" in exc.value.fields
    with pytest.raises(ValidationError):
        service.update_user(ADMIN, 1, {"email": "admin@example.com", "first_name": "Alice", "last_name": "Admin",
                                       "role": "manager", "title": None, "salary": None})


def test_manager_with_reports_cannot_be_demoted(service):
    with pytest.raises(ValidationError) as exc:
        service.update_user(ADMIN, 2, {"email": "maria@example.com", "first_name": "Maria", "last_name": "Gonzalez",
                                       "role": "employee", "title": None, "salary": None})
    assert exc.value.fields == {"role": "Still manages 1 person"}


def test_edit_unknown_account_is_404(service):
    with pytest.raises(NotFoundError):
        service.update_user(ADMIN, 404, edit_data())


def test_non_admin_cannot_edit(service):
    with pytest.raises(ForbiddenError):
        service.update_user(MANAGER, 4, edit_data())


# Passwords and deactivation

def test_admin_sets_a_new_password(service, repo):
    service.set_password(ADMIN, 4, "NewSecret99")
    assert bcrypt.checkpw(b"NewSecret99", repo.passwords[4].encode())


def test_admin_deactivates_and_reactivates(service, repo):
    assert service.set_deactivated(ADMIN, 4, True)["deactivatedAt"] == "2026-10-14"
    assert service.list_users(ADMIN)[2]["deactivatedAt"] == "2026-10-14"
    assert service.set_deactivated(ADMIN, 4, False)["deactivatedAt"] is None


def test_admin_cannot_deactivate_self(service, repo):
    with pytest.raises(ValidationError):
        service.set_deactivated(ADMIN, 1, True)
    assert repo.find_user(1)["deactivated_at"] is None


@pytest.mark.parametrize("user", [MANAGER, EMPLOYEE])
def test_non_admins_cannot_reset_or_deactivate(service, user):
    with pytest.raises(ForbiddenError):
        service.set_password(user, 4, "NewSecret99")
    with pytest.raises(ForbiddenError):
        service.set_deactivated(user, 4, True)


# Body validation

def valid_body(**overrides):
    body = {"username": "nina", "email": "Nina@Example.com", "role": "employee", "password": "Welcome123!",
            "firstName": " Nina ", "lastName": "Okafor", "title": "Analyst", "salary": 90000, "managerId": 1}
    return {**body, **overrides}


def test_parse_new_user_normalizes():
    data = _parse_new_user(valid_body())
    assert data["email"] == "nina@example.com" and data["first_name"] == "Nina"
    assert data["salary"] == Decimal("90000") and data["manager_id"] == 1
    assert _parse_new_user(valid_body(managerId="", title=None))["manager_id"] is None


@pytest.mark.parametrize("body,bad_fields", [
    ({}, {"username", "email", "role", "password"}),
    (valid_body(username="ab"), {"username"}),
    (valid_body(username="has space"), {"username"}),
    (valid_body(email="not-an-email"), {"email"}),
    (valid_body(role="owner"), {"role"}),
    (valid_body(password="short"), {"password"}),
    (valid_body(salary=-1), {"salary"}),
    (valid_body(managerId="1"), {"managerId"}),
    (valid_body(firstName="x" * 101), {"firstName"}),
])
def test_parse_new_user_names_bad_fields(body, bad_fields):
    with pytest.raises(ValidationError) as exc:
        _parse_new_user(body)
    assert set(exc.value.fields) == bad_fields


# Handler

@pytest.fixture(name="handler")
def fixture_handler(monkeypatch, service):
    controller = UserController(service)
    router = Router()
    router.add("GET", "/", controller.list_users)
    router.add("POST", "/", controller.create_user)
    router.add("PUT", "/{user_id}", controller.update_user)
    router.add("POST", "/{user_id}/password", controller.set_password)
    router.add("POST", "/{user_id}/deactivate", controller.deactivate_user)
    router.add("POST", "/{user_id}/reactivate", controller.reactivate_user)
    monkeypatch.setattr(function, "router", router)
    return function.handler


def event(method, user=None, body=None, path="/"):
    headers = {"Authorization": f"Bearer {tokens.create_token(user.id, user.role)}"} if user else {}
    return {"rawPath": path, "requestContext": {"http": {"method": method}}, "headers": headers,
            "body": json.dumps(body) if body is not None else None}


@pytest.mark.parametrize("ev,status", [
    (event("GET", ADMIN, path="/api/users"), 200),
    (event("GET", MANAGER), 403),
    (event("GET"), 401),
    (event("POST", ADMIN, valid_body()), 201),
    (event("POST", ADMIN, valid_body(username="priya")), 409),
    (event("POST", ADMIN, {}), 400),
    (event("POST", EMPLOYEE, valid_body()), 403),
    (event("PUT", ADMIN, {"email": "priya@example.com", "role": "employee", "title": "X", "salary": 1}, path="/4"), 200),
    (event("PUT", ADMIN, {"email": "bad", "role": "x"}, path="/4"), 400),
    (event("PUT", ADMIN, {"email": "p@example.com", "role": "employee"}, path="/404"), 404),
    (event("POST", ADMIN, {"password": "NewSecret99"}, path="/4/password"), 204),
    (event("POST", ADMIN, {"password": "short"}, path="/4/password"), 400),
    (event("POST", ADMIN, path="/4/deactivate"), 200),
    (event("POST", ADMIN, path="/4/reactivate"), 200),
    (event("POST", ADMIN, path="/1/deactivate"), 400),
    (event("POST", MANAGER, path="/4/deactivate"), 403),
])
def test_handler_statuses(handler, ev, status):
    assert handler(ev)["statusCode"] == status


def test_handler_create_returns_ids(handler):
    body = json.loads(handler(event("POST", ADMIN, valid_body()))["body"])
    assert body == {"userId": 100, "employeeId": 50, "username": "nina", "email": "nina@example.com",
                    "name": "Nina Okafor", "role": "employee"}


# Role boundary: employees and managers get 403 on every account route, with an
# empty body, before validation runs and before the repository is touched.
@pytest.mark.parametrize("user", [EMPLOYEE, MANAGER])
@pytest.mark.parametrize("method,path", [
    ("GET", "/api/users"),
    ("POST", "/api/users"),
    ("PUT", "/api/users/1"),
    ("POST", "/api/users/1/password"),
    ("POST", "/api/users/1/deactivate"),
    ("POST", "/api/users/1/reactivate"),
])
def test_non_admins_are_refused_before_validation_on_every_account_route(handler, repo, user, method, path):
    before = [dict(row) for row in repo.users]
    response = handler(event(method, user, {}, path=path))
    assert response["statusCode"] == 403
    assert json.loads(response["body"])["error"]["message"] == "Only admins can manage user accounts"
    assert [dict(row) for row in repo.users] == before
