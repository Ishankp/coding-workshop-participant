"""
Free-text search helpers shared by the list endpoints (?q=...).
"""

from .errors import ValidationError
from .http_utils import Request

MAX_QUERY_LENGTH = 100


def read_search_query(request: Request) -> str | None:
    """Return the trimmed ?q= parameter, or None when absent or blank; raise 400 if it's too long."""
    query = (request.query.get("q") or "").strip()
    if not query:
        return None
    if len(query) > MAX_QUERY_LENGTH:
        raise ValidationError("Search text is too long", {"q": f"Must be at most {MAX_QUERY_LENGTH} characters"})
    return query


def contains_pattern(query: str) -> str:
    """
    Turn free text into a case-insensitive "contains" pattern for ILIKE,
    escaping the wildcard characters so they match literally.
    """
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
