import { mkdir, readFile, writeFile, chmod, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function readSnapshot(directory) {
  try { return JSON.parse(await readFile(join(directory, 'board.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// Only call with the approved public snapshot. The data directory is separate
// from the website; Caddy exposes exactly board.json, never temporary files.
export async function writeSnapshot(directory, snapshot) {
  await mkdir(directory, { recursive: true, mode: 0o755 });
  const temporary = join(directory, `.board.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(snapshot) + '\n', { mode: 0o600, flag: 'wx' });
    await chmod(temporary, 0o644);
    await rename(temporary, join(directory, 'board.json'));
  } finally { await unlink(temporary).catch(() => {}); }
}
