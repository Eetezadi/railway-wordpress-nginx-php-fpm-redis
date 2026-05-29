# Railway WordPress Hybrid Cache System

A production-grade three-layer caching system for WordPress on Railway, inspired by how Cloudways Breeze coordinates with Varnish — but built specifically for NGINX + Docker containers.

## Architecture

```
Visitor Request
      │
      ▼
┌─────────────────────────────────────────┐
│  Layer 1: NGINX FastCGI Cache           │
│  - Serves HTML directly from disk       │
│  - Bypasses PHP entirely on cache hit   │
│  - Sub-millisecond response time        │
│  - Handles: anonymous visitors          │
└─────────────────────────────────────────┘
      │ Cache miss / Bypass
      ▼
┌─────────────────────────────────────────┐
│  Layer 2: WordPress advanced-cache.php  │
│  - PHP-level page cache fallback        │
│  - Handles: edge cases, exclusions      │
│  - Captures output via ob_start()       │
│  - Writes cache files for next visitor  │
└─────────────────────────────────────────┘
      │ Still no cache
      ▼
┌─────────────────────────────────────────┐
│  Layer 3: Redis Object Cache            │
│  - Caches DB queries, transients        │
│  - Already configured in your template  │
│  - Dramatically reduces DB load         │
└─────────────────────────────────────────┘
```

## Three-Layer Breakdown

### Layer 1: NGINX FastCGI Cache (Server-Level)

**What it does:** NGINX stores complete HTML responses and serves them directly from disk without touching PHP.

**Speed:** Sub-millisecond cache hits — faster than any WordPress plugin can achieve.

**Handles:**
- Anonymous (not logged-in) visitors
- GET requests only
- Standard pages, posts, archives, taxonomy pages

**Bypasses (served dynamically):**
- Logged-in WordPress users (`wordpress_logged_in` cookie)
- POST/PUT/DELETE requests
- AJAX requests (`X-Requested-With: XMLHttpRequest`)
- WooCommerce cart/checkout/account pages
- Query strings with dynamic indicators (`s=`, `cart`, `checkout`, etc.)
- WordPress admin, login, cron endpoints

**Storage:** `wp-content/cache/nginx/` — **inside the WordPress volume** (already persistent on Railway!)

> **Why not `/var/cache/nginx`?** Railway gives each service exactly one volume at `/var/www/html`. Putting the NGINX cache inside `wp-content/cache/nginx/` means it persists across deploys automatically — no extra volume needed.

### Layer 2: WordPress File Cache (Plugin-Level)

**What it does:** A lightweight `advanced-cache.php` drop-in that catches what NGINX misses.

**Speed:** Milliseconds — still avoids full WordPress boot + DB queries on cache hit.

**Handles:**
- Edge cases that slip past NGINX rules
- Fallback if NGINX cache is empty but WordPress cache exists
- Future: logged-in user caching (if enabled)

**Storage:** `wp-content/cache/railway-page/` — survives on persistent volumes

### Layer 3: Redis Object Cache (Already Working)

**What it does:** Caches database query results, transients, and WordPress objects in memory.

**Speed:** Microsecond lookups from Redis memory.

**Status:** Already configured in your Railway template. Just install the Redis Object Cache plugin.

## Comparison: Before vs After

| Metric | Before (No Cache) | After (Hybrid Cache) |
|--------|-------------------|----------------------|
| Anonymous visitor | ~200-500ms | **<1ms** (NGINX) |
| Cache miss (first visit) | ~200-500ms | ~200-500ms (uncached) |
| Logged-in user | ~200-500ms | ~100-200ms (Redis object) |
| Database queries per page | 20-50 | **0-5** (Redis) |

## Files Modified/Created

| File | Purpose |
|------|---------|
| `nginx.conf` | Added FastCGI cache zone + bypass map |
| `default.conf.template` | Added FastCGI cache directives to PHP location |
| `cache-system/railway-cache-manager.php` | MU plugin — cache invalidation, admin UI, WP-CLI |
| `cache-system/advanced-cache.php` | WordPress drop-in — PHP-level page cache fallback |
| `docker-entrypoint.sh` | Sets up cache dirs, installs files, enables WP_CACHE |
| `Dockerfile` | Copies cache system into image |
| `wp-config-custom.php` | Enhanced with cache constants |

## Railway Setup Instructions

### Step 1: Deploy the Modified Template

1. Fork this repo to your GitHub account
2. In Railway, create a new project from your forked repo
3. The cache system will be automatically installed on container start

### Step 2: Volume Setup (Already Done by Template!)

**Good news:** The Railway template **already** creates a persistent volume at `/var/www/html`. Since the cache system stores NGINX cache files inside `wp-content/cache/nginx/` (within the WordPress volume), your cache persists automatically across deploys — **no extra volume needed.**

The cache directories are created by `docker-entrypoint.sh` on every container start if they don't exist.

### Step 3: Install Redis Object Cache Plugin

1. Go to your WordPress admin
2. Navigate to **Plugins** → **Add New**
3. Search for **"Redis Object Cache"** (by Till Krüss)
4. Install and activate
5. Go to **Settings** → **Redis** — it should show "Connected"

### Step 4: Verify Everything Works

#### Check NGINX Cache:
```bash
# SSH into your Railway container (via Railway CLI or dashboard)
railway connect

# Check cache directory (inside WordPress volume)
ls -la /var/www/html/wp-content/cache/nginx/

# You should see hashed subdirectories with cache files
```

#### Check with curl:
```bash
# First request (cache miss)
curl -I https://your-domain.com/
# Look for: X-Cache-Status: MISS

# Second request (cache hit!)
curl -I https://your-domain.com/
# Look for: X-Cache-Status: HIT
# And: X-Cache-Layer: NGINX-FastCGI
```

#### Check WordPress Cache:
```bash
# Check if advanced-cache.php is loaded
curl -I https://your-domain.com/
# Look for: X-Cache-Layer header
```

#### Check Redis:
```bash
# Via WP-CLI
wp redis status

# Or in WordPress admin → Settings → Redis
```

### Step 5: Manage Cache

#### Via Admin Toolbar:
- **Purge All Cache** — clears all layers (NGINX + WordPress file cache)
- **Purge This Page** — clears cache for the current URL only

#### Via WP-CLI:
```bash
# Purge all cache
wp railway-cache purge-all

# Purge specific URL
wp railway-cache purge-url https://your-domain.com/about/

# Show cache statistics
wp railway-cache stats
```

#### Via WordPress Actions:
Cache is automatically purged when you:
- Publish/update/delete a post or page
- Approve/edit/delete a comment
- Change categories/tags (terms)
- Switch themes
- Save customizer changes
- Update widgets or menus
- Change WooCommerce product stock

## How Cache Invalidation Works

When you publish a post, this happens:

1. **Railway Cache Manager** (MU plugin) detects the `save_post` action
2. It collects all affected URLs: the post itself, homepage, category archives, tag archives, author archive, feeds
3. It calculates the MD5 hash of each URL's NGINX cache key (`$scheme$request_method$host$request_uri`)
4. It directly deletes the cache files from `wp-content/cache/nginx/` by their hash path
5. It also clears any WordPress file cache entries for the same URLs

This ensures visitors never see stale content after you make changes.

## How It Works on Railway

### Understanding Volumes on Railway

The Railway WordPress template gives each service **one persistent volume**. For the WordPress + Nginx service:

| Location | Type | Persists? |
|----------|------|-----------|
| `/var/www/html` | **Volume** | **Yes** — survives redeploys |
| `/var/www/html/wp-content/cache/nginx/` | **Inside volume** | **Yes** — cache persists! |
| `/var/www/html/wp-content/mu-plugins/` | **Inside volume** | **Yes** — plugins persist |
| `/var/cache/nginx` | Container filesystem | **No** — wiped on redeploy |
| `/usr/local/share/` | Container filesystem | **No** — image-only |

### Why This Matters for Cloning

When you **clone** a service on Railway, you get:
- ✅ Same Docker image
- ✅ Same environment variables
- ✅ Fresh **empty** volume (old volume is NOT cloned)

**The cache system handles this gracefully** because `docker-entrypoint.sh`:
1. Creates cache directories on the fresh volume
2. Re-installs the MU plugin from the Docker image
3. Re-installs `advanced-cache.php` from the Docker image
4. Ensures `WP_CACHE` is enabled in `wp-config.php`

**But your WordPress content** (posts, themes, plugins, uploads) is NOT cloned — it's on the original volume. To clone properly, you need to either:
- Export/import WordPress content via Tools → Export/Import
- Use WP-CLI: `wp db export` and `wp db import`
- Copy the volume data via Railway's backup/restore

### How the Cache System Survives Redeploys

The cache files are stored on the persistent WordPress volume:

```
/var/www/html/wp-content/cache/
├── nginx/               ← NGINX FastCGI cache (persistent!)
├── railway-page/        ← WordPress file cache (persistent!)
└── railway-config.php   ← Cache configuration (persistent!)
```

When you redeploy, the container is rebuilt but the volume stays. Cache files survive. The only thing that resets is **in-memory** state (Redis, OPcache).

### How It Handles Fresh Deploys

On a brand-new Railway project:
1. Container starts with empty `/var/www/html`
2. `docker-entrypoint.sh` installs WordPress core
3. `docker-entrypoint.sh` copies cache system files from image to volume
4. `docker-entrypoint.sh` creates cache directories
5. `docker-entrypoint.sh` enables `WP_CACHE` in `wp-config.php`
6. First visitor triggers cache creation
7. Subsequent visitors get served from cache

## How It Compares to Breeze

| Feature | Cloudways Breeze | Railway Hybrid Cache |
|---------|-----------------|----------------------|
| **Page cache type** | File-based (PHP) | NGINX FastCGI (server-level) |
| **Cache hits bypass PHP** | No | **Yes** |
| **Logged-in user cache** | Yes (optional) | No (by design, for simplicity) |
| **Varnish integration** | Yes | Replaced with NGINX FastCGI |
| **Redis object cache** | Separate plugin | **Built-in + configured** |
| **Auto-purge on save** | Yes | **Yes** |
| **WooCommerce support** | Yes | **Yes (exclusions)** |
| **Minification** | Yes (built-in) | Use separate plugin (e.g., Autoptimize) |
| **Lazy loading** | Yes (built-in) | Use separate plugin or theme feature |
| **CDN rewrite** | Yes (built-in) | Use separate plugin (e.g., CDN Enabler) |

## Customization

### Adjust Cache Duration

Edit `nginx.conf`:
```nginx
fastcgi_cache_valid 200 302 60m;   # Change 60m to your preferred duration
```

### Add Custom Exclusions

In your theme's `functions.php` or a custom plugin:
```php
add_filter('railway_cache_excluded_patterns', function($patterns) {
    $patterns[] = 'my-custom-endpoint';
    return $patterns;
});
```

### Enable Logged-In User Caching (Advanced)

Logged-in user caching is disabled by default because it adds complexity. If you need it:

1. Edit `nginx.conf` — remove the `wordpress_logged_in` bypass rule
2. Edit `advanced-cache.php` — adjust the cookie detection logic
3. The MU plugin already handles per-user cache variations via cookies

## Troubleshooting

### Cache is always MISS
- Check the cache directory exists: `ls -la /var/www/html/wp-content/cache/nginx/`
- Verify `www-data` owns it: `chown -R www-data:www-data /var/www/html/wp-content/cache/`
- Check you're not logged in (logged-in users bypass cache by design)
- Check for cookies that trigger bypass rules
- Check the `X-Cache-Status` response header — if it shows `BYPASS`, you're hitting a bypass rule

### Cache not persisting across deploys
- Railway volume not attached? Check Railway dashboard → Service → Volumes → should show `/var/www/html`
- The NGINX cache lives at `/var/www/html/wp-content/cache/nginx/` (inside the volume)
- If the volume is attached but cache is still gone, check `docker-entrypoint.sh` ran successfully

### Redis not connecting
- Check environment variables: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- These are automatically set by Railway when you deploy the template

### Admin toolbar not showing cache options
- Must be logged in as admin
- MU plugin must be installed in `wp-content/mu-plugins/`

### 500 errors after deployment
- Check PHP error logs: `tail -f /var/log/nginx/error.log`
- Verify nginx config syntax: `nginx -t`
- Check that cache directories are writable by `www-data`

## Credits

- Inspired by [Cloudways Breeze](https://github.com/Cloudways/breeze) cache plugin architecture
- Built for the [Railway WordPress Nginx PHP-FPM Redis](https://github.com/Eetezadi/railway-wordpress-nginx-php-fpm-redis) template
- Uses the same NGINX FastCGI cache approach used by high-traffic WordPress hosts
