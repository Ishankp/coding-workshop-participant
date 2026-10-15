"""
Milestone service: business logic for reading milestones and managing the
dependencies between them.

Admins can see every milestone; anyone else only sees milestones in projects
they are members of, and employees can't see archived milestones (or milestones
of archived projects) at all. Managers who are members, and admins, can archive
and restore milestones. Dependencies ("A depends on B finishing first") can be
added and removed by admins and by managers who are members of the project.
Adding one is refused when it would create a loop, when the two milestones are
in different projects, or when the dependent milestone starts before the one
it depends on.
"""

from datetime import date
from decimal import Decimal
from typing import Callable

from repository import MilestoneRepository
from shared.dependencies import dependency_view, would_create_cycle
from shared.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from shared.timeline import full_name
from shared.tokens import CurrentUser
from shared.validation import milestone_date_errors


class MilestoneService:
    """Returns milestone details and changes milestone dependencies for the logged-in user."""

    def __init__(self, repository: MilestoneRepository, today: Callable[[], date] = date.today) -> None:
        self._repository = repository
        self._today = today

    def get_milestone(self, user: CurrentUser, milestone_id: int) -> dict:
        """
        Return a milestone's details, its dependencies, and the work logged on it by everyone.

        Returns:
            dict: {milestoneId, projectId, name, description, startDate, endDate, completedAt,
                   archivedAt, projectArchivedAt, projectStartDate, projectEndDate,
                   dependsOn: [{milestoneId, name, completed, alert}],
                   requiredBy: [{milestoneId, name}],
                   totalHours,
                   hoursByEmployee: [{employeeId, name, hours}],          # most hours first
                   entries: [{entryId, workDate, hours, note,
                              employee: {employeeId, name},
                              loggedBy: {userId, name, role} | None, loggedBySelf, createdAt}]}

        Raises:
            NotFoundError: no such milestone.
            ForbiddenError: the user isn't an admin or a member of the milestone's project.
        """
        milestone = self._load_visible_milestone(user, milestone_id)
        today = self._today()
        rows = self._repository.find_project_dependencies(milestone["project_id"])

        return {
            "milestoneId": milestone["id"],
            "projectId": milestone["project_id"],
            "name": milestone["title"],
            "description": milestone["description"],
            "startDate": milestone["start_date"],
            "endDate": milestone["end_date"],
            "completedAt": milestone["completed_at"],
            "archivedAt": milestone["archived_at"],
            "projectArchivedAt": milestone["project_archived_at"],
            "projectStartDate": milestone["project_start_date"],
            "projectEndDate": milestone["project_end_date"],
            "dependsOn": [
                {
                    "milestoneId": view["dependsOnMilestoneId"],
                    "name": view["dependsOnName"],
                    "completed": view["dependsOnCompleted"],
                    "alert": view["alert"],
                }
                for view in (dependency_view(r, today) for r in rows if r["milestone_id"] == milestone_id)
            ],
            "requiredBy": [
                {"milestoneId": r["milestone_id"], "name": r["milestone_name"]}
                for r in rows if r["depends_on_milestone_id"] == milestone_id
            ],
            **_work_log(self._repository.find_time_entries(milestone_id)),
        }

    def add_dependency(self, user: CurrentUser, milestone_id: int, depends_on_id: int) -> dict:
        """
        Record that a milestone depends on another in the same project.

        Returns:
            dict: {milestoneId, milestoneName, dependsOnMilestoneId, dependsOnName}

        Raises:
            NotFoundError: no such milestone.
            ForbiddenError: not an admin or a manager who is a member of the project.
            ValidationError: unknown or cross-project prerequisite, duplicate, loop, or
                             the dependent milestone starts before its prerequisite.
        """
        milestone = self._load_visible_milestone(user, milestone_id)
        self._require_manager(user, milestone["project_id"])

        field = "dependsOnMilestoneId"
        prerequisite = self._repository.find_milestone_by_id(depends_on_id)
        if prerequisite is None:
            raise ValidationError("No such milestone", {field: "No such milestone"})
        if prerequisite["id"] == milestone["id"]:
            raise ValidationError("A milestone can't depend on itself", {field: "A milestone can't depend on itself"})
        if prerequisite["project_id"] != milestone["project_id"]:
            raise ValidationError("Must be in the same project", {field: "Must be a milestone in the same project"})

        rows = self._repository.find_project_dependencies(milestone["project_id"])
        edges = [(r["milestone_id"], r["depends_on_milestone_id"]) for r in rows]
        if (milestone_id, depends_on_id) in edges:
            raise ValidationError(
                "Dependency already exists", {field: f"{milestone['title']} already depends on {prerequisite['title']}"}
            )

        chain = would_create_cycle(edges, milestone_id, depends_on_id)
        if chain:
            names = {r["milestone_id"]: r["milestone_name"] for r in rows}
            names.update({r["depends_on_milestone_id"]: r["depends_on_name"] for r in rows})
            names.update({milestone["id"]: milestone["title"], prerequisite["id"]: prerequisite["title"]})
            loop = " → ".join([milestone["title"]] + [names[i] for i in chain])
            raise ValidationError("Would create a loop", {field: f"Would create a loop: {loop}"})

        if (
            milestone["start_date"] and prerequisite["start_date"]
            and milestone["start_date"] < prerequisite["start_date"]
        ):
            raise ValidationError("Starts before its prerequisite", {
                field: (
                    f"{milestone['title']} starts on {milestone['start_date'].isoformat()}, before "
                    f"{prerequisite['title']} ({prerequisite['start_date'].isoformat()})"
                ),
            })

        self._repository.insert_dependency(milestone_id, depends_on_id)
        return {
            "milestoneId": milestone["id"],
            "milestoneName": milestone["title"],
            "dependsOnMilestoneId": prerequisite["id"],
            "dependsOnName": prerequisite["title"],
        }

    def set_completed(self, user: CurrentUser, milestone_id: int, completed: bool) -> dict:
        """
        Mark a milestone complete, or reopen it.

        Returns:
            dict: {milestoneId, name, completedAt}

        Raises:
            NotFoundError: no such milestone.
            ForbiddenError: not an admin or a manager who is a member of the project.
            ConflictError: completing an archived milestone (restore it first).
        """
        milestone = self._load_visible_milestone(user, milestone_id)
        self._require_manager(user, milestone["project_id"])
        if completed and milestone["archived_at"]:
            raise ConflictError(f"{milestone['title']} is archived; restore it before marking it complete")
        row = self._repository.set_completed(milestone_id, completed)
        return {"milestoneId": row["id"], "name": row["title"], "completedAt": row["completed_at"]}

    def update_milestone(  # pylint: disable=too-many-arguments
        self, user: CurrentUser, milestone_id: int, title: str, description: str | None,
        start_date: date | None, end_date: date | None,
    ) -> dict:
        """
        Change a milestone's title, description and dates.

        Dates must stay inside the project, and a new start date can't break a
        dependency: this milestone can't start before one it depends on, and a
        milestone that depends on this one can't be left starting before it.

        Returns:
            dict: {milestoneId, projectId, name, description, startDate, endDate, completedAt, archivedAt}

        Raises:
            NotFoundError: no such milestone.
            ForbiddenError: not an admin or a manager who is a member of the project.
            ValidationError: a date rule is broken (field errors say which).
        """
        milestone = self._load_visible_milestone(user, milestone_id)
        self._require_manager(user, milestone["project_id"])

        project = {"start_date": milestone["project_start_date"], "end_date": milestone["project_end_date"]}
        errors = milestone_date_errors(project, start_date, end_date)
        if start_date and "startDate" not in errors:
            for r in self._repository.find_project_dependencies(milestone["project_id"]):
                if r["milestone_id"] == milestone_id and r["depends_on_start_date"] and start_date < r["depends_on_start_date"]:
                    errors["startDate"] = (
                        f"Can't start before {r['depends_on_name']} ({r['depends_on_start_date'].isoformat()}), "
                        "which it depends on"
                    )
                    break
                if r["depends_on_milestone_id"] == milestone_id and r["milestone_start_date"] and r["milestone_start_date"] < start_date:
                    errors["startDate"] = (
                        f"{r['milestone_name']} depends on this milestone and starts on "
                        f"{r['milestone_start_date'].isoformat()}"
                    )
                    break
        if errors:
            raise ValidationError("Invalid milestone dates", errors)

        row = self._repository.update_milestone(milestone_id, title, description, start_date, end_date)
        return {
            "milestoneId": row["id"],
            "projectId": row["project_id"],
            "name": row["title"],
            "description": row["description"],
            "startDate": row["start_date"],
            "endDate": row["end_date"],
            "completedAt": row["completed_at"],
            "archivedAt": row["archived_at"],
        }

    def set_archived(self, user: CurrentUser, milestone_id: int, archived: bool) -> dict:
        """
        Archive (hide from employees and progress) or restore a milestone.

        Returns:
            dict: {milestoneId, name, archivedAt}

        Raises:
            NotFoundError: no such milestone.
            ForbiddenError: not an admin or a manager who is a member of the project.
        """
        milestone = self._load_visible_milestone(user, milestone_id)
        self._require_manager(user, milestone["project_id"])
        row = self._repository.set_archived(milestone_id, archived)
        return {"milestoneId": row["id"], "name": row["title"], "archivedAt": row["archived_at"]}

    def remove_dependency(self, user: CurrentUser, milestone_id: int, depends_on_id: int) -> None:
        """
        Remove a dependency.

        Raises:
            NotFoundError: no such milestone, or it doesn't depend on the other one.
            ForbiddenError: not an admin or a manager who is a member of the project.
        """
        milestone = self._load_visible_milestone(user, milestone_id)
        self._require_manager(user, milestone["project_id"])
        if not self._repository.delete_dependency(milestone_id, depends_on_id):
            raise NotFoundError(f"Milestone {milestone_id} does not depend on milestone {depends_on_id}")

    def _load_visible_milestone(self, user: CurrentUser, milestone_id: int) -> dict:
        milestone = self._repository.find_milestone_by_id(milestone_id)
        if milestone is None:
            raise NotFoundError(f"Milestone {milestone_id} not found")
        if not user.is_admin and not self._repository.is_project_member(milestone["project_id"], user.id):
            raise ForbiddenError("You are not a member of this milestone's project")
        if (milestone["archived_at"] or milestone["project_archived_at"]) and not (user.is_admin or user.is_manager):
            raise ForbiddenError("This milestone has been archived")
        return milestone

    def _require_manager(self, user: CurrentUser, project_id: int) -> None:
        # Membership was already checked by _load_visible_milestone, so a manager here is a member
        if not (user.is_admin or user.is_manager):
            raise ForbiddenError("Only managers of this project or admins can change milestones")


def _work_log(rows: list[dict]) -> dict:
    """Shape the milestone's time entries, with totals overall and per employee."""
    entries = []
    by_employee: dict[int, dict] = {}
    for row in rows:
        name = full_name(row["first_name"], row["last_name"], row["username"])
        logged_by = None
        if row["created_by_user_id"] is not None:
            logged_by = {
                "userId": row["created_by_user_id"],
                "name": full_name(row["cb_first_name"], row["cb_last_name"], row["cb_username"] or ""),
                "role": row["cb_role"],
            }
        entries.append({
            "entryId": row["id"],
            "workDate": row["work_date"],
            "hours": row["hours"],
            "note": row["note"],
            "employee": {"employeeId": row["employee_id"], "name": name},
            "loggedBy": logged_by,
            "loggedBySelf": row["created_by_user_id"] == row["employee_user_id"],
            "createdAt": row["created_at"],
        })
        person = by_employee.setdefault(row["employee_id"], {"employeeId": row["employee_id"], "name": name,
                                                            "hours": Decimal(0)})
        person["hours"] += row["hours"]

    return {
        "totalHours": sum((e["hours"] for e in entries), Decimal(0)),
        "hoursByEmployee": sorted(by_employee.values(), key=lambda p: (-p["hours"], p["name"])),
        "entries": entries,
    }
