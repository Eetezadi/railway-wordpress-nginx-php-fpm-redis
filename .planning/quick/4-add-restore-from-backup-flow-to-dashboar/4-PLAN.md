---
phase: quick
plan: 4
type: execute
wave: 1
depends_on: []
files_modified:
  - admin-dashboard/src/api/restore.js
  - admin-dashboard/src/services/s3.js
  - admin-dashboard/src/index.js
  - admin-dashboard/frontend/src/lib/api.js
  - admin-dashboard/frontend/src/pages/SiteDetail.jsx
  - admin-dashboard/package.json
  - admin-dashboard/src/config.js
autonomous: true
requirements: []

must_haves:
  truths:
    - "User can click Restore from Backup on an active site and select a backup date from S3"
    - "Restore pulls files tarball from S3 and extracts into the WP container volume"
    - "Restore imports the SQL dump into the site's Railway MySQL database"
    - "User sees restore progress/status and success/error feedback"
  artifacts:
    - path: "admin-dashboard/src/services/s3.js"
      provides: "S3 listing and download using AWS SDK"
    - path: "admin-dashboard/src/api/restore.js"
      provides: "REST endpoints for listing backups and triggering restore"
    - path: "admin-dashboard/frontend/src/pages/SiteDetail.jsx"
      provides: "Restore UI card with backup picker and status"
  key_links:
    - from: "admin-dashboard/src/api/restore.js"
      to: "admin-dashboard/src/services/s3.js"
      via: "listBackups, downloadBackup calls"
    - from: "admin-dashboard/src/api/restore.js"
      to: "admin-dashboard/src/services/database.js"
      via: "getSiteConnection for SQL import"
    - from: "admin-dashboard/frontend/src/pages/SiteDetail.jsx"
      to: "/api/sites/:id/restore"
      via: "fetch calls for backup list and restore trigger"
---

<objective>
Add a "Restore from Backup" flow to the admin dashboard that lets a user pick a backup date from S3 (`s3://collapsible-trough-ntbmfs/{site-slug}/{date}/`) and restore both files and database into the site's Railway WordPress container.

Purpose: Enable migration of existing Cloudways WordPress sites to Railway by restoring from S3 backups.
Output: Backend API endpoints for listing/restoring backups, S3 service module, frontend restore UI card on SiteDetail page.
</objective>

<execution_context>
@/home/nc773/.claude/get-shit-done/workflows/execute-plan.md
@/home/nc773/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@admin-dashboard/src/api/sites.js
@admin-dashboard/src/services/railway.js
@admin-dashboard/src/services/database.js
@admin-dashboard/src/config.js
@admin-dashboard/frontend/src/pages/SiteDetail.jsx
@admin-dashboard/frontend/src/lib/api.js
@admin-dashboard/src/index.js

<interfaces>
<!-- Existing interfaces the executor needs -->

From admin-dashboard/src/services/database.js:
```javascript
export function getDashboardPool()                    // -> mysql2 Pool (dashboard DB)
export async function getSiteConnection(dbName)       // -> mysql2 Connection (site's WP DB)
export async function createDatabase(dbName)          // creates DB if not exists
```

From admin-dashboard/src/services/siteRegistry.js:
```javascript
export async function getSite(id)  // -> { id, name, slug, db_name, redis_prefix, railway_service_id, railway_domain, status, ... }
```

From admin-dashboard/frontend/src/lib/api.js:
```javascript
// Pattern: add methods to the `api` object using apiFetch(path, options)
export const api = { listSites, getSite, getSiteStatus, ... }
```

From admin-dashboard/src/config.js:
```javascript
// Pattern: add to `required` array for mandatory vars, or set with fallback for optional
config.KEY = process.env.KEY || '';
```

From admin-dashboard/src/index.js:
```javascript
// Pattern: import Hono sub-app and mount with app.route()
import sites from './api/sites.js';
app.route('/api/sites', sites);
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add S3 service and restore API endpoints</name>
  <files>
    admin-dashboard/package.json,
    admin-dashboard/src/config.js,
    admin-dashboard/src/services/s3.js,
    admin-dashboard/src/api/restore.js,
    admin-dashboard/src/index.js
  </files>
  <action>
1. Install `@aws-sdk/client-s3` in admin-dashboard:
   `cd admin-dashboard && npm install @aws-sdk/client-s3`

2. Add S3 config vars to `src/config.js` (NOT required — optional with defaults since the bucket is known):
   - `AWS_ACCESS_KEY_ID` (add to required array)
   - `AWS_SECRET_ACCESS_KEY` (add to required array)
   - `AWS_REGION` (optional, default `us-east-1`)
   - `S3_BACKUP_BUCKET` (optional, default `collapsible-trough-ntbmfs`)

3. Create `src/services/s3.js` with:
   - `listBackupDates(siteSlug)` — uses ListObjectsV2Command with prefix `{siteSlug}/` and delimiter `/` to list available backup date folders. Returns array of date strings sorted descending.
   - `listBackupFiles(siteSlug, date)` — lists files in `{siteSlug}/{date}/` prefix. Returns array of `{ key, size, lastModified }`.
   - `getBackupStream(key)` — uses GetObjectCommand to return a readable stream for the given S3 key.

4. Create `src/api/restore.js` as a Hono sub-app with these endpoints:

   **GET /api/sites/:id/backups** — Lists available backup dates for the site.
   - Look up site by id via `getSite(id)`, return 404 if not found.
   - Call `listBackupDates(site.slug)` and return the date list.

   **POST /api/sites/:id/restore** — Triggers a restore from a specific backup date.
   - Accept `{ date }` in request body.
   - Look up site, validate it exists and has `railway_service_id`.
   - Call `listBackupFiles(site.slug, date)` to find the `*-files-*.tar.gz` and `*-db-*.sql.gz` files.
   - **DB restore:** Stream the `.sql.gz` from S3, pipe through `zlib.createGunzip()`, collect the SQL text, then execute it against the site's MySQL database using `getSiteConnection(site.db_name)`. Use `conn.query()` with `multipleStatements: true` on the connection options (modify the getSiteConnection call or create a new connection inline with `multipleStatements: true`). Before importing, run `SET FOREIGN_KEY_CHECKS=0;` and after, `SET FOREIGN_KEY_CHECKS=1;`.
   - **Files restore:** This is trickier since the files need to go INTO the Railway container's volume. The approach: use the existing shell/exec WebSocket capability to run commands inside the container. However, a simpler v1 approach: skip file restore for now and just do DB restore. Add a comment `// TODO: File restore via Railway exec API or S3 sync from within container` and return a response indicating DB was restored but files were not.
   - Actually, a better v1: The WP container can pull from S3 itself if we give it AWS creds. So for file restore, use the Railway `setServiceVariables` to inject `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BACKUP_BUCKET`, and `RESTORE_BACKUP_PATH` (= `{slug}/{date}/{files-tarball-name}`) as env vars, then trigger a redeploy. But this requires the container entrypoint to check for RESTORE_BACKUP_PATH. This is too complex for v1.
   - **Final decision for v1:** Do DB restore server-side (dashboard can reach MySQL directly). For files, return a message with the S3 path and a shell command the user can run via the Shell Access card: `aws s3 cp s3://bucket/slug/date/files.tar.gz - | tar xzf - -C /var/www/html/wp-content/`. Include this command in the response.
   - Return `{ success: true, dbRestored: true, filesCommand: "..." }`.

5. Mount in `src/index.js`: `import restore from './api/restore.js'; app.route('/api/sites', restore);`
   Wait — the restore routes are nested under `/api/sites/:id/backups` and `/api/sites/:id/restore`. To avoid conflicts with the existing sites router, either:
   (a) Add the routes directly to `src/api/sites.js`, OR
   (b) Create `src/api/restore.js` but mount the Hono sub-app so `:id` is accessible.

   Best approach: Add the backup/restore routes directly to `src/api/sites.js` since they're site-scoped. Import the s3 functions at the top of sites.js. This avoids Hono path parameter issues with nested routers.

   So actually: DO NOT create `src/api/restore.js`. Instead add the two routes to `src/api/sites.js`:
   - `app.get('/:id/backups', ...)`
   - `app.post('/:id/restore', ...)`

   Update files list accordingly — modify `src/api/sites.js` instead of creating `src/api/restore.js`.
  </action>
  <verify>
    <automated>cd /home/nc773/Documents/railway-wordpress-nginx-php-fpm-redis/admin-dashboard && node -e "import('./src/services/s3.js').then(m => console.log('S3 module OK:', Object.keys(m)))" 2>&1 | head -5</automated>
  </verify>
  <done>S3 service module exports listBackupDates, listBackupFiles, getBackupStream. Sites API has GET /:id/backups and POST /:id/restore endpoints. AWS SDK installed.</done>
</task>

<task type="auto">
  <name>Task 2: Add restore UI to SiteDetail page</name>
  <files>
    admin-dashboard/frontend/src/lib/api.js,
    admin-dashboard/frontend/src/pages/SiteDetail.jsx
  </files>
  <action>
1. Add to `api` object in `frontend/src/lib/api.js`:
   - `listBackups: (siteId) => apiFetch(\`/sites/${siteId}/backups\`)`
   - `restoreSite: (siteId, date) => apiFetch(\`/sites/${siteId}/restore\`, { method: 'POST', body: JSON.stringify({ date }) })`

2. In `SiteDetail.jsx`, add a "Restore from Backup" card that appears when `site.status === 'active'`. Place it after the Password Reset card. Implementation:

   - Add state: `backups` (array), `backupsLoading` (bool), `selectedBackup` (string), `restoring` (bool), `restoreResult` (object|null).

   - Add a `loadBackups` function that calls `api.listBackups(id)` and sets the backups state. Call it alongside the users fetch when site is active (inside `loadSite` where users are fetched).

   - Card UI structure (follow existing card pattern with card-header, card-icon):
     - Card icon: a clock/restore icon character (use "↺")
     - Card header: "Restore from Backup"
     - If `backupsLoading`: show spinner
     - If `backups.length === 0`: show "No backups found" muted text
     - If backups exist: show a `<select>` dropdown with backup dates as options
     - "Restore Database" button (btn btn-danger) — disabled while `restoring` or no backup selected
     - When clicked, call `api.restoreSite(id, selectedBackup)`
     - On success, show the result: "Database restored successfully" in a success alert
     - If `restoreResult.filesCommand` exists, show a code block with the command and a note: "Run this command in the Shell Access card below to restore files:"
     - On error, show error alert

   - Style: use existing CSS classes (card, card-header, card-icon, btn, btn-danger, input, alert, alert-success, alert-error, form-group, muted). No new CSS needed.
  </action>
  <verify>
    <automated>cd /home/nc773/Documents/railway-wordpress-nginx-php-fpm-redis/admin-dashboard && npm run build:frontend 2>&1 | tail -5</automated>
  </verify>
  <done>SiteDetail page shows Restore from Backup card for active sites. User can select a backup date, trigger DB restore, and see the shell command for file restore. Frontend builds without errors.</done>
</task>

</tasks>

<verification>
- `cd admin-dashboard && node -e "import('./src/services/s3.js')"` loads without error
- `cd admin-dashboard && npm run build:frontend` succeeds
- Backend starts without crash (assuming AWS env vars are set)
</verification>

<success_criteria>
- Active sites show a "Restore from Backup" card with backup date picker
- Selecting a date and clicking Restore triggers POST to /api/sites/:id/restore
- DB restore streams .sql.gz from S3, gunzips, and executes against site's MySQL DB
- Response includes shell command for manual file restore via Shell Access card
- Frontend builds cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/4-add-restore-from-backup-flow-to-dashboar/4-SUMMARY.md`
</output>
