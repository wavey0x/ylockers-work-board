if (!process.env.ADMIN_SYNC_TOKEN) throw new Error('Set ADMIN_SYNC_TOKEN first.');
const origin = process.env.BOARD_URL || `http://127.0.0.1:${process.env.PORT || 8080}`;
const response = await fetch(new URL('/api/admin/sync', origin), { method: 'POST', headers: { Authorization: `Bearer ${process.env.ADMIN_SYNC_TOKEN}` }, signal: AbortSignal.timeout(180_000) });
const result = await response.json();
if (!response.ok) throw new Error(result.error || 'Sync failed.');
console.log(`Published ${result.count} items at ${result.syncedAt}.`);
