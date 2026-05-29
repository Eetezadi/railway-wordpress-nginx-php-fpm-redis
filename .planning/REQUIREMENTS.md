# Requirements: Railway WordPress Multi-Site Dashboard

**Defined:** 2026-03-12
**Core Value:** Reliably create and manage independent WordPress+Nginx sites on Railway from a single dashboard

## v1 Requirements

Requirements for milestone v1.0 — Reliable Site Creation. Each maps to roadmap phases.

### Pipeline Fix

- [x] **PIPE-01**: User can create a site and it transitions from provisioning to active (verify triggerDeploy + .railway.com endpoint in production)
- [x] **PIPE-02**: Status poller checks for Railway's `ACTIVE` status instead of `SUCCESS`

### Nginx Verification

- [x] **NGNX-01**: New services are created with `healthcheckPath: '/health'` so Railway verifies Nginx is responding before marking deploy as active

### Failure Handling

- [ ] **FAIL-01**: If service creation fails mid-pipeline, orphaned Railway service is cleaned up automatically
- [ ] **FAIL-02**: Sites stuck in provisioning longer than 15 minutes are marked as error with a timeout message

## Future Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Reliability

- **RELY-01**: Retry wrapper with backoff for transient Railway API errors
- **RELY-02**: All 10 Railway deployment statuses handled explicitly in status poller

### UX

- **UX-01**: Dashboard HTTP probe confirms Nginx responds after Railway marks deploy active
- **UX-02**: Nginx status shown in site detail UI

## Out of Scope

| Feature | Reason |
|---------|--------|
| Serverless function extraction | Keep creation logic in dashboard server for now |
| Custom domain management | Separate milestone |
| WordPress multisite (network) | Using separate databases per site instead |
| Dashboard-side HTTP probe | Railway healthcheck is sufficient for v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | Phase 1 | Complete |
| PIPE-02 | Phase 1 | Complete |
| NGNX-01 | Phase 1 | Complete |
| FAIL-01 | Phase 2 | Pending |
| FAIL-02 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 5 total
- Mapped to phases: 5
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 — traceability populated after roadmap creation*
