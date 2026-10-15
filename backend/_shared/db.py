"""
PostgreSQL connection management.

Keeps one module-level connection so it is reused across invocations of the
same warm Lambda container, and reconnects if it was closed.
"""

import os

from psycopg import Connection, connect
from psycopg.rows import dict_row

_IS_LOCAL = os.getenv("IS_LOCAL", "false") == "true"

PG_CONFIG = (
    f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
    f"port={os.getenv('POSTGRES_PORT', '5432')} "
    f"user={os.getenv('POSTGRES_USER', 'postgres')} "
    f"password={os.getenv('POSTGRES_PASS', 'postgres')} "
    f"dbname={os.getenv('POSTGRES_NAME', 'postgres')} "
    f"connect_timeout=15"
    + ("" if _IS_LOCAL else " sslmode=require")
)

_CONN: Connection | None = None


def get_connection() -> Connection:
    """Return an open connection whose cursors yield rows as dicts."""
    global _CONN  # pylint: disable=global-statement
    if _CONN is None or _CONN.closed:
        _CONN = connect(PG_CONFIG, row_factory=dict_row, autocommit=True)
    return _CONN


def reset_connection() -> None:
    """Drop the cached connection so the next call reconnects."""
    global _CONN  # pylint: disable=global-statement
    if _CONN is not None:
        try:
            _CONN.close()
        except Exception:  # pylint: disable=broad-except  # nosec B110 - best-effort close of a dead connection
            pass
    _CONN = None
