"""
User service: admin-only account management.

Only admins can list accounts or create new ones. Managers and employees get
an employee record (title, salary, manager); admins don't. A manager must be
chosen from people whose role is manager, and is fixed once set.
"""

import bcrypt

from repository import UserRepository
from shared.errors import ConflictError, ForbiddenError, ValidationError
from shared.timeline import full_name
from shared.tokens import CurrentUser

ROLES = ("admin", "manager", "employee")


class UserService:
    """Lists and creates user accounts for admins."""

    def __init__(self, repository: UserRepository) -> None:
        self._repository = repository

    def list_users(self, user: CurrentUser) -> list[dict]:
        """
        Return every account.

        Returns:
            list: [{userId, username, email, firstName, lastName, name, role,
                    employeeId, title, manager: {employeeId, name} | None}]

        Raises:
            ForbiddenError: not an admin.
        """
        self._require_admin(user)
        return [
            {
                "userId": row["user_id"],
                "username": row["username"],
                "email": row["email"],
                "firstName": row["first_name"],
                "lastName": row["last_name"],
                "name": full_name(row["first_name"], row["last_name"], row["username"]),
                "role": row["role"],
                "employeeId": row["employee_id"],
                "title": row["title"],
                "manager": (
                    {
                        "employeeId": row["manager_id"],
                        "name": full_name(row["manager_first_name"], row["manager_last_name"], row["manager_username"]),
                    }
                    if row["manager_id"] is not None else None
                ),
            }
            for row in self._repository.find_all_users()
        ]

    def create_user(self, user: CurrentUser, data: dict) -> dict:
        """
        Create an account, plus an employee record for managers and employees.

        `data` is already field-validated by the controller: {username, email, first_name,
        last_name, role, password, title, salary, manager_id}.

        Returns:
            dict: {userId, employeeId, username, email, name, role}

        Raises:
            ForbiddenError: not an admin.
            ConflictError: username or email already in use.
            ValidationError: an admin given employee details, or an unknown / non-manager manager.
        """
        self._require_admin(user)

        if self._repository.username_taken(data["username"]):
            raise ConflictError(f"Username '{data['username']}' is already taken")
        if self._repository.email_taken(data["email"]):
            raise ConflictError(f"An account already uses {data['email']}")

        employee = None
        if data["role"] == "admin":
            given = [f for f in ("title", "salary", "manager_id") if data.get(f) is not None]
            if given:
                raise ValidationError(
                    "Admins don't have an employee record",
                    {_camel(f): "Not used for admins" for f in given},
                )
        else:
            manager_id = data.get("manager_id")
            if manager_id is not None:
                role = self._repository.find_employee_role(manager_id)
                if role is None:
                    raise ValidationError("No such manager", {"managerId": "No such employee"})
                if role != "manager":
                    raise ValidationError("Not a manager", {"managerId": "That person isn't a manager"})
            employee = {"title": data.get("title"), "salary": data.get("salary"), "manager_id": manager_id}

        password_hash = bcrypt.hashpw(data["password"].encode(), bcrypt.gensalt(12)).decode()
        ids = self._repository.create_user(
            data["username"], data["email"], data.get("first_name"), data.get("last_name"), data["role"],
            password_hash, employee,
        )
        return {
            "userId": ids["user_id"],
            "employeeId": ids["employee_id"],
            "username": data["username"],
            "email": data["email"],
            "name": full_name(data.get("first_name"), data.get("last_name"), data["username"]),
            "role": data["role"],
        }

    @staticmethod
    def _require_admin(user: CurrentUser) -> None:
        if not user.is_admin:
            raise ForbiddenError("Only admins can manage user accounts")


def _camel(field: str) -> str:
    head, *rest = field.split("_")
    return head + "".join(part.capitalize() for part in rest)

