"""
Code shared by every backend service.

This folder is the single source of truth. bin/sync-shared.sh copies it into
each service as a `shared/` package before the service runs or is deployed,
because each Lambda is packaged from its own folder only.
"""
