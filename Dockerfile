FROM wordpress:php8.3-fpm

# Install dependencies
RUN apt-get update && apt-get install -y \
    nginx \
    gettext-base \
    libfreetype6-dev \
    libjpeg62-turbo-dev \
    libpng-dev \
    libzip-dev \
    unzip \
    wget \
    libfcgi-bin \
    && rm -rf /var/lib/apt/lists/*

# Remove ALL default nginx configs
RUN rm -rf /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d/default.conf

# Create clean nginx.conf (no default server block)
COPY nginx.conf /etc/nginx/nginx.conf

# Install PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) gd zip opcache
RUN pecl install redis && docker-php-ext-enable redis

# Install WP-CLI
RUN curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
    && chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp

# CRITICAL: Fix Nginx permissions for Railway
RUN mkdir -p /var/cache/nginx /var/lib/nginx /var/log/nginx /run/nginx && \
    chown -R www-data:www-data /var/cache/nginx /var/lib/nginx /var/log/nginx /run/nginx

# Configure PHP-FPM
RUN echo "pm.status_path = /status" >> /usr/local/etc/php-fpm.d/zz-docker.conf
RUN sed -i 's/listen = .*/listen = 127.0.0.1:9000/' /usr/local/etc/php-fpm.d/zz-docker.conf

COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY wp-config-custom.php /usr/local/share/wp-config-custom.php
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint-custom.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-custom.sh

# Ensure the mount point exists and has correct ownership
RUN mkdir -p /var/www/html && chown -R www-data:www-data /var/www/html

ENTRYPOINT ["docker-entrypoint-custom.sh"]
CMD ["php-fpm"]