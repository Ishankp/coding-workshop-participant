"""
Employees service Lambda entry point (served at /api/employees).

Wires the layers together and registers the routes:
    GET    /                                   Employees the logged-in user can see (everyone for admins)
    GET    /{employee_id}                      An employee's profile, with the projects (visible to the viewer)
                                               and milestones they're working on
    GET    /{employee_id}/time-entries         The employee's time log (self, their manager, admins)
    POST   /{employee_id}/time-entries         Log hours (self, their manager, admins)
    DELETE /{employee_id}/time-entries/{id}    Remove an entry (their manager, admins)
"""

import logging

from controller import EmployeeController
from repository import EmployeeRepository
from service import EmployeeService
from shared import db
from shared.http_utils import Router, handle
from time_entries_controller import TimeEntryController
from time_entries_repository import TimeEntryRepository
from time_entries_service import TimeEntryService

SERVICE_NAME = "employees"

logging.getLogger().setLevel(logging.INFO)

# Built once per container and reused across warm invocations
_employees = EmployeeRepository(db.get_connection)
_controller = EmployeeController(EmployeeService(_employees))
_time_entries = TimeEntryController(TimeEntryService(_employees, TimeEntryRepository(db.get_connection)))

router = Router()
router.add("GET", "/", _controller.list_employees)
router.add("GET", "/{employee_id}", _controller.get_employee)
router.add("GET", "/{employee_id}/time-entries", _time_entries.get_log)
router.add("POST", "/{employee_id}/time-entries", _time_entries.add_entry)
router.add("DELETE", "/{employee_id}/time-entries/{entry_id}", _time_entries.delete_entry)


def handler(event: dict | None = None, context: object = None) -> dict:  # pylint: disable=unused-argument
    """Lambda handler."""
    return handle(event, SERVICE_NAME, router)
