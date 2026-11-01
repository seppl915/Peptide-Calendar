// Zusammenführen zweier Datenstände (z. B. von zwei Geräten).
// Jeder Eintrag trägt `updatedAt` (ms); der neuere gewinnt. Gelöschte
// Einträge bleiben als "Grabstein" (deleted: true bzw. status: null) erhalten,
// damit Löschungen ebenfalls synchronisiert werden.

const newer = (a, b) => ((b?.updatedAt || 0) > (a?.updatedAt || 0) ? b : a);

export function mergeStates(a, b) {
  const items = new Map();
  for (const it of [...(a?.items || []), ...(b?.items || [])]) {
    items.set(it.id, items.has(it.id) ? newer(items.get(it.id), it) : it);
  }
  const logs = { ...(a?.logs || {}) };
  for (const [key, log] of Object.entries(b?.logs || {})) {
    logs[key] = key in logs ? newer(logs[key], log) : log;
  }
  return { items: [...items.values()], logs };
}

/** Grober Vergleich, ob sich zwei Stände unterscheiden. */
export function sameState(a, b) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(s) {
  const items = [...(s?.items || [])].sort((x, y) => x.id.localeCompare(y.id));
  const logs = Object.keys(s?.logs || {}).sort().map((k) => [k, s.logs[k]]);
  return { items, logs };
}
