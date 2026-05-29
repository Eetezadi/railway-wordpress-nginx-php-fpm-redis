-- Dashboard database schema
-- Auto-created by the app on startup, this file is for reference only

CREATE DATABASE IF NOT EXISTS wp_dashboard;
USE wp_dashboard;

CREATE TABLE IF NOT EXISTS dashboard_sites (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100)  NOT NULL,
  slug            VARCHAR(64)   NOT NULL UNIQUE,
  db_name         VARCHAR(64)   NOT NULL UNIQUE,
  redis_prefix    VARCHAR(32)   NOT NULL UNIQUE,
  railway_service_id VARCHAR(64),
  railway_domain  VARCHAR(255),
  custom_domain   VARCHAR(255),
  status          ENUM('provisioning','active','error','deleted') NOT NULL DEFAULT 'provisioning',
  error_message   TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
