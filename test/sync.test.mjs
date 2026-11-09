import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicItem, publicSnapshot, sanitizeItems } from '../sync/policy.mjs';
import { fetchBoard } from '../sync/github.mjs';
import { publishBoard } from '../sync/publish.mjs';
import { readSnapshot } from '../sync/store.mjs';
import { configuration } from '../sync/config.mjs';
import { spawnSync } from 'node:child_process';

function item(project = 'Tools', extra = {}) {
  return { id: 'private-project-node', isArchived: false, fieldValues: { nodes: [{ name: project, field: { name: 'Project' } }, { name: 'In Progress', field: { name: 'Status' } }] }, content: { __typename: 'Issue', title: 'Improve vote reporting', body: 'CONFIDENTIAL', url: 'https://github.com/example/internal/issues/1', assignees: { nodes: [{ login: 'wavey0x' }] }, labels: { nodes: [] }, repository: { nameWithOwner: 'example/internal' } }, ...extra };
}
const config = { githubToken: 'test-only', org: 'yLockers', projectNumber: 2, projectField: 'Project', allowedProjects: ['Tools', 'Operations'] };
function response(items, more = false, cursor = null) { return { ok: true, json: async () => ({ data: { organization: { projectV2: { fields: { pageInfo: { hasNextPage: false }, nodes: [{ name: 'Project' }, { name: 'Status' }] }, items: { nodes: items, pageInfo: { hasNextPage: more, endCursor: cursor } } } } } }) }; }

test('only selected fields from explicitly allowed categories leave the server', () => {
  const safe = publicItem(item());
  assert.deepEqual(Object.keys(safe).sort(), ['assignees', 'id', 'project', 'status', 'title']);
  assert.notEqual(safe.id, 'private-project-node');
  assert.equal(JSON.stringify(safe).includes('CONFIDENTIAL'), false);
  assert.equal(publicItem(item('yRisk')), null);
  assert.equal(publicItem(item('A new category')), null);
  assert.equal(publicItem(item(undefined, { fieldValues: { nodes: [] } })), null);
  assert.equal(publicItem(item('Tools', { isArchived: true })), null);
});
test('yRisk exclusion overrides an otherwise allowed category', () => {
  for (const modification of [{ title: 'yRisk oracle' }, { labels: { nodes: [{ name: 'yRisk' }] } }, { repository: { nameWithOwner: 'yRisk/private' } }]) {
    const source = item(); source.content = { ...source.content, ...modification }; assert.equal(publicItem(source), null);
  }
});
test('incomplete classification or unknown status cannot silently publish', () => {
  const a = item(); a.fieldValues.pageInfo = { hasNextPage: true };
  assert.throws(() => publicItem(a), /incomplete/);
  const b = item(); b.fieldValues.nodes[1].name = 'Renamed';
  assert.throws(() => publicItem(b), /unknown/);
  const c = item(); c.fieldValues.nodes.push({ name: 'yRisk', field: { name: 'Project' } });
  assert.equal(publicItem(c), null);
  assert.equal(publicItem(item('yRisk'), { allowedProjects: ['yRisk'] }), null);
});
test('stored snapshots are rebuilt from public fields and current categories only', () => {
  const safe = publicItem(item());
  const snapshot = { schemaVersion: 1, source: 'github', syncedAt: '2026-11-09T18:00:00Z', credential: 'PRIVATE', items: [{ ...safe, body: 'PRIVATE', url: 'PRIVATE' }, { ...safe, title: 'y-risk private task' }, { ...safe, project: 'yRisk' }, { ...safe, project: 'Unknown' }] };
  const published = publicSnapshot(snapshot, config);
  assert.deepEqual(published.items, [safe]);
  assert.equal(JSON.stringify(published).includes('PRIVATE'), false);
  assert.deepEqual(publicSnapshot(snapshot, { allowedProjects: [] }).items, []);
  assert.throws(() => publicSnapshot({ ...snapshot, items: [{ ...safe, id: 'private-project-node' }] }), /Invalid stored item/);
  assert.throws(() => publicSnapshot({ ...snapshot, source: 'snapshot' }), /Invalid stored snapshot/);
});
test('all GitHub pages are read; a later error aborts the whole sync', async () => {
  let calls = 0;
  const result = await fetchBoard(config, async (_, options) => {
    const cursor = JSON.parse(options.body).variables.cursor;
    calls++; if (calls === 1) { assert.equal(cursor, null); return response([item()], true, 'next'); }
    assert.equal(cursor, 'next'); return response([item('yRisk')]);
  });
  assert.equal(calls, 2); assert.equal(result.length, 1);
  calls = 0;
  await assert.rejects(fetchBoard(config, async () => ++calls === 1 ? response([item()], true, 'next') : { ok: false, status: 502 }), /failed/);
  await assert.rejects(fetchBoard(config, async () => response([{ id: 'redacted', content: null }])), /inaccessible/);
});
test('a standalone sync replaces the snapshot and preserves it on any failure', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ylockers-test-'));
  let fail = false; let rows = sanitizeItems([item()]);
  const cfg = { ...config, dataDir };
  const load = async () => { if (fail) throw new Error('Source unavailable'); return rows; };
  try {
    await publishBoard(cfg, { load });
    const original = await readSnapshot(dataDir);
    assert.equal((await stat(join(dataDir, 'board.json'))).mode & 0o777, 0o644);
    assert.deepEqual(await readdir(dataDir), ['board.json']);
    fail = true; await assert.rejects(publishBoard(cfg, { load }));
    assert.deepEqual(await readSnapshot(dataDir), original);
    fail = false; rows = [{ ...publicItem(item()), status: 'Unexpected' }];
    await assert.rejects(publishBoard(cfg, { load }));
    assert.deepEqual(await readSnapshot(dataDir), original);
    rows = [{ ...publicItem(item()), body: 'PRIVATE' }, { ...publicItem(item()), title: 'yRisk task' }];
    await publishBoard(cfg, { load });
    const saved = JSON.stringify(await readSnapshot(dataDir));
    assert.equal(saved.includes('PRIVATE'), false);
    assert.equal(saved.includes('yRisk'), false);
    rows = []; await publishBoard(cfg, { load });
    assert.deepEqual((await readSnapshot(dataDir)).items, []);
    assert.deepEqual(await readdir(dataDir), ['board.json']);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});
test('only the explicit board credential is used; no credential means no publication', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ylockers-unconfigured-'));
  try {
    const cfg = configuration({ GITHUB_TOKEN: 'unrelated-credential', BOARD_DATA_DIR: dataDir });
    assert.equal(cfg.githubToken, '');
    await assert.rejects(publishBoard(cfg), /BOARD_GITHUB_TOKEN/);
    assert.deepEqual(await readdir(dataDir), []);
    const result = spawnSync(process.execPath, ['scripts/sync.mjs'], { encoding: 'utf8', env: { BOARD_GITHUB_TOKEN: '', GITHUB_TOKEN: 'unrelated-credential', BOARD_DATA_DIR: dataDir } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BOARD_GITHUB_TOKEN/);
    assert.equal(result.stderr.includes('unrelated-credential'), false);
    assert.deepEqual(await readdir(dataDir), []);
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});
