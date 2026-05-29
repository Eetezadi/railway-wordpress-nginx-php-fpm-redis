# Technology Stack

**Analysis Date:** 2026-03-11

## Languages

**Primary:**
- PHP 8.3 - WordPress core and custom configuration
- Bash - Docker entrypoint and shell scripting
- Nginx Configuration Language - Web server routing and security

**Secondary:**
- SQL - WordPress database queries via MySQL client

## Runtime

**Environment:**
- Docker Alpine Linux (php8.3-fpm-alpine base image)
- PHP-FPM 8.3 (FastCGI Process Manager)
- Nginx (web server)

**Package Manager:**
- PECL - PHP extension installer (for Redis extension)
- APK - Alpine Linux package manager
- Composer - Not detected (pure WordPress installation)

## Frameworks

**Core:**
- WordPress 6.x - Content management system
  - Uses standard WordPress hooks and filters
  - Custom configuration via `wp-config-custom.php` injected at runtime

**Web Server:**
- Nginx 1.x - FastCGI reverse proxy to PHP-FPM
- PHP-FPM 8.3 - FastCGI application server

**Build/Dev:**
- Docker - Container orchestration and deployment

## Key Dependencies

**Critical:**
- `redis` (PECL extension) - Redis client for PHP-FPM
  - Enables persistent object caching
  - Installed in Dockerfile at line 28-30: `/home/nc773/Documents/railway-wordpress-nginx-php-fpm-redis/Dockerfile`

**Infrastructure:**
- `nginx` - Web server for request handling
- `php8.3-fpm-alpine` - Official WordPress image with PHP 8.3
- `gettext` - Translation support
- `curl` - HTTP client utilities
- `bash` - Shell for docker-entrypoint.sh
- `fcgi` - FastCGI utilities
- `libzip`, `libpng-dev`, `libjpeg-turbo-dev`, `freetype-dev` - Image processing libraries
- `autoconf`, `gcc`, `g++`, `make` - Build tools (temporary, for PECL compilation)

## PHP Extensions

**Installed:**
- `gd` - Image processing (configured with freetype and jpeg support at line 24-25)
- `zip` - ZIP file handling
- `opcache` - Opcode cache for performance
- `redis` - Redis client (PECL installed at line 28-30)

## Configuration

**Environment Variables:**
- Database:
  - `WORDPRESS_DB_HOST` - MySQL host (e.g., `${{MySQL.MYSQLHOST}}`)
  - `WORDPRESS_DB_NAME` - Database name (e.g., `${{MySQL.MYSQLDATABASE}}`)
  - `WORDPRESS_DB_USER` - Database user (e.g., `${{MySQL.MYSQLUSER}}`)
  - `WORDPRESS_DB_PASSWORD` - Database password (e.g., `${{MySQL.MYSQLPASSWORD}}`)

- Redis:
  - `REDIS_HOST` - Redis server host (e.g., `${{Redis.REDISHOST}}`)
  - `REDIS_PORT` - Redis server port (default: 6379, set in `wp-config-custom.php` line 17)
  - `REDIS_PASSWORD` - Redis authentication password (set in `wp-config-custom.php` line 18)

- Server:
  - `PORT` - Listen port (default: 80)

- Nginx:
  - `NGINX_CLIENT_MAX_BODY_SIZE` - Max upload size (default: 256M, templated in `default.conf.template` line 7)

- PHP:
  - `PHP_UPLOAD_MAX_FILESIZE` - Max file upload size (default: 256M, injected in `docker-entrypoint.sh` line 17)
  - `PHP_POST_MAX_SIZE` - Max POST data size (default: 256M, injected in `docker-entrypoint.sh` line 18)
  - `PHP_MEMORY_LIMIT` - PHP memory limit (default: 512M, injected in `docker-entrypoint.sh` line 19)

**Configuration Files:**
- `Dockerfile` - Docker image build specification with PHP extensions, Nginx, and entrypoint
- `docker-entrypoint.sh` - Container startup script handling configuration injection
- `nginx.conf` - Main Nginx configuration (minimal, loads conf.d)
- `default.conf.template` - Nginx server block template with WordPress routing
- `wp-config-custom.php` - WordPress config customizations for dynamic domain and Redis
- `.env.example` - Template for environment variables
- `.github/dependabot.yml` - Automated dependency updates

## Platform Requirements

**Development:**
- Docker runtime
- Docker Compose (optional, for local testing)

**Production:**
- Railway platform (or any Docker-compatible container hosting)
- MySQL 5.7+ database service
- Redis 6.0+ cache service
- Persistent volume mount at `/var/www/html` (minimum 1GB recommended)

## WordPress Configuration

**Critical Setup:**
- Dynamic domain detection via `WP_HOME` and `WP_SITEURL` in `wp-config-custom.php` (lines 8-12)
- Redis object caching: Requires manual plugin installation after deployment (Redis Object Cache by Till Krüss)
- WP-CLI pre-installed at `/usr/local/bin/wp` for command-line management

**Security Hardening:**
- XML-RPC disabled at Nginx level (`default.conf.template` line 37-41)
- wp-config.php access blocked (`default.conf.template` line 44-46)
- PHP execution blocked in uploads directory (`default.conf.template` line 49-51)
- Security headers added (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection)

---

*Stack analysis: 2026-03-11*
