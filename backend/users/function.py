"""
Users service Lambda entry point (served at /api/users). Admins only.

    GET  /    Every account with its role, employee record and manager
    POST /    Create an account (admins get no employee record; managers and
              employees get title, salary and manager)
"""

import logging

from controller import UserController
from repository import UserRepository
from service import UserService
from shared import db
from shared.http_utils import Router, handle

SERVICE_NAME = "users"

logging.getLogger().setLevel(logging.INFO)

# Built once per container and reused across warm invocations
_controller = UserController(UserService(UserRepository(db.get_connection)))

router = Router()
router.add("GET", "/", _controller.list_users)
router.add("POST", "/", _controller.create_user)


def handler(event: dict | None = None, context: object = None) -> dict:  # pylint: disable=unused-argument
    """Lambda handler."""
    return handle(event, SERVICE_NAME, router)
