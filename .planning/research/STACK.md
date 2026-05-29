# Technology Stack

**Project:** Railway WordPress Multi-Site Dashboard — Reliable Site Creation Pipeline
**Researched:** 2026-03-12
**Scope:** Stack additions and changes needed for reliable Railway service creation and Nginx verification. Existing validated stack (Docker/WordPress/Nginx/PHP-FPM/Redis/Hono.js/React/Clerk/MySQL) is out of scope.

---

## Problem Statement

Two bugs block reliable site creation, both already fixed in code but awaiting production verification:

1. **Wrong API endpoint** (`backboard.railway.app` → `backboard.railway.com`) causing `Not Authorized` on `serviceCreate` — FIXED in railway.js
2. **Missing deploy trigger** — `deployService()` configured the service but never called `serviceInstanceRedeploy`, leaving sites stuck in `provisioning` forever — FIXED with `triggerDeploy()` call

The remaining gap is: once Railway reports `SUCCESS`, is Nginx actually serving HTTP? Currently the pipeline treats `SUCCESS` as equivalent to "site is up" without verifying the HTTP layer.

---

## Current Stack Assessment

### What Is Already Correct — Do Not Change

| Component | Current State | Assessment |
|-----------|--------------|------------|
| Railway GraphQL endpoint | `backboard.railway.com/graphql/v2` | Correct (was .app, now fixed) |
| `serviceCreate` mutation | Create empty, then `serviceConnect` | Correct pattern per Railway docs |
| `serviceInstanceUpdate` | Used for `rootDirectory` | Valid mutation, correct signature |
| `variableCollectionUpsert` | Batch env var set | Correct |
| `serviceInstanceRedeploy` | Added to `deployService()` | Correct trigger mutation |
| `/health` endpoint | Returns 200 in `default.conf.template` | Already exists, ready to use |
| Deployment status polling | `getServiceStatus()` queries latest deployment | Working pattern |

### What Needs to Change

#### 1. Status Field: `SUCCESS` Does Not Mean "Active"

**Current code** checks for `railwayStatus === 'SUCCESS'` in `sites.js` (line 52).

**Finding:** Railway's actual terminal success status is `ACTIVE`, not `SUCCESS`. Per official Railway docs (https://docs.railway.com/deployments/reference), deployments transition through `INITIALIZING → BUILDING → DEPLOYING → ACTIVE`. There is no `SUCCESS` status in Railway's current deployment lifecycle. `COMPLETED` means the process exited cleanly (not a long-running server). `ACTIVE` means the container is running and serving traffic.

**Fix required:** Change the status check in `sites.js` from `'SUCCESS'` to `'ACTIVE'`. This is a one-line change in `sites.js` line 52. Without this fix, a correctly deployed site will never transition from `provisioning` to `active` in the dashboard even after both bugs above are fixed.

**Confidence:** HIGH — verified via official Railway docs.

#### 2. Railway Healthcheck Configuration — Set `healthcheckPath` via API

**Current state:** No `healthcheckPath` is set on created services. Railway deploys without a health check, meaning a container that starts Nginx but crashes PHP-FPM would still be marked `ACTIVE`.

**Finding:** `ServiceInstanceUpdateInput` accepts a `healthcheckPath` field (https://docs.railway.com/guides/manage-services). The WordPress Nginx image already has `/health` returning HTTP 200 (line 61-65 of `default.conf.template`). Railway uses `healthcheck.railway.app` as the origin for healthcheck requests — this hostname is not currently whitelisted in `server_name`, but since `server_name _;` is a catch-all it will accept it.

**Recommendation:** Add `healthcheckPath: '/health'` to the `serviceInstanceUpdate` call that already runs in `createService()`. This makes Railway wait for Nginx to confirm it is serving before marking deployment `ACTIVE`, which is the correct "Nginx verified running" signal.

```javascript
// In createService(), extend the existing serviceInstanceUpdate call:
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
    healthcheckTimeout: 300,  // seconds, default — explicit is better
  },
});
```

**Why this solves "Nginx verified running":** Railway will poll `https://<service-domain>/health` every few seconds after deploy. It only sets the deployment to `ACTIVE` once it receives HTTP 200. The `/health` location in Nginx returns 200 immediately without touching PHP-FPM, so this test confirms Nginx is up and accepting connections — not just that the container started. If Nginx fails to start, deployment stays in `DEPLOYING` and eventually transitions to `FAILED`, which the existing error handling already surfaces.

**Confidence:** HIGH — `healthcheckPath` field confirmed in Railway API docs, `/health` endpoint confirmed present in `default.conf.template`.

#### 3. Deployment Status Polling — Handle `ACTIVE` Not `SUCCESS`

The full corrected status-check logic in `sites.js`:

```javascript
if (railwayStatus === 'ACTIVE') {         // was 'SUCCESS' — wrong
  await updateSite(site.id, { status: 'active' });
  deployStatus = 'active';
} else if (['FAILED', 'CRASHED'].includes(railwayStatus)) {
  await updateSite(site.id, { status: 'error', error_message: `Deployment ${railwayStatus}` });
  deployStatus = 'error';
} else if (railwayStatus === 'no_deployments') {
  await updateSite(site.id, { status: 'error', error_message: 'No deployments found — service may not have been triggered' });
  deployStatus = 'error';
}
// INITIALIZING, BUILDING, DEPLOYING, WAITING, QUEUED → stay in provisioning (no change)
```

**Confidence:** HIGH.

---

## Recommended Stack Changes (Summary)

### Core Changes — Required

| Change | File | Description | Confidence |
|--------|------|-------------|------------|
| Fix status check: `'SUCCESS'` → `'ACTIVE'` | `admin-dashboard/src/api/sites.js` line 52 | Railway uses `ACTIVE` not `SUCCESS` as the running state | HIGH |
| Add `healthcheckPath: '/health'` to `serviceInstanceUpdate` | `admin-dashboard/src/services/railway.js` `createService()` | Nginx verification via Railway's built-in healthcheck | HIGH |
| Add `healthcheckTimeout: 300` alongside path | Same location | Explicit timeout, matches Railway default | HIGH |

### No New Dependencies Required

All three changes are modifications to existing code. No new npm packages, no new services, no infrastructure changes.

| Category | Recommended | Why Not Alternative |
|----------|-------------|---------------------|
| Nginx verification method | Railway built-in healthcheck (`healthcheckPath`) | External HTTP probe from dashboard would require the domain to be publicly resolvable before ACTIVE — chicken-and-egg. Railway's internal healthcheck probes the container directly before routing traffic. |
| Deploy trigger mutation | `serviceInstanceRedeploy` (already in use) | `environmentTriggersDeploy` is the newer documented mutation; `serviceInstanceRedeploy` is currently working and already in the codebase. Do not change what works. |
| Status polling approach | Query `deployments(first: 1)` (already in use) | Websocket/subscription would be more efficient but is architectural complexity not needed for this milestone. Current 5-second poll is acceptable. |

---

## What NOT to Add

- **A separate HTTP probe from the dashboard server to verify Nginx** — this adds complexity and race conditions (domain may not resolve yet). Railway's healthcheck is the right tool.
- **Retry logic on `serviceCreate`** — the auth bug was an endpoint URL issue, now fixed. Adding retries on top of a broken endpoint just masks errors.
- **Webhook-based status updates** — Railway supports deployment webhooks but this requires a publicly reachable callback URL. The poll-on-demand approach in `getServiceStatus` is simpler and sufficient.
- **New npm packages** — no dependencies are needed.

---

## Deployment Sequence After Changes

```
POST /sites (create)
  1. createDatabase(dbName)
  2. createSite(registry)
  3. createService(name)
     a. serviceCreate (empty)
     b. serviceConnect (attach GitHub repo)
     c. serviceInstanceUpdate (rootDirectory + healthcheckPath + healthcheckTimeout)
  4. deployService(serviceId, ...)
     a. variableCollectionUpsert (env vars)
     b. volumeCreate
     c. serviceDomainCreate
     d. serviceInstanceRedeploy  ← triggers build+deploy
  5. updateSite(railway_service_id, domain)
  → returns 202 {status: 'provisioning'}

GET /sites/:id/status (poll every 5s)
  1. getServiceStatus → query deployments(first: 1)
  2. INITIALIZING/BUILDING/DEPLOYING/WAITING/QUEUED → stay provisioning
  3. ACTIVE → Railway confirmed healthcheck /health returned 200 → set 'active'
  4. FAILED/CRASHED → set 'error' with message
  5. no_deployments → set 'error' (triggerDeploy was not called)
```

Railway guarantees: deployment only reaches `ACTIVE` after `/health` returns HTTP 200. This is the Nginx-verified-running signal.

---

## Sources

- Railway deployment statuses (ACTIVE vs SUCCESS): https://docs.railway.com/deployments/reference
- `ServiceInstanceUpdateInput` fields including `healthcheckPath`: https://docs.railway.com/guides/manage-services
- Railway healthcheck hostname and behavior: https://docs.railway.com/deployments/healthchecks / https://docs.railway.com/guides/healthchecks
- Railway deployment trigger mutations: https://docs.railway.com/guides/manage-deployments
- Railway API token types: https://docs.railway.com/integrations/api
