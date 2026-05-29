---
status: awaiting_human_verify
trigger: "backup-sql-not-found - Every app has a local_backups/backup.tgz but the restore UI shows 'No SQL dump found in backup' when trying to restore a database."
created: 2026-03-17T00:00:00Z
updated: 2026-03-17T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - The restore code (sites.js lines 252-253) searches for files named *-db-*.sql.gz and *-files-*.tar.gz as separate S3 objects, but the actual backups are a single combined archive named backup.tgz. No file in S3 matches the -db- pattern so sqlFile is always undefined.
test: Confirmed by reading: listBackupFiles returns keys like {source}/{date}/backup.tgz; the find() for '-db-' never matches
expecting: Fix: detect backup.tgz as a combined archive and extract SQL from inside it using tar parsing
next_action: Implement fix in sites.js restore route

## Symptoms

expected: The restore feature should find the SQL dump inside backup.tgz and restore it to the site's database
actual: UI shows "No SQL dump found in backup" error message
errors: "No SQL dump found in backup" displayed in the restore modal
reproduction: Go to any app's restore from backup UI, select a backup source and date, click "Restore Database"
started: Never worked - new feature (quick task 4, completed 2026-03-17)

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-17
  checked: admin-dashboard/src/api/sites.js lines 251-257
  found: "const sqlFile = files.find((f) => f.key.includes('-db-') && f.key.endsWith('.sql.gz'));" — requires filename containing '-db-' and ending in '.sql.gz'
  implication: This pattern matches a Cloudways-style split backup (separate files per type), not the actual backup format

- timestamp: 2026-03-17
  checked: Symptom description "every app has a local_backups/backup.tgz"
  found: Actual S3 structure is {source}/{date}/backup.tgz — a single combined archive
  implication: listBackupFiles() returns [{key: "source/date/backup.tgz", ...}]; no key contains '-db-' so sqlFile is always undefined, causing "No SQL dump found in backup" 404

- timestamp: 2026-03-17
  checked: admin-dashboard/src/services/s3.js
  found: listBackupFiles lists all S3 objects under {siteSlug}/{date}/ prefix — will correctly return backup.tgz as a file entry
  implication: S3 listing is fine; the problem is purely in the filename matching logic in sites.js

## Resolution

root_cause: The restore route in sites.js searched for files matching the pattern f.key.includes('-db-') && f.key.endsWith('.sql.gz') as separate S3 objects. Actual backups are a single combined archive named backup.tgz uploaded to S3. No key ever matches '-db-', so sqlFile is always undefined, causing the "No SQL dump found in backup" 404 immediately.

fix: Added a combinedTgz fallback that detects backup.tgz (or backup.tar.gz). When no split-format sqlFile is found, streams backup.tgz through gunzip+TarParser to locate and extract the .sql (or .sql.gz) entry inside the archive, then executes it against MySQL. For the files restore command, uses backup.tgz as the source (presigned URL + curl | tar xzf). Installed tar npm package for stream-based tar parsing. Backwards-compatible: split format still works if present.

verification: Module loads cleanly (PASS). Awaiting user confirmation with real backup.tgz.

files_changed:
  - admin-dashboard/src/api/sites.js (restore route logic + TarParser import)
  - admin-dashboard/package.json (tar dependency added)
  - admin-dashboard/package-lock.json
