#!/usr/bin/env bash
# Switch off ONE backend service (or all of them) by locking its Function URL.
# Requests to that service return 403 from CloudFront and from the direct URL;
# the rest of the site keeps working. Reverse with ./relaunch.sh service <name>.
#
#   auth        nobody can log in (existing sessions keep working up to 1 hour)
#   users       account management (admin Accounts page) unavailable
#   projects    project list/detail, team, budget, project/milestone creation
#   milestones  milestone detail, dependencies, complete/archive
#   employees   People page, profiles, time logs
#   dbsetup     not used by the site; locking it is harmless
#
# Usage: ./cloud-deployment/disable-service.sh <service|all>
set -e
source "$(dirname "$0")/_common.sh"
usage() { echo "Usage: $0 <service|all>"; echo "Services: $(lambda_services | tr '\n' ' ')"; }
[ -z "$1" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ] && { usage; exit 0; }
load_credentials

if [ "$1" = "all" ]; then
    for svc in $(lambda_services); do set_function_url_auth "$svc" AWS_IAM; done
elif lambda_services | grep -qx "$1"; then
    set_function_url_auth "$1" AWS_IAM
else
    echo "ERROR: unknown service '$1'"; usage; exit 1
fi
echo "DONE: locked. Check with ./cloud-deployment/status.sh"
