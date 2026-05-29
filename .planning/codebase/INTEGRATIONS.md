# External Integrations

**Analysis Date:** 2026-03-11

## APIs & External Services

**WordPress Repository:**
- WordPress.org Plugin Directory - Source for Redis Object Cache plugin installation
  - Installation: Manual via WordPress admin dashboard post-deployment
  - Plugin: "Redis Object Cache" by Till Krüss
  - Purpose: Provides WordPress hooks to use Redis for persistent object caching
  - Configuration: Activated in WordPress admin after deployment (README.md lines 30-39)

**WP-CLI Repository:**
- GitHub (wp-cli/builds) - Source for WP-CLI binary
  - SDK/Client: `wp-cli` command-line tool
  - Installation: Downloaded in Dockerfile line 33-34
  - Purpose: Command-line WordPress management (plugin list, cache flush, user management, etc.)

## Data Storage

**Databases:**
- MySQL 5.7+ - Primary WordPress data storage
  - Connection: Via environment variables `WORDPRESS_DB_HOST`, `WORDPRESS_DB_NAME`, `WORDPRESS_DB_USER`, `WORDPRESS_DB_PASSWORD`
  - Client: WordPress built-in MySQL client (via `mysqli` PHP extension)
  - Default location (Railway): `${{MySQL.MYSQLHOST}}` variable interpolation
  - Used for: Posts, pages, users, metadata, settings, plugin data

**Cache Storage:**
- Redis 6.0+ - Object cache and session storage
  - Connection: Via environment variables `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
  - Client: `redis` PECL PHP extension (installed in Dockerfile line 28-30)
  - Configuration: Detected at container startup in `wp-config-custom.php` (lines 15-20)
  - Cache prefix: Uses WordPress `WP_REDIS_*` constants
  - Purpose: Persistent object caching for database query reduction (estimated 80%+ improvement per documentation)
  - Session storage: Supported via Redis Object Cache plugin

**File Storage:**
- Local filesystem only - Persistent volume mount
  - Location: `/var/www/html` - WordPress core files, themes, plugins, uploads
  - Persistence: Docker volume mount (required for production)
  - Managed by: WordPress core (wp-admin file upload handler)

## Authentication & Identity

**Auth Provider:**
- WordPress Native - Built-in user authentication
  - Implementation: Standard WordPress user management
  - Storage: MySQL database (`wp_users`, `wp_usermeta` tables)
  - Sessions: PHP-FPM session handling (enhanced by Redis Object Cache plugin for persistence)

**Database Authentication:**
- MySQL credentials via environment variables
  - Username: `WORDPRESS_DB_USER`
  - Password: `WORDPRESS_DB_PASSWORD`
  - No SSH/SSL tunnel configured (direct connection via `WORDPRESS_DB_HOST`)

**Redis Authentication:**
- Password-based authentication
  - Password: `REDIS_PASSWORD` environment variable
  - Port: `REDIS_PORT` environment variable (default 6379)
  - Configuration: Injected in `wp-config-custom.php` (line 18)

## Monitoring & Observability

**Error Tracking:**
- Not configured - No external error tracking service integration detected
- Default: WordPress debug mode configurable via `WP_DEBUG` constant (not detected in current setup)

**Logs:**
- Nginx access/error logs: `/var/log/nginx/error.log` (configured in `nginx.conf` line 4)
- PHP-FPM logs: Default stderr output captured by Docker logging driver
- Approach: Standard Docker container logging (logs sent to stdout/stderr)
- Health endpoint: `/health` returns "healthy\n" via Nginx (for container orchestration)

**Monitoring Hooks:**
- PHP-FPM status endpoint: `/status` (line 41 in `docker-entrypoint.sh`)
- Accessible via FastCGI for container health checks

## CI/CD & Deployment

**Hosting:**
- Railway platform - Container-as-a-Service deployment
  - Services: WordPress app, MySQL database, Redis cache (managed by Railway)
  - Container registry: Docker image built and deployed on Railway
  - Persistent storage: Railway volumes at `/var/www/html`

**CI Pipeline:**
- Dependabot - Automated dependency updates
  - Config: `.github/dependabot.yml`
  - Scope: Docker base image updates (schedule: weekly on Sundays)
  - Pull request creation: Opens up to 5 concurrent PRs
  - Commit prefix: `chore` with scope included
  - Assignee: Eetezadi (configured in line 17-18)

**Deployment Flow:**
1. Docker build on Railway (uses `Dockerfile` at repository root)
2. Image pushed to Railway private registry
3. Container deployed with environment variable injection
4. Entrypoint script runs configuration setup (see `docker-entrypoint.sh`)
5. Nginx and PHP-FPM started in parallel

## Environment Configuration

**Required Environment Variables:**
- `WORDPRESS_DB_HOST` - MySQL hostname
- `WORDPRESS_DB_NAME` - Database name
- `WORDPRESS_DB_USER` - Database username
- `WORDPRESS_DB_PASSWORD` - Database password
- `REDIS_HOST` - Redis server hostname
- `REDIS_PORT` - Redis server port
- `REDIS_PASSWORD` - Redis password

**Optional Environment Variables:**
- `PORT` - Server port (default: 80, typically handled by Railway networking)
- `NGINX_CLIENT_MAX_BODY_SIZE` - Nginx max body size (default: 256M)
- `PHP_UPLOAD_MAX_FILESIZE` - PHP upload limit (default: 256M)
- `PHP_POST_MAX_SIZE` - PHP POST limit (default: 256M)
- `PHP_MEMORY_LIMIT` - PHP memory limit (default: 512M)

**Secrets Location:**
- Railway service variables (managed by Railway dashboard)
- Environment variables injected at container runtime
- `.env.example` - Template file committed to repository (example interpolation syntax for Railway variables)
- No `.env` file in repository (security best practice)

**Auto-Configuration:**
- Database credentials auto-detected from Railway MySQL service
- Redis credentials auto-detected from Railway Redis service
- Domain auto-detection: WordPress reads `HTTP_HOST` header and configures `WP_HOME` and `WP_SITEURL` dynamically (wp-config-custom.php lines 8-12)

## Webhooks & Callbacks

**Incoming:**
- None detected - No webhook listener endpoints configured

**Outgoing:**
- None detected - No external service callback integrations
- WordPress scheduled events: Uses WordPress cron (optional, can be configured with system cron)

## Dynamic Domain Handling

**Architecture:**
- No manual wp-config.php updates needed for new domains
- Process: Railway service receives domain request → Nginx routes to WordPress → PHP reads `$_SERVER['HTTP_HOST']` → Dynamic `WP_HOME`/`WP_SITEURL` configuration (wp-config-custom.php)
- SSL/TLS: Handled by Railway (automatic Certificate provisioning)

## WordPress Plugins

**Required Post-Installation:**
- Redis Object Cache (by Till Krüss) - Must be manually installed and activated
  - Provides WordPress admin interface for Redis connection
  - Enables persistent object caching
  - Installation: Plugins → Add New → Search "Redis Object Cache" → Install Now → Activate

**Pre-Installed Tools:**
- WP-CLI - Command-line WordPress management
  - Examples: `wp plugin list`, `wp cache flush`, `wp user list`

---

*Integration audit: 2026-03-11*
