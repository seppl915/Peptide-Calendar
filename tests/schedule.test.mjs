import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDue, dosesForDate, describeSchedule, weekdayOf } from '../js/schedule.js';

const base = { id: 'a', name: 'BPC-157', startDate: '2026-11-01', times: ['08:00'] };

test('daily respects start and end date', () => {
  const p = { ...base, endDate: '2026-11-05', schedule: { type: 'daily' } };
  assert.equal(isDue(p, '2026-10-31'), false);
  assert.equal(isDue(p, '2026-11-01'), true);
  assert.equal(isDue(p, '2026-11-05'), true);
  assert.equal(isDue(p, '2026-11-06'), false);
});

test('interval every 3 days, across DST and month boundaries', () => {
  const p = { ...base, startDate: '2026-10-20', schedule: { type: 'interval', interval: 3 } };
  const due = ['2026-10-20', '2026-10-23', '2026-10-26', '2026-10-29', '2026-11-01'];
  for (const d of due) assert.equal(isDue(p, d), true, d);
  assert.equal(isDue(p, '2026-10-21'), false);
  assert.equal(isDue(p, '2026-10-25'), false);
});

test('weekdays', () => {
  assert.equal(weekdayOf('2026-11-02'), 1); // Monday
  const p = { ...base, schedule: { type: 'weekdays', weekdays: [1, 3, 5] } };
  assert.equal(isDue(p, '2026-11-02'), true);
  assert.equal(isDue(p, '2026-11-03'), false);
  assert.equal(isDue(p, '2026-11-04'), true);
  assert.equal(isDue(p, '2026-11-01'), false); // Sunday
});

test('cycle 5 on / 2 off', () => {
  const p = { ...base, schedule: { type: 'cycle', onDays: 5, offDays: 2 } };
  const pattern = [];
  for (let i = 1; i <= 14; i++) pattern.push(isDue(p, `2026-11-${String(i).padStart(2, '0')}`) ? 1 : 0);
  assert.deepEqual(pattern, [1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0]);
});

test('paused peptides are never due', () => {
  assert.equal(isDue({ ...base, paused: true, schedule: { type: 'daily' } }, '2026-11-02'), false);
});

test('dosesForDate expands times and sorts', () => {
  const a = { ...base, id: 'a', times: ['20:00', '08:00'], schedule: { type: 'daily' } };
  const b = { ...base, id: 'b', times: ['12:00'], schedule: { type: 'daily' } };
  const doses = dosesForDate([a, b], '2026-11-02');
  assert.deepEqual(doses.map((d) => `${d.peptide.id}@${d.time}`), ['a@08:00', 'b@12:00', 'a@20:00']);
});

test('describeSchedule', () => {
  assert.equal(describeSchedule({ type: 'daily' }), 'Täglich');
  assert.equal(describeSchedule({ type: 'interval', interval: 2 }), 'Jeden 2. Tag');
  assert.equal(describeSchedule({ type: 'weekdays', weekdays: [0, 1, 3] }), 'Mo, Mi, So');
  assert.equal(describeSchedule({ type: 'cycle', onDays: 5, offDays: 2 }), '5 Tage an / 2 Tage Pause');
});
