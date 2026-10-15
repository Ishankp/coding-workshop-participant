"""
Database setup actions: validates the request and orders the SQL scripts.

The repository executes the SQL; this layer decides which files run, in what
order, and refuses the destructive action without an explicit confirmation.
"""

import os

from shared.errors import ValidationError

RESET_SCRIPTS = ("reset.sql", "schema.sql", "seed.sql")
TABLES = ("users", "employees", "projects", "milestones", "employee_projects",
          "employee_milestones", "milestone_dependencies", "time_entries")


class DbSetupService:
    """Runs the schema/seed scripts and reports database state."""

    def __init__(self, repository, sql_dir: str):
        self._repository = repository
        self._sql_dir = sql_dir

    def run(self, payload: dict) -> dict:
        """Dispatch on payload["action"]."""
        if not isinstance(payload, dict):
            raise ValidationError("Payload must be a JSON object")
        action = payload.get("action")
        if action == "status":
            return self.status()
        if action == "reset":
            if payload.get("confirm") is not True:
                raise ValidationError('Reset deletes all data; send {"action": "reset", "confirm": true}')
            return self.reset()
        raise ValidationError("Unknown action; expected 'status' or 'reset'", fields={"action": "Unknown action"})

    def status(self) -> dict:
        """Which tables exist and how many rows each has."""
        present = set(self._repository.list_tables())
        counts = {name: (self._repository.count_rows(name) if name in present else None) for name in TABLES}
        return {"serverVersion": self._repository.server_version(), "tables": counts,
                "ready": all(name in present for name in TABLES)}

    def reset(self) -> dict:
        """Drop everything, recreate the schema and load the seed data."""
        for name in RESET_SCRIPTS:
            self._repository.run_script(self._read_script(name))
        return {"ran": list(RESET_SCRIPTS), **self.status()}

    def _read_script(self, name: str) -> str:
        path = os.path.join(self._sql_dir, name)
        if not os.path.isfile(path):
            raise ValidationError(f"Missing SQL file {name}; run bin/sync-shared.sh before deploying")
        with open(path, encoding="utf-8") as handle:
            return handle.read()
