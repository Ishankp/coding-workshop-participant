#!/usr/bin/env bash
# Show which parts of the cloud deployment are currently on or off. Read-only.
# Usage: ./cloud-deployment/status.sh
set -e
source "$(dirname "$0")/_common.sh"
[ "$1" = "-h" ] || [ "$1" = "--help" ] && { echo "Usage: $0"; echo "Report CloudFront, website and per-service state (changes nothing)"; exit 0; }
load_credentials

ID="$(distribution_id)"
echo "Site URL:    $(website_url)"
if [ -n "$ID" ]; then
    aws cloudfront get-distribution --id "$ID" --output json \
        | jq -r '"CloudFront:  \(.Distribution.Id)  enabled=\(.Distribution.DistributionConfig.Enabled)  status=\(.Distribution.Status)"'
else
    echo "CloudFront:  not found"
fi

if aws s3 cp "s3://$(website_bucket)/index.html" - 2>/dev/null | grep -q "maintenance-page"; then
    echo "Website:     MAINTENANCE PAGE (app files replaced)"
elif aws s3 ls "s3://$(website_bucket)/index.html" > /dev/null 2>&1; then
    echo "Website:     app deployed"
else
    echo "Website:     no index.html in $(website_bucket)"
fi

echo "Services:"
for svc in $(lambda_services); do
    auth="$(function_url_auth "$svc")"
    case "$auth" in
        NONE)    state="ON  (public)" ;;
        AWS_IAM) state="OFF (locked, returns 403)" ;;
        *)       state="NOT DEPLOYED" ;;
    esac
    printf '  %-12s %s\n' "$svc" "$state"
done

echo "Database:"
"$BIN_DIR/db-setup.sh" aws status 2>/dev/null | jq -r '"  ready=\(.ready)  users=\(.tables.users)  projects=\(.tables.projects)  time_entries=\(.tables.time_entries)"' \
    || echo "  dbsetup Lambda not reachable"
