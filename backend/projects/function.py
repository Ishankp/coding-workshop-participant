"""
Projects service Lambda entry point (served at /api/projects).

Wires the layers together and registers the routes:
    GET /                          Projects the logged-in user is assigned to
    GET /{project_id}              One project's details (members only)
    GET /{project_id}/members      The project's members and their milestones (members only)
    GET /{project_id}/milestones   The project's milestones, schedule progress and assignees (members only)
    GET /{project_id}/budget       Budget vs cost so far and projected cost (managers and admins only)
"""

import logging

from controller import ProjectController
from repository import ProjectRepository
from service import ProjectService
from shared import db
from shared.http_utils import Router, handle

SERVICE_NAME = "projects"

logging.getLogger().setLevel(logging.INFO)

# Built once per container and reused across warm invocations
_controller = ProjectController(ProjectService(ProjectRepository(db.get_connection)))

router = Router()
router.add("GET", "/", _controller.list_projects)
router.add("GET", "/{project_id}", _controller.get_project)
router.add("GET", "/{project_id}/members", _controller.get_project_members)
router.add("GET", "/{project_id}/milestones", _controller.get_project_milestones)
router.add("GET", "/{project_id}/budget", _controller.get_project_budget)


def handler(event: dict | None = None, context: object = None) -> dict:  # pylint: disable=unused-argument
    """Lambda handler."""
    return handle(event, SERVICE_NAME, router)
