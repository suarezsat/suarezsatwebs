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
