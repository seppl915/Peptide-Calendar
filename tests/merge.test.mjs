import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates } from '../js/merge.js';
import { migrate } from '../js/storage.js';

test('newer item wins, unknown items are added', () => {
  const a = { items: [{ id: '1', name: 'alt', updatedAt: 1 }, { id: '2', name: 'nur A', updatedAt: 1 }], logs: {} };
  const b = { items: [{ id: '1', name: 'neu', updatedAt: 2 }, { id: '3', name: 'nur B', updatedAt: 1 }], logs: {} };
  const m = mergeStates(a, b);
  assert.deepEqual(m.items.map((i) => i.name).sort(), ['neu', 'nur A', 'nur B']);
  assert.equal(mergeStates(b, a).items.find((i) => i.id === '1').name, 'neu');
});

test('deletions (tombstones) propagate', () => {
  const a = { items: [{ id: '1', name: 'x', updatedAt: 1 }], logs: { k: { status: 'taken', updatedAt: 1 } } };
  const b = { items: [{ id: '1', name: 'x', deleted: true, updatedAt: 2 }], logs: { k: { status: null, updatedAt: 2 } } };
  const m = mergeStates(a, b);
  assert.equal(m.items[0].deleted, true);
  assert.equal(m.logs.k.status, null);
});

test('migrate v1 data', () => {
  const m = migrate({ peptides: [{ id: '1', name: 'BPC' }], logs: { 'x|y|': { status: 'taken' } } });
  assert.equal(m.items[0].category, 'peptide');
  assert.equal(m.logs['x|y|'].updatedAt, 0);
});
