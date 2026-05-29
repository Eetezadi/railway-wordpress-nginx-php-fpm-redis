FROM wordpress:7-php8.4-fpm-alpine

# Install dependencies
RUN apk add --no-cache \
    nginx \
    gettext \
    freetype-dev \
    libjpeg-turbo-dev \
    libpng-dev \
    libzip-dev \
    unzip \
    wget \
    curl \
    fcgi \
    bash

# Remove ALL default nginx configs
RUN rm -rf /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d/default.conf

# Create clean nginx.conf (no default server block)
COPY nginx.conf /etc/nginx/nginx.conf

# Install PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) gd zip opcache

# Install Redis extension (requires build tools temporarily)
RUN apk add --no-cache --virtual .build-deps autoconf gcc g++ make \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del .build-deps

# Install WP-CLI
RUN curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
    && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp

# ============================================
# RAILWAY CACHE SYSTEM SETUP
# ============================================

# Create cache system directory (source files copied into WordPress volume on startup)
RUN mkdir -p /usr/local/share/railway-cache-system

# Copy cache system files
COPY cache-system/railway-cache-manager.php /usr/local/share/railway-cache-system/
COPY cache-system/advanced-cache.php /usr/local/share/railway-cache-system/

# Note: NGINX cache directory lives inside WordPress volume at
# /var/www/html/wp-content/cache/nginx — created by docker-entrypoint.sh on startup

# CRITICAL: Fix Nginx permissions for Railway
RUN mkdir -p /var/lib/nginx /var/log/nginx /run/nginx && \
    chown -R www-data:www-data /var/lib/nginx /var/log/nginx /run/nginx

# Configure PHP-FPM
RUN echo "pm.status_path = /status" >> /usr/local/etc/php-fpm.d/zz-docker.conf
RUN sed -i 's/listen = .*/listen = 127.0.0.1:9000/' /usr/local/etc/php-fpm.d/zz-docker.conf

# Copy configuration files
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY wp-config-custom.php /usr/local/share/wp-config-custom.php
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint-custom.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-custom.sh

# Ensure the mount point exists and has correct ownership
RUN mkdir -p /var/www/html && chown -R www-data:www-data /var/www/html

ENTRYPOINT ["docker-entrypoint-custom.sh"]
CMD ["php-fpm"]
