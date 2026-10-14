"""
Auth service Lambda entry point (served at /api/auth).

Wires the layers together and registers the routes:
    POST /login   Exchange username + password for a session token
"""

import logging

from controller import AuthController
from repository import AuthRepository
from service import AuthService
from shared import db
from shared.http_utils import Router, handle

SERVICE_NAME = "auth"

logging.getLogger().setLevel(logging.INFO)

# Built once per container and reused across warm invocations
_controller = AuthController(AuthService(AuthRepository(db.get_connection)))

router = Router()
router.add("POST", "/login", _controller.login)


def handler(event: dict | None = None, context: object = None) -> dict:  # pylint: disable=unused-argument
    """Lambda handler."""
    return handle(event, SERVICE_NAME, router)
