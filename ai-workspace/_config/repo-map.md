# Repo map

## Main folders

- `ai-workspace/` - AI operating workspace, stage contracts, skills, durable context, and outputs.
- `../railway-wordpress-cache/` - Adjacent Railway WordPress cache variant inspected on 2026-05-15; standalone container/cache implementation without the admin dashboard app.
- `admin-dashboard/` - Admin dashboard application.
- `admin-dashboard/src/` - Backend API, middleware, config, and services.
- `admin-dashboard/frontend/` - React/Vite frontend application.
- `admin-dashboard/frontend/src/` - Frontend pages, components, API client, styles, and entrypoint.
- `admin-dashboard/db/` - Database schema.
- `.planning/` - Existing planning, research, debug notes, and prior work summaries.
- `.github/` - GitHub configuration.


## Adjacent cache variant: `../railway-wordpress-cache/`

- Purpose: Railway WordPress image variant focused on a hybrid cache system for Nginx + PHP-FPM + Redis.
- Root files: `Dockerfile`, `docker-entrypoint.sh`, `nginx.conf`, `default.conf.template`, `wp-config-custom.php`, `RAILWAY_CACHE_README.md`.
- Cache implementation: `cache-system/railway-cache-manager.php` and `cache-system/advanced-cache.php`.
- Docker runtime: `wordpress:6-php8.3-fpm-alpine`, Alpine `nginx`, Redis PHP extension via PECL, WP-CLI, PHP extensions `gd`, `zip`, and `opcache`.
- Runtime install flow: image copies cache files to `/usr/local/share/railway-cache-system`; entrypoint copies the MU plugin to `wp-content/mu-plugins/`, installs `advanced-cache.php`, enables `WP_CACHE`, injects `/usr/local/share/wp-config-custom.php`, generates `/etc/nginx/conf.d/default.conf`, tests Nginx config, then starts Nginx and PHP-FPM.
- Cache storage paths: Nginx FastCGI cache at `/var/cache/nginx`; WordPress file cache at `wp-content/cache/railway-page/`; config path referenced as `wp-content/cache/railway-config.php`.

## Root files

- `Dockerfile` - Main WordPress/PHP-FPM/Nginx Docker image.
- `docker-entrypoint.sh` - Custom container entrypoint.
- `default.conf.template` - Nginx site template.
- `nginx.conf` - Base Nginx config.
- `wp-config-custom.php` - WordPress custom configuration.
- `RAILWAY_TEMPLATE.md` - Railway template documentation.
- `README.md` - Public project overview and setup notes.
- `.env.example` - Example environment variables.
- `railwayFIX.js` - Railway-related utility or fix script.

## Where app code lives

- Backend app code: `admin-dashboard/src/`
- Frontend app code: `admin-dashboard/frontend/src/`
- WordPress/container runtime config: repository root files

## Config files

- Root Docker and Nginx config files.
- `admin-dashboard/package.json`
- `admin-dashboard/frontend/package.json`
- `admin-dashboard/Dockerfile`
- `admin-dashboard/frontend/vite.config.js`
- `.env.example`
- `admin-dashboard/.env.example`

## Tests

No obvious test folder or test scripts were found during the initial lightweight inspection. Future agents should re-check before assuming tests are absent.

## Database/schema files

- `admin-dashboard/db/schema.sql`

## Docs and planning

- `README.md`
- `RAILWAY_TEMPLATE.md`
- `.planning/`
- `ai-workspace/`
