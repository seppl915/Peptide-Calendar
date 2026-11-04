import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, doseInVialUnit } from '../js/calculator.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const base = { mode: 'syringe', vialAmount: 5, vialUnit: 'mg', dose: 250, doseUnit: 'mcg', waterMl: 2, syringeMl: 1 };

test('syringe U-100: 5 mg + 2 ml, 250 mcg → 10 Einheiten', () => {
  const r = calculate(base);
  assert.equal(r.ok, true);
  close(r.concentration, 2.5);
  close(r.volumeMl, 0.1);
  close(r.units, 10);
  close(r.dosesPerVial, 20);
  close(r.perUnit, 0.025);
  assert.equal(r.exceedsSyringe, false);
});

test('syringe U-40 and capacity overflow', () => {
  close(calculate({ ...base, unitsPerMl: 40 }).units, 4);
  const r = calculate({ ...base, dose: 2, doseUnit: 'mg', syringeMl: 0.3 });
  close(r.volumeMl, 0.8);
  assert.equal(r.exceedsSyringe, true);
});

test('reverse: water for 10 units', () => {
  const r = calculate({ ...base, solveFor: 'water', targetUnits: 10, waterMl: undefined, syringeMl: undefined });
  assert.equal(r.ok, true);
  close(r.waterMl, 2);
  close(r.volumeMl, 0.1);
});

test('pen always uses U-100', () => {
  const r = calculate({ ...base, mode: 'pen', unitsPerMl: 40, syringeMl: undefined });
  close(r.units, 10);
});

test('nasal spray', () => {
  const r = calculate({ mode: 'spray', vialAmount: 10, dose: 1, doseUnit: 'mg', waterMl: 4, sprayMl: 0.1 });
  close(r.volumeMl, 0.4);
  close(r.sprays, 4);
  assert.equal(r.units, undefined);
});

test('IU vials', () => {
  close(calculate({ ...base, vialAmount: 10, vialUnit: 'IE', dose: 2, doseUnit: 'IE', waterMl: 1 }).units, 20);
  assert.equal(calculate({ ...base, vialUnit: 'IE' }).ok, false);
  assert.equal(doseInVialUnit(5, 'mg', 'IE'), null);
});

test('blend: total vs. anchor component', () => {
  const blend = { mode: 'blend', components: [{ name: 'BPC-157', mg: 10 }, { name: 'TB-500', mg: 10 }], waterMl: 2, dose: 500, doseUnit: 'mcg' };
  const total = calculate(blend);
  close(total.concentration, 10);
  close(total.volumeMl, 0.05);
  close(total.units, 5);
  close(total.dosesPerVial, 40);
  const anchored = calculate({ ...blend, anchor: 'BPC-157' });
  close(anchored.units, 10);
  close(anchored.breakdown[1].perDoseMg, 0.5);
  close(anchored.dosesPerVial, 20);
});

test('reports missing inputs and impossible doses', () => {
  assert.deepEqual(calculate({ mode: 'syringe' }).missing, ['vial', 'dose', 'water', 'syringe']);
  assert.equal(calculate({ ...base, dose: 6, doseUnit: 'mg' }).ok, false);
});
