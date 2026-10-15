"""
SQL execution for the setup Lambda.

Scripts are sent as-is (no parameters), which lets PostgreSQL run every
statement in the file in one round trip.
"""

from psycopg import sql


class SqlRepository:
    """Executes whole SQL scripts and simple catalog queries."""

    def __init__(self, get_connection):
        self._get_connection = get_connection

    def run_script(self, script: str) -> None:
        with self._get_connection().cursor() as cur:
            cur.execute(script)

    def list_tables(self) -> list[str]:
        with self._get_connection().cursor() as cur:
            cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
            return [row["table_name"] for row in cur.fetchall()]

    def count_rows(self, table: str) -> int:
        with self._get_connection().cursor() as cur:
            cur.execute(sql.SQL("SELECT count(*) AS n FROM {}").format(sql.Identifier(table)))
            return cur.fetchone()["n"]

    def server_version(self) -> str:
        with self._get_connection().cursor() as cur:
            cur.execute("SHOW server_version")
            return cur.fetchone()["server_version"]
