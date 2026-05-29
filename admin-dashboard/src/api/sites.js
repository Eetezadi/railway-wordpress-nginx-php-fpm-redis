import { Hono } from 'hono';
import { createSite, listSites, getSite, updateSite, deleteSite, purgeDeletedSites } from '../services/siteRegistry.js';

const RAILWAY_DONE = new Set(['ACTIVE', 'SUCCESS', 'SLEEPING']);
const RAILWAY_FAIL = new Set(['FAILED', 'CRASHED', 'REMOVED']);
import { createDatabase, getSiteConnection } from '../services/database.js';
import { createService, prepareService, triggerDeploy, getServiceStatus, deleteService } from '../services/railway.js';
import { listWpUsers } from '../services/wordpress.js';
import { listBackupSources, listBackupDates, listBackupFiles, getBackupStream, getPresignedUrl } from '../services/s3.js';
import { createGunzip } from 'zlib';
import { Parser as TarParser } from 'tar';
import config from '../config.js';

const app = new Hono();

let lastCreateTime = 0;

// Purge all soft-deleted sites
app.delete('/purge', async (c) => {
  const count = await purgeDeletedSites();
  return c.json({ purged: count });
});

// List all sites (auto-checks provisioning statuses)
app.get('/', async (c) => {
  const sites = await listSites();
  // Check Railway status for any provisioning sites
  for (const site of sites) {
    if (site.status === 'provisioning' && site.railway_service_id) {
      try {
        const railwayStatus = await getServiceStatus(site.railway_service_id);
        console.log(`[status-poller] site ${site.id} railway status: "${railwayStatus}"`);
        if (RAILWAY_DONE.has(railwayStatus)) {
          await updateSite(site.id, { status: 'active' });
          site.status = 'active';
        } else if (RAILWAY_FAIL.has(railwayStatus)) {
          await updateSite(site.id, { status: 'error', error_message: `Deployment ${railwayStatus}` });
          site.status = 'error';
        }
      } catch (err) {
        console.error('Status check error:', err);
      }
    }
  }
  return c.json(sites);
});

// Get single site (auto-checks provisioning status)
app.get('/:id', async (c) => {
  const site = await getSite(c.req.param('id'));
  if (!site) return c.json({ error: 'Not found' }, 404);
  if (site.status === 'provisioning' && site.railway_service_id) {
    try {
      const railwayStatus = await getServiceStatus(site.railway_service_id);
      console.log(`[status-poller] site ${site.id} railway status: "${railwayStatus}"`);
      if (RAILWAY_DONE.has(railwayStatus)) {
        await updateSite(site.id, { status: 'active' });
        site.status = 'active';
        console.log(`[status-poller] site ${site.id} transitioned to active (Railway: ${railwayStatus})`);
      } else if (RAILWAY_FAIL.has(railwayStatus)) {
        await updateSite(site.id, { status: 'error', error_message: `Deployment ${railwayStatus}` });
        site.status = 'error';
        console.log(`[status-poller] site ${site.id} error (Railway: ${railwayStatus})`);
      }
    } catch (err) {
      console.error('Status check error:', err);
    }
  }
  return c.json(site);
});

// Get WP users for a site
app.get('/:id/users', async (c) => {
  const site = await getSite(c.req.param('id'));
  if (!site) return c.json({ error: 'Not found' }, 404);
  try {
    const users = await listWpUsers(site.db_name);
    return c.json(users);
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// Check deployment status
app.get('/:id/status', async (c) => {
  const site = await getSite(c.req.param('id'));
  if (!site) return c.json({ error: 'Not found' }, 404);

  let deployStatus = site.status;
  if (site.railway_service_id && site.status === 'provisioning') {
    try {
      const railwayStatus = await getServiceStatus(site.railway_service_id);
      console.log(`[status-poller] site ${site.id} railway status: "${railwayStatus}"`);
      if (RAILWAY_DONE.has(railwayStatus)) {
        await updateSite(site.id, { status: 'active' });
        deployStatus = 'active';
        console.log(`[status-poller] site ${site.id} transitioned to active (Railway: ${railwayStatus})`);
      } else if (RAILWAY_FAIL.has(railwayStatus)) {
        await updateSite(site.id, { status: 'error', error_message: `Deployment ${railwayStatus}` });
        deployStatus = 'error';
        console.log(`[status-poller] site ${site.id} error (Railway: ${railwayStatus})`);
      } else if (railwayStatus === 'no_deployments') {
        // Service exists but was never deployed — surface as an error so it's
        // not silently stuck in 'provisioning' indefinitely.
        await updateSite(site.id, { status: 'error', error_message: 'No deployments found — service may not have been triggered' });
        deployStatus = 'error';
      }
    } catch (err) {
      console.error('Status check error:', err);
    }
  }

  return c.json({ id: site.id, status: deployStatus, domain: site.railway_domain });
});

// Delete site
app.delete('/:id', async (c) => {
  const site = await getSite(c.req.param('id'));
  if (!site) return c.json({ error: 'Not found' }, 404);
  if (site.status === 'deleted') return c.json({ error: 'Already deleted' }, 400);

  try {
    if (site.railway_service_id) {
      try {
        await deleteService(site.railway_service_id);
      } catch (err) {
        console.error('Railway service deletion error (continuing):', err);
      }
    }
    await deleteSite(site.id);
    return c.json({ success: true });
  } catch (err) {
    console.error('Site deletion error:', err);
    return c.json({ error: err.message || 'Failed to delete site' }, 500);
  }
});

// Create new site
app.post('/', async (c) => {
  const now = Date.now();
  if (now - lastCreateTime < 10000) {
    return c.json({ error: 'Please wait before creating another site' }, 429);
  }

  const { name } = await c.req.json();
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return c.json({ error: 'Site name is required (min 2 characters)' }, 400);
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (slug.length < 2 || slug.length > 32) {
    return c.json({ error: 'Name must produce a valid slug (2-32 chars)' }, 400);
  }

  const dbName = `wp_${slug.replace(/-/g, '_')}`;
  const redisPrefix = `${slug.replace(/-/g, '_')}:`;

  if (!/^[a-z0-9_]{3,64}$/.test(dbName)) {
    return c.json({ error: 'Generated database name is invalid' }, 400);
  }

  try {
    lastCreateTime = now;

    console.log(`[create-site] Creating database: ${dbName}`);
    await createDatabase(dbName);
    console.log(`[create-site] Registering site: ${slug}`);
    const siteId = await createSite({ name: name.trim(), slug, dbName, redisPrefix });
    console.log(`[create-site] Creating Railway service: wp-${slug}`);
    const service = await createService(`wp-${slug}`);

    // Prepare the service (set variables, volume, domain) BEFORE triggering
    // the deploy.  Railway fires webhook events (BUILDING, DEPLOYING) almost
    // immediately after triggerDeploy() is called.  By writing railway_service_id
    // to the DB first we ensure getSiteByServiceId() can match those early events
    // and the site never gets stuck in 'provisioning' due to a race condition.
    console.log(`[create-site] Preparing service: ${service.id}`);
    const { domain } = await prepareService(service.id, { dbName, redisPrefix, siteName: slug });

    await updateSite(siteId, {
      railway_service_id: service.id,
      railway_domain: domain,
    });

    console.log(`[create-site] Triggering deploy: ${service.id}`);
    await triggerDeploy(service.id);

    return c.json({
      id: siteId,
      name: name.trim(),
      slug,
      domain,
      status: 'provisioning',
    }, 202);
  } catch (err) {
    console.error('Site creation error:', err);
    return c.json({ error: err.message || 'Failed to create site' }, 500);
  }
});

// List all backup sources and their dates
app.get('/:id/backups', async (c) => {
  const site = await getSite(c.req.param('id'));
  if (!site) return c.json({ error: 'Not found' }, 404);
  try {
    const source = c.req.query('source');
    if (source) {
      const dates = await listBackupDates(source);
      return c.json({ sources: [{ name: source, dates }] });
    }
    const sources = await listBackupSources();
    const results = await Promise.all(
      sources.map(async (name) => ({
        name,
        dates: await listBackupDates(name),
      }))
    );
    return c.json({ sources: results.filter((s) => s.dates.length > 0) });
  } catch (err) {
    console.error('[backups] Error listing backups:', err);
    return c.json({ error: err.message || 'Failed to list backups' }, 500);
  }
});

// Restore a site from a specific backup date (DB only; files via shell command)
app.post('/:id/restore', async (c) => {
  const site = await getSite(c.req.param('id'));
  if (!site) return c.json({ error: 'Not found' }, 404);
  if (!site.railway_service_id) {
    return c.json({ error: 'Site has no Railway service — cannot restore' }, 400);
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { date, source } = body;
  if (!date || typeof date !== 'string') {
    return c.json({ error: 'date is required' }, 400);
  }
  if (!source || typeof source !== 'string') {
    return c.json({ error: 'source is required (backup folder name)' }, 400);
  }

  try {
    const files = await listBackupFiles(source, date);
    if (!files.length) {
      return c.json({ error: `No backup files found for date: ${date}` }, 404);
    }

    // Find the SQL dump and files tarball.
    // Support two backup formats:
    //   1. Split format: separate {slug}-db-{date}.sql.gz and {slug}-files-{date}.tar.gz objects
    //   2. Combined format: a single backup.tgz containing the SQL dump and files inside the archive
    const sqlFile = files.find((f) => f.key.includes('-db-') && f.key.endsWith('.sql.gz'));
    const tarFile = files.find((f) => f.key.includes('-files-') && f.key.endsWith('.tar.gz'));
    const combinedTgz = files.find((f) => f.key.endsWith('backup.tgz') || f.key.endsWith('backup.tar.gz'));

    if (!sqlFile && !combinedTgz) {
      return c.json({ error: 'No SQL dump found in backup' }, 404);
    }

    let sql;

    if (sqlFile) {
      // --- Split format: dedicated .sql.gz object ---
      const stream = await getBackupStream(sqlFile.key);
      const gunzip = createGunzip();
      const sqlChunks = [];
      await new Promise((resolve, reject) => {
        stream.pipe(gunzip);
        gunzip.on('data', (chunk) => sqlChunks.push(chunk));
        gunzip.on('end', resolve);
        gunzip.on('error', reject);
        stream.on('error', reject);
      });
      sql = Buffer.concat(sqlChunks).toString('utf8');
    } else {
      // --- Combined format: extract SQL dump from inside backup.tgz ---
      const stream = await getBackupStream(combinedTgz.key);
      const gunzip = createGunzip();
      const sqlChunks = [];

      await new Promise((resolve, reject) => {
        const parser = new TarParser();
        let foundSql = false;

        parser.on('entry', (entry) => {
          const entryPath = entry.path || entry.header?.path || '';
          const isSql = entryPath.endsWith('.sql') || entryPath.endsWith('.sql.gz');
          if (isSql && !foundSql) {
            foundSql = true;
            if (entryPath.endsWith('.sql.gz')) {
              const innerGunzip = createGunzip();
              entry.pipe(innerGunzip);
              innerGunzip.on('data', (chunk) => sqlChunks.push(chunk));
              innerGunzip.on('end', () => {});
              innerGunzip.on('error', reject);
            } else {
              entry.on('data', (chunk) => sqlChunks.push(chunk));
            }
            entry.resume();
          } else {
            entry.resume(); // consume and discard non-SQL entries
          }
        });

        parser.on('end', () => {
          if (sqlChunks.length === 0) {
            reject(new Error('No SQL dump file found inside backup.tgz'));
          } else {
            resolve();
          }
        });
        parser.on('error', reject);
        stream.on('error', reject);

        stream.pipe(gunzip).pipe(parser);
      });

      sql = Buffer.concat(sqlChunks).toString('utf8');
    }

    // Execute against the site's MySQL database with multipleStatements enabled
    const conn = await getSiteConnection(site.db_name, { multipleStatements: true });
    try {
      await conn.query('SET FOREIGN_KEY_CHECKS=0;');
      await conn.query(sql);
      await conn.query('SET FOREIGN_KEY_CHECKS=1;');
    } finally {
      await conn.end();
    }

    // --- Files: provide shell command using presigned URL (no aws CLI needed) ---
    let filesCommand = null;
    const filesSource = tarFile || combinedTgz;
    if (filesSource) {
      const url = await getPresignedUrl(filesSource.key);
      filesCommand = `curl -sL '${url}' | tar xzf - -C /var/www/html/`;
    }

    return c.json({
      success: true,
      dbRestored: true,
      filesCommand,
      message: filesCommand
        ? 'Database restored. Run the filesCommand in Shell Access to restore files.'
        : 'Database restored. No files tarball found in this backup.',
    });
  } catch (err) {
    console.error('[restore] Error during restore:', err);
    return c.json({ error: err.message || 'Restore failed' }, 500);
  }
});

export default app;
