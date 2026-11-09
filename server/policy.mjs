import { createHash } from 'node:crypto';

export const DEFAULT_PROJECTS = ['yFactory', 'yYB', 'yCRV', 'Resupply', 'Tools', 'Operations'];
export const STATUSES = ['Backlog', 'Ready', 'In Progress', 'Blocked', 'Done'];
const privateScope = /y[\s_-]*risk/i;
const clean = (value, max = 300) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';

// Construct a new object with explicitly allowed properties. Never spread source items.
export function publicItem(item, { projectField = 'Project', allowedProjects = DEFAULT_PROJECTS } = {}) {
  if (item.isArchived || !item.content || item.content.__typename === 'RedactedProjectV2Item') return null;
  if (item.fieldValues?.pageInfo?.hasNextPage || item.content.labels?.pageInfo?.hasNextPage || item.content.assignees?.pageInfo?.hasNextPage) throw new Error('Source metadata was incomplete; publication stopped.');
  const values = item.fieldValues?.nodes ?? [];
  const categories = values.filter(v => v.field?.name === projectField).map(v => v.name).filter(Boolean);
  const content = item.content;
  const labels = (content.labels?.nodes ?? []).map(v => v.name);
  const rawTitle = content.title ?? '';
  if ([rawTitle, content.repository?.nameWithOwner ?? '', ...categories, ...labels].some(v => privateScope.test(v))) return null;
  if (categories.length !== 1 || !allowedProjects.includes(categories[0])) return null;
  const status = values.find(v => v.field?.name === 'Status')?.name;
  if (!STATUSES.includes(status)) throw new Error('An eligible item has an unknown or missing status; publication stopped.');
  const title = clean(rawTitle);
  if (!title) throw new Error('An eligible item has no title; publication stopped.');
  const assignees = [...new Set((content.assignees?.nodes ?? []).map(a => clean(a.login, 50)).filter(Boolean))];
  return { id: createHash('sha256').update(item.id).digest('hex').slice(0, 20), title, status, project: categories[0], assignees };
}

export function sanitizeItems(items, options) {
  return items.map(item => publicItem(item, options)).filter(Boolean);
}

// Recheck the stored format before writing it and before serving it. Old or
// manually edited snapshots must not bypass the publication policy.
export function publicSnapshot(snapshot, { allowedProjects = DEFAULT_PROJECTS } = {}) {
  if (snapshot == null) return { schemaVersion: 1, source: 'empty', syncedAt: null, items: [] };
  if (snapshot.schemaVersion !== 1 || snapshot.source !== 'github' || !Array.isArray(snapshot.items)
    || typeof snapshot.syncedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.syncedAt))) {
    throw new Error('Invalid stored snapshot; publication stopped.');
  }
  const items = [];
  for (const row of snapshot.items) {
    if (!row || typeof row !== 'object') throw new Error('Invalid stored item; publication stopped.');
    if (!allowedProjects.includes(row.project) || [row.title, row.project, ...(Array.isArray(row.assignees) ? row.assignees : [])].some(v => typeof v === 'string' && privateScope.test(v))) continue;
    if (typeof row.id !== 'string' || !/^[a-f0-9]{20}$/.test(row.id)
      || typeof row.title !== 'string' || !clean(row.title) || !STATUSES.includes(row.status)
      || !Array.isArray(row.assignees) || row.assignees.some(v => typeof v !== 'string' || !/^[a-z\d][a-z\d-]{0,38}$/i.test(v))) {
      throw new Error('Invalid stored item; publication stopped.');
    }
    items.push({ id: row.id, title: clean(row.title), status: row.status, project: row.project, assignees: [...new Set(row.assignees)] });
  }
  return { schemaVersion: 1, source: 'github', syncedAt: new Date(snapshot.syncedAt).toISOString(), items };
}
