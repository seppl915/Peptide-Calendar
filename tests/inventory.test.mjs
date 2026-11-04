import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert, remaining, forecast, reconstitution } from '../js/inventory.js';

const item = {
  id: 'p', dose: 250, unit: 'mcg', startDate: '2026-11-01', times: ['08:00'],
  schedule: { type: 'daily' }, stock: { base: 1000, baseAt: '2026-11-01T00:00:00.000Z' },
};

test('convert', () => {
  assert.equal(convert(5, 'mg', 'mcg'), 5000);
  assert.equal(convert(250, 'mcg', 'mg'), 0.25);
  assert.equal(convert(1, 'g', 'mg'), 1000);
  assert.equal(convert(2, 'Kapseln', 'Kapseln'), 2);
  assert.equal(convert(2, 'Kapseln', 'mg'), null);
});

test('remaining subtracts taken doses after baseAt only', () => {
  const logs = {
    'p|2026-11-01|08:00': { status: 'taken', at: '2026-11-01T08:00:00.000Z', used: 250 },
    'p|2026-11-02|08:00': { status: 'skipped', at: '2026-11-02T08:00:00.000Z' },
    'p|2026-10-31|08:00': { status: 'taken', at: '2026-10-31T08:00:00.000Z', used: 250 }, // vor Auffüllung
    'q|2026-11-01|08:00': { status: 'taken', at: '2026-11-01T08:00:00.000Z', used: 250 }, // anderes Item
    'p|2026-11-03|08:00': { status: null, updatedAt: 5 }, // rückgängig gemacht
  };
  assert.equal(remaining(item, logs), 750);
});

test('forecast daily', () => {
  const f = forecast(item, {}, '2026-11-01');
  assert.equal(f.dosesLeft, 4);
  assert.equal(f.runsOutOn, '2026-11-05');
  assert.equal(f.daysLeft, 4);
});

test('forecast skips doses already logged today and respects schedule', () => {
  const it = { ...item, schedule: { type: 'interval', interval: 2 }, times: ['08:00', '20:00'] };
  const logs = { 'p|2026-11-01|08:00': { status: 'taken', at: '2026-11-01T08:00:00.000Z', used: 250 } };
  // Rest 750 → 20:00 heute, 03.11. 08:00, 03.11. 20:00 → am 05.11. leer
  const f = forecast(it, logs, '2026-11-01');
  assert.equal(f.remaining, 750);
  assert.equal(f.dosesLeft, 3);
  assert.equal(f.runsOutOn, '2026-11-05');
});

test('forecast lasts until course end', () => {
  const f = forecast({ ...item, endDate: '2026-11-02' }, {}, '2026-11-01');
  assert.equal(f.dosesLeft, 2);
  assert.equal(f.runsOutOn, null);
});

test('reconstitution: 5 mg + 2 ml, 250 mcg dose', () => {
  const r = reconstitution(250, 'mcg', 5, 2);
  assert.equal(r.mgPerMl, 2.5);
  assert.ok(Math.abs(r.ml - 0.1) < 1e-9);
  assert.ok(Math.abs(r.units - 10) < 1e-9);
  assert.equal(r.dosesPerVial, 20);
  assert.equal(reconstitution(1, 'Kapseln', 5, 2), null);
});
