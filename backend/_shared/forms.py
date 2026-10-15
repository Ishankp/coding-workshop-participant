"""
Field parsers for JSON request bodies. Each records a message in `fields` when
the value is invalid and returns the parsed value (or None).
"""

import math
from datetime import date
from decimal import Decimal

MAX_TITLE = 255
MAX_DESCRIPTION = 5000
MAX_MONEY = Decimal("999999999999.99")  # DECIMAL(14,2)


def parse_title(body: dict, fields: dict, name: str = "title") -> str | None:
    """A required, non-blank string of at most MAX_TITLE characters, trimmed."""
    value = body.get(name)
    if not isinstance(value, str) or not value.strip():
        fields[name] = "Title is required"
        return None
    if len(value.strip()) > MAX_TITLE:
        fields[name] = f"Must be at most {MAX_TITLE} characters"
        return None
    return value.strip()


def parse_optional_date(body: dict, name: str, fields: dict) -> date | None:
    """An optional YYYY-MM-DD string; empty or missing means None."""
    value = body.get(name)
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        fields[name] = "Must be a date in YYYY-MM-DD format"
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        fields[name] = "Must be a date in YYYY-MM-DD format"
        return None


def parse_optional_money(body: dict, name: str, fields: dict) -> Decimal | None:
    """An optional non-negative amount with at most 2 decimals; empty or missing means None."""
    value = body.get(name)
    if value is None or value == "":
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        fields[name] = "Must be a number"
        return None
    amount = Decimal(str(value))
    if amount < 0:
        fields[name] = "Can't be negative"
    elif amount > MAX_MONEY:
        fields[name] = "Too large"
    elif amount != amount.quantize(Decimal("0.01")):
        fields[name] = "Use at most 2 decimal places"
    return amount


def parse_optional_text(body: dict, name: str, limit: int, fields: dict) -> str | None:
    """An optional string of at most `limit` characters, trimmed; blank means None."""
    value = body.get(name)
    if value is None:
        return None
    if not isinstance(value, str):
        fields[name] = "Must be text"
        return None
    value = value.strip()
    if len(value) > limit:
        fields[name] = f"Must be at most {limit} characters"
    return value or None
