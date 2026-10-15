"""
Database setup Lambda entry point.

This function is NOT an HTTP API. It is invoked directly with the AWS CLI
(see bin/db-setup.sh) so that the schema and seed can be applied to Aurora
from inside the VPC, where the database is reachable. Requests that arrive
through its Function URL (or CloudFront /api/dbsetup) are refused.

Payloads:
    {"action": "status"}                   tables present and row counts
    {"action": "reset", "confirm": true}   reset.sql + schema.sql + seed.sql (deletes all data)
"""

import logging
import os

from repository import SqlRepository
from service import DbSetupService
from shared import db
from shared.errors import AppError

logging.getLogger().setLevel(logging.INFO)

SQL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sql")

_service = DbSetupService(SqlRepository(db.get_connection), SQL_DIR)


def _is_http_event(event: dict) -> bool:
    return "requestContext" in event or "rawPath" in event


def handler(event: dict | None = None, context: object = None) -> dict:  # pylint: disable=unused-argument
    """Lambda handler for direct (CLI) invocations only."""
    event = event or {}
    if _is_http_event(event):
        return {"statusCode": 404, "headers": {"Content-Type": "application/json"},
                "body": '{"error":{"code":"not_found","message":"Not found"}}'}
    try:
        return {"ok": True, **_service.run(event)}
    except AppError as err:
        return {"ok": False, "error": {"code": err.code, "message": err.message}}
    except Exception as err:  # pylint: disable=broad-except
        logging.exception("db setup failed")
        db.reset_connection()
        return {"ok": False, "error": {"code": "db_error", "message": str(err)}}
