# Project Research Summary

**Project:** Railway WordPress Multi-Site Dashboard — Reliable Site Creation Pipeline
**Domain:** Cloud provisioning reliability / Railway API integration
**Researched:** 2026-03-12
**Confidence:** HIGH

## Executive Summary

This project is a targeted reliability fix for an existing Railway-hosted WordPress multi-site provisioning dashboard. Two production bugs have already been identified and patched in code — a wrong Railway API endpoint (`backboard.railway.app` → `backboard.railway.com`) and a missing deploy trigger (`serviceInstanceRedeploy` was never called). The work remaining is to verify those fixes hold end-to-end and to add the three layers of robustness the system currently lacks: correct deployment status detection, Nginx-layer health verification, and compensating rollback on partial creation failures.

The recommended approach is conservative: no new dependencies, no architectural changes, no serverless extraction. All changes are targeted modifications to three existing files (`sites.js`, `railway.js`, `siteRegistry.js`) and two new small modules (`lib/retry.js`, `services/nginxVerify.js`). The key non-obvious finding is that Railway's terminal success status is `ACTIVE` (not `SUCCESS` as current code checks), and that Railway's built-in healthcheck mechanism — triggered by setting `healthcheckPath: '/health'` on `serviceInstanceUpdate` — is the correct signal for "Nginx is confirmed running," making a separate post-deploy HTTP probe from the dashboard server unnecessary.

The primary risks are: (1) partial creation failures that leave orphaned Railway services consuming quota, (2) sites stuck permanently in `provisioning` because Railway's `no_deployments` or exotic statuses are silently ignored, and (3) no timeout on provisioning causing sites to never self-recover from Railway infrastructure hangs. All three have clear prevention strategies detailed in research.

## Key Findings

### Recommended Stack

No new dependencies are required. The existing stack (Hono.js / React / Clerk / MySQL / Railway GraphQL API) is correct for this workload. The only stack-level changes are two code corrections: change the Railway status check from `'SUCCESS'` to `'ACTIVE'` in `sites.js` line 52, and add `healthcheckPath: '/health'` plus `healthcheckTimeout: 300` to the `serviceInstanceUpdate` call in `createService()` in `railway.js`. Railway guarantees a deployment only reaches `ACTIVE` after `/health` returns HTTP 200, making this the Nginx-verified-running signal without requiring any external probe.

**Core technologies:**
- Railway GraphQL API (`backboard.railway.com/graphql/v2`): service provisioning — canonical endpoint confirmed, two-step create+connect pattern required
- `serviceInstanceUpdate` with `healthcheckPath`: Nginx verification — Railway polls `/health` and only marks `ACTIVE` after HTTP 200 is received
- `serviceInstanceRedeploy`: deploy trigger — must be called as final step after all vars/volumes/domains are set; absence causes permanent `no_deployments` state
- MySQL `dashboard_sites` table: site registry — needs rollback helpers (`deleteSite`, `deleteSiteBySlug`)

### Expected Features

**Must have (table stakes):**
- Correct Railway deployment status polling — `ACTIVE` (not `SUCCESS`) as terminal success; `FAILED`/`CRASHED` as terminal errors; `BUILDING`/`DEPLOYING`/`WAITING`/`QUEUED`/`INITIALIZING` as in-progress
- Nginx HTTP reachability verification — confirmed by Railway healthcheck on `/health` before `ACTIVE` is reached
- Rollback on partial creation failure — compensating `deleteService` + `deleteSite` if any post-`createService` step fails
- Slug uniqueness guard — check before calling Railway API; Railway permits duplicate service names and will not enforce this
- Structured error response with `failedStep` field — operator needs to know which step failed, not just that a 500 occurred
- Provisioning timeout — sites stuck beyond 15 minutes must auto-transition to `error`; Railway infrastructure hangs are documented

**Should have (competitive/operational):**
- Retry with exponential backoff in `gql()` — Railway had a documented Sept 2025 outage; 3 attempts with 500ms/1s/2s delays protects against transient API errors
- UI cooldown countdown — `lastCreateTime` rate limit already exists; surface it as a countdown rather than a generic 429

**Defer (v2+):**
- Build log streaming — requires Railway WebSocket/SSE subscription and new infrastructure; not needed for reliability milestone
- Automatic Railway healthcheck endpoint configuration per service (as anti-feature) — the built-in `healthcheckPath` approach is simpler and already recommended

### Architecture Approach

The architecture is a sequential provisioning pipeline in `api/sites.js` with compensating rollback. Creation returns 202 immediately; status transitions are driven by the React frontend polling `GET /api/sites/:id/status` every 3-5 seconds. No polling loop in the creation handler. The only new modules are `lib/retry.js` (generic exponential backoff used by both railway.js and nginxVerify.js) and `services/nginxVerify.js` (HTTP GET to `https://<domain>/health` with short timeout). All Railway GraphQL calls in `railway.js` get wrapped with retry logic.

**Major components:**
1. `api/sites.js` — orchestration: POST creates resources sequentially with rollback; GET/:id/status drives state transitions including Nginx verify trigger
2. `services/railway.js` — Railway GraphQL client: all mutations and queries, wrapped with retry
3. `lib/retry.js` (new) — exponential backoff utility; dependency for railway.js and nginxVerify.js
4. `services/nginxVerify.js` (new) — HTTP GET to `/health` after Railway reports `ACTIVE`; returns bool; timeout 5s
5. `services/siteRegistry.js` — MySQL registry: needs `deleteSiteBySlug` rollback helper

**Build order (dependency-driven):**
1. `lib/retry.js` — no dependencies
2. `services/railway.js` retry wrapping — depends on retry.js
3. `services/nginxVerify.js` — depends on retry.js
4. `api/sites.js` rollback — depends on railway.js deleteService
5. `api/sites.js` status corrections + Nginx verify — depends on nginxVerify.js

### Critical Pitfalls

1. **`SUCCESS` vs `ACTIVE` status mismatch** — Railway's running state is `ACTIVE`, not `SUCCESS`. Current code will never transition sites to active even with all other bugs fixed. Fix: one-line change in `sites.js`.

2. **Treating configured as deployed** — Railway separates configuration mutations from deployment. Without calling `serviceInstanceRedeploy` as the final step, services sit permanently in `no_deployments`. The fix is already in the codebase; protect it from regression with a comment marking it mandatory.

3. **No compensating rollback** — If `deployService` fails after `createService` succeeds, an orphaned Railway service exists with no DB record. On retry the user gets no slug collision (Railway allows duplicates) but quota is wasted. Implement best-effort rollback with the original error always surfaced.

4. **No provisioning timeout** — Railway infrastructure hangs (`QUEUED` indefinitely, volume migration stuck) are documented. Without a timeout, sites stay in `provisioning` forever. Store `provisioning_started_at`, check in status endpoint, flip to `error` after 15 minutes.

5. **Silent swallow of unknown Railway statuses** — `SLEEPING`, `SKIPPED`, `REMOVED`, and other Railway statuses cause sites to stay in `provisioning` without errors. Add exhaustive handling: known in-progress statuses pass through, known terminal statuses transition, unknown statuses after timeout surface as error with the raw Railway status.

## Implications for Roadmap

Based on research, the work naturally groups into three phases ordered by dependency: fix the broken pipeline first, harden its failure modes second, then add the Nginx verification layer on top.

### Phase 1: Fix the Broken Pipeline

**Rationale:** Two bugs are already fixed in code but unverified in production. A third bug (wrong status check) prevents sites from ever going active even with the other bugs fixed. This phase makes creation work at all — nothing else matters until this is true.
**Delivers:** End-to-end site creation that reaches `active` status on Railway
**Addresses:** Status polling correction (`ACTIVE` vs `SUCCESS`), deploy trigger verification, Railway healthcheck configuration via `healthcheckPath`
**Avoids:** "Treating configured as deployed" pitfall; `SUCCESS` vs `ACTIVE` mismatch
**Key changes:** `sites.js` status check (1 line), `railway.js` `createService()` add `healthcheckPath` + `healthcheckTimeout`, verify `serviceInstanceRedeploy` is called last in `deployService()`
**Research flag:** No deeper research needed — all changes are confirmed against Railway docs with HIGH confidence.

### Phase 2: Harden Failure Modes

**Rationale:** Once creation works, production failures will surface (Railway API transient errors, partial failures, stuck deployments). This phase prevents operational debt from accumulating and makes failures self-diagnosing rather than requiring manual DB intervention.
**Delivers:** Rollback on partial failure, provisioning timeout, exhaustive status handling, structured error responses, slug uniqueness guard
**Addresses:** Orphaned Railway services, sites stuck in provisioning, unknown status swallowing, `no_deployments` edge case
**Avoids:** Partial provisioning orphan pitfall, polling-without-timeout pitfall, silent status swallow pitfall
**Key changes:** Try/catch with compensating rollback in `POST /sites`, `provisioning_started_at` column + timeout check in status endpoint, exhaustive Railway status switch, slug check before Railway API call, `failedStep` in error responses, `lib/retry.js` + retry wrapping in `railway.js`
**Research flag:** No deeper research needed — patterns are well-documented and derived from direct codebase analysis.

### Phase 3: Nginx Verification Layer

**Rationale:** Railway's `ACTIVE` status (with healthcheck configured in Phase 1) already confirms Nginx is serving `/health`. This phase adds the dashboard-side verification step that confirms the probe actually passed before marking a site `active`, and adds the `services/nginxVerify.js` module for use in edge cases where the healthcheck is not yet configured on older services.
**Delivers:** HTTP probe integration in status endpoint, `nginxVerify.js` module, UX improvements (domain link visible during provisioning, human-readable status labels)
**Addresses:** "Health check verifying platform not application" pitfall; operator visibility
**Avoids:** False `active` state when container starts but Nginx is not responding
**Key changes:** `services/nginxVerify.js`, integration in `GET /:id/status` after `ACTIVE` confirmation, domain stored in registry immediately after `getServiceDomain()` (before deploy completes)
**Research flag:** No deeper research needed. The `/health` endpoint in `default.conf.template` is confirmed present. The only question is whether Railway's domain is DNS-resolvable from the dashboard server at `ACTIVE` time — test in Phase 1 integration to confirm.

### Phase Ordering Rationale

- Phase 1 before Phase 2: Nothing in Phase 2 can be validated until creation actually works. Hardening a broken pipeline is premature.
- Phase 2 before Phase 3: Nginx verify assumes the deploy completed successfully. Without rollback and timeout, failures in the deploy path interfere with the Nginx verify step — you cannot reliably test "Nginx not responding" vs "deploy never completed."
- Phase 3 last: The Railway healthcheck configured in Phase 1 already does most of the verification work. Phase 3 is an additional assertion layer, not a replacement — it is additive and can be deferred if needed.

### Research Flags

Phases with standard patterns (skip research-phase):
- **Phase 1:** All changes confirmed against Railway official docs; HIGH confidence throughout
- **Phase 2:** Rollback patterns, timeout logic, and retry utilities are standard; no novel integrations
- **Phase 3:** HTTP probe is a trivial `fetch()` call; `/health` endpoint already exists in Docker image

One open question to validate during Phase 1 (not requiring a research phase — just a test):
- Does Railway's assigned domain (`*.up.railway.app`) resolve from the dashboard server at the moment a deployment reaches `ACTIVE`? If not, the `nginxVerify` probe needs a brief retry loop rather than failing immediately.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Changes confirmed against Railway API docs; existing stack validated in production |
| Features | HIGH | Feature list derived from direct codebase analysis + Railway docs; one discrepancy noted (FEATURES.md says `SUCCESS` is correct; STACK.md and PITFALLS.md correctly identify `ACTIVE`) |
| Architecture | HIGH | All patterns derived from reading actual source files; no inference |
| Pitfalls | HIGH | Two pitfalls confirmed from production post-mortems; remaining three verified against Railway docs and Help Station issues |

**Overall confidence:** HIGH

### Gaps to Address

- **`SUCCESS` vs `ACTIVE` discrepancy in FEATURES.md:** FEATURES.md (line 16) states that polling for `SUCCESS` is correct per Railway docs, while STACK.md and PITFALLS.md correctly identify `ACTIVE` as the running state. The official Railway docs confirm `ACTIVE` is correct. FEATURES.md is wrong on this point — the roadmap should treat `ACTIVE` as authoritative.
- **DNS resolution timing:** It is not confirmed whether Railway-assigned domains are DNS-resolvable from within the dashboard server at the exact moment `ACTIVE` status is reported. This should be validated during Phase 1 testing before committing to synchronous Nginx verification in Phase 3.
- **`healthcheckPath` and Railway domain routing:** Railway's healthcheck uses `healthcheck.railway.app` as origin. The current `server_name _;` catch-all in `default.conf.template` will accept it, but this has not been tested end-to-end. Low risk; note for Phase 1 verification.

## Sources

### Primary (HIGH confidence)
- Railway Deployment Statuses / Lifecycle: https://docs.railway.com/deployments/reference
- Railway Manage Deployments API: https://docs.railway.com/guides/manage-deployments
- Railway `ServiceInstanceUpdateInput` (`healthcheckPath`): https://docs.railway.com/guides/manage-services
- Railway Healthchecks: https://docs.railway.com/deployments/healthchecks / https://docs.railway.com/guides/healthchecks-and-restarts
- Railway API token types: https://docs.railway.com/integrations/api
- Direct codebase: `admin-dashboard/src/api/sites.js`, `admin-dashboard/src/services/railway.js`, `admin-dashboard/src/services/siteRegistry.js`, `Dockerfile`, `default.conf.template`
- Production post-mortems: `.planning/debug/sites-provisioning-stuck.md`, `.planning/debug/railway-service-create-auth.md`

### Secondary (MEDIUM confidence)
- Railway Help Station: Volume Migration Stuck — documents indefinite `QUEUED` state from infra hangs
- Railway Help Station: Deploy Stuck at Creating Containers — documents infra-level deploy hangs
- Railway Incident Report Sept 2025 — confirms platform reliability events requiring retry logic

---
*Research completed: 2026-03-12*
*Ready for roadmap: yes*
