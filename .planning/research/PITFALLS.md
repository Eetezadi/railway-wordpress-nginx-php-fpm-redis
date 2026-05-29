# Pitfalls Research

**Domain:** Railway service provisioning pipeline — reliability, health checks, deployment verification
**Researched:** 2026-03-12
**Confidence:** HIGH (two bugs already confirmed from production; Railway API behavior verified against official docs)

## Critical Pitfalls

### Pitfall 1: Treating "Configured" as "Deployed"

**What goes wrong:**
A service creation pipeline sets environment variables, creates a volume, and assigns a domain — then returns "provisioning" and waits for Railway to report a successful deployment. But Railway never deploys unless explicitly triggered. The service sits in a permanently configured-but-not-deployed state. The status poller gets `no_deployments` indefinitely, which it silently ignores, so the site never transitions out of "provisioning."

**Why it happens:**
Developers conflate Railway's configuration step (setting variables, creating volumes) with deployment. The Railway API separates these: configuration mutations are idempotent and synchronous; a deployment is a distinct async action that must be explicitly triggered via `serviceInstanceRedeploy` or `serviceInstanceDeployV2`. Nothing in the configuration mutations indicates that a deploy will follow.

**How to avoid:**
Always call `serviceInstanceRedeploy` (or `serviceInstanceDeployV2`) as the final step of any provisioning sequence, after all variables, volumes, and domains are set. Treat the deploy trigger as a mandatory step, not an optional one. The current code in `deployService()` now does this — protect it from regression by adding a comment marking it as required.

**Warning signs:**
- `getServiceStatus()` returns `'no_deployments'` for a newly created service
- Site stays in `provisioning` status beyond 5 minutes
- Railway dashboard shows the service exists but has zero deployments listed

**Phase to address:**
Phase: End-to-end pipeline verification — add an assertion after `triggerDeploy()` that the Railway API confirms at least one deployment was created (query `deployments(first: 1)` immediately after triggering and fail fast if it returns empty).

---

### Pitfall 2: Silent Swallow of Unknown Deployment Statuses

**What goes wrong:**
The status poller only handles `SUCCESS`, `FAILED`, and `CRASHED`. Railway's GraphQL API returns ten possible statuses: `BUILDING`, `DEPLOYING`, `SUCCESS`, `FAILED`, `CRASHED`, `REMOVED`, `SLEEPING`, `SKIPPED`, `WAITING`, and `QUEUED`. Any status outside the handled set is silently ignored — the site stays in "provisioning" with no error and no timeout. `SLEEPING`, `SKIPPED`, and `WAITING` are real states that can persist.

**Why it happens:**
The initial poller was written when only a few statuses were known. The Railway API enum has more states than documented in the narrative docs — the complete list is only visible in the GraphQL playground under `DeploymentStatus`. Developers write against the documented happy path and miss the long tail.

**How to avoid:**
Add a catch-all branch after all known terminal states: any status that persists beyond a configurable timeout (e.g., 10 minutes) should flip the site to `error` with the actual Railway status logged. The `no_deployments` error branch already added is a good pattern — extend it to all unrecognized statuses.

**Warning signs:**
- Status check logs show a Railway status that is not `SUCCESS`, `FAILED`, or `CRASHED` but the site never updates
- Railway dashboard shows deployment in `SLEEPING` or `SKIPPED` state
- Site remains in `provisioning` for more than 10 minutes

**Phase to address:**
Phase: Status polling hardening — implement an exhaustive switch/map over all known Railway statuses plus a timeout-based fallback that surfaces the raw Railway status to the error message.

---

### Pitfall 3: Partial Provisioning Leaving Orphaned Railway Resources

**What goes wrong:**
The creation pipeline runs sequentially: `createDatabase` → `createSite` (DB record) → `createService` (Railway) → `deployService` (vars + volume + domain + redeploy). If any step after `createService` fails, a Railway service exists that the dashboard has no record of (or a corrupted record), and a MySQL database was created but will never be used. On the next creation attempt the user gets a duplicate slug error or the old orphaned service consumes quota.

**Why it happens:**
The pipeline has no compensating transaction (rollback). External APIs — Railway, MySQL — are not transactional. A partial failure leaves external state that cannot be undone automatically. The current code catches the outer error and returns 500, but does not attempt cleanup of already-created resources.

**How to avoid:**
Wrap the creation pipeline in a try/catch that attempts rollback in reverse order: if `deployService` fails, call `deleteService`; if `createService` fails, there is no Railway resource to clean but the DB record and MySQL database need removal. Log every partial cleanup attempt. Accept that cleanup may also fail — the goal is best-effort, not guaranteed atomicity. Expose a "purge orphaned" admin endpoint (already exists for soft-deleted sites; extend for provisioning-stuck sites).

**Warning signs:**
- Sites stuck in `provisioning` for more than 10 minutes with `error` status but no corresponding Railway service visible in the Railway dashboard
- Duplicate slug errors on re-creation attempts
- Railway service count grows but dashboard site count does not match

**Phase to address:**
Phase: Error handling and cleanup — implement try/catch with best-effort compensating cleanup, add a stuck-provisioning sweep that marks sites as `error` after a timeout, and expose purge tooling.

---

### Pitfall 4: Polling Without a Timeout

**What goes wrong:**
The status endpoint only transitions a site out of `provisioning` when Railway reports `SUCCESS`, `FAILED`, or `CRASHED`. If Railway gets stuck (volume migration hang, infra outage, `QUEUED` indefinitely — all documented Railway Help Station issues), the site stays in `provisioning` forever. The user cannot recover without manual DB intervention.

**Why it happens:**
Polling loops are written for the happy path. Timeout logic is added later, if at all. Railway infrastructure issues causing indefinitely-stuck deployments are a documented category of Railway Help Station questions.

**How to avoid:**
Store `provisioning_started_at` when a site enters provisioning. In the status endpoint, if the site has been provisioning for more than a configured threshold (suggest: 15 minutes for a Docker build from scratch), flip to `error` with a message like "Provisioning timed out — check Railway dashboard." Do not rely on Railway to report failure — Railway may not report anything if it is stuck.

**Warning signs:**
- Site has been in `provisioning` for more than 15 minutes
- Railway dashboard shows deployment in `QUEUED` or `BUILDING` for an unusually long time
- No build logs appearing in Railway dashboard

**Phase to address:**
Phase: Status polling hardening — add `provisioning_started_at` column, implement timeout check in status endpoint.

---

### Pitfall 5: Health Check Verifying Platform Status, Not Application Health

**What goes wrong:**
A site is marked "active" when Railway reports `SUCCESS`. But `SUCCESS` means the container started and Railway's internal checks passed — it does not mean Nginx is actually serving requests or WordPress is responsive. A site with a misconfigured Nginx config, missing environment variable, or failed WordPress install may have Railway status `SUCCESS` while returning 502 or 500 to users.

**Why it happens:**
Developers trust the platform's deployment status as a proxy for application health. The Railway health check, if configured, verifies the process started — not that WordPress is working. The milestone explicitly calls for "Nginx confirmed running" which the Railway status alone cannot provide.

**How to avoid:**
After Railway reports `SUCCESS`, make a real HTTP GET to the site's Railway domain (e.g., `https://<slug>.up.railway.app/`) and verify it returns HTTP 200. Accept 3xx redirects as valid (WordPress redirects on fresh install). Retry up to 3 times with 10-second delays because the container may have just started. Only mark the site `active` after the HTTP probe succeeds. If the probe fails after retries, mark `error` with message "Service started but HTTP probe failed."

**Warning signs:**
- Site shows "active" in dashboard but visiting the domain returns 502 or blank page
- Railway status is `SUCCESS` but no Nginx access logs appear in Railway logs
- WordPress setup page never loads despite "active" status

**Phase to address:**
Phase: Nginx verification — implement HTTP probe as a post-SUCCESS check before transitioning to `active`.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip HTTP probe, trust Railway `SUCCESS` | Simpler code, faster to ship | Sites show "active" while broken; support burden | Never — HTTP probe is the whole point of this milestone |
| No provisioning timeout | No DB schema change needed | Stuck sites accumulate, users cannot self-recover | Never for production |
| No cleanup on partial failure | Simpler error handler | Orphaned Railway services consume quota; re-creation fails | MVP only if purge tooling exists as escape hatch |
| Single Railway status poll per request | Simple implementation | Does not catch Railway's transient stuck states | Acceptable — polling on demand is fine for this scale |
| In-process polling (setInterval in API server) | No extra infrastructure | Polling stops if server restarts | Acceptable — the on-demand status-check pattern (poll on page load) is more robust than a background timer |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Railway GraphQL API | Using `backboard.railway.app` endpoint — works for some mutations (read, delete), silently fails auth on `serviceCreate` | Always use `backboard.railway.com/graphql/v2` — the `.com` endpoint is the current canonical URL |
| Railway GraphQL API | Passing `source.repo` in `serviceCreate` input — causes "Problem processing request" | Create empty service first, then call `serviceConnect` separately to attach the repo |
| Railway deployment status | Comparing against `'SUCCESS'` (uppercase) — the API returns uppercase enum values | The current code is correct; do not normalize to lowercase or you will miss matches |
| Railway health checks | Configuring Railway's built-in health check on the `/health` path without a corresponding Nginx location block | Either add the Nginx location block or rely on the external HTTP probe instead of Railway's built-in healthcheck |
| Railway health checks | Expecting Railway's built-in healthcheck to continuously monitor the service | Railway's healthcheck only fires at deploy startup, not continuously — external monitoring must be separate |
| Railway volumes | Creating a volume after `serviceConnect` and `serviceInstanceUpdate` — ordering appears flexible | Confirm volume creation before `triggerDeploy`; creating a volume after a deploy may trigger a volume migration queue |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Polling Railway API on every status check request | Slow status endpoint, Railway rate limits hit | Cache Railway status for 5–10 seconds per site in memory | At 10+ sites simultaneously in provisioning |
| HTTP probe blocking the status endpoint response | Status endpoint hangs for up to 30 seconds | Run HTTP probe async with a short timeout (5s), return `provisioning` if probe not yet complete | Immediately if probe target is slow or unreachable |
| `lastCreateTime` in-memory rate limit | Resets on server restart; does not protect across multiple dashboard instances | Acceptable for single-instance Railway deployment | If dashboard is ever scaled to 2+ instances |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| HTTP probe making requests to user-controlled domain | SSRF if domain input is not sanitized | The Railway domain is generated by Railway's API, not user input — no SSRF risk in current design |
| Logging full Railway API token in error messages | Token exposed in Railway log stream | The current `gql()` error logger logs query and variables but not the auth header — verify this remains true if logging is expanded |
| Allowing any caller to trigger site creation without rate limiting | Resource exhaustion, Railway quota abuse | The `lastCreateTime` check exists; ensure Clerk auth middleware protects the POST endpoint at the router level |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing spinner with no status text during provisioning | User does not know if something is wrong or how long to wait | Show elapsed time and current step (e.g., "Building image — 2 min 30 sec") |
| Marking site "active" with no way to visit it | User does not know the deploy succeeded | Show the Railway domain as a clickable link immediately when available (domain is returned before deploy completes) |
| Surfacing raw Railway error codes (e.g., "CRASHED") without explanation | User does not know what to do | Map Railway statuses to human-readable messages with a suggested action |
| No feedback when site creation fails partway | User sees error but site record remains in DB — re-creating same name fails | On error, immediately attempt cleanup and show specific step that failed |

---

## "Looks Done But Isn't" Checklist

- [ ] **triggerDeploy call:** Pipeline calls `serviceInstanceRedeploy` after all configuration — verify it is the last step, not accidentally removed
- [ ] **HTTP probe:** Status endpoint checks Railway status AND performs HTTP GET before marking "active" — Railway `SUCCESS` alone is insufficient
- [ ] **Timeout:** Sites that stay in `provisioning` beyond 15 minutes are automatically marked `error` — no manual DB intervention required
- [ ] **Partial failure cleanup:** If any step in the pipeline throws, Railway service and MySQL database are cleaned up (best-effort)
- [ ] **Unknown status handling:** Railway statuses beyond `SUCCESS`/`FAILED`/`CRASHED` do not cause silent indefinite provisioning — they eventually surface as errors
- [ ] **No_deployments branch:** The `no_deployments` case marks the site as `error` rather than staying in `provisioning` — this branch exists and is tested
- [ ] **Domain available before active:** The Railway domain is stored in `railway_domain` immediately after `getServiceDomain()` — users can see the URL even while provisioning

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Site stuck in provisioning (missing triggerDeploy) | LOW | Call `serviceInstanceRedeploy` manually via Railway API or dashboard; site will transition to active/error naturally |
| Orphaned Railway service (no DB record) | LOW | Delete service from Railway dashboard; no data loss since WordPress volume is fresh |
| Orphaned DB record (Railway service deleted) | LOW | Use existing "Purge Deleted" button after marking site deleted; extend to cover provisioning-error state |
| Site marked active but Nginx not responding | MEDIUM | Check Railway service logs; redeploy from Railway dashboard; investigate Nginx config / env vars |
| Provisioning timed out due to Railway infra issue | LOW | Delete and re-create site; Railway infrastructure issues are transient — retry usually succeeds |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Treating configured as deployed (missing triggerDeploy) | Phase 1: Pipeline end-to-end verification | Create site, confirm Railway shows at least 1 deployment, confirm site reaches `active` |
| Silent swallow of unknown Railway statuses | Phase 2: Status polling hardening | Simulate `SLEEPING`/`WAITING` status (or check all branches in code); confirm unknown status eventually surfaces as error |
| Partial provisioning leaving orphans | Phase 2: Error handling and cleanup | Force-fail at each pipeline step in staging; confirm rollback removes Railway service and MySQL database |
| Polling without a timeout | Phase 2: Status polling hardening | Create site, manually kill Railway deployment, confirm site transitions to `error` within 15 minutes |
| Health check verifying platform, not app (Railway SUCCESS != 200 from Nginx) | Phase 3: Nginx verification | Deploy site with intentionally broken Nginx config; confirm dashboard shows `error` not `active` |

---

## Sources

- `.planning/debug/sites-provisioning-stuck.md` — Production post-mortem: missing `triggerDeploy` call; `no_deployments` silent swallow
- `.planning/debug/railway-service-create-auth.md` — Production post-mortem: deprecated `.railway.app` endpoint vs `.railway.com`
- [Railway Deployments Reference](https://docs.railway.com/reference/deployments) — Full deployment lifecycle and status list (HIGH confidence)
- [Railway Manage Deployments API](https://docs.railway.com/guides/manage-deployments) — Complete status enum: `BUILDING`, `DEPLOYING`, `SUCCESS`, `FAILED`, `CRASHED`, `REMOVED`, `SLEEPING`, `SKIPPED`, `WAITING`, `QUEUED` (HIGH confidence)
- [Railway Manage Services API](https://docs.railway.com/integrations/api/manage-services) — Mutation list; two-step create + connect pattern confirmed (HIGH confidence)
- [Railway Healthchecks](https://docs.railway.com/deployments/healthchecks) — 300s default timeout; only fires at deploy startup; hostname `healthcheck.railway.app`; requires HTTP 200 (HIGH confidence)
- [Railway Help Station: Volume Migration Stuck](https://station.railway.com/questions/service-deployment-stuck-in-queued-wai-7922ebe8) — Documented infrastructure hang causing indefinite `QUEUED` state (MEDIUM confidence)
- [Railway Help Station: Creating Containers Stuck](https://station.railway.com/questions/deploy-stuck-at-creating-containers-d2ed076a) — Documented infra-level hangs during deploy (MEDIUM confidence)

---
*Pitfalls research for: Railway WordPress multi-site dashboard — reliable site creation pipeline*
*Researched: 2026-03-12*
