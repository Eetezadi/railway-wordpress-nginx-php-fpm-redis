import { getDashboardPool } from './database.js';

export async function listSites() {
  const pool = getDashboardPool();
  const [rows] = await pool.query(
    'SELECT * FROM dashboard_sites WHERE status != ? ORDER BY created_at DESC',
    ['deleted']
  );
  return rows;
}

export async function getSite(id) {
  const pool = getDashboardPool();
  const [rows] = await pool.query('SELECT * FROM dashboard_sites WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function createSite({ name, slug, dbName, redisPrefix }) {
  const pool = getDashboardPool();
  const [result] = await pool.query(
    'INSERT INTO dashboard_sites (name, slug, db_name, redis_prefix) VALUES (?, ?, ?, ?)',
    [name, slug, dbName, redisPrefix]
  );
  return result.insertId;
}

export async function deleteSite(id) {
  const pool = getDashboardPool();
  await pool.query('DELETE FROM dashboard_sites WHERE id = ?', [id]);
}

export async function purgeDeletedSites() {
  const pool = getDashboardPool();
  const [result] = await pool.query("DELETE FROM dashboard_sites WHERE status = 'deleted'");
  return result.affectedRows;
}

export async function getSiteByServiceId(serviceId) {
  const pool = getDashboardPool();
  const [rows] = await pool.query(
    'SELECT * FROM dashboard_sites WHERE railway_service_id = ? AND status != ? LIMIT 1',
    [serviceId, 'deleted']
  );
  return rows[0] || null;
}

export async function updateSite(id, fields) {
  const pool = getDashboardPool();
  const sets = [];
  const values = [];
  for (const [key, val] of Object.entries(fields)) {
    sets.push(`\`${key}\` = ?`);
    values.push(val);
  }
  values.push(id);
  await pool.query(`UPDATE dashboard_sites SET ${sets.join(', ')} WHERE id = ?`, values);
}
