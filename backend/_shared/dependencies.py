"""
Milestone dependencies: "milestone A depends on milestone B", meaning B should
be finished before A. Shared by the projects service (which shows them) and the
milestones service (which adds and removes them).
"""

from datetime import date
from typing import Callable

from psycopg import Connection


def find_project_dependencies(get_connection: Callable[[], Connection], project_id: int) -> list[dict]:
    """
    Return every dependency between the project's milestones, with both sides' names
    and the prerequisite's dates and completion, ordered by the dependent milestone.
    """
    with get_connection().cursor() as cur:
        cur.execute(
            "SELECT d.milestone_id, m.title AS milestone_name, m.start_date AS milestone_start_date, "
            "       d.depends_on_milestone_id, p.title AS depends_on_name, p.start_date AS depends_on_start_date, "
            "       p.end_date AS depends_on_end_date, p.completed_at AS depends_on_completed_at "
            "FROM milestone_dependencies d "
            "JOIN milestones m ON m.id = d.milestone_id "
            "JOIN milestones p ON p.id = d.depends_on_milestone_id "
            "WHERE m.project_id = %s "
            "ORDER BY m.start_date NULLS LAST, m.title, m.id, p.start_date NULLS LAST, p.title, p.id",
            (project_id,),
        )
        return cur.fetchall()


def would_create_cycle(edges: list[tuple[int, int]], milestone_id: int, depends_on_id: int) -> list[int] | None:
    """
    Check whether adding "milestone_id depends on depends_on_id" would close a loop.

    `edges` are the existing (milestone_id, depends_on_milestone_id) pairs. Returns the
    chain of milestone ids from depends_on_id back round to milestone_id when it would,
    or None when the dependency is safe.
    """
    if milestone_id == depends_on_id:
        return [milestone_id]

    prerequisites: dict[int, list[int]] = {}
    for dependent, prerequisite in edges:
        prerequisites.setdefault(dependent, []).append(prerequisite)

    stack = [(depends_on_id, [depends_on_id])]
    seen: set[int] = set()
    while stack:
        node, path = stack.pop()
        if node == milestone_id:
            return path
        if node in seen:
            continue
        seen.add(node)
        for nxt in prerequisites.get(node, []):
            stack.append((nxt, path + [nxt]))
    return None


def prerequisite_alert(row: dict, today: date) -> str | None:
    """Warning text when a prerequisite is past its end date and still not complete, else None."""
    end = row["depends_on_end_date"]
    if row["depends_on_completed_at"] is None and end is not None and end < today:
        days = (today - end).days
        return f"{row['depends_on_name']} is {days} day{'s' if days != 1 else ''} past its end date and not complete"
    return None


def dependency_view(row: dict, today: date) -> dict:
    """Shape one dependency row for the API."""
    return {
        "milestoneId": row["milestone_id"],
        "milestoneName": row["milestone_name"],
        "dependsOnMilestoneId": row["depends_on_milestone_id"],
        "dependsOnName": row["depends_on_name"],
        "dependsOnEndDate": row["depends_on_end_date"],
        "dependsOnCompleted": row["depends_on_completed_at"] is not None,
        "alert": prerequisite_alert(row, today),
    }
