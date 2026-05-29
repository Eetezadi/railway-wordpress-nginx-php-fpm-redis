---
status: awaiting_human_verify
trigger: "WordPress dashboard fails to create new sites with Railway API: Not Authorized on serviceCreate mutation"
created: 2026-03-12T00:00:00Z
updated: 2026-03-12T00:00:00Z
---

## Current Focus

hypothesis: API endpoint is wrong (.railway.app vs .railway.com) causing auth failures on some mutations
test: Change endpoint from backboard.railway.app to backboard.railway.com
expecting: serviceCreate should succeed with correct endpoint
next_action: Apply fix and verify

## Symptoms

expected: Creating a site from the dashboard should spin up a new WordPress-nginx service in Railway, reusing existing MySQL and Redis
actual: Railway API returns "Not Authorized" INTERNAL_SERVER_ERROR on serviceCreate mutation. Also shows 0 sites.
errors: Railway API: [{"message":"Not Authorized","locations":[{"line":3,"column":7}],"path":["serviceCreate"],"extensions":{"code":"INTERNAL_SERVER_ERROR","traceId":"374648752488492400"}}]
reproduction: Enter any site name in dashboard and click "Create Site"
started: After deploying delete functionality

## Eliminated

## Evidence

- timestamp: 2026-03-12T00:01:00Z
  checked: railway.js endpoint URL
  found: Code uses https://backboard.railway.app/graphql/v2 but Railway docs now specify https://backboard.railway.com/graphql/v2
  implication: Deprecated endpoint may not properly authorize newer mutations like serviceCreate

- timestamp: 2026-03-12T00:02:00Z
  checked: Whether deleteService works with same token
  found: User confirmed previous sites were deleted successfully, meaning deleteService works with current token
  implication: Token itself is valid, but the .app endpoint may handle different mutations differently

- timestamp: 2026-03-12T00:03:00Z
  checked: Railway Help Station threads about Not Authorized on serviceCreate
  found: Multiple users report auth issues; solution involves using correct endpoint (.com) and correct token type (personal/account token, not project token)
  implication: Two potential issues - endpoint URL and token type. Endpoint fix is the most likely since delete works

## Resolution

root_cause: API endpoint URL uses deprecated backboard.railway.app domain instead of backboard.railway.com. The .app endpoint may not properly handle auth for serviceCreate mutations. Secondary: if RAILWAY_API_TOKEN is a project-scoped token, serviceCreate may require a personal/account API token.
fix: Update endpoint from backboard.railway.app to backboard.railway.com in railway.js
verification: pending user deployment test
files_changed: [admin-dashboard/src/services/railway.js]
