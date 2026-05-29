# Project overview

## Project name

Deploy and Host WordPress Nginx PHP-FPM Redis on Railway

## Purpose

Provide a production-ready WordPress deployment template for Railway using Nginx, PHP-FPM, Redis, MySQL, and supporting admin tooling.

## Users/customers

- WordPress site owners deploying to Railway.
- Developers who need a hardened WordPress container with Redis caching.
- Operators managing WordPress sites and related infrastructure.

## Main product goal

Make it easy to deploy and operate a performant, secure WordPress stack on Railway with minimal manual configuration.

## Current status

- Existing repo with Docker/Railway deployment files, WordPress runtime configuration, and an `admin-dashboard/` Node/React application.
- Adjacent sibling `../railway-wordpress-cache/` contains a cache-focused standalone WordPress image variant with Nginx FastCGI cache, a WordPress `advanced-cache.php` drop-in, and an MU plugin for cache purging.

## Tech stack

- WordPress 6 on PHP 8.3 FPM Alpine
- Nginx
- Redis PHP extension and Redis object caching support
- Railway managed MySQL and Redis
- WP-CLI
- Node.js admin dashboard using Hono
- React 19 frontend using Vite
- Clerk authentication
- AWS S3 SDK
- MySQL via `mysql2`
- WebSockets via `ws`

## Important constraints

- Do not move real source code into `ai-workspace/`.
- Deployment config may affect production behavior; change carefully.
- Environment files and secrets must not be overwritten.
- Railway production configuration changes require explicit intent.

## Known risks

- Root Docker and Nginx files are load-bearing deployment configuration.
- WordPress domain, Redis, and database environment handling must remain compatible with Railway.
- Admin dashboard touches infrastructure services, database state, authentication, and backups.
- Adjacent cache variant has load-bearing cache invalidation behavior; verify cache filename conventions and documented file inventory before using it as the production source of truth.
