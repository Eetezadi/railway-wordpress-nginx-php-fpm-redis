# Codebase Concerns

**Analysis Date:** 2026-03-11

## Security Concerns

**Protocol Detection Inconsistency:**
- Issue: `wp-config-custom.php` line 9 hardcodes HTTPS protocol but HTTPS detection logic is incomplete. The code always sets `https://` regardless of actual connection type, contradicting the ternary operator intent.
- Files: `wp-config-custom.php` (lines 9)
- Impact: All HTTP connections are misidentified as HTTPS, potentially breaking mixed-content policies and HSTS headers. WordPress may redirect users incorrectly or fail SSL verification in upstream services.
- Fix approach: Replace hardcoded `https://` with proper protocol detection using the ternary operator result. Check `$_SERVER['HTTPS']`, `$_SERVER['HTTP_X_FORWARDED_PROTO']`, and `$_SERVER['SERVER_PORT']`.

**Redis Password Storage in Environment:**
- Issue: Redis password transmitted via `REDIS_PASSWORD` environment variable without encryption in transit.
- Files: `wp-config-custom.php` (line 18), `docker-entrypoint.sh` (line 16)
- Impact: If container logs are exposed or intercepted, Redis credentials become compromised. Railway's managed service should provide credential rotation mechanisms.
- Fix approach: Ensure Railway's secrets management is used, implement log filtering to exclude Redis credentials from `docker logs` output, consider Redis ACL instead of single password.

**wp-config.php Injection Lacks Idempotency Lock:**
- Issue: `docker-entrypoint.sh` (lines 40-50) checks for injection with `grep` but the check could fail if WordPress hasn't initialized yet on container restart.
- Files: `docker-entrypoint.sh` (lines 37-50)
- Impact: If `/var/www/html/wp-config.php` doesn't exist or container restarts before WordPress initializes, injection logic may execute twice or fail silently, causing undefined behavior.
- Fix approach: Create atomic lock file at `/var/www/html/.wp-config-injected` instead of grepping wp-config.php content.

**Missing Content-Type Header for Health Check:**
- Issue: `default.conf.template` (line 64) has `add_header` after `return 200` which may not execute properly in Nginx.
- Files: `default.conf.template` (lines 61-65)
- Impact: Health check endpoint may not properly advertise text/plain content type, causing parsing issues in load balancers.
- Fix approach: Use Nginx error_page directive or move header above return statement.

## Tech Debt

**Hardcoded Alpine Image Version:**
- Issue: Dockerfile (line 1) uses `wordpress:6-php8.3-fpm-alpine` without explicit pinned version.
- Files: `Dockerfile` (line 1)
- Impact: Major security/stability risk. Image updates can introduce breaking changes or vulnerabilities without notice. Different deployments will have inconsistent versions.
- Fix approach: Pin to specific WordPress image SHA (e.g., `wordpress:6.4.1-php8.3-fpm-alpine-3.19`). Update Dependabot to monitor and auto-update with version pinning.

**WP-CLI Installation Lacks Verification:**
- Issue: Dockerfile (lines 33-34) downloads WP-CLI from GitHub without checksum verification.
- Files: `Dockerfile` (lines 33-34)
- Impact: Man-in-the-middle attacks or GitHub outages could inject compromised WP-CLI executable into production containers.
- Fix approach: Download WP-CLI from signed releases, verify SHA256 before making executable, or use Alpine package manager if available.

**Nginx Configuration Duplication:**
- Issue: `nginx.conf` (line 17) and `default.conf.template` duplicate core Nginx configuration patterns.
- Files: `nginx.conf`, `default.conf.template`
- Impact: Changes to one config may not apply to the other, reducing maintainability. Server blocks in different files could conflict.
- Fix approach: Consolidate into single Nginx configuration file or use proper include statements with explicit path separation.

**Missing Graceful Shutdown Signal Handling in Nginx:**
- Issue: `docker-entrypoint.sh` (line 57) starts Nginx with `daemon off;` but signal handlers only trap cleanup, not actual shutdown propagation to child processes.
- Files: `docker-entrypoint.sh` (lines 55-66)
- Impact: Container shutdown may hang or force-kill processes, risking data loss or incomplete WordPress operations. Nginx workers may not gracefully close connections.
- Fix approach: Use process manager (supervisord) or explicitly handle SIGTERM/SIGINT forwarding to all child processes.

**PHP Memory Limit Default is Conservative:**
- Issue: `docker-entrypoint.sh` (line 19) defaults to `512M`, which may be insufficient for large WordPress sites with memory-intensive plugins.
- Files: `docker-entrypoint.sh` (line 19), `.env.example` (line 34)
- Impact: Memory exhaustion during heavy plugin operations (WooCommerce, backup plugins, image processing) will crash PHP-FPM without graceful recovery.
- Fix approach: Increase default to at least `1G` for production, add memory usage monitoring in health check endpoint, document memory requirements per site size.

## Performance Bottlenecks

**Single Nginx Worker Process Configuration:**
- Issue: `nginx.conf` (line 2) uses `worker_processes auto;` which is correct, but `worker_connections 1024` (line 7) may be too low for high-traffic sites.
- Files: `nginx.conf` (lines 6-8)
- Impact: Connection queue saturation under load (>1024 concurrent connections) will cause request timeouts and dropped connections.
- Fix approach: Increase `worker_connections` to 4096 or higher, make configurable via environment variable, add connection pooling monitoring.

**Missing Caching Headers for Dynamic Content:**
- Issue: `default.conf.template` only caches static assets (line 54-58) but WordPress pages are served with `Cache-Control: no-cache`.
- Files: `default.conf.template` (lines 54-58)
- Impact: Every page request hits the database even with Redis enabled. Full-page caching middleware (like Varnish or Nginx levels) not implemented.
- Fix approach: Add WP Super Cache or W3 Total Cache plugin installation guidance, implement Nginx microcache for dynamic content, document edge-case scenarios.

**No Connection Pooling Between Nginx and PHP-FPM:**
- Issue: `default.conf.template` (line 29) uses single `fastcgi_pass 127.0.0.1:9000` with default keepalive settings.
- Files: `default.conf.template` (lines 26-34)
- Impact: Each request creates new connection overhead, reducing throughput under high concurrency. No connection reuse between requests.
- Fix approach: Add `fastcgi_keep_conn on;` to Nginx config, configure PHP-FPM `max_children` to match expected concurrency, implement connection pooling.

**Database Query Logging Not Mentioned:**
- Issue: No slow query log configuration or database monitoring guidance provided.
- Files: `.env.example`
- Impact: Performance bottlenecks in database queries are invisible without external monitoring. Users may not realize Redis caching isn't working.
- Fix approach: Document how to enable slow query log in Railway's MySQL service, add monitoring recommendations (New Relic, DataDog), provide debugging guide for Redis hit rates.

## Fragile Areas

**Volume Mount Dependency for WordPress:**
- Issue: `docker-entrypoint.sh` (lines 31-34) calls original WordPress entrypoint which expects `/var/www/html` volume to be mounted.
- Files: `docker-entrypoint.sh` (lines 31-34), `Dockerfile` (line 50)
- Impact: If volume mount is missing or misconfigured, entire WordPress installation fails without clear error message. Container starts but serves 404 errors.
- Fix approach: Add explicit volume mount verification in entrypoint, provide clear error messages if mount missing, document volume requirements in README.

**DNS Resolution Dependency:**
- Issue: `wp-config-custom.php` (line 8) reads `$_SERVER['HTTP_HOST']` directly from request header without validation or fallback.
- Files: `wp-config-custom.php` (lines 7-11)
- Impact: If DNS is misconfigured or hostname header is spoofed, WordPress configuration becomes invalid. Subdomain conflicts or header injection attacks possible.
- Fix approach: Validate hostname against whitelist, add fallback to IP-based configuration, implement request header filtering.

**PHP-FPM Connection String Hardcoded:**
- Issue: `default.conf.template` (line 29) hardcodes `127.0.0.1:9000` for PHP-FPM connection.
- Files: `default.conf.template` (line 29)
- Impact: If PHP-FPM configuration changes (socket vs TCP, different port), Nginx configuration becomes outdated. No way to override via environment variable.
- Fix approach: Make PHP-FPM connection string configurable via `envsubst` in `docker-entrypoint.sh`, document as tunable parameter.

**Sed-Based Configuration Injection is Fragile:**
- Issue: `docker-entrypoint.sh` (lines 42-45) uses `sed` to inject code into wp-config.php with escaped newlines.
- Files: `docker-entrypoint.sh` (lines 40-50)
- Impact: If wp-config.php format changes (different line endings, special characters), sed injection could fail or corrupt the file. No rollback mechanism.
- Fix approach: Replace with PHP-based prepending (include statement), store custom config in separate file and require it, use `wp config` WP-CLI command.

## Test Coverage Gaps

**No Automated Testing for Configuration Injection:**
- Issue: wp-config.php injection logic is untested, no verification that custom configuration is properly included.
- Files: `docker-entrypoint.sh` (lines 36-50)
- Impact: Configuration injection could silently fail during deployment without detection. WordPress would run with default hardcoded settings instead of dynamic domain configuration.
- Fix approach: Add Docker build tests using `docker run` with volume assertions, verify HTTP_HOST is correctly resolved, test with multiple domain configurations.

**No Health Check Verification:**
- Issue: Health check endpoint exists but no test validates it responds correctly or that it truly indicates readiness.
- Files: `default.conf.template` (lines 61-65)
- Impact: Container orchestrators (Kubernetes, Docker Swarm) may mark unhealthy containers as ready, causing request failures during deployment.
- Fix approach: Add health check that verifies PHP-FPM is responding (not just Nginx), check database connectivity, verify Redis connection if configured.

**Missing Integration Tests for Redis Configuration:**
- Issue: Redis configuration code path is never tested, only documented as "install Redis Object Cache plugin."
- Files: `wp-config-custom.php` (lines 14-20)
- Impact: If Redis credentials are wrong or connection fails, users won't discover this until runtime. No automatic verification that Redis is properly configured.
- Fix approach: Add startup validation that tests Redis connection before starting Nginx, provide error logs if Redis is unavailable, document troubleshooting steps.

**No Dockerfile Build Tests:**
- Issue: Dockerfile modifications are not tested, no verification that all layers build successfully or that dependencies resolve.
- Files: `Dockerfile`
- Impact: Build failures only discovered on deployment. Broken APK dependencies or corrupted package downloads would cause production failures.
- Fix approach: Add CI/CD pipeline with `docker build` tests, publish to Docker registry with build verification, add security scanning (Trivy, Snyk).

## Missing Critical Features

**No Log Aggregation Configuration:**
- Issue: Nginx and PHP-FPM logs write to container stdout/stderr without structured format or aggregation.
- Files: `Dockerfile` (line 4), `nginx.conf` (line 4)
- Impact: Logs are lost on container exit. No centralized logging for debugging multi-container deployments. Hard to correlate Nginx and PHP-FPM logs.
- Fix approach: Configure syslog forwarding or implement JSON logging format, document Railway's log collection integration.

**Missing Database Backup Strategy:**
- Issue: No backup configuration or documentation for MySQL data persistence.
- Files: None (gap in documentation)
- Impact: Data loss risk if Railway's managed MySQL service has issues. No recovery procedure documented.
- Fix approach: Document Railway's automated backups, add manual backup WP-CLI commands to README, implement backup verification.

**No SSL/TLS Configuration at Application Level:**
- Issue: `docker-entrypoint.sh` assumes Railway handles HTTPS termination, but provides no fallback or verification.
- Files: `wp-config-custom.php` (line 9)
- Impact: If HTTPS is misconfigured at Railway level, WordPress may serve insecure content without detection.
- Fix approach: Add HTTPS redirect rules, verify SSL headers are present, document SSL certificate renewal process.

**No Monitoring/Observability Integration:**
- Issue: No built-in monitoring for PHP errors, slow queries, or resource exhaustion.
- Files: None
- Impact: Performance issues and errors are invisible until users report them. No metrics available for capacity planning.
- Fix approach: Document integration with Railway's monitoring, add New Relic/DataDog agent installation guidance, implement custom metrics for Redis hit rates.

## Dependencies at Risk

**WordPress Base Image Stability:**
- Risk: `wordpress:6-php8.3-fpm-alpine` image from Docker Hub may be deprecated or have security vulnerabilities without warning.
- Impact: Automated image pulls could fail. Security patches may not be provided for older versions.
- Migration plan: Implement explicit version pinning in Dependabot, monitor WordPress Docker Hub security advisories, consider maintaining custom base image.

**PHP Extensions Without Version Control:**
- Risk: PECL `redis` extension installed without version pinning in Dockerfile.
- Files: `Dockerfile` (line 28)
- Impact: Redis extension version changes could introduce incompatibilities with WordPress plugins or Redis server version.
- Migration plan: Pin PECL redis version explicitly (e.g., `pecl install redis-5.3.7`), add version testing in Dockerfile build.

**WP-CLI GitHub Dependency:**
- Risk: WP-CLI downloaded from GitHub at build time without fallback.
- Files: `Dockerfile` (lines 33-34)
- Impact: GitHub outages or rate limiting could cause build failures. No offline installation option.
- Migration plan: Cache WP-CLI in Docker layer, use official releases with checksums, implement retry logic with exponential backoff.

## Security Considerations

**Request Header Injection Vulnerability:**
- Risk: `wp-config-custom.php` (line 8) uses `$_SERVER['HTTP_HOST']` without validation against a whitelist.
- Files: `wp-config-custom.php` (lines 7-11)
- Current mitigation: Nginx only listens on specific ports, HTTP_HOST is set by Nginx.
- Recommendations: Implement hostname whitelist in wp-config-custom.php, validate against expected domains, sanitize with filter_var.

**XML-RPC Brute Force Protection:**
- Risk: XML-RPC is blocked but other attack vectors (wp-login.php) are not rate-limited.
- Files: `default.conf.template` (lines 36-41)
- Current mitigation: Nginx blocks XML-RPC endpoint only.
- Recommendations: Add rate limiting to wp-login.php, implement fail2ban or Nginx limit_req_zone, document login protection best practices.

**File Permission Risks:**
- Risk: `docker-entrypoint.sh` (line 53) applies blanket `chown -R www-data:www-data` without validating directory contents.
- Files: `docker-entrypoint.sh` (line 53)
- Current mitigation: WordPress directory structure is standard and trusted.
- Recommendations: Use more restrictive permissions (640 for files, 750 for directories), implement file integrity checking.

**Default Port 80 Exposure:**
- Risk: `.env.example` (line 22) documents PORT=80 but Railway should enforce HTTPS redirect.
- Files: `.env.example` (line 22)
- Current mitigation: Railway provides SSL termination at load balancer level.
- Recommendations: Document SSL redirect configuration, implement HSTS headers, add security header enforcement in Nginx.

---

*Concerns audit: 2026-03-11*
