import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configuration } from './sync/config.mjs';
import { publicSnapshot } from './sync/policy.mjs';
import { readSnapshot } from './sync/store.mjs';

// Local preview only. Production Caddy serves the published file directly.
function localBoard(server) {
  server.middlewares.use(async (req, res, next) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/board.json') return next();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; return res.end(); }
    try {
      const config = configuration();
      const board = publicSnapshot(await readSnapshot(config.dataDir), config);
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(board));
    } catch { res.statusCode = 503; res.end('{"error":"The board is temporarily unavailable."}'); }
  });
}
export default defineConfig({
  plugins: [react(), { name: 'local-board-preview', configureServer: localBoard, configurePreviewServer: localBoard }],
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
  build: { sourcemap: false },
});
