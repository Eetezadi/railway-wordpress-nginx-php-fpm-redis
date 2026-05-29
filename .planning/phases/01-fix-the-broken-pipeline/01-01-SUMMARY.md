---
phase: 01-fix-the-broken-pipeline
plan: 01
subsystem: infra
tags: [railway, nginx, php-fpm, healthcheck, wordpress]

requires: []
provides:
  - Status poller checks ACTIVE (not SUCCESS) to transition sites to active
  - Railway services created with healthcheckPath '/health'
  - Nginx /health location proxies to PHP-FPM via fastcgi (not static 200)
  - health.php written on every container boot before permissions are fixed
affects: [02-nginx-verification]

tech-stack:
  added: []
  patterns:
    - "Health check: PHP-FPM-backed /health endpoint via Nginx fastcgi_pass"
    - "Entrypoint: write dynamic files after volume init, before permission fix"

key-files:
  created: []
  modified:
    - admin-dashboard/src/api/sites.js
    - admin-dashboard/src/services/railway.js
    - default.conf.template
    - docker-entrypoint.sh

key-decisions:
  - "Use exact match `location = /health` to prevent prefix ambiguity with WordPress routing"
  - "Write health.php from entrypoint (not Dockerfile COPY) so volume mounts cannot shadow it"
  - "healthcheckPath set in serviceInstanceUpdate alongside rootDirectory — single call, not a second mutation"

patterns-established:
  - "Poller pattern: check Railway deployment status ACTIVE (not SUCCESS) to mark site active"
  - "Healthcheck pattern: Railway healthcheckPath + Nginx fastcgi_pass + entrypoint-written PHP = verified PHP-FPM liveness"

requirements-completed: [PIPE-01, PIPE-02, NGNX-01]

duration: 10min
completed: 2026-03-12
---

# Phase 1 Plan 01: Fix Pipeline Bugs Summary

**Four targeted fixes: ACTIVE status check, healthcheckPath on service create, PHP-FPM-backed /health endpoint, and entrypoint-written health.php**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-12T00:00:00Z
- **Completed:** 2026-03-12
- **Tasks:** 1 of 2 (Task 2 awaiting human verification in production)
- **Files modified:** 4

## Accomplishments
- Status poller now checks `ACTIVE` (not `SUCCESS`) — fixes the core bug keeping sites stuck in provisioning
- Railway service creation now sets `healthcheckPath: '/health'` so Railway uses the health endpoint as its readiness signal
- Nginx `/health` location upgraded from static `return 200` to `fastcgi_pass` to PHP-FPM — proves the application stack is alive, not just Nginx
- `docker-entrypoint.sh` writes `health.php` on every container start after WordPress volume init, ensuring the file survives volume mounts

## Task Commits

Each task was committed atomically:

1. **Task 1: Apply the four pipeline fixes** - `72b077c` (fix)

## Files Created/Modified
- `admin-dashboard/src/api/sites.js` - Changed SUCCESS to ACTIVE, added status-poller console.log entries
- `admin-dashboard/src/services/railway.js` - Added healthcheckPath '/health' to serviceInstanceUpdate input
- `default.conf.template` - Replaced static /health block with PHP-FPM fastcgi proxy using exact match
- `docker-entrypoint.sh` - Added step 5.5 to write health.php before permission chown

## Decisions Made
- Used `location = /health` (exact match) instead of `location /health` (prefix match) to avoid WordPress routing intercepting the request
- health.php is written from entrypoint rather than Dockerfile COPY because a volume mount at `/var/www/html` would shadow any file baked into the image
- healthcheckPath added to the existing `serviceInstanceUpdate` call rather than a separate mutation to keep Railway API calls minimal

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Task 2 (production verification) awaiting human: deploy to Railway, create test site, confirm provisioning → active transition
- Once verified, Phase 2 (Nginx verification) can proceed — it depends on the Railway-assigned domain being resolvable at ACTIVE time

---
*Phase: 01-fix-the-broken-pipeline*
*Completed: 2026-03-12*
