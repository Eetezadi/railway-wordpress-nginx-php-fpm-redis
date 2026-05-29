<?php
/**
 * Custom WordPress configuration additions
 * This file is prepended to wp-config.php to force dynamic domain handling
 * and Redis configuration for the Railway Cache System
 */

// ============================================
// DYNAMIC DOMAIN DETECTION
// ============================================

// Use the request host so cloned Railway services do not inherit another
// site's database-stored home/site URL. Respect Railway's forwarded scheme
// instead of forcing HTTPS inside the container.
if (isset($_SERVER['HTTP_HOST'])) {
    $forwarded_proto = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    if ($forwarded_proto === 'https' || $forwarded_proto === 'http') {
        $scheme = $forwarded_proto;
    } else {
        $https = (string) ($_SERVER['HTTPS'] ?? '');
        $port = (string) ($_SERVER['SERVER_PORT'] ?? '');
        $scheme = ($https !== '' && strtolower($https) !== 'off') || $port === '443' ? 'https' : 'http';
    }

    $url = $scheme . '://' . $_SERVER['HTTP_HOST'];
    if (!defined('WP_HOME')) {
        define('WP_HOME', $url);
    }
    if (!defined('WP_SITEURL')) {
        define('WP_SITEURL', $url);
    }
}

// ============================================
// REDIS OBJECT CACHE CONFIGURATION
// ============================================

if (getenv('REDIS_HOST')) {
    define('WP_REDIS_HOST', getenv('REDIS_HOST'));
    define('WP_REDIS_PORT', getenv('REDIS_PORT') ?: 6379);
    define('WP_REDIS_PASSWORD', getenv('REDIS_PASSWORD'));
    define('WP_REDIS_SCHEME', 'tcp');
    define('WP_REDIS_TIMEOUT', 1);
    define('WP_REDIS_READ_TIMEOUT', 1);
    define('WP_REDIS_DATABASE', 0);

    // Enable object caching/page cache only if not already set by wp-config.php
    if (!defined('WP_CACHE')) {
        define('WP_CACHE', true);
    }
}

// ============================================
// PERFORMANCE TWEAKS
// ============================================

// Limit post revisions to save DB space
if (!defined('WP_POST_REVISIONS')) {
    define('WP_POST_REVISIONS', 5);
}

// Trash cleanup interval (7 days instead of 30)
if (!defined('EMPTY_TRASH_DAYS')) {
    define('EMPTY_TRASH_DAYS', 7);
}

// Disable file editing from admin
if (!defined('DISALLOW_FILE_EDIT')) {
    define('DISALLOW_FILE_EDIT', true);
}

// ============================================
// RAILWAY CACHE SYSTEM CONFIGURATION
// ============================================

// Cache directory path (used by advanced-cache.php)
// This file is injected near the top of wp-config.php before WordPress defines
// WP_CONTENT_DIR, so only define the path when WordPress has made it available.
if (!defined('RAILWAY_CACHE_DIR') && defined('WP_CONTENT_DIR')) {
    define('RAILWAY_CACHE_DIR', WP_CONTENT_DIR . '/cache/railway-page/');
}

// Cache expiry in seconds (1 hour default)
if (!defined('RAILWAY_CACHE_EXPIRY')) {
    define('RAILWAY_CACHE_EXPIRY', 3600);
}
