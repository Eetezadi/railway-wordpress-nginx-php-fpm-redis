# Architecture Research

**Domain:** WordPress multi-site provisioning dashboard on Railway
**Researched:** 2026-03-12
**Confidence:** HIGH (based on direct codebase analysis)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Admin Dashboard                            │
│  ┌───────────────────┐        ┌──────────────────────────────┐   │
│  │  React + Vite UI  │        │     Hono.js API Server        │   │
│  │  (Clerk auth)     │◄──────►│  /api/sites (sites.js)        │   │
│  │  Status polling   │        │  /api/auth  (auth.js)         │   │
│  └───────────────────┘        └──────────┬───────────────────┘   │
└─────────────────────────────────────────│────────────────────────┘
                                           │
              ┌────────────────────────────┼──────────────────────┐
              │                            │                       │
              ▼                            ▼                       ▼
   ┌─────────────────┐      ┌─────────────────────┐   ┌──────────────────┐
   │  MySQL (shared) │      │  Railway GraphQL API │   │  Deployed WP     │
   │  dashboard_db   │      │  backboard.railway   │   │  Services        │
   │  + per-site DBs │      │  .com/graphql/v2     │   │  (one per site)  │
   └─────────────────┘      └─────────────────────┘   └──────────────────┘

Each WordPress Service:
┌──────────────────────────────────────────────┐
│  Docker Container (Alpine)                    │
│  ┌────────────┐     ┌───────────────────────┐ │
│  │   Nginx    │────►│    PHP-FPM :9000      │ │
│  │   :80      │     │  (WordPress 6)        │ │
│  └────────────┘     └───────────────────────┘ │
│  /health endpoint    /var/www/html (volume)   │
└──────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `api/sites.js` | Site creation orchestration, status polling, deletion | Existing — primary modification target |
| `services/railway.js` | All Railway GraphQL API calls | Existing — needs retry wrapping |
| `services/siteRegistry.js` | Read/write `dashboard_sites` MySQL table | Existing — needs rollback support |
| `services/database.js` | Dashboard DB pool + per-site DB creation | Existing — unchanged |
| `docker-entrypoint.sh` | Container init, Nginx+PHP-FPM startup | Existing — already has `/health` |
| `default.conf.template` | Nginx config with `/health` endpoint | Existing — `/health` returns 200 |
| Nginx verify service (new) | HTTP probe to `<domain>/health` after deploy | New module in `services/` |
| Retry wrapper (new) | Exponential backoff for Railway API calls | New utility in `lib/` or inline |

## Recommended Project Structure

```
admin-dashboard/src/
├── api/
│   └── sites.js              # MODIFY: add rollback on failure, structured error states
├── services/
│   ├── railway.js            # MODIFY: wrap gql() calls with retry logic
│   ├── siteRegistry.js       # MODIFY: add rollback helpers (deleteSiteBySlug, etc.)
│   ├── database.js           # unchanged
│   ├── wordpress.js          # unchanged
│   └── nginxVerify.js        # NEW: HTTP probe to /health endpoint post-deploy
└── lib/
    └── retry.js              # NEW: generic exponential backoff wrapper
```

### Structure Rationale

- **`services/nginxVerify.js` as separate module:** Keeps the HTTP probe logic isolated and testable without touching the Railway client.
- **`lib/retry.js` as generic utility:** The same retry wrapper serves both Railway API calls (network flakiness) and the Nginx health probe (deployment warmup delay), avoiding duplication.
- **Modify `sites.js`, not extract:** PROJECT.md explicitly rules out serverless function extraction. All orchestration stays in the Hono.js API handler.

## Architectural Patterns

### Pattern 1: Sequential Provisioning with Compensating Rollback

**What:** The creation handler runs steps in dependency order. If any step fails after resources are created, compensating actions clean up what was already provisioned.

**When to use:** Any multi-step provisioning flow where partial completion is worse than clean failure. This is the right model here because orphaned Railway services cost money and pollute the service list.

**Trade-offs:** Simple to reason about; no saga framework needed at this scale. Rollback is best-effort — Railway API failures during rollback are logged but not fatal.

**Current flow (sites.js lines 121-143):**
```
createDatabase(dbName)           → MySQL
createSite(...)                  → dashboard_sites row (status: provisioning)
createService(`wp-${slug}`)      → Railway service
deployService(serviceId, ...)    → env vars + volume + domain + triggerDeploy
updateSite(siteId, { railway_service_id, railway_domain })
```

**Recommended flow with rollback:**
```
createDatabase(dbName)           → on failure: nothing to undo (CREATE IF NOT EXISTS is safe)
createSite(...)                  → on failure: nothing created yet
createService(...)               → on failure: deleteSite(siteId)
deployService(...)               → on failure: deleteService(serviceId) + deleteSite(siteId)
updateSite(...)                  → on failure: deleteService(serviceId) + deleteSite(siteId)
waitForDeploy(serviceId)         → on timeout: mark status=error, do not rollback (deploy may succeed later)
verifyNginx(domain)              → on failure: mark status=error with nginx_failed message
```

### Pattern 2: Polling-Based Deploy Readiness Check

**What:** After `triggerDeploy`, poll `getServiceStatus` until Railway reports `SUCCESS`, `FAILED`, or a timeout is reached. This already exists in the status endpoint (`GET /api/sites/:id/status`) driven by the React frontend. The missing piece is a server-side wait during creation so errors surface immediately rather than requiring manual dashboard refresh.

**When to use:** Railway deploys take 60-180 seconds. The frontend already polls every few seconds via `GET /api/sites/:id/status`. Two options:
1. Keep async (return 202 immediately, let frontend poll) — current approach, acceptable.
2. Add a server-side poll loop in the creation handler with a timeout — surfaces errors sooner, but ties up the HTTP connection.

**Recommendation:** Keep the 202 async pattern for creation. Add server-side status transition logic to the existing status endpoint so it also triggers the Nginx verify step when Railway reports SUCCESS. This avoids an open connection while Railway builds the image.

**Trade-offs:** Async is more resilient to Railway build time variance. The downside is the user must wait for the next poll cycle to see an error.

### Pattern 3: Nginx Health Probe After Deploy Confirmation

**What:** Once the status endpoint sees Railway report `SUCCESS`, make an HTTP GET to `https://<domain>/health` before marking the site `active`. The `/health` endpoint in `default.conf.template` already returns `200 "healthy\n"` if Nginx is serving.

**When to use:** Every time a site transitions from `provisioning` to `active`.

**Integration point:** Inside the status-check block in `sites.js` `GET /:id/status`:

```javascript
// existing code
if (railwayStatus === 'SUCCESS') {
  const nginxOk = await verifyNginx(site.railway_domain);  // NEW
  if (nginxOk) {
    await updateSite(site.id, { status: 'active' });
    deployStatus = 'active';
  } else {
    await updateSite(site.id, { status: 'error', error_message: 'Nginx not responding after deploy' });
    deployStatus = 'error';
  }
}
```

**Trade-offs:** Adds one HTTP round-trip per status poll when Railway says SUCCESS. The probe should have a short timeout (5s) and not retry aggressively here — the frontend will poll again if it fails transiently. A single verify per SUCCESS transition is enough.

## Data Flow

### Site Creation Flow (Current + Proposed Changes)

```
POST /api/sites
    │
    ├─► createDatabase(dbName)          [MySQL]
    ├─► createSite(...)                 [MySQL: status=provisioning]
    ├─► createService(`wp-${slug}`)     [Railway GraphQL]   ← wrap with retry
    ├─► setServiceVariables(...)        [Railway GraphQL]   ← wrap with retry
    ├─► createVolume(...)               [Railway GraphQL]   ← wrap with retry
    ├─► getServiceDomain(...)           [Railway GraphQL]   ← wrap with retry
    ├─► triggerDeploy(...)              [Railway GraphQL]   ← wrap with retry
    ├─► updateSite({railway_service_id, railway_domain})    [MySQL]
    │
    └─► return 202 { id, slug, domain, status: 'provisioning' }

GET /api/sites/:id/status  (called by React polling every 3-5s)
    │
    ├─► getSite(id)                     [MySQL]
    ├─► getServiceStatus(serviceId)     [Railway GraphQL]
    │       │
    │       ├── SUCCESS → verifyNginx(domain)  [HTTP GET /health]  ← NEW
    │       │       ├── 200 → updateSite status=active
    │       │       └── fail → updateSite status=error, error_message=nginx_failed
    │       ├── FAILED/CRASHED → updateSite status=error
    │       └── no_deployments → updateSite status=error
    │
    └─► return { id, status, domain }
```

### Retry Wrapper Data Flow

```
railway.js gql() call
    │
    └─► withRetry(fn, { maxAttempts: 3, baseDelayMs: 500, backoff: 'exponential' })
            │
            ├── attempt 1: success → return result
            ├── attempt 1: Railway API error → wait 500ms → attempt 2
            ├── attempt 2: error → wait 1000ms → attempt 3
            └── attempt 3: error → throw (surfaces to creation handler → rollback)
```

## Integration Points

### New vs Modified Components

| Component | New or Modified | Change |
|-----------|----------------|--------|
| `lib/retry.js` | NEW | Generic exponential backoff. Used by railway.js and nginxVerify.js |
| `services/nginxVerify.js` | NEW | `verifyNginx(domain, opts)` — GET `https://<domain>/health`, returns bool |
| `services/railway.js` | MODIFIED | Wrap `gql()` or individual exported functions with retry logic |
| `api/sites.js` — POST `/` | MODIFIED | Add try/catch with compensating rollback per step |
| `api/sites.js` — GET `/:id/status` | MODIFIED | Call `verifyNginx` when Railway status transitions to SUCCESS |
| `services/siteRegistry.js` | MODIFIED (minor) | Add `deleteSiteBySlug` or use existing `deleteSite` in rollback |
| `Dockerfile` | UNCHANGED | `/health` endpoint already exists via default.conf.template |
| `docker-entrypoint.sh` | UNCHANGED | Already starts Nginx; health endpoint works on startup |
| `default.conf.template` | UNCHANGED | `/health` already returns 200 |

### External Service Boundaries

| Service | Integration Pattern | Reliability Concern |
|---------|---------------------|---------------------|
| Railway GraphQL API | HTTP POST to `backboard.railway.com/graphql/v2` | Rate limits, transient 5xx errors → need retry |
| Railway deploy status | Poll via `getServiceStatus` | Deploy can take 60-180s; no webhook available |
| MySQL (shared) | mysql2 connection pool | Already reliable; `CREATE IF NOT EXISTS` is idempotent |
| WordPress `/health` endpoint | HTTP GET from dashboard server | Only accessible after Railway routes DNS; may need brief delay |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `sites.js` ↔ `railway.js` | Direct function import | railway.js functions must become retry-aware or sites.js wraps calls |
| `sites.js` ↔ `nginxVerify.js` | Direct function import | Called only from status endpoint, not creation handler |
| `sites.js` ↔ `siteRegistry.js` | Direct function import | Rollback path calls `deleteSite` and/or `updateSite` |
| React frontend ↔ Hono API | HTTP polling (GET /api/sites/:id/status) | No change needed; frontend already polls |

## Build Order (Phase Dependencies)

1. **`lib/retry.js`** — No dependencies. Build first; everything else depends on it.
2. **`services/railway.js` retry wrapping** — Depends on retry.js. Wrap existing exported functions. Independent of Nginx verify.
3. **`services/nginxVerify.js`** — Depends on retry.js for the probe loop. No other dependencies.
4. **`api/sites.js` rollback** — Depends on railway.js (to call deleteService in rollback). Can be done before or after Nginx verify.
5. **`api/sites.js` Nginx verify integration** — Depends on nginxVerify.js. This is the last step — status endpoint enhancement.

## Anti-Patterns

### Anti-Pattern 1: Verifying Nginx During Creation (Not Status Poll)

**What people do:** Call `verifyNginx` at the end of `POST /api/sites` before returning 202.

**Why it's wrong:** Railway build + deploy takes 60-180 seconds. The creation HTTP request would hang for that entire window. The dashboard frontend would time out or show a spinner with no feedback. Railway may also not have provisioned the domain yet, so the HTTP probe would fail immediately.

**Do this instead:** Keep `POST /api/sites` fast (return 202 in under 5 seconds). Place the Nginx probe in the `GET /api/sites/:id/status` handler, triggered only when Railway first reports SUCCESS. The React polling loop already handles the wait.

### Anti-Pattern 2: Hard-Failing Rollback

**What people do:** Throw an error if the Railway service deletion during rollback fails, causing the error response to hide the original failure.

**Why it's wrong:** The caller (dashboard user) needs to know why site creation failed (e.g., Railway API rate limit), not that rollback also failed. Rollback is best-effort cleanup.

**Do this instead:** Wrap rollback calls in their own try/catch. Log rollback failures with a `[rollback-failed]` prefix. Always throw the original error after best-effort cleanup.

### Anti-Pattern 3: Retrying Non-Idempotent Railway Mutations

**What people do:** Retry `serviceCreate` or `volumeCreate` on failure, creating duplicate resources.

**Why it's wrong:** Railway mutations are not idempotent. Retrying `serviceCreate` after a partial success (e.g., Railway created the service but the response timed out) creates a duplicate orphaned service.

**Do this instead:** Only retry clearly transient errors (HTTP 429, 503, network timeout) on mutations, with a low max attempt count (2-3). For reads like `getServiceStatus`, retry freely. Consider checking for existing resources before creating (query first, create only if absent).

### Anti-Pattern 4: Polling Railway Status from the Creation Handler

**What people do:** Add a `while` loop in `POST /api/sites` that polls Railway until deploy completes, then returns 200.

**Why it's wrong:** At 60-180s deploy time this blocks the server thread and the HTTP client. Railway may also rate-limit status queries from tight polling loops.

**Do this instead:** Return 202 immediately. The existing React polling via `GET /api/sites/:id/status` already handles the wait. Add a deploy timeout threshold in the status handler (e.g., if `created_at` is >15 minutes ago and still `provisioning`, mark `error`).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-20 sites | Current monolith is appropriate. No changes needed beyond reliability fixes. |
| 20-100 sites | Status polling load increases. Consider caching Railway status responses for 10-15s to avoid hammering the GraphQL API when many users have dashboards open. |
| 100+ sites | MySQL connection pool limit (currently 5) becomes a bottleneck. Consider PlanetScale or increasing `connectionLimit`. Status polling should move to webhooks if Railway exposes them. |

### Scaling Priority for This Milestone

The current milestone is reliability at small scale (likely <10 active sites). No scaling changes needed. Focus entirely on correctness of the provisioning flow.

## Sources

- Direct codebase analysis: `admin-dashboard/src/api/sites.js`, `admin-dashboard/src/services/railway.js`, `admin-dashboard/src/services/siteRegistry.js`, `admin-dashboard/src/services/database.js`
- Container architecture: `Dockerfile`, `docker-entrypoint.sh`, `default.conf.template`
- Existing architecture analysis: `.planning/codebase/ARCHITECTURE.md` (2026-03-11)
- Known concerns: `.planning/codebase/CONCERNS.md` (2026-03-11)
- Project requirements: `.planning/PROJECT.md` (2026-03-12)
- Confidence: HIGH — all findings derived from reading actual source files, not inferred from training data

---
*Architecture research for: Railway WordPress multi-site dashboard — reliable site creation pipeline*
*Researched: 2026-03-12*
