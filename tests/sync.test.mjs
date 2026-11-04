import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-sync-'));
process.env.DATA_DIR = dir;
const { createServer } = await import('../server.js');
const { syncOnce, generateKey, isValidKey, deriveKeys } = await import('../js/sync.js');

let server, serverUrl;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  serverUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('key generation', () => {
  const k = generateKey();
  assert.match(k, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
  assert.ok(isValidKey(k));
  assert.ok(isValidKey(k.toLowerCase().replace(/-/g, ' ')));
  assert.ok(!isValidKey('abc'));
});

test('two devices converge and server only stores ciphertext', async () => {
  const key = generateKey();
  const cfg = { serverUrl, key };
  const deviceA = { items: [{ id: 'a', name: 'BPC-157', updatedAt: 1 }], logs: {} };
  const deviceB = { items: [{ id: 'b', name: 'Magnesium', updatedAt: 1 }], logs: { 'b|2026-11-01|': { status: 'taken', updatedAt: 2 } } };

  const r1 = await syncOnce(cfg, deviceA);
  assert.equal(r1.version, 1);
  const r2 = await syncOnce(cfg, deviceB);
  assert.equal(r2.version, 2);
  assert.deepEqual(r2.state.items.map((i) => i.id).sort(), ['a', 'b']);
  const r3 = await syncOnce(cfg, r1.state);
  assert.deepEqual(r3.state.items.map((i) => i.id).sort(), ['a', 'b']);
  assert.equal(r3.state.logs['b|2026-11-01|'].status, 'taken');
  assert.equal(r3.version, 2); // nichts Neues → kein Upload

  const { roomId } = await deriveKeys(key);
  const stored = fs.readFileSync(path.join(dir, `${roomId}.json`), 'utf8');
  assert.ok(!stored.includes('BPC') && !stored.includes('Magnesium'));
});

test('conflicting version is rejected', async () => {
  const key = generateKey();
  await syncOnce({ serverUrl, key }, { items: [{ id: 'x', updatedAt: 1 }], logs: {} });
  const { roomId } = await deriveKeys(key);
  const res = await fetch(`${serverUrl}/api/sync/${roomId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseVersion: 0, iv: 'x', data: 'y' }),
  });
  assert.equal(res.status, 409);
});

test('server does not expose data dir or source files', async () => {
  for (const p of ['/server.js', '/data/', '/../package.json', '/js/../server.js', '/api/sync/abc']) {
    const res = await fetch(serverUrl + p);
    assert.equal(res.status, 404, p);
  }
  assert.equal((await fetch(serverUrl + '/')).status, 200);
  assert.equal((await fetch(serverUrl + '/js/app.js')).status, 200);
});
