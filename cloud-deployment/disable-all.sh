#!/usr/bin/env bash
# Take the ENTIRE website offline while keeping all data and infrastructure.
#   - disables the CloudFront distribution (the public URL stops serving)
#   - locks every service's Function URL to IAM-only (direct URLs return 403)
# Nothing is deleted. Reverse with ./launch-all.sh (or ./relaunch.sh all).
# Usage: ./cloud-deployment/disable-all.sh [-y]
set -e
source "$(dirname "$0")/_common.sh"
[ "$1" = "-h" ] || [ "$1" = "--help" ] && { echo "Usage: $0 [-y]"; echo "Disable CloudFront and lock all service URLs (-y skips the prompt)"; exit 0; }
load_credentials

if [ "$1" != "-y" ]; then
    read -r -p "Take the whole site offline (data is kept)? Type 'offline' to continue: " ANSWER
    [ "$ANSWER" = "offline" ] || { echo "Aborted."; exit 1; }
fi

echo "INFO: Locking service URLs..."
for svc in $(lambda_services); do set_function_url_auth "$svc" AWS_IAM; done
echo "INFO: Disabling CloudFront..."
set_distribution_enabled false
echo "DONE: site is going offline. Check with ./cloud-deployment/status.sh"
