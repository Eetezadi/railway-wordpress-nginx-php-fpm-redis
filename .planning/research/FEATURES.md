# Feature Research

**Domain:** Reliable deployment pipeline for Railway-hosted WordPress multi-site dashboard
**Researched:** 2026-03-12
**Confidence:** HIGH (Railway API behavior confirmed from official docs; current code reviewed directly)

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must exist for the creation pipeline to be considered working. Missing any of these leaves the operator unable to trust the system.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Idempotent site creation (slug uniqueness guard) | Double-submit or retry must not create orphaned Railway services or duplicate DB records | LOW | Add slug uniqueness check in `createSite` before calling Railway API. Railway allows duplicate service names; enforcement must be in the dashboard. |
| Correct Railway deployment status polling | Pipeline must know when a site is truly running vs still building | LOW | Railway GraphQL `DeploymentStatus` enum is: `BUILDING`, `DEPLOYING`, `SUCCESS`, `FAILED`, `CRASHED`, `REMOVED`, `SLEEPING`, `SKIPPED`, `WAITING`, `QUEUED`. Current code polls for `SUCCESS` — this is correct per Railway docs. Also handle `WAITING` and `QUEUED` as in-progress, not errors. |
| Nginx/HTTP reachability verification after deploy | `SUCCESS` status means the container started, not that Nginx is serving requests | MEDIUM | After Railway reports `SUCCESS`, make an HTTP GET to the Railway domain. Expect HTTP 200 or 301/302 (WordPress redirect). A `CONNECTION_REFUSED` or timeout means Nginx is not listening. This is separate from Railway's health check system. |
| Clear error state on creation failure with cleanup | A failed creation must not leave orphaned Railway services or phantom DB records | MEDIUM | Current code has a try/catch that logs but does not roll back Railway service if `deployService` fails after `createService` succeeds. Compensating delete is needed. |
| Step-by-step provisioning status exposed to operator | Operator needs to know which stage failed (DB creation, service creation, variable set, volume, domain, deploy) | LOW | Current code logs per-step but only surfaces a generic 500 error to the caller. Return structured error with `failedStep` field. |
| Distinguish transient from permanent deployment failures | `CRASHED` after first deploy is often a config problem; `FAILED` is a build failure — different remediation | LOW | Status polling already catches `FAILED` and `CRASHED`. Add distinct `error_message` text per status so the operator knows whether to retry or investigate config. |

### Differentiators (Competitive Advantage)

Features that make this dashboard more operationally trustworthy than a bare Railway project.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Automatic retry with backoff for transient Railway API errors | Railway API is occasionally unavailable (confirmed September 2025 incident); a retry prevents phantom failures | MEDIUM | Wrap `gql()` in a retry loop (3 attempts, exponential backoff). Only retry on network errors or HTTP 5xx from Railway — never on 4xx. |
| Nginx endpoint health probe after `SUCCESS` | Confirms the full stack (Nginx + PHP-FPM + WordPress) is serving, not just that the container started | MEDIUM | HTTP GET to `https://{domain}/` with a short timeout (10s). Interpret 200/301/302 as healthy. Log and surface any other response as a warning. Railway's own health check system requires a `/health` endpoint configured per-service — easier to do this from the dashboard post-deploy than configure it on every new Railway service. |
| Rollback / cleanup on partial creation failure | Prevents resource leaks that accumulate Railway charges | MEDIUM | Track which steps completed. If any step after `createService` fails, call `deleteService` and mark DB record as `failed` rather than leaving it in `provisioning`. |
| Rate-limit guard surfaced to UI | Prevents accidental double-creation during slow deploys | LOW | Already implemented (10s cooldown). Ensure the UI disables the create button and shows remaining wait time rather than showing a generic 429 error. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Railway health check endpoint (`/health` route) configured via API per new service | "Proper" health checks feel more professional | Requires modifying the Dockerfile or Nginx config and calling `serviceInstanceUpdate` with healthcheck settings on every new service — more API calls, more failure points during provisioning | Do the health probe from the dashboard after `SUCCESS` instead. One HTTP GET is sufficient to confirm Nginx is serving. |
| Real-time build log streaming | Operators want to watch deploy logs | Requires Railway's log streaming API (WebSocket or SSE subscription), significant new infrastructure, and the dashboard has no WebSocket endpoint today | Show deployment status polling with human-readable stage labels; link to Railway dashboard for full logs |
| Automatic redeploy on `CRASHED` | Seems helpful to recover automatically | A `CRASHED` status after first deploy almost always means a misconfiguration (bad env var, DB unreachable) — auto-redeploy loops without fixing the root cause; wastes Railway credits | Surface `CRASHED` as an error with actionable message; let the operator investigate and manually retrigger |
| Serverless / edge function extraction of creation logic | "Cleaner architecture" | PROJECT.md explicitly calls this out of scope; adds cold-start latency and complicates Railway API token management | Keep all creation logic in the Hono.js server |

## Feature Dependencies

```
[Nginx health probe]
    └──requires──> [Deployment status SUCCESS from Railway polling]
                       └──requires──> [triggerDeploy called after setServiceVariables + createVolume + getServiceDomain]

[Rollback on failure]
    └──requires──> [createService returning serviceId]
    └──requires──> [Step tracking (which steps completed)]

[Structured error with failedStep]
    └──enhances──> [Rollback on failure]
    └──enhances──> [Nginx health probe] (distinguish "deploy failed" from "Nginx not ready")

[Idempotent slug guard]
    └──conflicts──> [Allowing retry to create new service with same slug]
```

### Dependency Notes

- **Nginx health probe requires SUCCESS polling:** You cannot probe HTTP until Railway confirms the container is running. Probing during `DEPLOYING` will always fail.
- **Rollback requires step tracking:** Without knowing which steps completed, cleanup may call `deleteService` on a service that was never created, which is harmless but must not throw.
- **Slug guard conflicts with unguarded retry:** If a first attempt fails after Railway service creation but before DB write, a retry with the same name will attempt to create a second Railway service with the same name. Railway permits this (no uniqueness enforcement). The dashboard must query for existing slugs before calling Railway.

## MVP Definition

### Launch With (v1 — this milestone)

- [x] Correct deployment status polling — `SUCCESS`, `FAILED`, `CRASHED`, `QUEUED`, `WAITING` all handled
- [ ] Nginx reachability probe after `SUCCESS` — HTTP GET to domain, surface result in status response
- [ ] Rollback (compensating `deleteService`) if any post-`createService` step fails
- [ ] Slug uniqueness guard before Railway API call
- [ ] Structured error response with `failedStep` field on creation failure

### Add After Validation (v1.x)

- [ ] Retry with backoff in `gql()` for transient Railway API errors — add once creation is stable and transient errors are observed
- [ ] UI disables create button with countdown during 10s cooldown — add once creation flow is confirmed reliable end-to-end

### Future Consideration (v2+)

- [ ] Build log streaming — defer; requires WebSocket infrastructure and Railway log subscription API
- [ ] Automatic Railway health check endpoint configuration per service — defer; requires Dockerfile/Nginx changes and more API calls per provisioning run

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Correct status polling (QUEUED/WAITING as in-progress) | HIGH | LOW | P1 |
| Nginx HTTP reachability probe | HIGH | LOW | P1 |
| Rollback on partial failure | HIGH | MEDIUM | P1 |
| Slug uniqueness guard | HIGH | LOW | P1 |
| Structured error with failedStep | MEDIUM | LOW | P1 |
| Retry with backoff in gql() | MEDIUM | MEDIUM | P2 |
| UI cooldown countdown | LOW | LOW | P2 |
| Build log streaming | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

This is an internal tool, not a competitive product. Comparable patterns come from platform provisioning tools (Heroku Review Apps, Render deploy hooks, Fly.io Machines API).

| Feature | Heroku / Render pattern | Our Approach |
|---------|------------------------|--------------|
| Deployment status | Poll `/deployments/{id}` until `succeeded` or `failed`; treat `pending`/`building` as in-progress | Poll Railway GraphQL `deployments` query for `SUCCESS`; treat `QUEUED`/`WAITING`/`BUILDING`/`DEPLOYING` as in-progress |
| Health verification | Heroku waits for process to bind port; Render uses configurable health check path | HTTP GET to Railway domain after `SUCCESS` — simpler, no per-service config |
| Partial failure cleanup | Heroku deletes dyno on provisioning error; Render marks deploy as failed and stops | Call `deleteService` and mark site as `failed` in local registry |
| Duplicate resource guard | Unique slug enforced by platform | Must enforce in dashboard — Railway allows duplicate service names within a project |

## Sources

- [Railway Deployment Status values — Manage Deployments docs](https://docs.railway.com/guides/manage-deployments)
- [Railway Deployment Reference — status lifecycle](https://docs.railway.com/deployments/reference)
- [Railway Health Checks configuration](https://docs.railway.com/guides/healthchecks-and-restarts)
- [Railway Incident Report Sept 2025 — platform reliability context](https://blog.railway.com/p/incident-report-sept-22-2025)
- Current codebase: `admin-dashboard/src/services/railway.js`, `admin-dashboard/src/api/sites.js`
- PROJECT.md constraints and out-of-scope declarations

---
*Feature research for: Railway WordPress multi-site dashboard — reliable creation pipeline*
*Researched: 2026-03-12*
