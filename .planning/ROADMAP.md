# Roadmap: Railway WordPress Multi-Site Dashboard — v1.0 Reliable Site Creation

## Overview

Three known bugs are breaking site creation: a wrong Railway API endpoint, a missing deploy trigger, and a status check looking for `SUCCESS` instead of `ACTIVE`. This milestone fixes those bugs, verifies them in production, then adds failure hardening (rollback on partial creation, provisioning timeout) so that failures self-diagnose rather than requiring manual DB intervention.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Fix the Broken Pipeline** - Make end-to-end site creation reach `active` status in production (completed 2026-03-12)
- [ ] **Phase 2: Harden Failure Modes** - Prevent orphaned services, stuck provisioning, and silent failures

## Phase Details

### Phase 1: Fix the Broken Pipeline
**Goal**: Users can create a site and it reliably reaches active status on Railway
**Depends on**: Nothing (first phase)
**Requirements**: PIPE-01, PIPE-02, NGNX-01
**Success Criteria** (what must be TRUE):
  1. A newly created site transitions from provisioning to active in the dashboard without manual intervention
  2. The status poller recognizes Railway's `ACTIVE` status and marks the site active (not stuck in provisioning)
  3. New services are created with `healthcheckPath: '/health'` so Railway verifies Nginx is responding before marking a deploy active
  4. The `serviceInstanceRedeploy` call is confirmed as the final step in `deployService()` and protected from regression
**Plans:** 1/1 plans complete

Plans:
- [ ] 01-01-PLAN.md — Fix status poller, add healthcheckPath, upgrade /health to PHP-FPM, verify in production

### Phase 2: Harden Failure Modes
**Goal**: Creation failures are self-diagnosing and leave no permanent damage to the system
**Depends on**: Phase 1
**Requirements**: FAIL-01, FAIL-02
**Success Criteria** (what must be TRUE):
  1. If site creation fails mid-pipeline, any orphaned Railway service is automatically deleted and the error is surfaced with a `failedStep` field identifying which step failed
  2. A site stuck in provisioning for more than 15 minutes is automatically marked as error with a timeout message visible in the dashboard
  3. Slug uniqueness is checked before calling the Railway API, preventing duplicate service names from being submitted
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fix the Broken Pipeline | 1/1 | Complete   | 2026-03-12 |
| 2. Harden Failure Modes | 0/? | Not started | - |
