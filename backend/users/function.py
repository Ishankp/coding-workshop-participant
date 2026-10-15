"""
Users service Lambda entry point (served at /api/users). Admins only.

    GET  /                       Every account with its role, employee record, salary and manager
    POST /                       Create an account (admins get no employee record; managers and
                                 employees get title, salary and manager)
    PUT  /{user_id}              Edit email, name, role, title and salary (manager is fixed)
    POST /{user_id}/password     Set a new password
    POST /{user_id}/deactivate   Block logins and hide from pickers (history kept); /reactivate undoes it
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
router.add("PUT", "/{user_id}", _controller.update_user)
router.add("POST", "/{user_id}/password", _controller.set_password)
router.add("POST", "/{user_id}/deactivate", _controller.deactivate_user)
router.add("POST", "/{user_id}/reactivate", _controller.reactivate_user)


def handler(event: dict | None = None, context: object = None) -> dict:  # pylint: disable=unused-argument
    """Lambda handler."""
    return handle(event, SERVICE_NAME, router)
