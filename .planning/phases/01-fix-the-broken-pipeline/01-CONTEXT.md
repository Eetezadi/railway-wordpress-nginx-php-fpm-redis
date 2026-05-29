# Phase 1: Fix the Broken Pipeline - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Make end-to-end site creation reach `active` status in production. Fix the status poller to recognize Railway's `ACTIVE` status, verify the triggerDeploy fix works, and add a healthcheckPath so Railway verifies Nginx+PHP-FPM before marking a deploy active. This phase covers the happy path only — failure hardening (rollback, timeouts) belongs to Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Health check endpoint
- Nginx + PHP-FPM check: a PHP script returns `{"status":"ok"}` — proves both Nginx and PHP-FPM are running
- Baked into Docker image at build time (e.g., /var/www/html/health.php) so it's always present and can't be overwritten
- healthcheckPath set during the existing `serviceInstanceUpdate` call in `createService()` — minimal code change
- Response body: JSON `{"status":"ok"}` (extensible later)

### Status mapping
- Minimal fix: change `SUCCESS` → `ACTIVE` in the status poller (line 51 of sites.js)
- Keep FAILED/CRASHED → error. Everything else stays as 'provisioning'
- `no_deployments` stays as error — with triggerDeploy working, this means something went wrong
- Include raw Railway status in error_message for debugging (keep existing pattern)
- Full status handling (SLEEPING, REMOVING, all 10 statuses) deferred to future work (RELY-02)

### Verification approach
- Manual verification: create a test site via dashboard, watch it transition to active, then delete
- Add step-level console logging to status poller transitions (create endpoint already has logging)
- Include a verification checklist in phase output documenting exact steps
- Railway accepting deploy with healthcheckPath is sufficient proof /health works — no separate curl needed

### Deploy trigger safety
- No guard before triggerDeploy — pipeline order guarantees repo is connected
- triggerDeploy failure throws and aborts site creation (fail fast, clear error)
- No rollback on failure — orphan cleanup is Phase 2 (FAIL-01)
- No delay between serviceConnect and serviceInstanceRedeploy — Railway mutations are synchronous

### Claude's Discretion
- Exact health.php implementation details
- Log message formatting and verbosity
- Verification checklist wording

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `railway.js:createService()` already calls `serviceInstanceUpdate` — add healthcheckPath there
- `railway.js:triggerDeploy()` and `deployService()` already exist and are wired correctly
- `railway.js:getServiceStatus()` queries latest deployment status

### Established Patterns
- Railway API wrapper uses a `gql()` helper for all GraphQL calls
- Error logging pattern: `console.error('Context:', err)` with JSON stringified details
- Status poller in `sites.js` GET `/:id/status` — checks Railway status only when dashboard status is 'provisioning'

### Integration Points
- `admin-dashboard/src/services/railway.js:76-85` — serviceInstanceUpdate where healthcheckPath should be added
- `admin-dashboard/src/api/sites.js:51` — the SUCCESS→ACTIVE fix location
- Docker image Nginx config needs a `/health` location block or PHP script
- Dockerfile needs to COPY health.php into the image

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-fix-the-broken-pipeline*
*Context gathered: 2026-03-12*
