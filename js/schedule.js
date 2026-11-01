// Pure scheduling logic – no DOM access, so it can be tested with Node.

/** Parse "YYYY-MM-DD" into a day number (days since epoch, timezone-independent). */
export function dayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Format a local Date as "YYYY-MM-DD". */
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Weekday of an ISO date (0 = Sunday … 6 = Saturday). */
export function weekdayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Is a dose of `peptide` due on the ISO date `iso`?
 *
 * Schedule types:
 *  - daily:    every day
 *  - interval: every `interval` days, starting on startDate
 *  - weekdays: on the given weekdays (0 = Sunday … 6 = Saturday)
 *  - cycle:    `onDays` days on, then `offDays` days off, repeating
 */
export function isDue(peptide, iso) {
  if (!peptide || peptide.paused) return false;
  const day = dayNumber(iso);
  const start = dayNumber(peptide.startDate);
  if (day < start) return false;
  if (peptide.endDate && day > dayNumber(peptide.endDate)) return false;

  const s = peptide.schedule || { type: 'daily' };
  const offset = day - start;
  switch (s.type) {
    case 'daily':
      return true;
    case 'interval': {
      const n = Math.max(1, Number(s.interval) || 1);
      return offset % n === 0;
    }
    case 'weekdays':
      return Array.isArray(s.weekdays) && s.weekdays.includes(weekdayOf(iso));
    case 'cycle': {
      const on = Math.max(1, Number(s.onDays) || 1);
      const off = Math.max(0, Number(s.offDays) || 0);
      return offset % (on + off) < on;
    }
    default:
      return false;
  }
}

/** All doses (peptide × time) due on a given date, sorted by time. */
export function dosesForDate(peptides, iso) {
  const doses = [];
  for (const p of peptides) {
    if (!isDue(p, iso)) continue;
    const times = p.times && p.times.length ? p.times : [''];
    for (const time of times) {
      doses.push({ peptide: p, time, key: logKey(p.id, iso, time) });
    }
  }
  return doses.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}

export function logKey(peptideId, iso, time) {
  return `${peptideId}|${iso}|${time || ''}`;
}

const WEEKDAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Human-readable German description of a schedule. */
export function describeSchedule(schedule) {
  const s = schedule || { type: 'daily' };
  switch (s.type) {
    case 'daily':
      return 'Täglich';
    case 'interval': {
      const n = Number(s.interval) || 1;
      return n === 1 ? 'Täglich' : n === 2 ? 'Jeden 2. Tag' : `Alle ${n} Tage`;
    }
    case 'weekdays': {
      const order = [1, 2, 3, 4, 5, 6, 0];
      const days = order.filter((d) => (s.weekdays || []).includes(d));
      return days.length ? days.map((d) => WEEKDAY_NAMES[d]).join(', ') : 'Keine Tage gewählt';
    }
    case 'cycle':
      return `${s.onDays} Tage an / ${s.offDays} Tage Pause`;
    default:
      return '';
  }
}
