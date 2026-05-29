<?php
/**
 * Plugin Name: Railway Cache Manager
 * Description: Coordinates NGINX FastCGI cache with WordPress. Handles purge on content changes, smart exclusions, and cache warming.
 * Version: 1.0.0
 * Author: Railway Cache System
 */

if (!defined('ABSPATH')) exit;

class Railway_Cache_Manager
{
    private string $cache_dir;
    private bool $debug;
    private array $excluded_patterns;

    public function __construct()
    {
        $this->cache_dir = WP_CONTENT_DIR . '/cache/railway-page/';
        $this->debug = defined('WP_DEBUG') && WP_DEBUG;

        // URLs/patterns that should never be cached (applied at WordPress level)
        $this->excluded_patterns = apply_filters('railway_cache_excluded_patterns', [
            '/wp-admin',
            '/wp-login.php',
            '/wp-cron.php',
            '/xmlrpc.php',
            's=',              // Search results
            'cart',            // WooCommerce cart
            'checkout',        // WooCommerce checkout
            'my-account',      // WooCommerce account
            'wc-api',          // WooCommerce API
            'add-to-cart',     // WooCommerce add to cart
            'lost-password',
            'wp-json',         // REST API
            'rest_route',
        ]);

        $this->init();
    }

    /**
     * Initialize hooks
     */
    private function init(): void
    {
        // === CACHE INVALIDATION HOOKS ===

        // Post/content changes
        add_action('save_post', [$this, 'purge_post_cache'], 10, 1);
        add_action('deleted_post', [$this, 'purge_post_cache'], 10, 1);
        add_action('trashed_post', [$this, 'purge_post_cache'], 10, 1);
        add_action('untrashed_post', [$this, 'purge_post_cache'], 10, 1);

        // Post status transitions
        add_action('publish_post', [$this, 'purge_post_cache'], 10, 1);
        add_action('publish_page', [$this, 'purge_post_cache'], 10, 1);

        // Comment changes
        add_action('comment_post', [$this, 'purge_comment_post_cache'], 10, 3);
        add_action('edit_comment', [$this, 'purge_comment_cache'], 10, 1);
        add_action('trashed_comment', [$this, 'purge_comment_cache'], 10, 1);
        add_action('untrashed_comment', [$this, 'purge_comment_cache'], 10, 1);
        add_action('spammed_comment', [$this, 'purge_comment_cache'], 10, 1);
        add_action('unspammed_comment', [$this, 'purge_comment_cache'], 10, 1);
        add_action('deleted_comment', [$this, 'purge_comment_cache'], 10, 1);
        add_action('wp_set_comment_status', [$this, 'purge_comment_cache'], 10, 1);

        // Term/taxonomy changes
        add_action('created_term', [$this, 'purge_all_cache'], 10, 0);
        add_action('edited_term', [$this, 'purge_all_cache'], 10, 0);
        add_action('delete_term', [$this, 'purge_all_cache'], 10, 0);

        // Theme/customizer
        add_action('switch_theme', [$this, 'purge_all_cache'], 10, 0);
        add_action('customize_save_after', [$this, 'purge_all_cache'], 10, 0);

        // Widgets/menus
        add_action('update_option_sidebars_widgets', [$this, 'purge_all_cache'], 10, 0);
        add_action('wp_update_nav_menu', [$this, 'purge_all_cache'], 10, 0);

        // WooCommerce specific
        if (class_exists('WooCommerce')) {
            add_action('woocommerce_product_set_stock', [$this, 'purge_product_cache']);
            add_action('woocommerce_product_set_stock_status', [$this, 'purge_product_cache']);
            add_action('woocommerce_variation_set_stock', [$this, 'purge_product_cache']);
            add_action('woocommerce_variation_set_stock_status', [$this, 'purge_product_cache']);
            add_action('woocommerce_new_order', [$this, 'purge_cache_for_urls'], 10, 0);
            add_action('woocommerce_update_order', [$this, 'purge_cache_for_urls'], 10, 0);
            add_action('woocommerce_order_status_changed', [$this, 'purge_cache_for_urls'], 10, 0);
        }

        // === ADMIN UI ===
        if (is_admin()) {
            add_action('admin_bar_menu', [$this, 'add_admin_bar_menu'], 100);
            add_action('admin_init', [$this, 'handle_manual_purge']);
            add_action('admin_notices', [$this, 'admin_notices']);
        }

        // === DEBUG HEADER ===
        add_action('wp', [$this, 'maybe_add_debug_header']);

        // === WP-CLI ===
        if (defined('WP_CLI') && WP_CLI) {
            $this->register_cli_commands();
        }
    }

    // ============================================
    // CACHE INVALIDATION METHODS
    // ============================================

    /**
     * Purge cache for a specific post
     */
    public function purge_post_cache(int $post_id): void
    {
        $post = get_post($post_id);
        if (!$post || $post->post_status !== 'publish') {
            return;
        }

        $urls = [];

        // The post itself
        $post_url = get_permalink($post_id);
        if ($post_url) {
            $urls[] = $post_url;
        }

        // Homepage
        $urls[] = home_url('/');

        // Post type archive
        $post_type_archive = get_post_type_archive_link($post->post_type);
        if ($post_type_archive) {
            $urls[] = $post_type_archive;
        }

        // Taxonomy archives for this post
        $taxonomies = get_object_taxonomies($post->post_type);
        foreach ($taxonomies as $taxonomy) {
            $terms = get_the_terms($post_id, $taxonomy);
            if (is_array($terms)) {
                foreach ($terms as $term) {
                    $term_link = get_term_link($term, $taxonomy);
                    if (!is_wp_error($term_link)) {
                        $urls[] = $term_link;
                    }
                }
            }
        }

        // Author archive
        $author_url = get_author_posts_url($post->post_author);
        if ($author_url) {
            $urls[] = $author_url;
        }

        // Feed
        $urls[] = get_feed_link();

        $this->purge_cache_for_urls($urls);
    }

    /**
     * Purge cache when a comment is posted
     */
    public function purge_comment_post_cache(int $comment_id, int $comment_approved, array $comment_data): void
    {
        if ($comment_approved !== 1) {
            return; // Only purge for approved comments
        }

        $post_id = $comment_data['comment_post_ID'] ?? 0;
        if ($post_id) {
            $this->purge_post_cache((int)$post_id);
        }
    }

    /**
     * Purge cache for a comment
     */
    public function purge_comment_cache(int $comment_id): void
    {
        $comment = get_comment($comment_id);
        if ($comment && $comment->comment_post_ID) {
            $this->purge_post_cache((int)$comment->comment_post_ID);
        }
    }

    /**
     * Purge all cache
     */
    public function purge_all_cache(): void
    {
        // Purge NGINX cache
        $this->purge_nginx_cache('purge_all');

        // Purge WordPress file cache
        $this->purge_wordpress_file_cache();

        do_action('railway_cache_purged_all');
    }

    /**
     * Purge WooCommerce product cache
     */
    public function purge_product_cache(int $product_id): void
    {
        $product = wc_get_product($product_id);
        if ($product) {
            $urls = [
                get_permalink($product_id),
                home_url('/'),
                wc_get_page_permalink('shop'),
            ];
            $this->purge_cache_for_urls(array_filter($urls));
        }
    }

    /**
     * Purge cache for specific URLs
     */
    public function purge_cache_for_urls(array $urls = []): void
    {
        if (empty($urls)) {
            $this->purge_all_cache();
            return;
        }

        // Deduplicate
        $urls = array_unique(array_filter($urls));

        // Purge from NGINX
        $this->purge_nginx_cache('purge_urls', $urls);

        // Also purge from WordPress file cache
        foreach ($urls as $url) {
            $this->purge_wordpress_file_cache_for_url($url);
        }

        if ($this->debug) {
            error_log('[Railway Cache] Purged ' . count($urls) . ' URLs');
        }
    }

    // ============================================
    // NGINX CACHE PURGE
    // ============================================

    /**
     * Purge NGINX cache by deleting cache files directly
     * Since both PHP-FPM and nginx run as www-data, we can access the cache directory
     */
    private function purge_nginx_cache(string $action, array $urls = []): void
    {
        switch ($action) {
            case 'purge_all':
                $this->purge_nginx_cache_all();
                break;

            case 'purge_url':
                if (!empty($urls)) {
                    $this->purge_nginx_cache_url($urls[0]);
                }
                break;

            case 'purge_urls':
                foreach ($urls as $url) {
                    $this->purge_nginx_cache_url($url);
                }
                break;
        }
    }

    /**
     * Purge all NGINX cache files
     */
    private function purge_nginx_cache_all(): void
    {
        // NGINX cache lives inside the WordPress volume for persistence on Railway
        $cache_path = WP_CONTENT_DIR . '/cache/nginx';

        if (!is_dir($cache_path)) {
            return;
        }

        // Use shell command for fastest recursive deletion
        // The -mindepth 1 ensures we don't delete the nginx directory itself
        shell_exec('find ' . escapeshellarg($cache_path) . ' -mindepth 1 -delete 2>/dev/null');

        if ($this->debug) {
            error_log('[Railway Cache] NGINX cache fully purged at: ' . $cache_path);
        }
    }

    /**
     * Purge NGINX cache for a specific URL by calculating the cache key hash
     * NGINX cache file path: /wp-content/cache/nginx/{md5[0]}/{md5[1..2]}/{md5}
     * where md5 = md5("$scheme$request_method$host$request_uri")
     */
    private function purge_nginx_cache_url(string $url): bool
    {
        $cache_path = WP_CONTENT_DIR . '/cache/nginx';
        $found = false;

        foreach ($this->get_url_variants($url) as $variant) {
            $parsed = parse_url($variant);
            if (!$parsed) {
                continue;
            }

            $scheme = ($parsed['scheme'] ?? 'https') . 'GET';
            $host = $parsed['host'] ?? ($_SERVER['HTTP_HOST'] ?? 'localhost');
            $path = ($parsed['path'] ?? '/') . (isset($parsed['query']) ? '?' . $parsed['query'] : '');
            $cache_key = $scheme . $host . $path;
            $md5 = md5($cache_key);
            $file = $cache_path . '/' . substr($md5, 0, 1) . '/' . substr($md5, 1, 2) . '/' . $md5;

            if (file_exists($file)) {
                @unlink($file);
                $found = true;

                // Clean up empty parent directories
                $dir = dirname($file);
                @rmdir($dir);
                @rmdir(dirname($dir));
            }
        }

        if ($this->debug && $found) {
            error_log('[Railway Cache] Purged NGINX cache for: ' . $url);
        }

        return $found;
    }

    /**
     * Direct file-system purge (legacy method, kept for compatibility)
     */
    public function purge_nginx_cache_direct(string $url): bool
    {
        return $this->purge_nginx_cache_url($url);
    }

    // ============================================
    // WORDPRESS FILE CACHE (FALLBACK)
    // ============================================

    /**
     * Purge all WordPress file cache
     */
    private function purge_wordpress_file_cache(): void
    {
        if (!is_dir($this->cache_dir)) return;

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($this->cache_dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        foreach ($iterator as $file) {
            if ($file->isDir()) {
                @rmdir($file->getPathname());
            } else {
                @unlink($file->getPathname());
            }
        }
    }

    /**
     * Purge file cache for a specific URL
     */
    private function purge_wordpress_file_cache_for_url(string $url): void
    {
        foreach ($this->get_url_variants($url) as $variant) {
            $hash = sha1($variant);
            $file = $this->cache_dir . substr($hash, 0, 2) . '/' . $hash . '.cache';

            @unlink($file);
            @unlink($file . '.gz');

            // Remove stale files created by earlier builds that used .html.
            $legacy_file = $this->cache_dir . substr($hash, 0, 2) . '/' . $hash . '.html';
            @unlink($legacy_file);
            @unlink($legacy_file . '.gz');
        }
    }

    // ============================================
    // ADMIN UI
    // ============================================

    /**
     * Add admin bar menu
     */
    public function add_admin_bar_menu(WP_Admin_Bar $wp_admin_bar): void
    {
        if (!current_user_can('manage_options')) return;

        $cache_status = $this->get_cache_status();

        $wp_admin_bar->add_node([
            'id' => 'railway-cache',
            'title' => '🚄 Cache (' . $cache_status . ')',
            'href' => '#',
        ]);

        $wp_admin_bar->add_node([
            'id' => 'railway-cache-purge-all',
            'parent' => 'railway-cache',
            'title' => 'Purge All Cache',
            'href' => wp_nonce_url(admin_url('?railway_cache_action=purge_all'), 'railway_cache_purge'),
        ]);

        $wp_admin_bar->add_node([
            'id' => 'railway-cache-purge-page',
            'parent' => 'railway-cache',
            'title' => 'Purge This Page',
            'href' => wp_nonce_url(add_query_arg('railway_cache_action', 'purge_page'), 'railway_cache_purge'),
        ]);

        // Show current page cache status
        $page_cache_status = $this->is_current_page_excluded() ? 'EXCLUDED' : 'CACHED';
        $wp_admin_bar->add_node([
            'id' => 'railway-cache-status',
            'parent' => 'railway-cache',
            'title' => 'This page: ' . $page_cache_status,
            'href' => false,
        ]);
    }

    /**
     * Handle manual purge actions
     */
    public function handle_manual_purge(): void
    {
        if (!isset($_GET['railway_cache_action'])) return;
        if (!wp_verify_nonce($_GET['_wpnonce'] ?? '', 'railway_cache_purge')) return;
        if (!current_user_can('manage_options')) return;

        $action = sanitize_text_field($_GET['railway_cache_action']);

        switch ($action) {
            case 'purge_all':
                $this->purge_all_cache();
                wp_redirect(add_query_arg('railway_cache_notice', 'purged_all', remove_query_arg(['railway_cache_action', '_wpnonce'])));
                exit;

            case 'purge_page':
                $current_url = home_url(add_query_arg([]));
                $this->purge_cache_for_urls([$current_url]);
                wp_redirect(add_query_arg('railway_cache_notice', 'purged_page', remove_query_arg(['railway_cache_action', '_wpnonce'])));
                exit;
        }
    }

    /**
     * Admin notices
     */
    public function admin_notices(): void
    {
        if (!isset($_GET['railway_cache_notice'])) return;

        $notice = sanitize_text_field($_GET['railway_cache_notice']);
        $message = '';

        switch ($notice) {
            case 'purged_all':
                $message = 'All cache layers have been purged successfully.';
                break;
            case 'purged_page':
                $message = 'Current page cache has been purged.';
                break;
        }

        if ($message) {
            echo '<div class="notice notice-success is-dismissible"><p><strong>Railway Cache:</strong> ' . esc_html($message) . '</p></div>';
        }
    }

    /**
     * Add debug header
     */
    public function maybe_add_debug_header(): void
    {
        if (!$this->debug || headers_sent()) return;

        $excluded = $this->is_current_page_excluded();
        header('X-Railway-Cache: ' . ($excluded ? 'EXCLUDED' : 'CANDIDATE'));
        header('X-Railway-Cache-Manager: active');
    }

    // ============================================
    // HELPERS
    // ============================================

    /**
     * Check if current page should be excluded from cache
     */
    public function is_current_page_excluded(): bool
    {
        // Admin
        if (is_admin()) return true;

        // Logged-in users
        if (is_user_logged_in()) return true;

        // Search
        if (is_search()) return true;

        // 404
        if (is_404()) return true;

        // Password protected
        if (post_password_required()) return true;

        // Check against excluded patterns
        $request_uri = $_SERVER['REQUEST_URI'] ?? '/';
        foreach ($this->excluded_patterns as $pattern) {
            if (stripos($request_uri, $pattern) !== false) {
                return true;
            }
        }

        return false;
    }

    /**
     * Return URL variants that may have been cached behind Railway's TLS proxy.
     * WordPress permalinks are usually https://, while the container may see
     * http:// unless X-Forwarded-Proto was propagated correctly.
     */
    private function get_url_variants(string $url): array
    {
        $parsed = parse_url($url);
        if (!$parsed) {
            return [];
        }

        $scheme = strtolower($parsed['scheme'] ?? 'https');
        $host = $parsed['host'] ?? ($_SERVER['HTTP_HOST'] ?? 'localhost');
        $port = isset($parsed['port']) ? ':' . $parsed['port'] : '';
        $authority = $host . $port;
        $path = $parsed['path'] ?? '/';
        $path = $path === '' ? '/' : $path;
        $query = isset($parsed['query']) ? '?' . $parsed['query'] : '';

        $schemes = $scheme === 'https' ? ['https', 'http'] : ['http', 'https'];
        $path_variants = $path === '/'
            ? ['/']
            : array_unique([$path, rtrim($path, '/') . '/', rtrim($path, '/')]);

        $variants = [];
        foreach ($schemes as $variant_scheme) {
            foreach ($path_variants as $variant_path) {
                $variants[] = $variant_scheme . '://' . $authority . $variant_path . $query;
            }
        }

        return array_values(array_unique($variants));
    }

    /**
     * Get cache status
     */
    private function get_cache_status(): string
    {
        $nginx_cache = WP_CONTENT_DIR . '/cache/nginx';
        $file_count = 0;

        if (is_dir($nginx_cache)) {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($nginx_cache, RecursiveDirectoryIterator::SKIP_DOTS)
            );
            foreach ($iterator as $file) {
                if ($file->isFile()) $file_count++;
            }
        }

        return $file_count > 0 ? $file_count . ' files' : 'Empty';
    }

    // ============================================
    // WP-CLI
    // ============================================

    private function register_cli_commands(): void
    {
        \WP_CLI::add_command('railway-cache', Railway_Cache_CLI::class);
    }
}

// ============================================
// WP-CLI COMMANDS
// ============================================

class Railway_Cache_CLI
{
    /**
     * Purge all cache layers
     *
     * ## EXAMPLES
     *   wp railway-cache purge-all
     */
    public function purge_all(): void
    {
        $manager = new Railway_Cache_Manager();
        $manager->purge_all_cache();
        \WP_CLI::success('All cache layers purged.');
    }

    /**
     * Purge cache for a specific URL
     *
     * ## OPTIONS
     * <url>
     * : The URL to purge
     *
     * ## EXAMPLES
     *   wp railway-cache purge-url https://example.com/about/
     */
    public function purge_url(array $args): void
    {
        $manager = new Railway_Cache_Manager();
        $manager->purge_cache_for_urls([$args[0]]);
        \WP_CLI::success("Cache purged for: {$args[0]}");
    }

    /**
     * Show cache statistics
     *
     * ## EXAMPLES
     *   wp railway-cache stats
     */
    public function stats(): void
    {
        $nginx_cache = WP_CONTENT_DIR . '/cache/nginx';
        $file_count = 0;
        $total_size = 0;

        if (is_dir($nginx_cache)) {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($nginx_cache, RecursiveDirectoryIterator::SKIP_DOTS)
            );
            foreach ($iterator as $file) {
                if ($file->isFile()) {
                    $file_count++;
                    $total_size += $file->getSize();
                }
            }
        }

        \WP_CLI::line('=== Railway Cache Statistics ===');
        \WP_CLI::line('NGINX Cache Path: ' . $nginx_cache);
        \WP_CLI::line('Cached Files: ' . $file_count);
        \WP_CLI::line('Total Size: ' . size_format($total_size));
        \WP_CLI::line('Redis Object Cache: ' . (wp_cache_get('test') !== false ? 'Active' : 'Check with `wp redis status`'));
    }
}

// Initialize
add_action('muplugins_loaded', function () {
    new Railway_Cache_Manager();
});
