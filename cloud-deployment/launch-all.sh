#!/usr/bin/env bash
# Full launch (or full relaunch) of the website in AWS:
#   1. ./bin/deploy-backend.sh   Terraform: Lambdas, Function URLs (public), CloudFront (enabled)
#   2. ./bin/db-setup.sh         loads schema + seed if the database is empty (or with --reset-db)
#   3. ./bin/deploy-frontend.sh  builds the app and uploads it
# Because Terraform re-applies the desired state, this also undoes disable-all.sh,
# disable-service.sh and disable-website.sh in one go.
#
# Usage: ./cloud-deployment/launch-all.sh [--reset-db]
#   --reset-db   DELETE all data and reload the seed even if the database is already set up
set -e
source "$(dirname "$0")/_common.sh"
[ "$1" = "-h" ] || [ "$1" = "--help" ] && { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }
load_credentials

echo "==== 1/3 Backend (Terraform) ===="
"$BIN_DIR/deploy-backend.sh" aws | grep -E "Apply complete|Error|rror:|website_url|No changes" || true

echo "==== 2/3 Database ===="
READY="$("$BIN_DIR/db-setup.sh" aws status | jq -r .ready 2>/dev/null || echo false)"
if [ "$1" = "--reset-db" ]; then
    echo reset | "$BIN_DIR/db-setup.sh" aws reset | jq -c '{ok, ready, users: .tables.users}'
elif [ "$READY" = "true" ]; then
    echo "  database already set up; keeping existing data (use --reset-db to reload the seed)"
else
    echo "  database empty; loading schema and seed data"
    echo reset | "$BIN_DIR/db-setup.sh" aws reset | jq -c '{ok, ready, users: .tables.users}'
fi

echo "==== 3/3 Frontend ===="
"$BIN_DIR/deploy-frontend.sh" aws | grep -E "INFO: Building|INFO: Uploading|INFO: Invalidating|CloudFront URL|ERROR" || true

echo
echo "DONE: site is live at $(website_url)"
echo "Check with ./cloud-deployment/status.sh"
