# Coding Conventions

**Analysis Date:** 2026-03-11

## Overview

This codebase is a Docker-based WordPress deployment configuration with minimal custom code. The custom code consists of PHP configuration, shell scripts, and Nginx configuration files. Code quality practices are infrastructure-focused rather than application-focused.

## Naming Patterns

**Files:**
- Shell scripts: `lowercase-with-hyphens.sh` (e.g., `docker-entrypoint.sh`)
- PHP files: `lowercase-with-hyphens.php` (e.g., `wp-config-custom.php`)
- Configuration files: descriptive names with extension (e.g., `default.conf.template`, `nginx.conf`)
- Template files: use `.template` suffix for files that require environment variable substitution

**Variables:**
- Environment variables: `UPPERCASE_WITH_UNDERSCORES` (e.g., `NGINX_CLIENT_MAX_BODY_SIZE`, `PHP_UPLOAD_MAX_FILESIZE`)
- PHP constants: `UPPERCASE_WITH_UNDERSCORES` using `define()` (e.g., `WP_HOME`, `WP_REDIS_HOST`)
- Shell script variables: `UPPERCASE_WITH_UNDERSCORES` for environment and computed values (e.g., `PHP_INI_DIR`, `NGINX_PID`)

**Functions:**
- Shell functions: `lowercase_with_underscores` (e.g., `cleanup`)
- PHP uses WordPress conventions where present

## Code Style

**Shell Scripts:**
- Use bash strict mode: `set -e` at script start to exit on errors
- Indentation: 4 spaces
- Quoted variables: All variable references quoted to prevent word splitting (e.g., `"$NGINX_CLIENT_MAX_BODY_SIZE"`)
- Comments: Single-line comments with `#` for clarity

**PHP:**
- Minimal custom PHP code - primarily configuration definitions
- Opening tag on line 1: `<?php`
- Function-level comments follow WordPress documentation standard
- Closing tags omitted where possible to prevent output issues

**Configuration Files:**
- Nginx: Standard Nginx configuration conventions
- Template substitution: Use `envsubst` with explicit variable placeholders (e.g., `${NGINX_CLIENT_MAX_BODY_SIZE}`)

## Comments and Documentation

**PHP Comments:**
- File-level documentation: PHP docblock at top of file (`/** ... */`)
- Inline comments: Explain "why" not "what" for non-obvious logic

**Shell Script Comments:**
- Section comments: `# Step number. Description` (e.g., `# 1. Generate PHP config`)
- Inline comments: Explain conditional logic and command side effects
- Comments on complex operations: Document the reason for workarounds

Example from `docker-entrypoint.sh`:
```bash
# CRITICAL: Fix Nginx permissions for Railway
# Graceful shutdown handler
# Security Headers
```

**Nginx Comments:**
- Describe the purpose of location blocks and directives
- Comments explain what each security measure does

## Error Handling

**Shell Scripts:**
- Trap signals: Use `trap cleanup SIGTERM SIGINT` for graceful shutdown
- Error redirection: `2>/dev/null || true` to suppress non-critical errors and continue
- Safe command execution: Commands that might fail use `|| true` to prevent script exit
- Exit codes: Process exit is monitored with `wait` commands

Pattern from `docker-entrypoint.sh`:
```bash
trap cleanup SIGTERM SIGINT
cleanup() {
    echo "Shutting down..."
    nginx -s quit 2>/dev/null || true
    kill -TERM "$PHP_FPM_PID" 2>/dev/null || true
    wait "$PHP_FPM_PID" 2>/dev/null || true
    exit 0
}
```

**PHP:**
- Conditional checks for environment variables: `if (getenv('REDIS_HOST'))`
- Fallback values: Using ternary operator (e.g., `getenv('REDIS_PORT') ?: 6379`)
- No explicit error throwing in custom config - relies on WordPress error handling

## Logging

**Framework:** Bash `echo` statements and Docker container logs

**Patterns:**
- Status messages to stdout: Used for operation progress tracking
- Log format: Simple descriptive messages with context
- Informational steps logged with `echo` during initialization:
  - `echo "Testing nginx configuration..."`
  - `echo "Initializing WordPress..."`
  - `echo "Starting Nginx..."`
  - `echo "Starting PHP-FPM..."`

**Log Visibility:**
- All echo statements go to stdout which Docker collects as container logs
- Access logs disabled for health checks: `access_log off;`
- Error logs written to standard path: `/var/log/nginx/error.log`

## Validation

**Shell Scripts:**
- Configuration validation: `nginx -t` test before starting service
- PHP-FPM configuration check: `docker-entrypoint.sh php-fpm -t`
- File existence checks: `if [ -f /var/www/html/wp-config.php ]`
- Pattern matching: `if ! grep -q "wp-config-custom.php"` to detect already-applied configuration

**PHP:**
- Conditional existence: `isset($_SERVER['HTTP_HOST'])`
- Environment variable detection: `getenv('REDIS_HOST')`

## Process Management

**Background Process Tracking:**
- Processes started in background: `service_name &`
- PID captured: `SERVICE_PID=$!`
- Process monitoring: `wait -n $NGINX_PID $PHP_FPM_PID` to detect first process exit
- Graceful shutdown: Signal traps and process cleanup

## Security Practices

**Configuration Level:**
- Security headers hardcoded in `default.conf.template`:
  - `X-Frame-Options: SAMEORIGIN`
  - `X-Content-Type-Options: nosniff`
  - `X-XSS-Protection: 1; mode=block`
- XML-RPC blocking: `location = /xmlrpc.php { deny all; }`
- Protected files: `wp-config.php` access denied
- Upload protection: PHP execution blocked in `/wp-content/uploads/`
- Hidden file protection: `.` directories deny all access

**Permissions:**
- Web server ownership: `chown -R www-data:www-data` applied to critical paths
- Directory creation with proper context before permission changes

## Conventions Summary

| Aspect | Convention |
|--------|-----------|
| Environment variables | UPPERCASE_WITH_UNDERSCORES |
| Shell functions | lowercase_with_underscores |
| File names | lowercase-with-hyphens |
| Indentation | 4 spaces (shell), tabs (Nginx) |
| Quoted variables | Always quote in bash |
| Error handling | Use `|| true` for optional failures, trap for signals |
| Logging | `echo` to stdout for status, disable logs for health checks |
| Comments | Explain "why", not "what" |
| Configuration validation | Always validate before service start |

---

*Convention analysis: 2026-03-11*
