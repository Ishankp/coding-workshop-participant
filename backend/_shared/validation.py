"""
Validation rules shared by the services, returning per-field error messages
in the shape ValidationError expects.
"""

from datetime import date


def milestone_date_errors(project: dict, start_date: date | None, end_date: date | None) -> dict[str, str]:
    """
    Field errors for a milestone's dates: the end can't be before the start, and both
    must fall within the project's dates when the project has them. The database
    enforces the same rules, but checking here gives the caller a message per field.
    """
    errors: dict[str, str] = {}
    if start_date and end_date and end_date < start_date:
        errors["endDate"] = "Must be on or after the start date"

    project_start, project_end = project.get("start_date"), project.get("end_date")
    if project_start:
        if start_date and start_date < project_start:
            errors["startDate"] = f"Can't be before the project starts ({project_start.isoformat()})"
        if end_date and end_date < project_start:
            errors.setdefault("endDate", f"Can't be before the project starts ({project_start.isoformat()})")
    if project_end:
        if end_date and end_date > project_end:
            errors.setdefault("endDate", f"Can't be after the project ends ({project_end.isoformat()})")
        if start_date and start_date > project_end:
            errors.setdefault("startDate", f"Can't be after the project ends ({project_end.isoformat()})")
    return errors
