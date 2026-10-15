"""
User service: admin-only account management.

Only admins can list, create, edit, deactivate or reset the password of
accounts. Managers and employees get an employee record (title, salary,
manager); admins don't. A manager must be chosen from people whose role is
manager, and is fixed once set. Roles can move between manager and employee
(not to or from admin), and a manager with direct reports can't be demoted.
Deactivated accounts can't log in and drop out of pickers but keep history.
Deleting is for employees and managers who never logged hours and manage no
one; everyone else is deactivated so their history stays intact.
"""

import bcrypt

from repository import UserRepository
from shared.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
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
            list: [{userId, username, email, firstName, lastName, name, role, deactivatedAt,
                    employeeId, title, salary, manager: {employeeId, name} | None}]

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
                "deactivatedAt": row["deactivated_at"],
                "employeeId": row["employee_id"],
                "title": row["title"],
                "salary": row["salary"],
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

    def update_user(self, user: CurrentUser, user_id: int, data: dict) -> dict:
        """
        Change an account's email, name and role, and (for managers/employees) title and salary.

        `data` is controller-validated: {email, first_name, last_name, role, title, salary}.

        Returns:
            dict: {userId, username, email, name, role}

        Raises:
            ForbiddenError: not an admin.
            NotFoundError: no such account.
            ConflictError: another account already uses the email.
            ValidationError: a role change to/from admin, or demoting a manager who has direct reports.
        """
        self._require_admin(user)
        account = self._load(user_id)

        if self._repository.email_taken_by_other(data["email"], user_id):
            raise ConflictError(f"Another account already uses {data['email']}")
        if (account["role"] == "admin") != (data["role"] == "admin"):
            raise ValidationError("Can't change to or from admin", {"role": "Admins can't be converted to or from other roles"})
        if account["role"] == "manager" and data["role"] == "employee" and account["direct_reports"]:
            raise ValidationError("Still has direct reports", {
                "role": f"Still manages {account['direct_reports']} {'person' if account['direct_reports'] == 1 else 'people'}",
            })

        employee = None if account["employee_id"] is None else {"title": data.get("title"), "salary": data.get("salary")}
        self._repository.update_user(user_id, data["email"], data.get("first_name"), data.get("last_name"), data["role"], employee)
        return {
            "userId": user_id,
            "username": account["username"],
            "email": data["email"],
            "name": full_name(data.get("first_name"), data.get("last_name"), account["username"]),
            "role": data["role"],
        }

    def set_password(self, user: CurrentUser, user_id: int, password: str) -> None:
        """Replace an account's password (admins only)."""
        self._require_admin(user)
        self._load(user_id)
        self._repository.set_password(user_id, bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode())

    def set_deactivated(self, user: CurrentUser, user_id: int, deactivated: bool) -> dict:
        """
        Deactivate (can't log in, hidden from pickers) or reactivate an account.

        Raises:
            ForbiddenError: not an admin.
            NotFoundError: no such account.
            ValidationError: deactivating your own account.
        """
        self._require_admin(user)
        self._load(user_id)
        if deactivated and user_id == user.id:
            raise ValidationError("You can't deactivate your own account", {"userId": "That's you"})
        row = self._repository.set_deactivated(user_id, deactivated)
        return {"userId": user_id, "deactivatedAt": row["deactivated_at"]}

    def delete_user(self, user: CurrentUser, user_id: int) -> None:
        """
        Permanently delete an employee's or manager's account, with its employee record,
        project memberships and milestone assignments.

        Raises:
            ForbiddenError: not an admin.
            NotFoundError: no such account.
            ValidationError: deleting your own account.
            ConflictError: an admin account, a manager who still has direct reports, or
                someone with hours logged (their time entries would be lost); deactivate instead.
        """
        self._require_admin(user)
        account = self._load(user_id)
        if user_id == user.id:
            raise ValidationError("You can't delete your own account", {"userId": "That's you"})
        name = full_name(account["first_name"], account["last_name"], account["username"])
        if account["role"] == "admin":
            raise ConflictError(f"{name} is an admin; admin accounts can be deactivated but not deleted")
        if account["direct_reports"]:
            count = account["direct_reports"]
            raise ConflictError(
                f"{name} still manages {count} {'person' if count == 1 else 'people'}; deactivate the account instead"
            )
        entries = self._repository.count_time_entries_for_user(user_id)
        if entries:
            raise ConflictError(
                f"{name} has {entries} time {'entry' if entries == 1 else 'entries'} logged; "
                "deactivate the account instead of deleting it"
            )
        self._repository.delete_user(user_id)

    def _load(self, user_id: int) -> dict:
        account = self._repository.find_user(user_id)
        if account is None:
            raise NotFoundError(f"Account {user_id} not found")
        return account

    @staticmethod
    def _require_admin(user: CurrentUser) -> None:
        if not user.is_admin:
            raise ForbiddenError("Only admins can manage user accounts")


def _camel(field: str) -> str:
    head, *rest = field.split("_")
    return head + "".join(part.capitalize() for part in rest)

