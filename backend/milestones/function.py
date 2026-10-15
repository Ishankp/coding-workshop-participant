"""
Milestones service Lambda entry point (served at /api/milestones).

Wires the layers together and registers the routes:
    GET    /{milestone_id}                              One milestone's details and dependencies (members)
    POST   /{milestone_id}/dependencies                 Make it depend on another milestone (managers, admins)
    DELETE /{milestone_id}/dependencies/{depends_on}    Remove a dependency (managers, admins)
    POST   /{milestone_id}/archive, /unarchive          Hide from employees and progress / restore (managers, admins)
    PUT    /{milestone_id}                              Edit title, description and dates (managers, admins)
    DELETE /{milestone_id}                              Delete (admins only; refused while hours are logged)
    POST   /{milestone_id}/complete, /reopen            Mark done / reopen (managers, admins)
"""

import logging

from controller import MilestoneController
from repository import MilestoneRepository
from service import MilestoneService
from shared import db
from shared.http_utils import Router, handle

SERVICE_NAME = "milestones"

logging.getLogger().setLevel(logging.INFO)

# Built once per container and reused across warm invocations
_controller = MilestoneController(MilestoneService(MilestoneRepository(db.get_connection)))

router = Router()
router.add("GET", "/{milestone_id}", _controller.get_milestone)
router.add("POST", "/{milestone_id}/dependencies", _controller.add_dependency)
router.add("DELETE", "/{milestone_id}/dependencies/{depends_on_id}", _controller.remove_dependency)
router.add("PUT", "/{milestone_id}", _controller.update_milestone)
router.add("DELETE", "/{milestone_id}", _controller.delete_milestone)
router.add("POST", "/{milestone_id}/complete", _controller.complete_milestone)
router.add("POST", "/{milestone_id}/reopen", _controller.reopen_milestone)
router.add("POST", "/{milestone_id}/archive", _controller.archive_milestone)
router.add("POST", "/{milestone_id}/unarchive", _controller.unarchive_milestone)


def handler(event: dict | None = None, context: object = None) -> dict:  # pylint: disable=unused-argument
    """Lambda handler."""
    return handle(event, SERVICE_NAME, router)
