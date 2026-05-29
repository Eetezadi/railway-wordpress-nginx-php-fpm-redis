---
phase: quick
plan: 4
subsystem: admin-dashboard
tags: [restore, s3, backup, mysql, frontend]
dependency_graph:
  requires: []
  provides: [backup-listing, db-restore, restore-ui]
  affects: [admin-dashboard/src/api/sites.js, admin-dashboard/frontend/src/pages/SiteDetail.jsx]
tech_stack:
  added: ["@aws-sdk/client-s3"]
  patterns: [S3 streaming with gunzip, multipleStatements MySQL, Hono REST endpoints]
key_files:
  created:
    - admin-dashboard/src/services/s3.js
  modified:
    - admin-dashboard/src/api/sites.js
    - admin-dashboard/src/config.js
    - admin-dashboard/src/services/database.js
    - admin-dashboard/frontend/src/lib/api.js
    - admin-dashboard/frontend/src/pages/SiteDetail.jsx
decisions:
  - Add backup/restore routes to existing sites.js (avoids Hono nested router param issues)
  - DB restore server-side via streaming S3 gunzip into MySQL; file restore via shell command
  - getSiteConnection extended with extraOptions to support multipleStatements
metrics:
  duration: ~15 minutes
  completed: 2026-03-17
---

# Quick Task 4: Add Restore from Backup Flow to Dashboard Summary

**One-liner:** S3-backed restore flow — streams .sql.gz from S3 bucket into site MySQL DB and returns aws s3 cp shell command for file restore via Shell Access card.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Add S3 service and restore API endpoints | acf1301 | Done |
| 2 | Add restore UI to SiteDetail page | f6359b6 | Done |

## What Was Built

### Backend (Task 1)

- Installed `@aws-sdk/client-s3` in admin-dashboard
- Added `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to required config vars; `AWS_REGION` (default `us-east-1`) and `S3_BACKUP_BUCKET` (default `collapsible-trough-ntbmfs`) as optional
- Created `src/services/s3.js` with `listBackupDates`, `listBackupFiles`, `getBackupStream`
- Added `GET /:id/backups` — lists available backup dates from S3 using delimiter-based folder listing
- Added `POST /:id/restore` — streams .sql.gz from S3 through zlib gunzip and executes SQL with `multipleStatements: true` against the site's MySQL DB; returns `filesCommand` with the `aws s3 cp` command for file restore
- Extended `getSiteConnection` to accept `extraOptions` (e.g. `{ multipleStatements: true }`)

### Frontend (Task 2)

- Added `listBackups` and `restoreSite` to `api` object in `api.js`
- Backup dates loaded automatically when site transitions to `active`
- "Restore from Backup" card on SiteDetail (active sites only): backup date picker (newest first), "Restore Database" button, loading/error/success states
- On success: shows confirmation message and the shell command for file restore in a styled code block

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Enhancement] Extended getSiteConnection to support extraOptions**
- **Found during:** Task 1 implementation
- **Issue:** `getSiteConnection` had no way to pass `multipleStatements: true` needed for batch SQL execution
- **Fix:** Added `extraOptions = {}` parameter merged into connection config
- **Files modified:** `admin-dashboard/src/services/database.js`
- **Commit:** acf1301

## Self-Check: PASSED

- admin-dashboard/src/services/s3.js: FOUND
- Commit acf1301: FOUND
- Commit f6359b6: FOUND
