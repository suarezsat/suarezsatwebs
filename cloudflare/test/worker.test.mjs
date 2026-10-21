import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { madridDay } from '../src/worker.js';
test('Spanish day follows local midnight and daylight-saving transitions', () => {
  assert.equal(madridDay(new Date('2026-10-21T22:30:00Z')), '2026-10-22');
  assert.equal(madridDay(new Date('2026-12-01T22:30:00Z')), '2026-12-01');
  assert.equal(madridDay(new Date('2026-12-01T23:30:00Z')), '2026-12-02');
  assert.equal(madridDay(new Date('2026-03-29T01:30:00Z')), '2026-03-29');
});
test('Reject cross-origin write requests before touching storage', async () => {
  const response = await worker.fetch(new Request('https://panel.example/api/admin/entries', { method: 'POST', headers: { Origin: 'https://attacker.example' }, body: '{}' }), {});
  assert.equal(response.status, 403);
});
test('Unauthenticated publishing and uploads are denied', async () => {
  for (const path of ['/api/admin/entries', '/api/admin/media']) {
    const response = await worker.fetch(new Request(`https://panel.example${path}`, { method: 'POST', headers: { Origin: 'https://panel.example' }, body: '{}' }), {});
    assert.equal(response.status, 401);
  }
});
function freeQuotaEnvironment() {
  return {
    MEDIA_KV: { put() { throw new Error('A rejected upload must not reach storage'); } },
    DB: { prepare() { return { bind() { return this; }, async first() { return { token_hash: 'test' }; }, async run() { return { meta: { changes: 0 } }; } }; } },
  };
}
test('Files over 20 MiB are rejected before storage', async () => {
  const response = await worker.fetch(new Request('https://panel.example/api/admin/media', {
    method: 'POST', headers: { Origin: 'https://panel.example', Cookie: 'ss_session=test', 'Content-Type': 'image/png', 'Content-Length': String(20 * 1024 * 1024 + 1) }, body: 'x',
  }), freeQuotaEnvironment());
  assert.equal(response.status, 413);
});
test('Full free storage stops uploads instead of enabling a paid service', async () => {
  const response = await worker.fetch(new Request('https://panel.example/api/admin/media', {
    method: 'POST', headers: { Origin: 'https://panel.example', Cookie: 'ss_session=test', 'Content-Type': 'image/png', 'Content-Length': '1' }, body: 'x',
  }), freeQuotaEnvironment());
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /espacio gratuito/);
});
