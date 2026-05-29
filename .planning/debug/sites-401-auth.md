---
status: awaiting_human_verify
trigger: "sites-401-auth: /sites page returns 401 Unauthorized errors when making API calls to /api/sites"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## Current Focus

hypothesis: setGetToken(() => getToken) wraps getToken in an extra arrow function, causing apiFetch to receive the Clerk getToken function object instead of a token string, resulting in Authorization: Bearer [function] which the backend rejects with 401
test: Read api.js, SitesList.jsx, SiteDetail.jsx to trace the token flow
expecting: Fix confirmed by changing setGetToken(() => getToken) to setGetToken(getToken) in both pages
next_action: Apply fix to SitesList.jsx and SiteDetail.jsx

## Symptoms

expected: /sites page loads and shows user's WordPress sites after logging in
actual: "Invalid session" error shown, 0 sites displayed, all /api/sites calls return 401
errors: Failed to load resource: 401 on GET /api/sites, POST /api/sites returns 401 Unauthorized
reproduction: Navigate to /sites page while logged in via Clerk
started: Recurring issue - "same error we had for a while"

## Eliminated

- hypothesis: Race condition - getToken called before Clerk session loaded
  evidence: isLoaded guard is present in SitesList.jsx, and SiteDetail.jsx sets getToken before calling loadSite
  timestamp: 2026-03-11

- hypothesis: Backend authenticateRequest failing due to missing jwtKey or network JWK fetch failure
  evidence: The header path is taken when Authorization header is present; but the real problem is WHAT is being sent as the token
  timestamp: 2026-03-11

- hypothesis: Clerk session truly invalid
  evidence: The token is never a real JWT - it is the getToken function reference serialized to a string
  timestamp: 2026-03-11

## Evidence

- timestamp: 2026-03-11
  checked: frontend/src/lib/api.js line 8
  found: apiFetch does `const token = getTokenFn ? await getTokenFn() : null` - calls getTokenFn() and awaits it
  implication: getTokenFn must be an async function that returns a token string when invoked

- timestamp: 2026-03-11
  checked: frontend/src/pages/SitesList.jsx line 17
  found: setGetToken(() => getToken) - stores an arrow function () => getToken where the body returns the Clerk getToken function
  implication: When apiFetch calls await getTokenFn(), it awaits a function reference (not a promise), resolving to the getToken function object itself

- timestamp: 2026-03-11
  checked: frontend/src/pages/SiteDetail.jsx line 25
  found: Same bug: setGetToken(() => getToken)
  implication: Both pages send Authorization: Bearer [object Function] which the backend rejects

- timestamp: 2026-03-11
  checked: @clerk/backend authenticateRequest flow
  found: When Authorization header is present, it calls verifyToken(sessionTokenInHeader, ...) which validates a JWT string
  implication: Sending a function's toString() as the Bearer token will always fail JWT verification -> 401

## Resolution

root_cause: Both SitesList.jsx and SiteDetail.jsx call setGetToken(() => getToken) which wraps Clerk's getToken function in an extra arrow function. When apiFetch calls await getTokenFn(), instead of calling getToken() and getting a JWT string, it gets the getToken function object itself (since the stored function returns it without calling it). This sends "Authorization: Bearer function getToken(...){...}" to the backend, which always fails JWT verification.

fix: Change setGetToken(() => getToken) to setGetToken(getToken) in both pages so getTokenFn IS getToken, and await getTokenFn() correctly calls getToken() and returns a real JWT string.

verification: Fix applied. setGetToken(getToken) now correctly registers Clerk's getToken function directly. apiFetch will call getToken() and receive a real JWT string to send as the Bearer token.
files_changed:
  - admin-dashboard/frontend/src/pages/SitesList.jsx
  - admin-dashboard/frontend/src/pages/SiteDetail.jsx
