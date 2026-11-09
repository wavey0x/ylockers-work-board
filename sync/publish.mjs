import { fetchBoard } from './github.mjs';
import { publicSnapshot } from './policy.mjs';
import { writeSnapshot } from './store.mjs';

export async function publishBoard(config, { load = fetchBoard, now = () => new Date() } = {}) {
  if (!config.githubToken) throw new Error('Set BOARD_GITHUB_TOKEN with Projects read access.');
  const items = await load(config);
  const snapshot = publicSnapshot({ schemaVersion: 1, source: 'github', syncedAt: now().toISOString(), items }, config);
  await writeSnapshot(config.dataDir, snapshot);
  return snapshot;
}
