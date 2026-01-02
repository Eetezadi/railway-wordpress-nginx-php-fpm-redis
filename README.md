# Deploy and Host WordPress Nginx PHP-FPM Redis on Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/FrpUIu?referralCode=wOLOAa&utm_medium=integration&utm_source=template&utm_campaign=generic)

A production-ready WordPress deployment featuring a security-hardened custom Docker image with Nginx and PHP-FPM 8.3, integrated with Railway's managed MySQL and Redis databases, plus a phpMyAdmin interface for database management.

## About Hosting WordPress Nginx PHP-FPM Redis on Railway
Production WordPress stack optimized for performance and security.

- 🔒 **Security Hardened**: Custom Docker image with XML-RPC disabled, protected wp-config.php, upload directory PHP execution blocking, security headers, and hidden file protection
- ⚡ **Performance Optimized**: Nginx web server with PHP-FPM 8.3, Redis object caching for database query reduction, and optimized PHP configuration
- 🗄️ **Managed Databases**: Railway's standard MySQL database with phpMyAdmin web interface for easy administration
- 📦 **Redis Integration**: Built-in Redis support for persistent object caching and session storage
- 🛠️ **WP-CLI Ready**: Pre-installed WordPress command-line tools for advanced site management

## Common Use Cases
This template is ideal for production WordPress sites requiring high performance, security, and scalability. Redis object caching significantly reduces database load for content-heavy sites, e-commerce platforms, membership sites, and high-traffic blogs.

## Dependencies for WordPress Nginx PHP-FPM Redis Hosting
- MySQL Database (Railway managed service)
- Redis Database (Railway managed service)
- phpMyAdmin (optional, for database management)

## Post-Installation Setup
**All environment variables are configured automatically** when you deploy this template on Railway. The template automatically connects to Railway's MySQL and Redis services with no manual configuration required.

After deploying the template, there is **only one step** required to enable Redis caching:

### Install and Enable Redis Object Cache Plugin

1. Log into your WordPress admin dashboard
2. Navigate to **Plugins** → **Add Plugin**
3. Search for **"Redis Object Cache"** (by Till Krüss)
4. Click **Install Now**, then **Activate**
5. Click **"Enable Object Cache"**
6. Verify the connection status shows **"Connected"**

That's it! Redis object caching is now active and will significantly improve your site's performance by caching database queries.

### phpMyAdmin Access
phpMyAdmin is deployed as a separate service on Railway. Access it to connect to your MySQL database for a web-based database management interface.

### Optional Performance Tuning
If you want to customize performance settings, you can optionally set these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PHP_MEMORY_LIMIT` | `512M` | PHP memory limit |
| `PHP_UPLOAD_MAX_FILESIZE` | `256M` | Max upload size |
| `PHP_POST_MAX_SIZE` | `256M` | Max POST size |
| `NGINX_CLIENT_MAX_BODY_SIZE` | `256M` | Nginx body size limit |

## Implementation Details
The template uses a custom Docker image with security hardening and production optimizations:

- **Nginx Configuration**: Optimized for WordPress with security rules blocking common attack vectors
- **PHP-FPM 8.3**: Latest stable PHP version with performance enhancements
- **Persistent Storage**: Volume mounted at `/var/www/html` for WordPress files
- **WP-CLI**: Pre-installed for command-line management (`wp plugin list`, `wp cache flush`, etc.)
- **Security Layers**: XML-RPC disabled, wp-config.php access blocked, PHP execution prevented in uploads directory
- **Redis Integration**: Automatic connection to Railway Redis with password authentication

## Why Deploy WordPress Nginx PHP-FPM Redis on Railway?
Railway is a singular platform to deploy your infrastructure stack. Railway will host your infrastructure so you don't have to deal with configuration, while allowing you to vertically and horizontally scale it.

By deploying WordPress with Redis on Railway, you are one step closer to supporting a complete full-stack application with minimal burden. Host your WordPress site, MySQL database, Redis cache, phpMyAdmin interface, and more on Railway with enterprise-grade security and performance optimizations built into the custom Docker image.
