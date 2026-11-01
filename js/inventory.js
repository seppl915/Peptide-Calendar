// Vorratsberechnung – reine Logik ohne DOM.
import { dayNumber, isDue, logKey } from './schedule.js';

const MASS = { mcg: 0.001, mg: 1, g: 1000 };
const VOLUME = { ml: 1 };

/** Rechnet eine Menge zwischen kompatiblen Einheiten um, sonst null. */
export function convert(amount, from, to) {
  if (amount == null || Number.isNaN(Number(amount))) return null;
  if (from === to) return Number(amount);
  for (const table of [MASS, VOLUME]) {
    if (from in table && to in table) return (Number(amount) * table[from]) / table[to];
  }
  return null;
}

/** Hat das Item eine Vorratsverwaltung? */
export function hasStock(item) {
  return !!item?.stock && item.stock.base != null && !Number.isNaN(Number(item.stock.base));
}

/** Aktueller Restvorrat (in der Dosis-Einheit). */
export function remaining(item, logs) {
  if (!hasStock(item)) return null;
  const prefix = `${item.id}|`;
  const since = item.stock.baseAt || '';
  let used = 0;
  for (const [key, log] of Object.entries(logs || {})) {
    if (!key.startsWith(prefix) || log?.status !== 'taken') continue;
    if ((log.at || '') >= since) used += Number(log.used) || 0;
  }
  return Math.max(0, Number(item.stock.base) - used);
}

/**
 * Prognose, wie lange der Vorrat reicht.
 * Liefert { remaining, dosesLeft, daysLeft, runsOutOn } – runsOutOn ist das Datum
 * der ersten Einnahme, für die der Vorrat nicht mehr reicht (null = reicht bis
 * Kursende bzw. länger als `maxDays`).
 */
export function forecast(item, logs, todayIso, maxDays = 730) {
  const rest = remaining(item, logs);
  if (rest == null) return null;
  const dose = Number(item.dose) || 0;
  if (dose <= 0) return { remaining: rest, dosesLeft: null, daysLeft: null, runsOutOn: null };

  const eps = 1e-9;
  let r = rest;
  let dosesLeft = 0;
  const start = dayNumber(todayIso);
  const [y, m, d] = todayIso.split('-').map(Number);
  const times = item.times?.length ? item.times : [''];

  for (let i = 0; i <= maxDays; i++) {
    const iso = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    if (!isDue({ ...item, paused: false }, iso)) continue;
    for (const time of times) {
      if (i === 0 && logs?.[logKey(item.id, iso, time)]?.status) continue; // heute schon erledigt
      if (r + eps < dose) {
        return { remaining: rest, dosesLeft, daysLeft: dayNumber(iso) - start, runsOutOn: iso };
      }
      r -= dose;
      dosesLeft++;
    }
  }
  return { remaining: rest, dosesLeft, daysLeft: null, runsOutOn: null };
}

/**
 * Rekonstitution: Wie viel ml (und Einheiten auf einer U-100-Spritze) entsprechen einer Dosis?
 * vialMg = Wirkstoff pro Fläschchen in mg, waterMl = zugegebenes Wasser in ml.
 */
export function reconstitution(dose, unit, vialMg, waterMl) {
  const doseMg = convert(dose, unit, 'mg');
  if (!doseMg || !(vialMg > 0) || !(waterMl > 0)) return null;
  const mgPerMl = vialMg / waterMl;
  const ml = doseMg / mgPerMl;
  return { mgPerMl, ml, units: ml * 100, dosesPerVial: Math.floor(vialMg / doseMg + 1e-9) };
}
