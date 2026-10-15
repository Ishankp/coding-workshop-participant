#!/usr/bin/env bash
# Replace the web app with a maintenance page. The API services stay up, so
# anything calling /api/... directly (curl, scripts) keeps working.
# Reverse with ./relaunch.sh website (rebuilds and re-uploads the app).
# Usage: ./cloud-deployment/disable-website.sh
set -e
source "$(dirname "$0")/_common.sh"
[ "$1" = "-h" ] || [ "$1" = "--help" ] && { echo "Usage: $0"; echo "Swap the app for maintenance.html (API stays up)"; exit 0; }
load_credentials

echo "INFO: Uploading maintenance page to s3://$(website_bucket)/index.html ..."
aws s3 cp "$CLOUD_DIR/maintenance.html" "s3://$(website_bucket)/index.html" \
    --content-type "text/html" --cache-control "no-cache" > /dev/null
invalidate_cache
echo "DONE: visitors now see the maintenance page at $(website_url)"
