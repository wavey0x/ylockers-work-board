import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, join, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_PROJECTS, publicSnapshot } from './policy.mjs';
import { readJSON } from './store.mjs';
import { createSync } from './sync.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function configuration(env = process.env) {
  const intervalHours = Number(env.SYNC_INTERVAL_HOURS || 1);
  const projectNumber = Number(env.GITHUB_PROJECT_NUMBER || 2);
  if (!Number.isFinite(intervalHours) || intervalHours < 0.1 || intervalHours > 168) throw new Error('SYNC_INTERVAL_HOURS must be between 0.1 and 168.');
  if (!Number.isInteger(projectNumber) || projectNumber < 1) throw new Error('Invalid GitHub project number.');
  if (env.ADMIN_SYNC_TOKEN && env.ADMIN_SYNC_TOKEN.length < 32) throw new Error('ADMIN_SYNC_TOKEN must have at least 32 characters.');
  return { githubToken: env.BOARD_GITHUB_TOKEN || '', org: env.GITHUB_ORG || 'yLockers', projectNumber, projectField: env.GITHUB_PROJECT_FIELD || 'Project', allowedProjects: env.PUBLIC_PROJECTS ? env.PUBLIC_PROJECTS.split(',').map(v => v.trim()).filter(Boolean) : DEFAULT_PROJECTS, adminToken: env.ADMIN_SYNC_TOKEN || '', intervalHours, dataDir: resolve(env.DATA_DIR || join(root, 'data')) };
}
export function authorized(request, token) {
  if (!token) return false;
  const supplied = Buffer.from(request.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
export function createApp(config, sync = createSync(config)) {
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://avatars.githubusercontent.com; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return send(res, 400, { error: 'Invalid path.' }); }
    try {
      if (path === '/api/board' && req.method === 'GET') {
        const board = publicSnapshot(await readJSON(join(config.dataDir, 'board.json')), config);
        const state = sync.status();
        return send(res, 200, { ...board, sync: { configured: state.configured, intervalHours: state.intervalHours, nextSyncAt: state.nextSyncAt, stale: board.source === 'github' && Date.now() - Date.parse(board.syncedAt) > state.intervalHours * 3600_000 * 1.5 } });
      }
      if (path === '/api/admin/status' || path === '/api/admin/sync') {
        if (!authorized(req, config.adminToken)) return send(res, 401, { error: 'Enter a valid sync key.' });
        if (path.endsWith('/status') && req.method === 'GET') return send(res, 200, sync.status());
        if (path.endsWith('/sync') && req.method === 'POST') {
          if (!config.githubToken) return send(res, 503, { error: 'Live sync needs a GitHub credential with Projects read access.' });
          if (sync.status().running) return send(res, 409, { error: 'A sync is already running.' });
          try { const board = await sync.run(); return send(res, 200, { count: board.items.length, syncedAt: board.syncedAt }); }
          catch (error) { return send(res, 502, { error: error.message }); }
        }
        return send(res, 405, { error: 'Method not allowed.' });
      }
      if (path.startsWith('/api/')) return send(res, 404, { error: 'Not found.' });
      if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Method not allowed.' });
      const dist = join(root, 'dist');
      const target = path === '/' ? join(dist, 'index.html') : resolve(dist, `.${path}`);
      if (!target.startsWith(dist + '/') || path.includes('\0')) return send(res, 404, { error: 'Not found.' });
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
      const body = await readFile(target);
      res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (error.code === 'ENOENT') return send(res, 404, { error: 'Not found.' });
      console.error('Request failed; no source contents were logged.');
      send(res, 503, { error: 'The board is temporarily unavailable.' });
    }
  });
  server.requestTimeout = 10_000;
  return { server, sync };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = configuration();
  const { server, sync } = createApp(config);
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`yLockers Work Board http://${host}:${port}`));
  sync.start().catch(() => console.error('Sync scheduler could not start. Check the data directory.'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { sync.stop(); server.close(() => process.exit(0)); });
}
