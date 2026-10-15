"""
Projects service Lambda entry point (served at /api/projects).

Wires the layers together and registers the routes:
    GET /                          Projects the logged-in user is assigned to
    GET /{project_id}              One project's details (members only)
    GET /{project_id}/members      The project's members and their milestones (members only)
    GET /{project_id}/milestones   The project's milestones, schedule progress and assignees (members only)
    GET /{project_id}/budget       Budget vs cost so far and projected cost (managers and admins only)

    Creating (managers and admins; milestones need project membership for managers):
    POST   /                                                           Create a project
    PUT    /{project_id}                                               Edit its title, dates and budget
    POST   /{project_id}/milestones                                    Add a milestone to it
    POST   /{project_id}/archive, /{project_id}/unarchive              Hide from employees and progress / restore

    Team management (managers who are members, and admins):
    GET    /{project_id}/team                                          Members, their milestones, and who can be added
    POST   /{project_id}/members                                       Add someone to the project
    DELETE /{project_id}/members/{employee_id}                         Remove them (refused while they have hours logged)
    POST   /{project_id}/milestones/{milestone_id}/assignees           Assign someone to a milestone (adds to project if needed)
    DELETE /{project_id}/milestones/{milestone_id}/assignees/{employee_id}   Unassign (refused while they have hours logged)
"""

import logging

from authoring_controller import AuthoringController
from authoring_service import AuthoringService
from controller import ProjectController
from repository import ProjectRepository
from service import ProjectService
from shared import db
from shared.http_utils import Router, handle
from team_controller import TeamController
from team_service import TeamService

SERVICE_NAME = "projects"

logging.getLogger().setLevel(logging.INFO)

# Built once per container and reused across warm invocations
_repository = ProjectRepository(db.get_connection)
_controller = ProjectController(ProjectService(_repository))
_team = TeamController(TeamService(_repository))
_authoring = AuthoringController(AuthoringService(_repository))

router = Router()
router.add("GET", "/", _controller.list_projects)
router.add("POST", "/", _authoring.create_project)
router.add("PUT", "/{project_id}", _authoring.update_project)
router.add("POST", "/{project_id}/milestones", _authoring.create_milestone)
router.add("POST", "/{project_id}/archive", _authoring.archive_project)
router.add("POST", "/{project_id}/unarchive", _authoring.unarchive_project)
router.add("GET", "/{project_id}", _controller.get_project)
router.add("GET", "/{project_id}/members", _controller.get_project_members)
router.add("GET", "/{project_id}/milestones", _controller.get_project_milestones)
router.add("GET", "/{project_id}/budget", _controller.get_project_budget)
router.add("GET", "/{project_id}/team", _team.get_team)
router.add("POST", "/{project_id}/members", _team.add_member)
router.add("DELETE", "/{project_id}/members/{employee_id}", _team.remove_member)
router.add("POST", "/{project_id}/milestones/{milestone_id}/assignees", _team.assign_milestone)
router.add("DELETE", "/{project_id}/milestones/{milestone_id}/assignees/{employee_id}", _team.unassign_milestone)


def handler(event: dict | None = None, context: object = None) -> dict:  # pylint: disable=unused-argument
    """Lambda handler."""
    return handle(event, SERVICE_NAME, router)
