# Deploy and Host WordPress Nginx PHP-FPM Redis on Railway

A production-ready WordPress deployment featuring a security-hardened custom Docker image with Nginx and PHP-FPM 8.3, integrated with Railway's managed MySQL and Redis databases, plus a phpMyAdmin interface for database management.

## About Hosting WordPress Nginx PHP-FPM Redis

Hosting WordPress with Nginx, PHP-FPM, and Redis involves deploying a high-performance web stack optimized for production environments. This configuration uses Nginx as the web server for efficient request handling, PHP-FPM 8.3 for processing PHP code, and Redis for persistent object caching and session storage. The setup includes security hardening measures such as XML-RPC disabling, protected wp-config.php, upload directory PHP execution blocking, and security headers. Railway's managed MySQL database handles persistent data storage, while phpMyAdmin provides a web-based interface for database administration. WP-CLI is pre-installed for advanced command-line site management.

## Common Use Cases

- **High-Traffic Blogs and Content Sites**: Redis object caching significantly reduces database load for content-heavy websites with frequent page views
- **E-commerce Platforms**: Performance-optimized stack handles product catalogs, shopping carts, and checkout flows with improved response times
- **Membership and Community Sites**: Session storage and object caching support user authentication and dynamic content delivery at scale

## Dependencies for WordPress Nginx PHP-FPM Redis Hosting

- **MySQL Database**: Railway's managed MySQL service for WordPress data persistence
- **Redis Database**: Railway's managed Redis service for object caching and session storage
- **phpMyAdmin**: Optional web-based MySQL database management interface

### Deployment Dependencies

- [Redis Object Cache Plugin](https://wordpress.org/plugins/redis-cache/) - WordPress plugin by Till Krüss for Redis integration
- [Railway MySQL Service](https://docs.railway.app/databases/mysql) - Managed MySQL database documentation
- [Railway Redis Service](https://docs.railway.app/databases/redis) - Managed Redis database documentation

### Implementation Details

**Required Post-Deployment Setup**

To enable Redis caching, install and activate the Redis Object Cache plugin in Wordpress:

1. Log into your WordPress admin dashboard
2. Navigate to **Plugins** → **Add New**
3. Search for **"Redis Object Cache"** (by Till Krüss)
4. Click **Install Now**, then **Activate**
5. Navigate to **Settings** → **Redis**
6. Click **"Enable Object Cache"**
7. Verify the connection status shows **"Connected"**

All environment variables are configured automatically by Railway, so no manual Redis configuration is required.

The template uses a custom Docker image with the following configuration:

**Nginx Configuration**
- Optimized for WordPress with security rules blocking common attack vectors
- Client max body size configurable via `NGINX_CLIENT_MAX_BODY_SIZE` (default: 256M)

**PHP-FPM 8.3 Settings**
```
PHP_MEMORY_LIMIT=512M (configurable)
PHP_UPLOAD_MAX_FILESIZE=256M (configurable)
PHP_POST_MAX_SIZE=256M (configurable)
```

**Security Hardening**
- XML-RPC disabled to prevent brute force attacks
- wp-config.php access blocked at web server level
- PHP execution prevented in uploads directory
- Security headers enabled (X-Frame-Options, X-Content-Type-Options, etc.)
- Hidden file protection (.htaccess, .git, etc.)

**Redis Integration**
- Automatic connection to Railway Redis with password authentication
- Persistent object caching reduces database queries by 80%+ on average
- Session storage for improved scalability

**WP-CLI Pre-installed**
```bash
wp plugin list
wp cache flush
wp user list
```

**Persistent Storage**
- Volume mounted at `/var/www/html` for WordPress files
- Ensures uploads and plugins persist across deployments

## Why Deploy WordPress Nginx PHP-FPM Redis on Railway?

Railway is a singular platform to deploy your infrastructure stack. Railway will host your infrastructure so you don't have to deal with configuration, while allowing you to vertically and horizontally scale it.

By deploying WordPress Nginx PHP-FPM Redis on Railway, you are one step closer to supporting a complete full-stack application with minimal burden. Host your servers, databases, AI agents, and more on Railway.
