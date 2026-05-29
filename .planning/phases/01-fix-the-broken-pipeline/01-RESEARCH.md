# Phase 1: Fix the Broken Pipeline - Research

**Researched:** 2026-03-12
**Domain:** Railway GraphQL API, Nginx/PHP-FPM health checks, Node.js/Hono status polling
**Confidence:** HIGH — all findings based on direct code inspection of the live codebase

## Summary

Phase 1 is a surgical three-change fix. The codebase already has all scaffolding in place: `deployService()` already calls `triggerDeploy()`, the Railway API wrapper is fully functional, and the Nginx config template already has a `/health` location block. The remaining work is: (1) change one string in the status poller from `SUCCESS` to `ACTIVE`, (2) add `healthcheckPath: '/health'` to the existing `serviceInstanceUpdate` call in `createService()`, and (3) upgrade the `/health` Nginx response from a bare `200 "healthy\n"` plain-text response to a PHP-FPM-backed JSON response to prove both Nginx and PHP-FPM are live.

The phase requires no new libraries, no new API calls, and no architectural changes. Three targeted edits plus a new `health.php` file.

**Primary recommendation:** Make the minimum code changes, verify end-to-end manually, ship.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Health check endpoint**
- Nginx + PHP-FPM check: a PHP script returns `{"status":"ok"}` — proves both Nginx and PHP-FPM are running
- Baked into Docker image at build time (e.g., /var/www/html/health.php) so it's always present and can't be overwritten
- healthcheckPath set during the existing `serviceInstanceUpdate` call in `createService()` — minimal code change
- Response body: JSON `{"status":"ok"}` (extensible later)

**Status mapping**
- Minimal fix: change `SUCCESS` → `ACTIVE` in the status poller (line 51 of sites.js)
- Keep FAILED/CRASHED → error. Everything else stays as 'provisioning'
- `no_deployments` stays as error — with triggerDeploy working, this means something went wrong
- Include raw Railway status in error_message for debugging (keep existing pattern)
- Full status handling (SLEEPING, REMOVING, all 10 statuses) deferred to future work (RELY-02)

**Verification approach**
- Manual verification: create a test site via dashboard, watch it transition to active, then delete
- Add step-level console logging to status poller transitions (create endpoint already has logging)
- Include a verification checklist in phase output documenting exact steps
- Railway accepting deploy with healthcheckPath is sufficient proof /health works — no separate curl needed

**Deploy trigger safety**
- No guard before triggerDeploy — pipeline order guarantees repo is connected
- triggerDeploy failure throws and aborts site creation (fail fast, clear error)
- No rollback on failure — orphan cleanup is Phase 2 (FAIL-01)
- No delay between serviceConnect and serviceInstanceRedeploy — Railway mutations are synchronous

### Claude's Discretion
- Exact health.php implementation details
- Log message formatting and verbosity
- Verification checklist wording

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PIPE-01 | User can create a site and it transitions from provisioning to active (verify triggerDeploy + .railway.com endpoint in production) | `deployService()` already calls `triggerDeploy()` at line 188 of railway.js. The `serviceInstanceRedeploy` mutation is the final step. API base URL is already `backboard.railway.com`. No code change needed here — PIPE-01 is verification only. |
| PIPE-02 | Status poller checks for Railway's `ACTIVE` status instead of `SUCCESS` | `sites.js:51` contains `if (railwayStatus === 'SUCCESS')` — change to `'ACTIVE'`. One-line fix. Error message should include raw `railwayStatus` value per existing pattern. |
| NGNX-01 | New services are created with `healthcheckPath: '/health'` so Railway verifies Nginx is responding before marking deploy as active | `railway.js:75-85` — the `serviceInstanceUpdate` call currently sets only `rootDirectory: '/'`. Add `healthcheckPath: '/health'` to the same `input` object. Nginx template already has `/health` location at line 61-65 of `default.conf.template`, but it returns plain text. Must be changed to proxy to `health.php` to satisfy the "proves PHP-FPM is running" requirement. |
</phase_requirements>

---

## Standard Stack

### Core — No New Dependencies

This phase uses only existing code. No packages to install.

| Component | Version | Current Location | Role |
|-----------|---------|-----------------|------|
| Hono | existing | `admin-dashboard/src/api/sites.js` | HTTP router, status endpoint |
| Railway GraphQL API | v2 | `admin-dashboard/src/services/railway.js` | Service management |
| Nginx | alpine pkg | `Dockerfile` + `nginx.conf` | Reverse proxy, serves `/health` |
| PHP-FPM | 8.3 | Base image `wordpress:6-php8.3-fpm-alpine` | Executes `health.php` |

## Architecture Patterns

### Current Project Structure (relevant files only)

```
/
├── Dockerfile                          # WordPress+Nginx+PHP-FPM image
├── nginx.conf                          # Nginx main config (loads conf.d/*.conf)
├── default.conf.template               # Server block template (envsubst at runtime)
├── docker-entrypoint.sh                # Generates nginx conf, starts both processes
├── wp-config-custom.php                # Injected into wp-config.php at runtime
└── admin-dashboard/
    └── src/
        ├── api/sites.js                # Hono routes — status poller is here
        └── services/railway.js         # All Railway GraphQL mutations
```

### Pattern 1: serviceInstanceUpdate with multiple fields

The `serviceInstanceUpdate` call at `railway.js:75-85` currently passes one field. The Railway API accepts multiple fields in a single call. Add `healthcheckPath` alongside `rootDirectory` in the same mutation — no second API call needed.

```javascript
// railway.js — existing call, add healthcheckPath to input
await gql(`
  mutation ($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
    serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
  }
`, {
  serviceId,
  environmentId,
  input: {
    rootDirectory: '/',
    healthcheckPath: '/health',
  },
});
```

### Pattern 2: Status poller fix — single string change

```javascript
// sites.js:51 — change 'SUCCESS' to 'ACTIVE'
if (railwayStatus === 'ACTIVE') {
  await updateSite(site.id, { status: 'active' });
  deployStatus = 'active';
  console.log(`[status-poller] site ${site.id} transitioned to active (Railway: ACTIVE)`);
} else if (railwayStatus === 'FAILED' || railwayStatus === 'CRASHED') {
  await updateSite(site.id, { status: 'error', error_message: `Deployment ${railwayStatus}` });
  deployStatus = 'error';
  console.log(`[status-poller] site ${site.id} error (Railway: ${railwayStatus})`);
} else if (railwayStatus === 'no_deployments') {
  await updateSite(site.id, { status: 'error', error_message: 'No deployments found — service may not have been triggered' });
  deployStatus = 'error';
}
```

### Pattern 3: health.php — minimal PHP-FPM proof

The file must live in the Docker image at a path that is NOT under `/var/www/html` (because that is a volume mount — files there get replaced at runtime). The entrypoint copies WordPress files into `/var/www/html` from the image. However, looking at the entrypoint more carefully: `docker-entrypoint.sh php-fpm -t` runs the upstream WP entrypoint which copies files to `/var/www/html` if it's empty. Once the volume is populated, the health.php placed there at build time will be overwritten or present depending on first-boot state.

**Critical finding:** `/var/www/html` is a mounted volume. Files COPYed there at build time are NOT guaranteed to survive. The upstream WordPress `docker-entrypoint.sh` copies WordPress files into the volume on first boot — `health.php` placed in the image at `/var/www/html/health.php` will be present after first boot only if the WP entrypoint places it or doesn't clobber it.

**Safe approach (two options):**

Option A — Copy health.php to a non-volume path and serve from there:
```nginx
location = /health {
    alias /usr/local/share/health.php;
    fastcgi_pass 127.0.0.1:9000;
    fastcgi_param SCRIPT_FILENAME /usr/local/share/health.php;
    include fastcgi_params;
    access_log off;
}
```
This requires Nginx's `alias` + fastcgi, which is slightly unusual but works.

Option B — Copy health.php to `/var/www/html/health.php` and add it to the entrypoint script so it's (re)written on every boot:
```bash
# In docker-entrypoint.sh, after WordPress initialization:
echo '<?php header("Content-Type: application/json"); echo json_encode(["status" => "ok"]);' > /var/www/html/health.php
```
This is simpler and guarantees the file exists after every container start regardless of volume state.

**Recommendation (Claude's discretion):** Option B. Writing health.php from the entrypoint is idiomatic for this project (the entrypoint already injects wp-config.php customizations). It avoids Nginx alias complexity and ensures the file is always present and correct.

```bash
# health.php content written by entrypoint
echo '<?php header("Content-Type: application/json"); echo json_encode(["status" => "ok"]); ?>' \
  > /var/www/html/health.php
```

The existing Nginx `/health` location block returns `200 "healthy\n"` as plain text (lines 61-65 of `default.conf.template`). This does NOT proxy through PHP-FPM — it's a pure Nginx static response. To prove PHP-FPM is alive, the location must be changed to use `fastcgi_pass`. Replace the existing location block:

```nginx
# default.conf.template — replace existing /health block
location = /health {
    access_log off;
    fastcgi_pass 127.0.0.1:9000;
    fastcgi_param SCRIPT_FILENAME $document_root/health.php;
    fastcgi_param QUERY_STRING "";
    include fastcgi_params;
}
```

### Anti-Patterns to Avoid

- **Placing health.php only in Dockerfile COPY to /var/www/html:** Volume mount overwrites image contents. The file won't survive after WordPress initializes the volume on first boot.
- **Creating a second `serviceInstanceUpdate` call:** The existing call at lines 75-85 already sets `rootDirectory`. Add `healthcheckPath` to the same `input` object — don't make two separate mutations.
- **Using `location /health` (prefix match) instead of `location = /health` (exact match):** The prefix match could intercept paths like `/health-check`. Use exact match `=`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PHP-FPM health proof | Custom socket check or TCP probe | `health.php` via fastcgi | Railway's healthcheck hits HTTP — PHP script is the natural integration |
| Status normalization | Large status mapping table | One-line `'ACTIVE'` check | Only `ACTIVE` → active is needed now; RELY-02 handles full mapping |

## Common Pitfalls

### Pitfall 1: health.php overwritten by volume mount

**What goes wrong:** `COPY health.php /var/www/html/health.php` in Dockerfile appears to work locally but in Railway the `/var/www/html` mount replaces image files. On first deploy, WordPress initialization writes its files into the volume. If health.php was not written after that step, `/health` returns 404, Railway healthcheck fails, deploy never goes active.

**Why it happens:** Docker volumes shadow image filesystem contents. Any file at the mount path in the image is inaccessible once the volume is mounted.

**How to avoid:** Write health.php from `docker-entrypoint.sh` after the WordPress initialization step (step 4 in the existing script). This runs every container start and is not affected by volume state.

**Warning signs:** `/health` returns 404 or 502 (PHP-FPM can't find the script). Railway deploy stays in BUILDING or DEPLOYING indefinitely.

### Pitfall 2: Railway healthcheck path vs Nginx location mismatch

**What goes wrong:** `healthcheckPath: '/health'` is set in Railway, but Nginx location is `/health` (prefix) or doesn't proxy to PHP-FPM. Railway's healthcheck gets a 200 from Nginx's static `return 200` without PHP-FPM ever being involved.

**Why it happens:** The existing `/health` location block already returns 200 without fastcgi. If only the Railway field is added without updating the Nginx template, the healthcheck "passes" but doesn't prove PHP-FPM works.

**How to avoid:** Update `default.conf.template` to use `fastcgi_pass` for `/health`. Verify content-type is `application/json` in response.

### Pitfall 3: Status poller still checking wrong value

**What goes wrong:** Deploy succeeds in Railway (status = `ACTIVE`) but dashboard never transitions the site from 'provisioning' to 'active' because the poller checks for `'SUCCESS'`.

**Why it happens:** `'SUCCESS'` was Railway's old status string. Railway changed it to `'ACTIVE'`. The code predates this change.

**How to avoid:** Change `sites.js:51` — single character diff. The fix is confirmed correct per CONTEXT.md decisions.

### Pitfall 4: healthcheckPath not set before deploy trigger

**What goes wrong:** `createService()` creates the service, connects the repo, sets `rootDirectory`, then `deployService()` triggers the build. If `healthcheckPath` is set AFTER `triggerDeploy()`, the first deploy won't have the healthcheck configured. Railway may not retroactively apply it.

**Why it happens:** Order matters in Railway's API. The healthcheck must be set before the deploy that Railway will verify against it.

**How to avoid:** `healthcheckPath` is added to the `serviceInstanceUpdate` call inside `createService()` — this call happens before `deployService()` is ever called. Order is already correct in the existing code flow.

## Code Examples

### Change 1: Status poller fix (sites.js:51)

```javascript
// Before
if (railwayStatus === 'SUCCESS') {

// After
if (railwayStatus === 'ACTIVE') {
```

Add logging on transition (Claude's discretion — log format):
```javascript
// After the status update:
console.log(`[status-poller] site ${site.id} → active (Railway status: ${railwayStatus})`);
```

### Change 2: Add healthcheckPath to serviceInstanceUpdate (railway.js:80-84)

```javascript
// Before
input: {
  rootDirectory: '/',
},

// After
input: {
  rootDirectory: '/',
  healthcheckPath: '/health',
},
```

### Change 3: Update Nginx /health location (default.conf.template:61-65)

```nginx
# Before
location /health {
    access_log off;
    return 200 "healthy\n";
    add_header Content-Type text/plain;
}

# After
location = /health {
    access_log off;
    fastcgi_pass 127.0.0.1:9000;
    fastcgi_param SCRIPT_FILENAME $document_root/health.php;
    fastcgi_param QUERY_STRING "";
    include fastcgi_params;
}
```

### Change 4: Write health.php from entrypoint (docker-entrypoint.sh)

```bash
# After step 4 (WordPress initialization), add step 4.5:
echo "Writing health check script..."
echo '<?php header("Content-Type: application/json"); echo json_encode(["status" => "ok"]);' \
  > /var/www/html/health.php
```

### No change needed: deployService() / triggerDeploy()

`deployService()` at `railway.js:169-191` already calls `triggerDeploy(serviceId)` as its final step before returning. `triggerDeploy()` uses `serviceInstanceRedeploy` mutation. This is correct and complete. PIPE-01 verification is manual only.

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Railway deployment status: `SUCCESS` | Railway deployment status: `ACTIVE` | Status poller must check `ACTIVE` not `SUCCESS` — the `SUCCESS` check silently never matches |
| Plain-text `/health` Nginx stub | FastCGI-backed `/health` with PHP script | Proves PHP-FPM is alive, not just Nginx |

## Open Questions

1. **Does Railway's `serviceInstanceUpdate` accept `healthcheckPath` in `ServiceInstanceUpdateInput`?**
   - What we know: The mutation is used successfully for `rootDirectory` in the current code
   - What's unclear: `healthcheckPath` field name is confirmed in CONTEXT.md decisions as the correct field, but not independently verified against Railway's current GraphQL schema
   - Recommendation: Treat as HIGH confidence given user confirmed this in discussions. If the mutation rejects it, the Railway API error will be descriptive — fail fast is acceptable.

2. **Does WordPress entrypoint overwrite `/var/www/html/health.php` if it already exists?**
   - What we know: The upstream WP `docker-entrypoint.sh php-fpm -t` (test mode) is called at step 4 of the custom entrypoint — this runs `php-fpm -t` (config test only), not the full file-copy path
   - What's actually unclear: The `-t` flag means the upstream entrypoint only validates PHP-FPM config, it does NOT copy WordPress files. WordPress files are already in the volume from a previous boot.
   - Recommendation: Write health.php after step 4 in the entrypoint. Since `-t` doesn't modify files, health.php won't be clobbered even if written before.

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — no test files, no jest/vitest/pytest config |
| Config file | None — Wave 0 must install |
| Quick run command | N/A until Wave 0 |
| Full suite command | N/A until Wave 0 |

**Note:** This phase makes surgical changes to a working system. All three requirement behaviors are end-to-end observable only by deploying to Railway. Unit tests of the status poller string comparison are possible but the project currently has no test infrastructure. Given the minimal scope of Phase 1 changes, manual verification is the stated approach (per CONTEXT.md locked decision).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | triggerDeploy call is final step in deployService() | manual | `grep -n 'triggerDeploy' admin-dashboard/src/services/railway.js` | N/A (grep) |
| PIPE-02 | Status poller transitions site to active on Railway ACTIVE status | manual | deploy test site, observe dashboard | ❌ no test infra |
| NGNX-01 | healthcheckPath /health set on service creation | manual | Railway dashboard confirms healthcheck field | ❌ no test infra |

### Wave 0 Gaps

- [ ] No test framework installed — if unit tests are desired later, `npm install --save-dev vitest` in `admin-dashboard/`
- [ ] No test files exist — `admin-dashboard/src/api/sites.test.js` would cover PIPE-02 status mapping

*(Manual verification via Railway dashboard is the stated and sufficient approach for Phase 1. Test infrastructure gaps are not blockers.)*

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `admin-dashboard/src/api/sites.js` — status poller implementation, exact line numbers confirmed
- Direct code inspection: `admin-dashboard/src/services/railway.js` — `serviceInstanceUpdate` call, `deployService()` flow
- Direct code inspection: `default.conf.template` — existing `/health` location block
- Direct code inspection: `docker-entrypoint.sh` — container startup sequence, volume initialization order
- Direct code inspection: `Dockerfile` — image structure, volume mount point at `/var/www/html`

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions: `healthcheckPath` field name in Railway API — confirmed by user in discussion session, not independently verified against Railway GraphQL schema

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing code, no new dependencies
- Architecture: HIGH — all changes are pinpointed to exact lines in existing files
- Pitfalls: HIGH — volume mount pitfall derived from direct Dockerfile/entrypoint analysis; status string pitfall confirmed by code + CONTEXT.md

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (Railway API schema changes are rare; volume behavior is Docker standard)
