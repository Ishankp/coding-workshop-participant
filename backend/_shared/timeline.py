"""
Milestone schedule progress, shared by every service that shows milestones.
"""

from datetime import date


def elapsed_fraction(start: date | None, end: date | None, today: date) -> float | None:
    """
    Share (0.0–1.0) of the start→end window that has passed as of today:
    0 before the start, 1 once the end date has passed. None if either date is missing.
    """
    if start is None or end is None:
        return None
    total_days = (end - start).days
    if total_days <= 0:
        # Single-day window: all or nothing
        return 1.0 if today >= end else 0.0
    return min(max((today - start).days / total_days, 0.0), 1.0)


def milestone_timeline(start: date | None, end: date | None, today: date) -> dict:
    """
    Describe how far through its scheduled time a milestone is.

    Returns:
        dict: {
            "timeElapsedPercent": 0-100 share of the start→end window that has passed
                                  (0 before it starts, 100 once the end date has passed),
                                  or None if either date is missing,
            "daysLeft": days until the end date (negative once past), or None,
            "status": "not_started" | "in_progress" | "past_end_date" | "unscheduled",
        }
    """
    days_left = (end - today).days if end else None
    fraction = elapsed_fraction(start, end, today)
    if fraction is None:
        return {"timeElapsedPercent": None, "daysLeft": days_left, "status": "unscheduled"}

    if today < start:
        status = "not_started"
    elif today > end:
        status = "past_end_date"
    else:
        status = "in_progress"

    return {"timeElapsedPercent": round(fraction * 100), "daysLeft": days_left, "status": status}


def full_name(first_name: str | None, last_name: str | None, fallback: str) -> str:
    """Join first and last name, falling back (e.g. to the username) when both are empty."""
    return " ".join(part for part in (first_name, last_name) if part) or fallback
