// Rekonstitutions- und Dosisrechner – reine Logik ohne DOM.
//
// Grundformel: Konzentration = Wirkstoff im Fläschchen / Wasser (ml)
//              Volumen pro Dosis = Dosis / Konzentration
//              Einheiten auf der Spritze = Volumen × Einheiten pro ml (U-100 → 100)

const TO_MG = { mcg: 0.001, mg: 1 };

/** Rechnet die Dosis in die Einheit des Fläschchens um (mg ↔ mcg, IE ↔ IE). */
export function doseInVialUnit(dose, doseUnit, vialUnit) {
  if (vialUnit === 'IE') return doseUnit === 'IE' ? dose : null;
  if (doseUnit in TO_MG) return dose * TO_MG[doseUnit];
  return null;
}

const pos = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * input:
 *   mode:        'syringe' | 'pen' | 'spray' | 'blend'
 *   vialAmount, vialUnit ('mg' | 'IE')
 *   dose, doseUnit ('mcg' | 'mg' | 'IE')
 *   waterMl
 *   solveFor:    'units' (Standard) | 'water' – Wasser aus Ziel-Einheiten berechnen (Spritze/Pen)
 *   targetUnits: gewünschte Einheiten pro Dosis (bei solveFor = 'water')
 *   unitsPerMl:  100 (U-100) | 40 (U-40) – nur Spritze
 *   syringeMl:   Fassungsvermögen der Spritze in ml – nur Spritze
 *   sprayMl:     Volumen pro Sprühstoß – nur Nasenspray
 *   components:  [{ name, mg }] – nur Blend
 *   anchor:      Name der Komponente, auf die sich die Dosis bezieht (Blend; leer = Gesamt)
 *
 * Liefert { ok: true, ... } oder { ok: false, missing: [...]} / { ok: false, error }.
 */
export function calculate(input) {
  const i = { unitsPerMl: 100, vialUnit: 'mg', solveFor: 'units', ...input };
  const missing = [];
  const need = (cond, name) => { if (!cond) missing.push(name); };

  if (i.mode === 'blend') {
    const comps = (i.components || []).filter((c) => pos(c.mg));
    need(comps.length, 'components');
    need(pos(i.dose), 'dose');
    need(pos(i.waterMl), 'water');
    if (missing.length) return { ok: false, missing };
    const doseMg = doseInVialUnit(i.dose, i.doseUnit, 'mg');
    if (doseMg == null) return { ok: false, error: 'Blends werden in mg/mcg dosiert.' };

    const totalMg = comps.reduce((s, c) => s + c.mg, 0);
    const anchor = comps.find((c) => c.name && c.name === i.anchor) || null;
    const refMg = anchor ? anchor.mg : totalMg;
    const volumeMl = doseMg / (refMg / i.waterMl);
    const breakdown = comps.map((c) => ({ name: c.name, mg: c.mg, perDoseMg: (c.mg / i.waterMl) * volumeMl }));
    return {
      ok: true, mode: 'blend', totalMg, anchor: anchor?.name || null,
      concentration: totalMg / i.waterMl, concentrationUnit: 'mg',
      volumeMl, units: volumeMl * 100, unitsPerMl: 100,
      dosesPerVial: refMg / doseMg, breakdown,
    };
  }

  need(pos(i.vialAmount), 'vial');
  need(pos(i.dose), 'dose');
  const reverse = i.solveFor === 'water' && (i.mode === 'syringe' || i.mode === 'pen');
  if (reverse) need(pos(i.targetUnits), 'targetUnits');
  else need(pos(i.waterMl), 'water');
  if (i.mode === 'spray') need(pos(i.sprayMl), 'spray');
  if (i.mode === 'syringe' && !reverse) need(pos(i.syringeMl), 'syringe');
  if (missing.length) return { ok: false, missing };

  const dose = doseInVialUnit(i.dose, i.doseUnit, i.vialUnit);
  if (dose == null) return { ok: false, error: `Eine Dosis in ${i.doseUnit} passt nicht zu einem Fläschchen in ${i.vialUnit}.` };
  if (dose > i.vialAmount) return { ok: false, error: 'Die Dosis ist größer als der Inhalt des Fläschchens.' };

  const unitsPerMl = i.mode === 'syringe' ? i.unitsPerMl : 100; // Pen und Blend: Insulin-Einheiten (U-100)
  const dosesPerVial = i.vialAmount / dose;

  if (reverse) {
    const volumeMl = i.targetUnits / unitsPerMl;
    const waterMl = (i.vialAmount * volumeMl) / dose;
    return {
      ok: true, mode: i.mode, reverse: true, waterMl,
      concentration: i.vialAmount / waterMl, concentrationUnit: i.vialUnit,
      volumeMl, units: i.targetUnits, unitsPerMl, dosesPerVial,
    };
  }

  const concentration = i.vialAmount / i.waterMl;
  const volumeMl = dose / concentration;
  const result = {
    ok: true, mode: i.mode, concentration, concentrationUnit: i.vialUnit,
    volumeMl, dosesPerVial, waterMl: i.waterMl,
  };
  if (i.mode === 'spray') {
    result.sprays = volumeMl / i.sprayMl;
  } else {
    result.unitsPerMl = unitsPerMl;
    result.units = volumeMl * unitsPerMl;
    result.perUnit = concentration / unitsPerMl; // Wirkstoff pro Teilstrich
  }
  if (i.mode === 'syringe') {
    result.syringeMl = i.syringeMl;
    result.exceedsSyringe = volumeMl > i.syringeMl + 1e-9;
  }
  return result;
}

/** Übliche Fläschchengrößen und Wassermengen als Schnellauswahl. */
export const PRESETS = {
  vial: [2, 5, 10, 15, 20, 30, 50],
  water: [0.5, 1, 1.5, 2, 2.5, 3],
  sprayWater: [2, 3, 4, 5],
  targetUnits: [5, 10, 15, 20, 25, 50],
  syringeMl: [0.3, 0.5, 1],
  sprayMl: [0.1, 0.12, 0.14],
};
