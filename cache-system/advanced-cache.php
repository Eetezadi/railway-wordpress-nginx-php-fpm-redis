<?php
/**
 * Railway Hybrid Cache - WordPress Page Cache Drop-in
 * Fallback layer when NGINX FastCGI cache is bypassed or misses.
 * Inspired by Breeze's execute-cache.php architecture.
 *
 * This file is loaded via WP_CACHE in wp-config.php
 * It runs BEFORE WordPress core loads.
 */

if (!defined('ABSPATH')) exit;
if (is_admin()) return;

// ============================================
// CONFIGURATION (mirrors Breeze's approach)
// ============================================

if (!defined('RAILWAY_CACHE_DIR')) {
    define('RAILWAY_CACHE_DIR', WP_CONTENT_DIR . '/cache/railway-page/');
}
if (!defined('RAILWAY_CACHE_EXPIRY')) {
    define('RAILWAY_CACHE_EXPIRY', 3600);
}
if (!defined('RAILWAY_CACHE_VERSION')) {
    define('RAILWAY_CACHE_VERSION', '1.0.0');
}

// ============================================
// EARLY BYPASS CHECKS (zero WordPress dependency)
// ============================================

class Railway_Early_Cache
{
    private static ?array $config = null;

    /**
     * Main entry — called from this file's bootstrap
     */
    public static function bootstrap(): void
    {
        // Only handle GET requests
        if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'GET') {
            return;
        }

        // Skip AJAX/REST immediately
        if (self::is_ajax_request()) return;
        if (self::is_rest_request()) return;

        // Skip common non-page endpoints
        if (self::is_excluded_uri()) return;

        // Skip logged-in users (NGINX handles this too, but double-check)
        if (self::is_logged_in_via_cookie()) return;

        // Load configuration
        self::$config = self::load_config();

        // Check exclusions from config
        if (self::is_excluded_by_config()) return;

        // Try to serve from cache
        self::try_serve_cache();

        // No cache hit — register buffer handler to capture output
        self::register_buffer_handler();
    }

    // ============================================
    // BYPASS DETECTION
    // ============================================

    private static function is_ajax_request(): bool
    {
        if (defined('DOING_AJAX') && DOING_AJAX) return true;
        if (defined('REST_REQUEST') && REST_REQUEST) return true;

        if (isset($_SERVER['HTTP_X_REQUESTED_WITH'])) {
            return strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest';
        }

        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        return strpos($uri, '/wp-json/') !== false || strpos($uri, 'rest_route=') !== false;
    }

    private static function is_rest_request(): bool
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        return strpos($uri, '/wp-json/') !== false;
    }

    private static function is_excluded_uri(): bool
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '/';

        $excluded = [
            'wp-admin', 'wp-login.php', 'wp-cron.php', 'xmlrpc.php',
            'robots.txt', '.htaccess', 'favicon.ico',
            's=', 'cart', 'checkout', 'my-account', 'wc-api',
            'add-to-cart', 'logout', 'lost-password',
            'breeze-minification',
        ];

        foreach ($excluded as $pattern) {
            if (stripos($uri, $pattern) !== false) return true;
        }

        // Skip file extensions that aren't HTML
        $extension = pathinfo(parse_url($uri, PHP_URL_PATH) ?? '/', PATHINFO_EXTENSION);
        if ($extension && !in_array($extension, ['', 'php', 'html'])) return true;

        return false;
    }

    private static function is_logged_in_via_cookie(): bool
    {
        if (empty($_COOKIE)) return false;

        foreach (array_keys($_COOKIE) as $name) {
            if (strpos($name, 'wordpress_logged_in_') === 0) return true;
            if (strpos($name, 'comment_author_') === 0) return true;
            if (strpos($name, 'wordpress_') === 0 && strpos($name, '_') > 10) return true;
        }

        return false;
    }

    // ============================================
    // CONFIGURATION LOADING
    // ============================================

    private static function load_config(): array
    {
        $config_file = WP_CONTENT_DIR . '/cache/railway-config.php';

        if (file_exists($config_file)) {
            $config = @include $config_file;
            if (is_array($config)) return $config;
        }

        // Default config
        return [
            'enabled' => true,
            'exclude_urls' => [],
            'cache_logged_in' => false,
            'gzip' => true,
            'expiry' => RAILWAY_CACHE_EXPIRY,
        ];
    }

    private static function is_excluded_by_config(): bool
    {
        if (!self::$config || empty(self::$config['exclude_urls'])) return false;

        $current_url = self::get_current_url();

        foreach (self::$config['exclude_urls'] as $pattern) {
            if (fnmatch($pattern, $current_url) || fnmatch($pattern, parse_url($current_url, PHP_URL_PATH) ?? '/')) {
                return true;
            }
        }

        return false;
    }

    // ============================================
    // CACHE SERVING
    // ============================================

    private static function try_serve_cache(): void
    {
        $cache_file = self::get_cache_file_path();
        if (!$cache_file || !file_exists($cache_file)) return;

        // Check expiry
        $max_age = self::$config['expiry'] ?? RAILWAY_CACHE_EXPIRY;
        if ((time() - filemtime($cache_file)) > $max_age) return;

        // Read cache with shared lock
        $fp = @fopen($cache_file, 'r');
        if (!$fp) return;

        if (!flock($fp, LOCK_SH)) {
            fclose($fp);
            return;
        }

        $data = stream_get_contents($fp);
        flock($fp, LOCK_UN);
        fclose($fp);

        if (!$data) return;

        $cached = @unserialize($data);
        if (!is_array($cached) || empty($cached['body'])) return;

        // Send headers
        header('X-Cache-Status: HIT');
        header('X-Cache-Layer: WordPress-file');
        header('Content-Type: text/html; charset=UTF-8');

        if (!empty($cached['headers']) && is_array($cached['headers'])) {
            foreach ($cached['headers'] as $header) {
                if (is_string($header)) header($header);
            }
        }

        // Serve gzipped or plain
        $accept_gzip = isset($_SERVER['HTTP_ACCEPT_ENCODING']) && strpos($_SERVER['HTTP_ACCEPT_ENCODING'], 'gzip') !== false;

        if ($accept_gzip && !empty($cached['gzip'])) {
            header('Content-Encoding: gzip');
            header('Vary: Accept-Encoding');
            header('Content-Length: ' . strlen($cached['gzip']));
            echo $cached['gzip'];
        } else {
            header('Content-Length: ' . strlen($cached['body']));
            echo $cached['body'];
        }

        exit;
    }

    // ============================================
    // BUFFER HANDLER (cache writer)
    // ============================================

    private static function register_buffer_handler(): void
    {
        // Store config in global for the handler
        $GLOBALS['railway_cache_config'] = self::$config;

        ob_start([self::class, 'handle_output_buffer']);
    }

    public static function handle_output_buffer(string $buffer): string
    {
        // Only cache successful 200 responses with HTML
        if (http_response_code() !== 200) return $buffer;
        if (strlen($buffer) < 255) return $buffer;
        if (!preg_match('#</html>#i', $buffer)) return $buffer;

        $config = $GLOBALS['railway_cache_config'] ?? self::$config;
        if (!$config || empty($config['enabled'])) return $buffer;

        // Check DONOTCACHEPAGE constant (used by WooCommerce, etc.)
        if (defined('DONOTCACHEPAGE') && DONOTCACHEPAGE) return $buffer;

        // Build cache file path
        $cache_file = self::get_cache_file_path();
        if (!$cache_file) return $buffer;

        // Ensure directory exists
        $cache_dir = dirname($cache_file);
        if (!is_dir($cache_dir)) {
            @mkdir($cache_dir, 0755, true);
        }

        $should_gzip = !empty($config['gzip']) && function_exists('gzencode');

        $cache_data = [
            'body' => $buffer,
            'headers' => [
                'Last-Modified: ' . gmdate('D, d M Y H:i:s') . ' GMT',
            ],
            'gzip' => $should_gzip ? gzencode($buffer, 6) : null,
            'created' => time(),
            'version' => RAILWAY_CACHE_VERSION,
        ];

        // Write with exclusive lock
        $temp = $cache_file . '.tmp.' . uniqid();
        $fp = @fopen($temp, 'xb');
        if ($fp && flock($fp, LOCK_EX)) {
            fwrite($fp, serialize($cache_data));
            flock($fp, LOCK_UN);
            fclose($fp);
            @rename($temp, $cache_file);
        } else {
            @unlink($temp);
        }

        // Debug header
        if (!headers_sent()) {
            header('X-Cache-Status: MISS');
            header('X-Cache-Layer: WordPress-file');
        }

        return $buffer;
    }

    // ============================================
    // HELPERS
    // ============================================

    private static function get_current_url(): string
    {
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        return self::get_request_scheme() . '://' . $host . $uri;
    }

    private static function get_request_scheme(): string
    {
        $forwarded_proto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
        if (is_string($forwarded_proto)) {
            $proto = strtolower(trim(explode(',', $forwarded_proto)[0]));
            if ($proto === 'https' || $proto === 'http') {
                return $proto;
            }
        }

        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['SERVER_PORT'] ?? 80) == 443)
            ? 'https'
            : 'http';
    }

    private static function get_cache_file_path(): ?string
    {
        $url = self::get_current_url();
        $hash = sha1($url);
        return RAILWAY_CACHE_DIR . substr($hash, 0, 2) . '/' . $hash . '.cache';
    }
}

// ============================================
// BOOTSTRAP
// ============================================

// Only bootstrap if WP_CACHE is enabled and this is a frontend request
if (defined('WP_CACHE') && WP_CACHE && !is_admin()) {
    Railway_Early_Cache::bootstrap();
}
