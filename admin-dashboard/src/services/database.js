import mysql from 'mysql2/promise';
import config from '../config.js';

let dashboardPool;

export function getDashboardPool() {
  if (!dashboardPool) {
    dashboardPool = mysql.createPool({
      host: config.MYSQL_HOST,
      port: config.MYSQL_PORT,
      user: config.MYSQL_USER,
      password: config.MYSQL_PASSWORD,
      database: config.DASHBOARD_DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return dashboardPool;
}

export async function getSiteConnection(dbName, extraOptions = {}) {
  return mysql.createConnection({
    host: config.MYSQL_HOST,
    port: config.MYSQL_PORT,
    user: config.MYSQL_USER,
    password: config.MYSQL_PASSWORD,
    database: dbName,
    ...extraOptions,
  });
}

export async function createDatabase(dbName) {
  const conn = await mysql.createConnection({
    host: config.MYSQL_HOST,
    port: config.MYSQL_PORT,
    user: config.MYSQL_USER,
    password: config.MYSQL_PASSWORD,
  });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  } finally {
    await conn.end();
  }
}

export async function initDashboardDb() {
  const conn = await mysql.createConnection({
    host: config.MYSQL_HOST,
    port: config.MYSQL_PORT,
    user: config.MYSQL_USER,
    password: config.MYSQL_PASSWORD,
  });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${config.DASHBOARD_DB_NAME}\``);
  } finally {
    await conn.end();
  }

  const pool = getDashboardPool();
  await pool.query(`
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
    )
  `);
  console.log('Dashboard database initialized');
}
