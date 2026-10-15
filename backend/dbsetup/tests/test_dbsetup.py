"""
Unit tests for the dbsetup Lambda: action dispatch, confirmation guard, HTTP refusal.

The repository is replaced with an in-memory fake that records the scripts it ran.
Run from backend/dbsetup (after ./bin/sync-shared.sh):  python3 -m pytest tests -q
"""

import os
import sys

import pytest

os.environ.setdefault("IS_LOCAL", "true")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=wrong-import-position
import function
from service import RESET_SCRIPTS, TABLES, DbSetupService
from shared.errors import ValidationError


class FakeRepository:
    """Pretends the schema appears once schema.sql has run."""

    def __init__(self):
        self.scripts = []
        self.tables = []

    def run_script(self, script):
        self.scripts.append(script)
        if script.startswith("-- schema"):
            self.tables = list(TABLES)
        if script.startswith("-- reset"):
            self.tables = []

    def list_tables(self):
        return list(self.tables)

    def count_rows(self, table):
        return 7 if table == "users" else 0

    def server_version(self):
        return "17.7"


@pytest.fixture(name="sql_dir")
def fixture_sql_dir(tmp_path):
    for name in RESET_SCRIPTS:
        (tmp_path / name).write_text(f"-- {name.split('.')[0]}\nSELECT 1;")
    return str(tmp_path)


@pytest.fixture(name="repo")
def fixture_repo():
    return FakeRepository()


@pytest.fixture(name="service")
def fixture_service(repo, sql_dir):
    return DbSetupService(repo, sql_dir)


def test_status_reports_missing_tables(service):
    result = service.run({"action": "status"})
    assert result["ready"] is False
    assert result["tables"]["users"] is None
    assert result["serverVersion"] == "17.7"


def test_reset_runs_scripts_in_order_and_reports_ready(service, repo):
    result = service.run({"action": "reset", "confirm": True})
    assert [s.splitlines()[0] for s in repo.scripts] == ["-- reset", "-- schema", "-- seed"]
    assert result["ran"] == list(RESET_SCRIPTS)
    assert result["ready"] is True
    assert result["tables"]["users"] == 7


@pytest.mark.parametrize("payload", [{"action": "reset"}, {"action": "reset", "confirm": "yes"}])
def test_reset_requires_explicit_confirmation(service, repo, payload):
    with pytest.raises(ValidationError):
        service.run(payload)
    assert repo.scripts == []


@pytest.mark.parametrize("payload", [{}, {"action": "drop"}, "status", None])
def test_unknown_action_is_rejected(service, payload):
    with pytest.raises(ValidationError):
        service.run(payload)


def test_missing_sql_file_is_a_clear_error(repo, tmp_path):
    service = DbSetupService(repo, str(tmp_path))
    with pytest.raises(ValidationError, match="sync-shared"):
        service.reset()


def test_handler_refuses_http_requests(monkeypatch, service):
    monkeypatch.setattr(function, "_service", service)
    response = function.handler({"rawPath": "/", "requestContext": {"http": {"method": "POST"}},
                                 "body": '{"action":"reset","confirm":true}'})
    assert response["statusCode"] == 404


def test_handler_wraps_results_and_errors(monkeypatch, service):
    monkeypatch.setattr(function, "_service", service)
    assert function.handler({"action": "status"})["ok"] is True
    failed = function.handler({"action": "nope"})
    assert failed["ok"] is False
    assert failed["error"]["code"] == "validation_error"
