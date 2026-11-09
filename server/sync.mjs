import { join } from 'node:path';
import { fetchBoard } from './github.mjs';
import { readJSON, writeJSON } from './store.mjs';
import { publicSnapshot } from './policy.mjs';

export function createSync(config, { load = fetchBoard, now = () => new Date() } = {}) {
  let pending = null;
  let state = { lastAttemptAt: null, lastSuccessAt: null, lastError: null, nextSyncAt: null };
  const configured = Boolean(config.githubToken);
  const interval = config.intervalHours * 3600_000;
  async function run() {
    if (!configured) throw new Error('GitHub syncing is not configured. Add BOARD_GITHUB_TOKEN with Projects read access.');
    if (pending) return pending;
    pending = (async () => {
      state.lastAttemptAt = now().toISOString();
      try {
        const items = await load(config);
        const syncedAt = now().toISOString();
        const snapshot = publicSnapshot({ schemaVersion: 1, source: 'github', syncedAt, items }, config);
        await writeJSON(config.dataDir, 'board.json', snapshot);
        state.lastSuccessAt = syncedAt;
        state.lastError = null;
        return snapshot;
      } catch (error) { state.lastError = error.message; throw error; }
      finally {
        state.nextSyncAt = new Date(now().getTime() + (state.lastError ? Math.min(interval, 15 * 60_000) : interval)).toISOString();
        await writeJSON(config.dataDir, 'sync.json', state);
      }
    })();
    try { return await pending; } finally { pending = null; }
  }
  let timer;
  async function start() {
    state = await readJSON(join(config.dataDir, 'sync.json'), state);
    if (!configured) { state.nextSyncAt = null; return; }
    const latestNext = state.lastSuccessAt ? Date.parse(state.lastSuccessAt) + interval : now().getTime();
    if (!state.nextSyncAt || Date.parse(state.nextSyncAt) > latestNext) state.nextSyncAt = new Date(latestNext).toISOString();
    const tick = async () => {
      if (new Date(state.nextSyncAt).getTime() <= now().getTime() && !pending) {
        try { await run(); } catch { console.warn('Board sync failed. View the protected sync panel for details.'); }
      }
    };
    timer = setInterval(tick, 30_000);
    timer.unref();
    await tick();
  }
  return { run, start, stop: () => clearInterval(timer), status: () => ({ ...state, configured, running: Boolean(pending), intervalHours: config.intervalHours }) };
}
