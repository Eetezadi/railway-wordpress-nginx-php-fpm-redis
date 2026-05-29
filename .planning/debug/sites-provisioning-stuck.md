---
status: awaiting_human_verify
trigger: "sites-provisioning-stuck"
created: 2026-03-11T21:00:00Z
updated: 2026-03-11T21:05:00Z
---

## Current Focus

hypothesis: deployService() only sets env vars and creates a volume/domain but never triggers a deployment. Without an actual deploy trigger, Railway has no deployment to report — getServiceStatus returns 'no_deployments', which is not 'SUCCESS', so the site stays in 'provisioning' forever.
test: Reviewed deployService() in railway.js — it calls setServiceVariables, createVolume, getServiceDomain. No serviceInstanceRedeploy or equivalent mutation is called.
expecting: Adding a redeploy mutation after variable/volume setup will create a deployment that transitions to SUCCESS, allowing the status poller to flip the site to 'active'.
next_action: Deploy updated code to Railway and create a new test site to confirm it transitions from provisioning -> active.

## Symptoms

expected: Site should provision and become ready within 2-3 minutes
actual: Site stays stuck in PROVISIONING status indefinitely with loading spinner
errors: None visible in the screenshot - just perpetual loading
reproduction: Create a new site called "bba" via the dashboard
started: Just happened after the auth fix was deployed

## Eliminated

- hypothesis: Frontend polling not starting
  evidence: SiteDetail.jsx line 41 — startPolling() is called when status === 'provisioning'. Polling hits GET /sites/:id/status every 5 seconds.
  timestamp: 2026-03-11T21:02:00Z

- hypothesis: Status endpoint not checking Railway
  evidence: sites.js lines 42-55 — it calls getServiceStatus(railway_service_id) when status is 'provisioning'. Logic is correct.
  timestamp: 2026-03-11T21:02:00Z

- hypothesis: railway_service_id not being saved
  evidence: sites.js lines 92-95 — updateSite is called with railway_service_id and domain after createService/deployService. Saving is correct.
  timestamp: 2026-03-11T21:03:00Z

## Evidence

- timestamp: 2026-03-11T21:01:00Z
  checked: admin-dashboard/src/services/railway.js deployService()
  found: deployService sets env vars via variableCollectionUpsert, creates a volume, creates a domain — but never calls any "trigger deploy" or "redeploy" mutation
  implication: Railway service is created and configured but never deployed. There are no deployments, so getServiceStatus returns 'no_deployments'. The status check code only transitions on 'SUCCESS' or 'FAILED'/'CRASHED', so 'no_deployments' is silently ignored and the site stays 'provisioning' forever.

- timestamp: 2026-03-11T21:02:00Z
  checked: admin-dashboard/src/api/sites.js getServiceStatus handler (lines 42-55)
  found: The fallthrough on unknown status (including 'no_deployments') does not update the DB — it just returns the original stored status. Silent no-op.
  implication: Even if Railway returns 'no_deployments', the site stays stuck. No error is surfaced to the user.

- timestamp: 2026-03-11T21:03:00Z
  checked: Railway GraphQL API — known mutations
  found: serviceInstanceRedeploy(input: {serviceId, environmentId}) triggers a deploy of the current service config. This is the missing call.
  implication: Adding this call at the end of deployService() will kick off an actual Railway deployment, which will then progress through statuses and eventually reach SUCCESS.

## Resolution

root_cause: deployService() in railway.js configures a Railway service (env vars, volume, domain) but never triggers an actual deployment. Without a deploy trigger, Railway has no deployments to report. getServiceStatus() returns 'no_deployments', which is not handled as a terminal state, so the site stays in 'provisioning' forever with no path to 'active'.

fix: Add serviceInstanceRedeploy mutation call at the end of deployService(), after all configuration is complete.

verification: awaiting human confirmation — need to create a new site after deploy and confirm it reaches 'active'
files_changed:
  - admin-dashboard/src/services/railway.js (added triggerDeploy() + call at end of deployService())
  - admin-dashboard/src/api/sites.js (added 'no_deployments' error branch so future stuck sites surface visibly)
