---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - admin-dashboard/frontend/src/pages/SiteDetail.jsx
  - admin-dashboard/frontend/src/lib/api.js
  - admin-dashboard/frontend/src/pages/SitesList.jsx
  - admin-dashboard/src/api/sites.js
  - admin-dashboard/frontend/package.json
  - admin-dashboard/frontend/src/components/ShellTerminal.jsx
autonomous: true
requirements: [QUICK-2]
must_haves:
  truths:
    - "SitesList shows all active WP services from database with service health info"
    - "SiteDetail page has a working shell terminal for active sites"
    - "User can type commands and see output from the Railway container"
  artifacts:
    - path: "admin-dashboard/frontend/src/components/ShellTerminal.jsx"
      provides: "xterm.js terminal component with WebSocket connection"
    - path: "admin-dashboard/src/api/sites.js"
      provides: "WebSocket upgrade endpoint for shell exec"
  key_links:
    - from: "ShellTerminal.jsx"
      to: "ws://host/api/sites/:id/shell"
      via: "WebSocket connection"
      pattern: "new WebSocket"
---

<objective>
Enhance the dashboard to (1) show richer site info on the sites list and (2) add interactive shell access to each WP site via xterm.js + WebSocket backed by Railway CLI exec.

Purpose: Give admin full visibility and control over all WP services from the dashboard.
Output: Enhanced SitesList with health details, interactive shell terminal on SiteDetail page.
</objective>

<execution_context>
@/home/nc773/.claude/get-shit-done/workflows/execute-plan.md
@/home/nc773/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@admin-dashboard/frontend/src/pages/SitesList.jsx
@admin-dashboard/frontend/src/pages/SiteDetail.jsx
@admin-dashboard/frontend/src/lib/api.js
@admin-dashboard/src/api/sites.js
@admin-dashboard/src/services/railway.js
@admin-dashboard/src/index.js
@admin-dashboard/frontend/package.json
@admin-dashboard/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enhance SitesList with richer service details</name>
  <files>admin-dashboard/frontend/src/pages/SitesList.jsx, admin-dashboard/src/api/sites.js</files>
  <action>
    1. In `admin-dashboard/src/api/sites.js` GET `/` handler: the endpoint already returns all non-deleted sites and checks Railway status for provisioning ones. Add a `railway_service_id` presence indicator and include `custom_domain` in the response if not already exposed. No schema changes needed - all columns already exist in dashboard_sites.

    2. In `admin-dashboard/frontend/src/pages/SitesList.jsx`:
       - Add a "Service ID" column showing a truncated `railway_service_id` (first 8 chars) or a dash if missing
       - Add a "Custom Domain" column showing `custom_domain` if set, otherwise dash
       - Add filter tabs/buttons at the top: "All", "Active", "Provisioning", "Error" that filter the sites array by status. Default to "All". Use simple state (`const [filter, setFilter] = useState('all')`) and filter the `sites` array before rendering.
       - Show a count badge next to each filter tab with the number of sites in that status
       - Add a colored dot or icon next to each site row indicating live/down status based on `status` field (green for active, yellow for provisioning, red for error)

    These are purely frontend display enhancements. The backend already returns all needed data.
  </action>
  <verify>
    <automated>cd /home/nc773/Documents/railway-wordpress-nginx-php-fpm-redis/admin-dashboard/frontend && npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>SitesList shows all sites with status filter tabs, service ID column, custom domain column, and colored status indicators. Build succeeds.</done>
</task>

<task type="auto">
  <name>Task 2: Add shell terminal with xterm.js on SiteDetail page</name>
  <files>admin-dashboard/frontend/package.json, admin-dashboard/frontend/src/components/ShellTerminal.jsx, admin-dashboard/frontend/src/pages/SiteDetail.jsx, admin-dashboard/frontend/src/lib/api.js, admin-dashboard/src/api/sites.js, admin-dashboard/src/index.js, admin-dashboard/package.json</files>
  <action>
    **Frontend:**

    1. Install xterm.js: `cd admin-dashboard/frontend && npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links`

    2. Create `admin-dashboard/frontend/src/components/ShellTerminal.jsx`:
       - Props: `siteId` (string), `getToken` (function from Clerk auth)
       - On mount, create xterm Terminal instance, attach to a ref div, apply FitAddon
       - Connect via WebSocket to `ws://${window.location.host}/api/sites/${siteId}/shell`
       - Pass auth token as query param: `?token=${await getToken()}`
       - On WS message, write data to terminal (`term.write(data)`)
       - On terminal input (`term.onData`), send to WS
       - On WS close, display "[Connection closed]" in terminal
       - On WS error, display "[Connection error]" in terminal
       - Cleanup: dispose terminal and close WS on unmount
       - Style the container div: `width: 100%, height: 400px, background: #1e1e1e, border-radius: 8px, overflow: hidden, padding: 4px`
       - Import xterm CSS: `import '@xterm/xterm/css/xterm.css'`

    3. In `admin-dashboard/frontend/src/pages/SiteDetail.jsx`:
       - Import ShellTerminal component
       - Add a new card section after "Quick Links" card, only shown when `site.status === 'active'`:
         ```jsx
         <div className="card">
           <h3>Shell Access</h3>
           <p className="muted">Interactive shell on the WordPress container</p>
           <ShellTerminal siteId={id} getToken={getToken} />
         </div>
         ```

    **Backend:**

    4. Install ws package: `cd admin-dashboard && npm install ws`

    5. In `admin-dashboard/src/index.js`:
       - Import `WebSocketServer` from 'ws' and the Node http module
       - Change from `serve({ fetch: app.fetch, port })` to creating an HTTP server manually:
         ```js
         import { createServer } from 'http';
         import { WebSocketServer } from 'ws';
         import { spawn } from 'child_process';

         const server = createServer((req, res) => {
           // Let Hono handle HTTP
           const honoReq = new Request(`http://localhost${req.url}`, {
             method: req.method,
             headers: req.headers,
           });
           // Use @hono/node-server's createAdaptorServer instead
         });
         ```
       - Actually, simpler approach: use `createAdoption` from @hono/node-server:
         ```js
         import { createAdaptorServer } from '@hono/node-server';
         const server = createAdaptorServer(app);
         ```
       - Create WebSocketServer attached to the HTTP server with `noServer: true`
       - Handle upgrade requests: listen for `server.on('upgrade', (req, socket, head) => { ... })`
       - Only upgrade requests to paths matching `/api/sites/:id/shell`
       - Extract `token` from query string, verify with Clerk (use `@clerk/backend` verifyToken or the same middleware logic)
       - Extract `siteId` from the URL path
       - Look up site from DB via `getSite(siteId)`, reject if not found or not active
       - On successful WS connection, spawn: `railway exec --service ${site.railway_service_id} --environment production -- /bin/bash`
         - Set env `RAILWAY_TOKEN` to config.RAILWAY_API_TOKEN and `RAILWAY_PROJECT_ID` to config.RAILWAY_PROJECT_ID
       - Pipe: ws.on('message') -> child.stdin.write, child.stdout/stderr.on('data') -> ws.send
       - On child exit, send exit message and close WS
       - On WS close, kill child process
       - Start server with `server.listen(Number(config.PORT))`

    6. If `railway` CLI is not available in the deployment environment, provide a fallback: use Railway's GraphQL API `executionCreate` mutation if it exists, OR document that railway CLI must be installed. Add a check at the start of the WS handler: try `which railway` and if not found, send error message to terminal "Railway CLI not installed - shell access unavailable" and close.

    Note: The Railway CLI approach requires the CLI to be installed on the dashboard server. This is a reasonable requirement since the dashboard is the admin control plane.
  </action>
  <verify>
    <automated>cd /home/nc773/Documents/railway-wordpress-nginx-php-fpm-redis/admin-dashboard && npm install && cd frontend && npm install && npx vite build 2>&1 | tail -5</automated>
  </verify>
  <done>SiteDetail page shows an xterm.js terminal for active sites. WebSocket endpoint exists at /api/sites/:id/shell. Backend spawns railway exec to connect to the container. Frontend build succeeds with xterm.js bundled.</done>
</task>

</tasks>

<verification>
1. Frontend builds without errors: `cd admin-dashboard/frontend && npx vite build`
2. Backend starts without errors: `cd admin-dashboard && timeout 5 node src/index.js 2>&1 || true` (will fail on missing env vars but should not have syntax errors)
3. SitesList renders filter tabs and enhanced columns
4. SiteDetail shows shell terminal card for active sites
</verification>

<success_criteria>
- SitesList displays all DB sites with status filters (All/Active/Provisioning/Error) and enhanced columns
- SiteDetail has interactive xterm.js terminal connected via WebSocket for active sites
- Backend WebSocket handler spawns railway exec for shell access
- Both frontend and backend build/start without errors
</success_criteria>

<output>
After completion, create `.planning/quick/2-load-all-live-wp-services-from-db-in-das/2-SUMMARY.md`
</output>
