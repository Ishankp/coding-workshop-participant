"""
Team service: who is on a project and which milestones they work on.

Managers who are members of the project, and admins, can add people to the
project (with or without a milestone), assign them to milestones, and undo
both. A manager can only add or assign their own people: direct reports and
members of projects the manager is also on. Assigning someone to a milestone
adds them to the project if needed. Removing is refused while the person has
hours logged there, because those entries would be lost.
"""

from repository import ProjectRepository
from shared.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from shared.timeline import full_name
from shared.tokens import CurrentUser


class TeamService:
    """Reads and changes a project's membership and milestone assignments."""

    def __init__(self, repository: ProjectRepository) -> None:
        self._repository = repository

    def get_team(self, user: CurrentUser, project_id: int) -> dict:
        """
        Return the project's members with their milestones, and who could be added:
        everyone for admins, the manager's own people for managers.

        Returns:
            dict: {members: [{employeeId, name, username, title, role, hoursLogged,
                              milestones: [{milestoneId, name}]}],
                   candidates: [{employeeId, name, username, title, role}]}

        Raises:
            NotFoundError: no such project.
            ForbiddenError: not an admin or a manager who is a member of the project.
        """
        self._load_managed_project(user, project_id)
        pool_of = None if user.is_admin else user.id

        members: dict[int, dict] = {}
        for row in self._repository.find_team(project_id):
            member = members.setdefault(row["employee_id"], {**_person(row), "hoursLogged": row["hours_logged"],
                                                             "milestones": []})
            if row["milestone_id"] is not None:
                member["milestones"].append({"milestoneId": row["milestone_id"], "name": row["milestone_name"]})

        return {
            "members": list(members.values()),
            "candidates": [_person(row) for row in self._repository.find_non_members(project_id, pool_of)],
        }

    def add_member(self, user: CurrentUser, project_id: int, employee_id: int) -> dict:
        """
        Add an employee to the project without assigning a milestone.

        Raises:
            ValidationError: no such employee.
            ForbiddenError: a manager adding someone who isn't one of their people.
            ConflictError: already a member.
        """
        self._load_managed_project(user, project_id)
        employee = self._load_employee(employee_id)
        self._require_in_pool(user, employee)
        if self._repository.is_member(project_id, employee_id):
            raise ConflictError(f"{employee['name']} is already on this project")
        self._repository.insert_member(project_id, employee_id)
        return {"projectId": project_id, **employee}

    def remove_member(self, user: CurrentUser, project_id: int, employee_id: int) -> None:
        """
        Remove an employee from the project, including their milestone assignments in it.

        Raises:
            NotFoundError: not a member.
            ConflictError: they have logged hours on the project.
        """
        self._load_managed_project(user, project_id)
        if not self._repository.is_member(project_id, employee_id):
            raise NotFoundError(f"Employee {employee_id} is not on project {project_id}")
        entries = self._repository.count_project_entries(employee_id, project_id)
        if entries:
            name = self._load_employee(employee_id)["name"]
            raise ConflictError(
                f"{name} has {entries} time {'entry' if entries == 1 else 'entries'} on this project; "
                "remove those first"
            )
        self._repository.delete_member_assignments(project_id, employee_id)
        self._repository.delete_member(project_id, employee_id)

    def assign_milestone(self, user: CurrentUser, project_id: int, milestone_id: int, employee_id: int) -> dict:
        """
        Assign an employee to one of the project's milestones, adding them to the project if needed.

        Returns:
            dict: {employeeId, name, milestoneId, milestoneName, addedToProject}

        Raises:
            NotFoundError: the milestone isn't in this project.
            ValidationError: no such employee.
            ForbiddenError: a manager assigning someone who isn't one of their people.
            ConflictError: already assigned.
        """
        self._load_managed_project(user, project_id)
        milestone = self._repository.find_project_milestone(project_id, milestone_id)
        if milestone is None:
            raise NotFoundError(f"Milestone {milestone_id} is not part of project {project_id}")
        employee = self._load_employee(employee_id)
        self._require_in_pool(user, employee)
        if self._repository.is_assigned(employee_id, milestone_id):
            raise ConflictError(f"{employee['name']} is already assigned to {milestone['title']}")

        added_to_project = not self._repository.is_member(project_id, employee_id)
        if added_to_project:
            self._repository.insert_member(project_id, employee_id)
        self._repository.insert_assignment(employee_id, milestone_id)
        return {
            "employeeId": employee["employeeId"],
            "name": employee["name"],
            "milestoneId": milestone["id"],
            "milestoneName": milestone["title"],
            "addedToProject": added_to_project,
        }

    def unassign_milestone(self, user: CurrentUser, project_id: int, milestone_id: int, employee_id: int) -> None:
        """
        Unassign an employee from a milestone (they stay on the project).

        Raises:
            NotFoundError: the milestone isn't in this project, or they weren't assigned.
            ConflictError: they have logged hours on the milestone.
        """
        self._load_managed_project(user, project_id)
        milestone = self._repository.find_project_milestone(project_id, milestone_id)
        if milestone is None:
            raise NotFoundError(f"Milestone {milestone_id} is not part of project {project_id}")
        if not self._repository.is_assigned(employee_id, milestone_id):
            raise NotFoundError(f"Employee {employee_id} is not assigned to {milestone['title']}")
        entries = self._repository.count_milestone_entries(employee_id, milestone_id)
        if entries:
            name = self._load_employee(employee_id)["name"]
            raise ConflictError(
                f"{name} has {entries} time {'entry' if entries == 1 else 'entries'} on {milestone['title']}; "
                "remove those first"
            )
        self._repository.delete_assignment(employee_id, milestone_id)

    def _load_managed_project(self, user: CurrentUser, project_id: int) -> dict:
        project = self._repository.find_project_by_id(project_id)
        if project is None:
            raise NotFoundError(f"Project {project_id} not found")
        if user.is_admin:
            return project
        if not self._repository.is_project_member(project_id, user.id):
            raise ForbiddenError("You are not a member of this project")
        if not user.is_manager:
            raise ForbiddenError("Only managers of this project or admins can change the team")
        return project

    def _require_in_pool(self, user: CurrentUser, employee: dict) -> None:
        if user.is_admin or self._repository.is_in_pool_of(employee["employeeId"], user.id):
            return
        raise ForbiddenError(
            f"{employee['name']} isn't one of your people: you can only add direct reports "
            "or members of projects you're on"
        )

    def _load_employee(self, employee_id: int) -> dict:
        row = self._repository.find_employee_summary(employee_id)
        if row is None:
            raise ValidationError("No such employee", {"employeeId": "No such employee"})
        return _person(row)


def _person(row: dict) -> dict:
    return {
        "employeeId": row["employee_id"],
        "name": full_name(row["first_name"], row["last_name"], row["username"]),
        "username": row["username"],
        "title": row["title"],
        "role": row["role"],
    }
