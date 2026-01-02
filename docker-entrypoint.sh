#!/bin/bash
set -e

# Graceful shutdown handler
cleanup() {
    echo "Shutting down..."
    nginx -s quit 2>/dev/null || true
    kill -TERM "$PHP_FPM_PID" 2>/dev/null || true
    wait "$PHP_FPM_PID" 2>/dev/null || true
    exit 0
}
trap cleanup SIGTERM SIGINT

# 1. Generate PHP config
PHP_INI_DIR="/usr/local/etc/php/conf.d"
cat > "${PHP_INI_DIR}/custom-settings.ini" << EOF
upload_max_filesize = ${PHP_UPLOAD_MAX_FILESIZE:-256M}
post_max_size = ${PHP_POST_MAX_SIZE:-256M}
memory_limit = ${PHP_MEMORY_LIMIT:-512M}
EOF

# 2. Generate Nginx config
export NGINX_CLIENT_MAX_BODY_SIZE="${NGINX_CLIENT_MAX_BODY_SIZE:-256M}"
mkdir -p /etc/nginx/conf.d
envsubst '${NGINX_CLIENT_MAX_BODY_SIZE}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# 3. Test nginx configuration
echo "Testing nginx configuration..."
nginx -t

# 4. Initialize WordPress files in volume (call original WP entrypoint)
echo "Initializing WordPress..."
# The original WordPress entrypoint at /usr/local/bin/docker-entrypoint.sh handles file setup
docker-entrypoint.sh php-fpm -t

# 5. Inject custom wp-config.php modifications for dynamic domain handling
if [ -f /var/www/html/wp-config.php ]; then
    echo "Injecting dynamic domain configuration into wp-config.php..."
    # Check if our custom config is already injected
    if ! grep -q "wp-config-custom.php" /var/www/html/wp-config.php; then
        # Insert our custom config at the beginning of wp-config.php (after <?php)
        sed -i "2i\\
// Dynamic domain configuration - injected by Railway\\
require_once('/usr/local/share/wp-config-custom.php');\\
" /var/www/html/wp-config.php
        echo "Dynamic domain configuration injected successfully."
    else
        echo "Dynamic domain configuration already present."
    fi
fi

# 6. Fix permissions
chown -R www-data:www-data /var/www/html

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
