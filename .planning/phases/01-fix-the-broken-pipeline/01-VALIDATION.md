---
phase: 1
slug: fix-the-broken-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test infrastructure exists |
| **Config file** | None — Wave 0 not needed (manual verification) |
| **Quick run command** | `grep -n 'triggerDeploy' admin-dashboard/src/services/railway.js` |
| **Full suite command** | Manual: deploy test site, observe Railway dashboard |
| **Estimated runtime** | ~5 seconds (grep) / ~120 seconds (manual deploy) |

---

## Sampling Rate

- **After every task commit:** Run `grep -n 'triggerDeploy' admin-dashboard/src/services/railway.js`
- **After every plan wave:** Manual deploy verification on Railway
- **Before `/gsd:verify-work`:** Full manual verification must pass
- **Max feedback latency:** 5 seconds (grep) / 120 seconds (deploy)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | PIPE-02 | manual | `grep -n 'ACTIVE' admin-dashboard/src/api/sites.js` | N/A (grep) | ⬜ pending |
| 01-01-02 | 01 | 1 | NGNX-01 | manual | `grep -n 'healthcheckPath' admin-dashboard/src/services/railway.js` | N/A (grep) | ⬜ pending |
| 01-01-03 | 01 | 1 | NGNX-01 | manual | `grep -n 'health' default.conf.template` | N/A (grep) | ⬜ pending |
| 01-01-04 | 01 | 1 | NGNX-01 | manual | `grep -n 'health.php' docker-entrypoint.sh` | N/A (grep) | ⬜ pending |
| 01-01-05 | 01 | 1 | PIPE-01 | manual | `grep -n 'triggerDeploy' admin-dashboard/src/services/railway.js` | N/A (grep) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. Manual verification via Railway dashboard is the stated and sufficient approach for Phase 1. No test framework installation needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Site transitions to active after deploy | PIPE-01, PIPE-02 | Requires live Railway deployment | 1. Create test site via dashboard 2. Observe status transitions 3. Confirm final status is "active" |
| Healthcheck configured on service | NGNX-01 | Requires Railway API/dashboard | 1. Create new service 2. Check Railway dashboard for healthcheck field 3. Verify `/health` returns 200 |
| `/health` proves PHP-FPM is alive | NGNX-01 | Requires running container | 1. Deploy container 2. `curl /health` 3. Confirm response comes from PHP-FPM |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
