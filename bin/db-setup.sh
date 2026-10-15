#!/usr/bin/env bash
# Script: Database Setup (schema + seed)
# Purpose: Invoke the dbsetup Lambda, which runs backend/db/*.sql against the
#          database it is connected to (Aurora in AWS, host PostgreSQL locally).
# Usage: ./db-setup.sh [aws|local] [status|reset]
# Default: aws status
#
# The Lambda is used because Aurora is only reachable from inside the VPC.
# "reset" DELETES ALL DATA and reloads schema.sql + seed.sql.

set -e

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [aws|local] [status|reset]"
    echo "  status   Show which tables exist and their row counts (default)"
    echo "  reset    Drop everything, recreate the schema and load the seed data"
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
PROJECT_ROOT="$(cd $SCRIPT_DIR/.. > /dev/null 2>&1 || exit 1; pwd -P)"
ENVIRONMENT=${1:-"aws"}
ACTION=${2:-"status"}

export PATH="$HOME/.local/bin:$PATH"
export AWS_REGION=${AWS_REGION:-us-east-1}
aws --version > /dev/null 2>&1 || { echo "ERROR: 'aws' is missing. Aborting..."; exit 1; }

if [ "$ENVIRONMENT" = "aws" ]; then
    if [ -f "$PROJECT_ROOT/ENVIRONMENT.config" ]; then
        source "$PROJECT_ROOT/ENVIRONMENT.config"
    else
        echo "ERROR: ENVIRONMENT.config is missing; run ./bin/deploy-backend.sh first"
        exit 1
    fi
else
    export AWS_ENDPOINT_URL="http://localhost.localstack.cloud:4566"
    export AWS_ACCESS_KEY_ID=test
    export AWS_SECRET_ACCESS_KEY=test
    export AWS_REGION=us-east-1
    unset AWS_SESSION_TOKEN
fi

FUNCTION_NAME="${TF_VAR_aws_project:-coding-workshop}-dbsetup-${PARTICIPANT_ID:-abcd1234}"

case "$ACTION" in
    status) PAYLOAD='{"action":"status"}' ;;
    reset)
        echo "WARNING: this deletes every row in the $ENVIRONMENT database and reloads the seed data."
        read -r -p "Type 'reset' to continue: " ANSWER
        [ "$ANSWER" = "reset" ] || { echo "Aborted."; exit 1; }
        PAYLOAD='{"action":"reset","confirm":true}'
        ;;
    *) echo "ERROR: unknown action '$ACTION' (expected status or reset)"; exit 1 ;;
esac

OUT=$(mktemp)
echo "INFO: Invoking $FUNCTION_NAME with $PAYLOAD ..."
aws lambda invoke --function-name "$FUNCTION_NAME" \
    --cli-binary-format raw-in-base64-out --payload "$PAYLOAD" "$OUT" > /dev/null
if command -v jq > /dev/null 2>&1; then jq . "$OUT"; else cat "$OUT"; echo; fi
OK=$(grep -o '"ok": *true' "$OUT" || true)
rm -f "$OUT"
[ -n "$OK" ] || { echo "ERROR: database setup failed (see output above)"; exit 1; }
