import { configuration } from '../sync/config.mjs';
import { publishBoard } from '../sync/publish.mjs';

try {
  const config = configuration();
  if (!config.githubToken) {
    console.error('Set BOARD_GITHUB_TOKEN with Projects read access before syncing.');
    process.exitCode = 1;
  } else {
    const board = await publishBoard(config);
    console.log(`Published ${board.items.length} items at ${board.syncedAt}.`);
  }
} catch {
  console.error('Board sync failed; the previous snapshot was kept. Check GitHub access and the data directory.');
  process.exitCode = 1;
}
