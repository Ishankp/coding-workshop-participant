#!/usr/bin/env bash
# Shared helpers for the cloud-deployment scripts. Not run directly; sourced by the others.
#
# Provides: load_credentials, website_bucket, distribution_id, function_name,
#           set_function_url_auth, set_distribution_enabled, invalidate_cache, lambda_services

CLOUD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" > /dev/null 2>&1 || exit 1; pwd -P)"
PROJECT_ROOT="$(cd "$CLOUD_DIR/.." > /dev/null 2>&1 || exit 1; pwd -P)"
BIN_DIR="$PROJECT_ROOT/bin"
export PATH="$HOME/.local/bin:$PATH"

for tool in aws jq; do
    command -v "$tool" > /dev/null 2>&1 || { echo "ERROR: '$tool' is missing. Aborting..."; exit 1; }
done

# Load the temporary workshop credentials, refreshing them if they expired.
load_credentials() {
    if [ -z "$AWS_REGION" ] || [ -z "$PARTICIPANT_ID" ]; then
        echo "ERROR: AWS_REGION / PARTICIPANT_ID are not set. Run: source ~/.bashrc"
        exit 1
    fi
    if [ -f "$PROJECT_ROOT/ENVIRONMENT.config" ]; then
        # shellcheck disable=SC1091
        source "$PROJECT_ROOT/ENVIRONMENT.config"
    fi
    if ! aws sts get-caller-identity > /dev/null 2>&1; then
        echo "INFO: AWS credentials missing or expired; refreshing..."
        "$BIN_DIR/setup-participant.sh" > /dev/null
        # shellcheck disable=SC1091
        source "$PROJECT_ROOT/ENVIRONMENT.config"
    fi
    PROJECT="${TF_VAR_aws_project:-coding-workshop}"
    export PROJECT
}

# Backend services = every backend/<name>/ folder with a requirements.txt (same rule as Terraform).
lambda_services() {
    for req in "$PROJECT_ROOT"/backend/*/requirements.txt; do
        name="$(basename "$(dirname "$req")")"
        case "$name" in _*|.*) continue ;; esac
        echo "$name"
    done
}

function_name() { echo "$PROJECT-$1-$PARTICIPANT_ID"; }
website_bucket() { echo "$PROJECT-website-$PARTICIPANT_ID"; }

# The CloudFront distribution whose S3 origin is our website bucket.
distribution_id() {
    aws cloudfront list-distributions --output json \
        | jq -r --arg b "$(website_bucket)" \
            '.DistributionList.Items[]? | select(.Origins.Items[]?.DomainName | contains($b)) | .Id' \
        | head -1
}

# NONE = public (normal), AWS_IAM = only signed requests, so browsers and CloudFront get 403.
set_function_url_auth() {   # <service> <NONE|AWS_IAM>
    local fn; fn="$(function_name "$1")"
    aws lambda update-function-url-config --function-name "$fn" --auth-type "$2" --output json > /dev/null
    echo "  $fn: function URL auth = $2"
}

function_url_auth() {       # <service> -> prints NONE or AWS_IAM
    aws lambda get-function-url-config --function-name "$(function_name "$1")" \
        --query AuthType --output text 2>/dev/null || echo "missing"
}

# Turn the whole distribution on or off. Changes take a few minutes to propagate.
set_distribution_enabled() {   # <true|false>
    local id etag cfg
    id="$(distribution_id)"
    [ -n "$id" ] || { echo "ERROR: no CloudFront distribution found for $(website_bucket)"; exit 1; }
    cfg="$(aws cloudfront get-distribution-config --id "$id" --output json)"
    etag="$(echo "$cfg" | jq -r .ETag)"
    if [ "$(echo "$cfg" | jq -r .DistributionConfig.Enabled)" = "$1" ]; then
        echo "  CloudFront $id already has Enabled=$1"
        return
    fi
    echo "$cfg" | jq --argjson v "$1" '.DistributionConfig | .Enabled = $v' > /tmp/cf-config-$$.json
    aws cloudfront update-distribution --id "$id" --if-match "$etag" \
        --distribution-config "file:///tmp/cf-config-$$.json" --output json > /dev/null
    rm -f /tmp/cf-config-$$.json
    echo "  CloudFront $id: Enabled=$1 (propagating, allow a few minutes)"
}

invalidate_cache() {
    local id; id="$(distribution_id)"
    [ -n "$id" ] && aws cloudfront create-invalidation --distribution-id "$id" --paths "/*" --output json > /dev/null
    echo "  CloudFront cache invalidated"
}

website_url() {
    local id; id="$(distribution_id)"
    [ -n "$id" ] && echo "https://$(aws cloudfront get-distribution --id "$id" --query Distribution.DomainName --output text)"
}
