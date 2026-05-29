# Architecture

**Analysis Date:** 2026-03-11

## Pattern Overview

**Overall:** Multi-tier containerized architecture using a custom Docker image combining Nginx web server with PHP-FPM application server, integrated with managed external databases (MySQL and Redis).

**Key Characteristics:**
- Containerized monolithic application running two coordinated processes (Nginx + PHP-FPM)
- Security-hardened WordPress deployment with defensive configurations
- Automatic dynamic domain detection enabling multi-domain support
- Managed service integration (Railway MySQL and Redis) via environment variables
- Graceful process orchestration with signal handling

## Layers

**Web Server Layer (Nginx):**
- Purpose: HTTP request routing, static asset serving, security enforcement, request proxying to PHP-FPM
- Location: `nginx.conf`, `default.conf.template`
- Contains: Nginx configuration for routing, caching, security headers, PHP passthrough
- Depends on: PHP-FPM running on 127.0.0.1:9000
- Used by: All HTTP/HTTPS traffic to the application

**Application Layer (PHP-FPM):**
- Purpose: WordPress application execution, database operations, plugin/theme processing
- Location: Standard WordPress installation at `/var/www/html`
- Contains: WordPress core, plugins, themes, custom configuration injections
- Depends on: MySQL database, Redis cache, environment variables for configuration
- Used by: Nginx via FastCGI protocol on 127.0.0.1:9000

**Configuration Layer:**
- Purpose: Dynamic configuration generation and injection
- Location: `docker-entrypoint.sh`, `wp-config-custom.php`
- Contains: Environment variable processing, config file generation, dynamic domain detection
- Depends on: Environment variables set in Railway service
- Used by: Container initialization and WordPress runtime

**Data Layer:**
- Purpose: Persistent data storage and caching
- Location: External (not in container) - MySQL database and Redis cache
- Contains: WordPress database tables, user data, cached objects
- Depends on: Railway managed services (MySQL, Redis)
- Used by: PHP-FPM application layer via configured connection strings

## Data Flow

**Request Handling:**

1. HTTP request arrives at Nginx on port 80
2. Nginx evaluates request against security rules (blocks XML-RPC, wp-config.php, hidden files, etc.)
3. Nginx routes static assets (JS, CSS, images) directly with 30-day cache headers
4. Nginx routes PHP requests to PHP-FPM on 127.0.0.1:9000 via FastCGI protocol
5. PHP-FPM executes WordPress code, queries database, reads/writes Redis cache
6. PHP-FPM returns response to Nginx
7. Nginx applies response headers (security headers, compression) and sends to client

**Configuration Injection:**

1. Container starts, docker-entrypoint.sh executes
2. PHP configuration generated from environment variables: `PHP_MEMORY_LIMIT`, `PHP_UPLOAD_MAX_FILESIZE`, `PHP_POST_MAX_SIZE`
3. Nginx configuration generated from template with `NGINX_CLIENT_MAX_BODY_SIZE` substitution
4. WordPress files initialized by original WordPress entrypoint at `/var/www/html`
5. Custom wp-config modifications injected into wp-config.php for:
   - Dynamic domain detection via `HTTP_HOST` header
   - Redis connection parameters from environment variables
6. File permissions normalized for www-data user
7. Nginx starts in daemon-off mode (background)
8. PHP-FPM starts in foreground
9. Container waits on first process to exit

**State Management:**

- **Session State:** Stored in Redis cache if Redis Object Cache plugin enabled
- **Database State:** Stored in MySQL via standard WordPress queries
- **Configuration State:** Baked into environment variables, injected at container startup
- **Static Assets:** Cached in browser with 30-day expiration or Railway CDN
- **Application State:** Ephemeral in memory within current PHP-FPM process

## Key Abstractions

**Dynamic Domain Handler:**
- Purpose: Automatically detect and configure WordPress for any domain (Railway native or custom)
- Examples: `wp-config-custom.php` (lines 7-12)
- Pattern: Override `WP_HOME` and `WP_SITEURL` constants based on `HTTP_HOST` header at request time, eliminating database hardcoding

**Security Hardening Layer:**
- Purpose: Block common attack vectors at web server level before reaching application
- Examples: `default.conf.template` (lines 36-72)
- Pattern: Nginx location directives deny access to dangerous paths and file types

**Configuration Injection System:**
- Purpose: Inject runtime configuration into wp-config.php without modifying original files
- Examples: `docker-entrypoint.sh` (lines 37-50)
- Pattern: Sed insertion to require custom file after opening PHP tag, allowing override of constants

**Environment-Driven Configuration:**
- Purpose: Support Railway's managed service integration without manual configuration
- Examples: `wp-config-custom.php` (lines 15-20), `docker-entrypoint.sh` (lines 14-25)
- Pattern: Check for environment variables and define WordPress constants conditionally

## Entry Points

**Container Entrypoint:**
- Location: `docker-entrypoint.sh`
- Triggers: Container startup (Docker CMD or Kubernetes pod initialization)
- Responsibilities: Initialize system, generate configs, inject modifications, start Nginx and PHP-FPM, handle graceful shutdown

**HTTP Entrypoint:**
- Location: Nginx listening on 0.0.0.0:80
- Triggers: Client HTTP requests
- Responsibilities: Route requests, enforce security rules, serve static assets, proxy to PHP-FPM

**WordPress Entrypoint:**
- Location: index.php in `/var/www/html`
- Triggers: All dynamic requests routed by Nginx (`try_files $uri $uri/ /index.php?$args`)
- Responsibilities: Execute WordPress bootstrap, load plugins, execute request handler

**Health Check Entrypoint:**
- Location: `default.conf.template` line 61-65 - /health endpoint
- Triggers: Container orchestration health probes
- Responsibilities: Return 200 response with "healthy\n" body for liveness/readiness checks

## Error Handling

**Strategy:** Multi-layered defensive approach with fail-safe defaults

**Patterns:**

- **Web Server Errors:** Nginx returns appropriate HTTP status codes; errors logged to `/var/log/nginx/error.log`
- **PHP Errors:** Logged per standard PHP configuration; displayed or suppressed based on PHP settings
- **Startup Failures:** Container exits with error code if Nginx test fails (`nginx -t`) or WordPress initialization fails
- **Graceful Shutdown:** SIGTERM/SIGINT trapped with cleanup handler terminating both Nginx and PHP-FPM processes
- **Missing Directories:** Created with proper ownership during build time to prevent startup failures
- **Configuration Errors:** Nginx configuration tested before starting (`nginx -t`); container fails fast if invalid

## Cross-Cutting Concerns

**Logging:**
- Nginx error logs: `/var/log/nginx/error.log`
- Nginx access logs: Disabled for health checks and static assets; enabled for requests
- PHP-FPM logs: Configured per standard PHP-FPM settings
- Application logs: WordPress debug logging configurable via wp-config.php

**Validation:**
- Nginx validates request paths against security rules
- Nginx validates PHP file presence with `try_files` before proxying
- PHP-FPM validates FastCGI requests
- WordPress validates domain against configured values (via dynamic detection in wp-config-custom.php)

**Authentication:**
- Redis: Password-based authentication via `REDIS_PASSWORD` environment variable
- MySQL: User/password authentication via `WORDPRESS_DB_USER` and `WORDPRESS_DB_PASSWORD` environment variables
- WordPress: Standard WordPress user authentication via database
- HTTP: No built-in authentication; relies on WordPress application layer

---

*Architecture analysis: 2026-03-11*
