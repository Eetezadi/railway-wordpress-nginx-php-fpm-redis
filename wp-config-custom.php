<?php
/**
 * Custom WordPress configuration additions
 * This file is prepended to wp-config.php to force dynamic domain handling
 */

// Force dynamic domain detection - overrides database values
if (isset($_SERVER['HTTP_HOST'])) {
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || $_SERVER['SERVER_PORT'] == 443) ? 'https://' : 'https://';
    define('WP_HOME', $protocol . $_SERVER['HTTP_HOST']);
    define('WP_SITEURL', $protocol . $_SERVER['HTTP_HOST']);
}

// Redis configuration
if (getenv('REDIS_HOST')) {
    define('WP_REDIS_HOST', getenv('REDIS_HOST'));
    define('WP_REDIS_PORT', getenv('REDIS_PORT') ?: 6379);
    define('WP_REDIS_PASSWORD', getenv('REDIS_PASSWORD'));
    define('WP_CACHE', true);
}
