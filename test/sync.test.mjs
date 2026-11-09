import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicItem, sanitizeItems } from '../server/policy.mjs';
import { fetchBoard } from '../server/github.mjs';
import { createSync } from '../server/sync.mjs';
import { readJSON } from '../server/store.mjs';
import { configuration, createApp } from '../server/index.mjs';

function item(project = 'Tools', extra = {}) {
  return { id: 'private-project-node', isArchived: false, fieldValues: { nodes: [{ name: project, field: { name: 'Project' } }, { name: 'In Progress', field: { name: 'Status' } }] }, content: { __typename: 'Issue', title: 'Improve vote reporting', body: 'CONFIDENTIAL', url: 'https://github.com/private/issue', assignees: { nodes: [{ login: 'wavey0x' }] }, labels: { nodes: [] }, repository: { nameWithOwner: 'yLockers/ylockers' } }, ...extra };
}
const config = { githubToken: 'test-only', org: 'yLockers', projectNumber: 2, projectField: 'Project', allowedProjects: ['Tools', 'Operations'], intervalHours: 6 };
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
test('successful snapshots replace removed items; failed sync keeps the last complete snapshot', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ylockers-test-'));
  let fail = false; let rows = sanitizeItems([item()]);
  const sync = createSync({ ...config, dataDir }, { load: async () => { if (fail) throw new Error('Source unavailable'); return rows; } });
  try {
    await sync.run(); const original = await readJSON(join(dataDir, 'board.json'));
    fail = true; await assert.rejects(sync.run());
    assert.deepEqual(await readJSON(join(dataDir, 'board.json')), original);
    fail = false; rows = []; await sync.run();
    assert.deepEqual((await readJSON(join(dataDir, 'board.json'))).items, []);
    assert.equal(sync.status().lastError, null);
  } finally { sync.stop(); await rm(dataDir, { recursive: true, force: true }); }
});
test('syncs are serialized and successful runs set the next update six hours later', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ylockers-timer-'));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const fixed = new Date('2026-11-09T18:00:00Z');
  const sync = createSync({ ...config, dataDir }, { now: () => fixed, load: async () => { calls++; await gate; return []; } });
  try {
    const first = sync.run(); const second = sync.run();
    release(); await Promise.all([first, second]);
    assert.equal(calls, 1);
    assert.equal(sync.status().nextSyncAt, '2026-11-10T00:00:00.000Z');
    const restarted = createSync({ ...config, dataDir }, { now: () => fixed, load: async () => { throw new Error('Should not sync before due'); } });
    await restarted.start();
    assert.equal(restarted.status().nextSyncAt, '2026-11-10T00:00:00.000Z');
    assert.equal(restarted.status().lastError, null);
    restarted.stop();
  } finally { sync.stop(); await rm(dataDir, { recursive: true, force: true }); }
});
test('public HTTP API exposes no credentials and every admin endpoint requires authentication', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ylockers-http-'));
  const cfg = configuration({ DATA_DIR: dataDir, ADMIN_SYNC_TOKEN: 'a'.repeat(48) });
  let runs = 0;
  const fakeSync = { status: () => ({ configured: false, intervalHours: 6, nextSyncAt: null, lastError: 'PRIVATE ERROR' }), run: async () => { runs++; } };
  const { server } = createApp(cfg, fakeSync);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const publicResponse = await fetch(url + '/api/board'); const text = await publicResponse.text();
    assert.equal(publicResponse.headers.get('cache-control'), 'no-store');
    assert.equal(text.includes('PRIVATE ERROR'), false); assert.equal(text.includes(cfg.adminToken), false);
    assert.equal(JSON.parse(text).items.length, 33);
    for (const path of ['/api/admin/status', '/api/admin/sync']) assert.equal((await fetch(url + path, { method: path.endsWith('sync') ? 'POST' : 'GET' })).status, 401);
    assert.equal((await fetch(url + '/api/admin/sync', { method: 'POST', headers: { Authorization: `Bearer ${cfg.adminToken}` } })).status, 503);
    assert.equal(runs, 0);
    assert.equal((await fetch(url + '/.env')).status, 404);
    assert.equal((await fetch(url + '/data/board.json')).status, 404);
    assert.equal((await fetch(url + '/server/index.mjs')).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); }
});
