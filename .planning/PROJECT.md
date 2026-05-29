# Railway WordPress Multi-Site Dashboard

## What This Is

A management dashboard that provisions and manages multiple WordPress sites on Railway. Each site gets its own WordPress+Nginx service (built from a shared Docker image) while reusing a common MySQL database server and Redis cache. The dashboard handles service creation, deployment, domain assignment, password management, and site lifecycle.

## Core Value

Reliably create and manage independent WordPress+Nginx sites on Railway from a single dashboard, reusing shared infrastructure.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Docker image bundles WordPress 6 + Nginx + PHP-FPM + Redis on Alpine
- ✓ Dynamic domain detection via HTTP_HOST header
- ✓ Security hardening (XML-RPC blocked, wp-config protected, uploads PHP execution blocked)
- ✓ Dashboard UI with Clerk authentication
- ✓ Site list, site details, status polling
- ✓ Password reset (direct and email methods)
- ✓ Site deletion with soft-delete and purge

### Active

<!-- Current scope. Building toward these. -->

- [ ] Reliable site creation pipeline (service create → deploy → active)
- [ ] Nginx verified running on all deployed sites
- [ ] Error handling and status visibility during provisioning

### Out of Scope

- Serverless function extraction — keep creation logic in dashboard server
- Custom domain management — future milestone
- WordPress multisite (wp-admin network) — using separate databases per site instead

## Context

- Deployed on Railway platform using Railway GraphQL API for service management
- Recent bugs fixed: API endpoint changed from .railway.app to .railway.com, missing triggerDeploy call causing sites stuck in provisioning
- Both fixes awaiting production verification
- Dashboard: React + Vite frontend, Hono.js backend, Clerk auth
- Each new site gets: own Railway service, own MySQL database, own Redis prefix, own volume, own domain

## Constraints

- **Platform**: Railway — all services must work within Railway's container hosting model
- **Infrastructure**: Shared MySQL and Redis across all WordPress sites
- **Auth**: Clerk for dashboard, Railway API token for service management
- **Docker**: Single Dockerfile in repo root builds the WordPress+Nginx image

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bundle Nginx + PHP-FPM in one container | Railway charges per service; combining reduces cost | ✓ Good |
| Separate DB per site (not WP multisite) | Isolation, independent backups, simpler management | ✓ Good |
| Shared Redis with per-site prefix | Cost-effective caching without cross-site contamination | — Pending |
| Hono.js for API server | Lightweight, runs well on Railway | ✓ Good |

## Current Milestone: v1.0 Reliable Site Creation

**Goal:** Make the site creation pipeline reliably produce working WordPress+Nginx services and verify Nginx is running on deployed sites.

**Target features:**
- Verified end-to-end site creation (create → deploy → active)
- Nginx confirmed running on provisioned sites
- Clear error reporting when provisioning fails

---
*Last updated: 2026-03-12 after milestone v1.0 started*
