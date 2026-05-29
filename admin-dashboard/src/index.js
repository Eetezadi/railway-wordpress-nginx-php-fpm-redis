import { createAdaptorServer } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { WebSocketServer } from 'ws';
import { spawn, execSync } from 'child_process';
import config from './config.js';
import { initDashboardDb } from './services/database.js';
import { getSite } from './services/siteRegistry.js';
import sitesApi from './api/sites.js';
import passwordsApi from './api/passwords.js';
import authApi from './api/auth.js';
import webhooksApi from './api/webhooks.js';
import { clerkAuth } from './middleware/clerkAuth.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '..', 'dist');

const app = new Hono();

app.use(logger());
app.use('/api/*', cors());

// Health check
app.get('/health', (c) => c.text('ok'));

// Auth info endpoint (no auth required — returns publishable key)
app.route('/api/auth', authApi);
app.route('/api/webhooks', webhooksApi);

// Protected API routes
app.use('/api/*', clerkAuth);
app.route('/api/sites', sitesApi);
app.route('/api/passwords', passwordsApi);

// Serve static frontend in production
if (existsSync(distPath)) {
  app.use('/*', serveStatic({ root: './dist' }));

  // SPA fallback — serve index.html for all non-API, non-static routes
  app.get('*', (c) => {
    const html = readFileSync(join(distPath, 'index.html'), 'utf-8');
    return c.html(html);
  });
}

// Init DB and start server
await initDashboardDb();
console.log(`Dashboard starting on port ${config.PORT}`);

const server = createAdaptorServer(app);

// WebSocket server for shell access
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const match = url.pathname.match(/^\/api\/sites\/([^/]+)\/shell$/);

  if (!match) {
    socket.destroy();
    return;
  }

  const siteId = match[1];
  const token = url.searchParams.get('token');

  if (!token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Verify token using Clerk
  try {
    const { verifyToken } = await import('@clerk/backend');
    await verifyToken(token, {
      secretKey: config.CLERK_SECRET_KEY,
    });
  } catch (err) {
    console.error('[shell] Auth failed:', err.message);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Look up site
  const site = await getSite(siteId);
  if (!site || site.status !== 'active' || !site.railway_service_id) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, site);
  });
});

wss.on('connection', (ws, req, site) => {
  // Check if railway CLI is available
  let hasRailwayCli = false;
  try {
    execSync('which railway', { stdio: 'ignore' });
    hasRailwayCli = true;
  } catch {
    // not available
  }

  if (!hasRailwayCli) {
    ws.send('Railway CLI not installed - shell access unavailable\r\n');
    ws.close();
    return;
  }

  const child = spawn('railway', [
    'exec', '--service', site.railway_service_id,
    '--environment', 'production',
    '--', '/bin/bash',
  ], {
    env: {
      ...process.env,
      RAILWAY_TOKEN: config.RAILWAY_API_TOKEN,
      RAILWAY_PROJECT_ID: config.RAILWAY_PROJECT_ID,
    },
  });

  child.stdout.on('data', (data) => {
    if (ws.readyState === ws.OPEN) ws.send(data.toString());
  });

  child.stderr.on('data', (data) => {
    if (ws.readyState === ws.OPEN) ws.send(data.toString());
  });

  child.on('exit', (code) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(`\r\n[Process exited with code ${code}]\r\n`);
      ws.close();
    }
  });

  child.on('error', (err) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(`\r\n[Error: ${err.message}]\r\n`);
      ws.close();
    }
  });

  ws.on('message', (data) => {
    if (child.stdin.writable) {
      child.stdin.write(data);
    }
  });

  ws.on('close', () => {
    child.kill();
  });
});

server.listen(Number(config.PORT));
