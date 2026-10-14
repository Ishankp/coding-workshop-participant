"""
Unit tests for the milestones service: service rules and handler routing.

The repository is replaced with an in-memory fake, so no database is needed.
Run from backend/milestones (after ./bin/sync-shared.sh):  python3 -m pytest tests -q
"""

import json
import os
import sys

import pytest

os.environ.setdefault("IS_LOCAL", "true")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=wrong-import-position
import function
from controller import MilestoneController
from service import MilestoneService
from shared import tokens
from shared.errors import ForbiddenError, NotFoundError
from shared.http_utils import Router
from shared.tokens import CurrentUser

MEMBER = CurrentUser(id=10, role="employee")
OUTSIDER = CurrentUser(id=99, role="manager")
ADMIN = CurrentUser(id=1, role="admin")
MILESTONE = {"id": 5, "project_id": 2, "title": "Migration", "description": "Move data",
             "start_date": None, "end_date": None, "completed_at": None}


class FakeMilestoneRepository:
    """In-memory stand-in for MilestoneRepository."""

    def find_milestone_by_id(self, milestone_id):
        return dict(MILESTONE) if milestone_id == 5 else None

    def is_project_member(self, project_id, user_id):
        return project_id == 2 and user_id == MEMBER.id


@pytest.fixture(name="service")
def fixture_service():
    return MilestoneService(FakeMilestoneRepository())


def test_member_gets_milestone_with_project_id(service):
    milestone = service.get_milestone(MEMBER, 5)
    assert milestone["milestoneId"] == 5 and milestone["projectId"] == 2 and milestone["name"] == "Migration"
    assert milestone["completedAt"] is None


def test_missing_milestone_is_404(service):
    with pytest.raises(NotFoundError):
        service.get_milestone(MEMBER, 404)


def test_admin_sees_any_milestone(service):
    assert service.get_milestone(ADMIN, 5)["milestoneId"] == 5


def test_admin_still_gets_404(service):
    with pytest.raises(NotFoundError):
        service.get_milestone(ADMIN, 404)


def test_non_member_of_its_project_is_403(service):
    with pytest.raises(ForbiddenError):
        service.get_milestone(OUTSIDER, 5)


@pytest.fixture(name="handler")
def fixture_handler(monkeypatch, service):
    router = Router()
    router.add("GET", "/{milestone_id}", MilestoneController(service).get_milestone)
    monkeypatch.setattr(function, "router", router)
    return function.handler


def get(path, user=None):
    headers = {"Authorization": f"Bearer {tokens.create_token(user.id, user.role)}"} if user else {}
    return {"rawPath": path, "requestContext": {"http": {"method": "GET"}}, "headers": headers}


@pytest.mark.parametrize("event,status", [
    (get("/api/milestones/5", MEMBER), 200),
    (get("/5"), 401),
    (get("/5", OUTSIDER), 403),
    (get("/5", ADMIN), 200),
    (get("/404", MEMBER), 404),
    (get("/x", MEMBER), 400),
    (get("/", MEMBER), 404),
])
def test_handler_statuses(handler, event, status):
    assert handler(event)["statusCode"] == status


def test_handler_body(handler):
    body = json.loads(handler(get("/5", MEMBER))["body"])
    assert body["milestoneId"] == 5 and body["projectId"] == 2
