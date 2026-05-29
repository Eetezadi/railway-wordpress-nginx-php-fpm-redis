# Repo learning summary: railway-wordpress-cache

Date: 2026-05-15

## Scope inspected

Inspected sibling project at `/home/nick/Documents/railway-wordpress-nginx-php-fpm-redis/railway-wordpress-cache`.

Files/folders reviewed:

- `RAILWAY_CACHE_README.md`
- `Dockerfile`
- `docker-entrypoint.sh`
- `nginx.conf`
- `default.conf.template`
- `wp-config-custom.php`
- `cache-system/railway-cache-manager.php`
- `cache-system/advanced-cache.php`

## What it is

`railway-wordpress-cache` is a standalone Railway WordPress cache variant. It contains Docker, Nginx, PHP-FPM, WordPress config, and cache-system files. It does not contain the admin dashboard app or package-manager project files.

## Architecture

The cache design has three layers:

1. Nginx FastCGI full-page cache at `/var/cache/nginx`.
2. WordPress `advanced-cache.php` page-cache drop-in under `wp-content/cache/railway-page/`.
3. Redis object-cache configuration support through `wp-config-custom.php`.

`Dockerfile` builds from `wordpress:6-php8.3-fpm-alpine`, installs Nginx, WP-CLI, Redis PHP extension, and PHP extensions `gd`, `zip`, and `opcache`, then copies cache-system files into `/usr/local/share/railway-cache-system`.

`docker-entrypoint.sh` generates PHP/Nginx runtime config, runs `nginx -t`, initializes WordPress through the upstream entrypoint, installs the MU plugin and `advanced-cache.php`, injects custom config, enables `WP_CACHE`, fixes ownership, then starts Nginx and PHP-FPM.

## Important implementation details

- `nginx.conf` defines FastCGI cache zone `WORDPRESS`, cache path `/var/cache/nginx`, cache key `"$scheme$request_method$host$request_uri"`, and bypass rules for logged-in cookies, AJAX, WooCommerce session/cart cookies, comment-author cookies, admin/login endpoints, and dynamic query strings.
- `default.conf.template` adds static asset caching, security headers, `/health`, XML-RPC blocking, upload PHP blocking, and PHP FastCGI cache headers.
- `cache-system/railway-cache-manager.php` is an MU plugin that purges cache on content/comment/taxonomy/theme/customizer/widget/menu/WooCommerce changes, adds admin-bar purge actions, and registers `wp railway-cache` CLI commands.
- `cache-system/advanced-cache.php` handles frontend GET requests, bypasses dynamic/excluded/logged-in requests, serves cached serialized payloads, and writes new `.cache` files via output buffering.

## Notes for future work

- Railway persistence requires a volume mounted at `/var/cache/nginx`.
- The README references `cache-system/nginx-purge.php`, but that file was not present during inspection.
- Targeted WordPress file-cache purge in `railway-cache-manager.php` deletes `.html` and `.gz` files, while `advanced-cache.php` writes `.cache` files. Full recursive purge still clears the directory.

## Workspace files updated

- `_config/repo-map.md`
- `_config/learned-context.md`
- `_config/project.md`
- `CONTEXT.md`
- `permissions.md`
