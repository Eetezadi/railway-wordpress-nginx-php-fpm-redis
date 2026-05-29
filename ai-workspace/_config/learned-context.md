# Learned context

This is living memory for reusable repo knowledge.

## Durable project facts

- The project is a Railway WordPress deployment template using Nginx, PHP-FPM 8.3, Redis, and MySQL.
- The root deployment stack is based on `wordpress:6-php8.3-fpm-alpine`.
- The repo also contains an `admin-dashboard/` app with a Hono/Node backend and React/Vite frontend.
- `../railway-wordpress-cache/` is an adjacent, standalone cache-focused variant of the WordPress/Railway deployment. It has no `admin-dashboard/` app or package-manager files; it is Docker/Nginx/PHP/WordPress config plus `cache-system/`.

## Architecture notes

- Root files define WordPress container runtime and Nginx/PHP-FPM behavior.
- `admin-dashboard/src/` contains backend API/services/middleware.
- `admin-dashboard/frontend/src/` contains frontend UI code.
- `admin-dashboard/db/schema.sql` contains database schema.


## Adjacent cache variant notes

- `../railway-wordpress-cache/` implements three cache layers: Nginx FastCGI full-page cache, a WordPress `advanced-cache.php` page-cache drop-in, and Redis object-cache configuration support.
- `nginx.conf` defines `fastcgi_cache_path /var/cache/nginx`, key `"$scheme$request_method$host$request_uri"`, and a `$cache_bypass` map for logged-in cookies, non-GET-like requests, AJAX, WooCommerce cart/session cookies, comment-author cookies, admin/login endpoints, and dynamic query strings.
- `default.conf.template` serves static assets with long-lived cache headers, blocks XML-RPC, protects `wp-config.php`, blocks PHP execution in uploads, exposes `/health`, and applies `fastcgi_cache WORDPRESS` in the PHP location with `X-Cache-Status` and `X-Cache-Layer: NGINX-FastCGI` headers.
- `cache-system/advanced-cache.php` only handles frontend GET requests, bypasses AJAX/REST/logged-in/excluded URLs, reads and writes serialized page-cache payloads under `wp-content/cache/railway-page/{sha1-prefix}/{sha1}.cache`, and can store gzip content in the payload.
- `cache-system/railway-cache-manager.php` is an MU plugin that purges caches on post, comment, taxonomy, theme, customizer, widget/menu, and WooCommerce changes; it also adds admin-bar purge actions and `wp railway-cache` CLI commands.
- `docker-entrypoint.sh` generates PHP/Nginx config from env defaults, runs `nginx -t`, initializes WordPress through the upstream entrypoint, installs cache drop-ins, injects custom WordPress config, enables `WP_CACHE`, fixes ownership, and starts Nginx plus PHP-FPM.

## Common commands

From `admin-dashboard/package.json`:

- `npm run dev:api`
- `npm run dev:frontend`
- `npm run build:frontend`
- `npm run start`

From `admin-dashboard/frontend/package.json`:

- `npm run dev`
- `npm run build`
- `npm run preview`

## Common bugs or risks

- Deployment config is production-sensitive.
- Railway environment variable handling affects WordPress, database, Redis, and domains.
- Admin dashboard changes may affect auth, database records, backups, and Railway/S3 integrations.

- In `../railway-wordpress-cache/`, `RAILWAY_CACHE_README.md` lists `cache-system/nginx-purge.php`, but that file was not present during the 2026-05-15 inspection.
- In `../railway-wordpress-cache/`, `advanced-cache.php` writes WordPress file-cache entries as `.cache`, while `railway-cache-manager.php` targeted URL purging unlinks `.html` and `.gz`; full file-cache purge still recursively clears the directory.
- Nginx cache persistence depends on a Railway volume mounted at `/var/cache/nginx`; without it, cache files are lost on deploy/restart.

## User preferences

- Keep language plain and practical.
- Do not rewrite or move the real codebase unless asked.
- Use `ai-workspace/` as the AI control center.

## Decisions made

- `ai-workspace/` was added as a project-local AI operating workspace.
- Real application code remains in its existing locations.

## Things to avoid

- Do not read every source file by default.
- Do not edit application code outside the appropriate stage.
- Do not overwrite environment files or production config without explicit permission.
