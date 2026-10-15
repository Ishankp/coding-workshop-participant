#!/usr/bin/env bash
# Run every backend service's unit tests with coverage and print one combined
# report for first-party code (the shared/ copies are merged back into _shared).
# Fails if combined line coverage is under 80%.
# Usage: ./bin/test-backend.sh            (needs: pip install pytest pytest-cov)

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
ROOT="$(cd "$SCRIPT_DIR/.." > /dev/null 2>&1 || exit 1; pwd -P)"
BACKEND="$ROOT/backend"
COV_DIR="$ROOT/.coverage-backend"
MIN_PERCENT="${MIN_PERCENT:-80}"

"$SCRIPT_DIR/sync-shared.sh" > /dev/null
rm -rf "$COV_DIR" && mkdir -p "$COV_DIR"

cat > "$COV_DIR/.coveragerc" <<RC
[paths]
shared =
    $BACKEND/_shared
    $BACKEND/*/shared
RC

failed=0
for svc in auth users projects milestones employees dbsetup; do
    echo "===== $svc"
    (
        cd "$BACKEND/$svc"
        COVERAGE_FILE="$COV_DIR/.coverage.$svc" python3 -m pytest tests -q -p no:cacheprovider \
            --cov=. --cov-report= --cov-config="$COV_DIR/.coveragerc"
    ) || failed=1
done
[ "$failed" = 0 ] || { echo "Some tests failed"; exit 1; }

echo
echo "===== Combined backend coverage (first-party code only)"
cd "$COV_DIR"
python3 -m coverage combine --rcfile=.coveragerc .coverage.* > /dev/null
python3 -m coverage report --rcfile=.coveragerc --fail-under="$MIN_PERCENT" \
    --omit='*/tests/*,*/psycopg*/*,*/bcrypt/*,*/jwt/*,*dist-info*,*/site-packages/*' \
    | sed "s#$BACKEND/##"
