const required = [
  'CLERK_SECRET_KEY',
  'CLERK_PUBLISHABLE_KEY',
  'RAILWAY_API_TOKEN',
  'RAILWAY_PROJECT_ID',
  'MYSQL_HOST',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
];

const config = {};

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
  config[key] = process.env[key];
}

config.PORT = process.env.PORT || 3000;
config.MYSQL_PORT = process.env.MYSQL_PORT || 3306;
config.DASHBOARD_DB_NAME = process.env.DASHBOARD_DB_NAME || 'wp_dashboard';
config.RAILWAY_ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID || '';
config.RAILWAY_WP_REPO = process.env.RAILWAY_WP_REPO || '';
config.RAILWAY_WEBHOOK_SECRET = process.env.RAILWAY_WEBHOOK_SECRET || '';

// Optional: internal Railway private-network URL for this dashboard service.
// When the dashboard and WP services are in the same Railway project, Railway
// provides private DNS at <service-name>.railway.internal.
// Set this to e.g. http://admin-dashboard.railway.internal:3000 and use
// ${DASHBOARD_INTERNAL_URL}/api/webhooks/railway as the webhook URL in
// Railway project settings to avoid going over the public internet.
// Falls back to DASHBOARD_URL (public URL) if internal URL is not set.
config.DASHBOARD_INTERNAL_URL = process.env.DASHBOARD_INTERNAL_URL || '';
config.DASHBOARD_URL = process.env.DASHBOARD_URL || '';
// Railway Object Storage (S3-compatible, AWS SDK Generic style)
config.AWS_ENDPOINT_URL = process.env.AWS_ENDPOINT_URL || '';
config.AWS_DEFAULT_REGION = process.env.AWS_DEFAULT_REGION || 'us-east-1';
config.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
config.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
config.AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || '';

export default config;
