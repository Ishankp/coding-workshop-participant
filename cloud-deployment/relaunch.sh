#!/usr/bin/env bash
# Bring a part of the site back without a full Terraform run.
#
#   relaunch.sh website            rebuild the app and upload it (undoes disable-website.sh)
#   relaunch.sh service <name|all> unlock a service's Function URL (undoes disable-service.sh)
#   relaunch.sh cloudfront         re-enable the CloudFront distribution
#   relaunch.sh all                cloudfront + every service + website (undoes disable-all.sh)
#
# Usage: ./cloud-deployment/relaunch.sh <website|service <name|all>|cloudfront|all>
set -e
source "$(dirname "$0")/_common.sh"
usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; }
[ -z "$1" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ] && { usage; exit 0; }
load_credentials

relaunch_services() {
    if [ "$1" = "all" ] || [ -z "$1" ]; then
        for svc in $(lambda_services); do set_function_url_auth "$svc" NONE; done
    elif lambda_services | grep -qx "$1"; then
        set_function_url_auth "$1" NONE
    else
        echo "ERROR: unknown service '$1'. Services: $(lambda_services | tr '\n' ' ')"; exit 1
    fi
}

relaunch_website() {
    echo "INFO: Rebuilding and uploading the web app..."
    "$BIN_DIR/deploy-frontend.sh" aws | grep -E "INFO|CloudFront URL|ERROR" || true
}

case "$1" in
    website)    relaunch_website ;;
    service)    relaunch_services "$2" ;;
    cloudfront) set_distribution_enabled true ;;
    all)        set_distribution_enabled true; relaunch_services all; relaunch_website ;;
    *)          echo "ERROR: unknown part '$1'"; usage; exit 1 ;;
esac
echo "DONE. Check with ./cloud-deployment/status.sh"
