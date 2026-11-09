import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function readJSON(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function writeJSON(directory, name, data) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.${name}.${randomUUID()}.tmp`);
  try { await writeFile(temporary, JSON.stringify(data), { mode: 0o600 }); await rename(temporary, join(directory, name)); }
  finally { await unlink(temporary).catch(() => {}); }
}
