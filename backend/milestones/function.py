"""
Milestones service Lambda entry point (served at /api/milestones).

Wires the layers together and registers the routes:
    GET    /{milestone_id}                              One milestone's details and dependencies (members)
    POST   /{milestone_id}/dependencies                 Make it depend on another milestone (managers, admins)
    DELETE /{milestone_id}/dependencies/{depends_on}    Remove a dependency (managers, admins)
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


def handler(event: dict | None = None, context: object = None) -> dict:  # pylint: disable=unused-argument
    """Lambda handler."""
    return handle(event, SERVICE_NAME, router)
