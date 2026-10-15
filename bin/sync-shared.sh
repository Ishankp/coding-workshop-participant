#!/usr/bin/env bash
# Script: Sync Shared Backend Code
# Purpose: Copy backend/_shared into every Python service as shared/
# Usage: ./sync-shared.sh
#
# Each Lambda is packaged from its own folder only, so code shared between
# services is copied in rather than imported from a sibling folder.
# backend/_shared is the source of truth; the copies are gitignored.
# Re-run after editing anything in backend/_shared.

set -e

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0"
    echo "Copy backend/_shared into each Python service under backend/ as shared/"
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../backend" > /dev/null 2>&1 || exit 1; pwd -P)"
SHARED_DIR="$BACKEND_DIR/_shared"

shopt -s nullglob
for fn in "$BACKEND_DIR"/*/function.py; do
    svc_dir="$(dirname "$fn")"
    case "$(basename "$svc_dir")" in _*|.*) continue ;; esac
    rm -rf "$svc_dir/shared"
    mkdir -p "$svc_dir/shared"
    cp "$SHARED_DIR"/*.py "$svc_dir/shared/"
    echo "  Synced shared code into $(basename "$svc_dir")"
done

# The dbsetup Lambda applies backend/db/*.sql from inside the VPC, so it needs its own copy
if [ -d "$BACKEND_DIR/dbsetup" ]; then
    rm -rf "$BACKEND_DIR/dbsetup/sql"
    mkdir -p "$BACKEND_DIR/dbsetup/sql"
    cp "$BACKEND_DIR"/db/*.sql "$BACKEND_DIR/dbsetup/sql/"
    echo "  Synced backend/db SQL into dbsetup"
fi
