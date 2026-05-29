# Testing Patterns

**Analysis Date:** 2026-03-11

## Overview

This codebase is a Docker-based WordPress infrastructure project with **no formal testing framework**. Testing is performed through configuration validation, container runtime checks, and health endpoints. There are no unit tests, integration tests, or test suites.

## Configuration Validation

**Pre-flight Checks:**

Location: `docker-entrypoint.sh`

Nginx configuration is validated before service start:
```bash
# 3. Test nginx configuration
echo "Testing nginx configuration..."
nginx -t
```

This uses Nginx's built-in `-t` flag to verify syntax and configuration validity.

PHP-FPM configuration is validated before startup:
```bash
# 4. Initialize WordPress files in volume (call original WP entrypoint)
echo "Initializing WordPress..."
docker-entrypoint.sh php-fpm -t
```

This leverages the WordPress Docker image's built-in entrypoint with the `-t` test flag.

## Runtime Validation

**File Existence and State Checks:**

Location: `docker-entrypoint.sh` lines 37-50

Configuration injection validation uses grep pattern matching:
```bash
if [ -f /var/www/html/wp-config.php ]; then
    echo "Injecting dynamic domain configuration into wp-config.php..."
    # Check if our custom config is already injected
    if ! grep -q "wp-config-custom.php" /var/www/html/wp-config.php; then
        # Perform injection
    else
        echo "Dynamic domain configuration already present."
    fi
fi
```

**Pattern:**
- Check file existence before modification
- Verify idempotency with grep pattern matching
- Provide feedback on state (injected vs already present)

## Health Checks

**Health Endpoint:**

Location: `default.conf.template` lines 60-65

A dedicated health check endpoint is exposed:
```nginx
# Health check endpoint
location /health {
    access_log off;
    return 200 "healthy\n";
    add_header Content-Type text/plain;
}
```

**Pattern:**
- Returns HTTP 200 with plain text response
- Disabled access logging for health checks (reduces noise)
- Simple endpoint suitable for container orchestration health probes

**Docker Health Check:**

Not implemented in Dockerfile. Container relies on orchestrator (Railway, Kubernetes) health probes hitting the `/health` endpoint.

## Process Supervision

**Process Exit Monitoring:**

Location: `docker-entrypoint.sh` lines 56-66

Multiple processes are monitored for exit:
```bash
# 7. Start Nginx (background, but not daemon mode for proper signal handling)
echo "Starting Nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

# 8. Start PHP-FPM (foreground)
echo "Starting PHP-FPM..."
php-fpm &
PHP_FPM_PID=$!

# Wait for either process to exit
wait -n $NGINX_PID $PHP_FPM_PID
```

**Pattern:**
- Processes started with `&` to capture PID
- `wait -n` monitors first process to exit
- Container terminates if either Nginx or PHP-FPM fails
- Acts as implicit health check - failure causes container restart

## Signal Handling

**Graceful Shutdown:**

Location: `docker-entrypoint.sh` lines 4-12

Signals are trapped to ensure clean shutdown:
```bash
cleanup() {
    echo "Shutting down..."
    nginx -s quit 2>/dev/null || true
    kill -TERM "$PHP_FPM_PID" 2>/dev/null || true
    wait "$PHP_FPM_PID" 2>/dev/null || true
    exit 0
}
trap cleanup SIGTERM SIGINT
```

**Pattern:**
- SIGTERM and SIGINT both trigger cleanup
- Graceful nginx shutdown: `nginx -s quit`
- Process termination signal: `kill -TERM`
- Error suppression with `2>/dev/null || true` allows cleanup to complete even if processes already exited
- `wait` ensures process fully terminates before exit

## Error Handling Testing

**Error Suppression Pattern:**

Location: Throughout `docker-entrypoint.sh`

Non-critical commands use error suppression:
```bash
nginx -s quit 2>/dev/null || true
rm -rf /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d/default.conf
```

**Pattern:**
- Optional operations: `command 2>/dev/null || true` (suppress stderr, continue on failure)
- Required operations: No suppression (failure causes `set -e` exit)
- Allows resilience to expected failures (e.g., process already stopped)

## Security Configuration Testing

**Security Headers Validation:**

Location: `default.conf.template` lines 9-12

Security headers are static and validated through Nginx configuration:
```nginx
# Security Headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
```

These can be verified with:
```bash
curl -I http://localhost/
# Returns headers in HTTP response
```

**Blocking Rules Validation:**

Protection mechanisms are static configuration:
```nginx
# Block XML-RPC (common attack vector)
location = /xmlrpc.php {
    deny all;
}

# Protect wp-config.php
location = /wp-config.php {
    deny all;
}
```

Manual verification:
```bash
curl -I http://localhost/xmlrpc.php  # Should return 403
curl -I http://localhost/wp-config.php  # Should return 403
```

## Manual Testing Approach

Since no automated test framework exists, testing is manual:

**1. Container Startup:**
```bash
docker build -t wordpress-nginx .
docker run -p 80:80 wordpress-nginx
```
Check logs for:
- `Testing nginx configuration...`
- `Initializing WordPress...`
- `Starting Nginx...`
- `Starting PHP-FPM...`

**2. Health Endpoint:**
```bash
curl http://localhost/health
# Expected: "healthy\n"
```

**3. WordPress Functionality:**
- Access http://localhost/ in browser
- Verify WordPress setup page or admin dashboard

**4. Security Headers:**
```bash
curl -I http://localhost/
# Verify X-Frame-Options, X-Content-Type-Options, X-XSS-Protection headers
```

**5. Blocked Endpoints:**
```bash
curl -I http://localhost/xmlrpc.php    # Should be 403
curl -I http://localhost/wp-config.php # Should be 403
```

## Dependency Updates

**Automated Dependency Checking:**

Location: `.github/dependabot.yml`

Dependabot monitors Docker images weekly:
```yaml
version: 2
updates:
  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "sunday"
```

**Pattern:**
- Weekly automated checks for Docker image updates
- Automatic pull requests created for new versions
- Labels: `dependencies`, `docker` for organization
- Commit message prefix: `chore`
- Open PR limit: 5

This serves as a form of continuous testing by ensuring base images (wordpress, PHP, Alpine) are regularly audited.

## Testing Gaps

**No Formal Testing Framework:**
- No unit tests
- No integration tests
- No E2E tests
- No load testing
- No security scanning (OWASP, SAST)

**Current Testing Limitations:**
- Nginx configuration validated but WordPress-specific routing not tested
- PHP-FPM startup validated but extension loading not verified
- Redis configuration defined but connectivity not tested
- Signal handling tested manually only
- Permission issues discovered at runtime

## Recommended Testing Additions

For production hardening, consider adding:

1. **Configuration tests** - Validate Nginx and PHP configs match expected values
2. **Startup tests** - Verify all required processes start within timeout
3. **Endpoint tests** - Check health endpoint, blocked paths, security headers
4. **Integration tests** - Verify WordPress can connect to database and Redis
5. **Load tests** - Verify performance under expected traffic
6. **Security scanning** - Container image scanning for vulnerabilities

## Summary

| Aspect | Status | Approach |
|--------|--------|----------|
| Test Framework | None | N/A |
| Unit Tests | None | N/A |
| Integration Tests | None | N/A |
| Configuration Validation | Yes | `nginx -t`, `php-fpm -t` |
| Health Checks | Yes | `/health` endpoint |
| Process Monitoring | Yes | `wait -n` process tracking |
| Signal Handling | Yes | Trap SIGTERM/SIGINT |
| Security Headers | Static | Configuration-based |
| Dependency Updates | Automated | Dependabot weekly |
| Manual Testing | Required | Curl, browser testing |

---

*Testing analysis: 2026-03-11*
