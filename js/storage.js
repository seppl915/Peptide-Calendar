// Persistenz in localStorage.
const KEY = 'peptide-calendar:v2';
const LEGACY_KEY = 'peptide-calendar:v1';
const SYNC_KEY = 'peptide-calendar:sync';

const empty = () => ({ items: [], logs: {} });

/** Bringt ältere Datenformate (v1: `peptides`) auf den aktuellen Stand. */
export function migrate(data) {
  if (!data || typeof data !== 'object') return empty();
  const items = (data.items || data.peptides || []).map((it) => ({
    category: 'peptide',
    updatedAt: 0,
    ...it,
  }));
  const logs = {};
  for (const [k, v] of Object.entries(data.logs || {})) logs[k] = { updatedAt: 0, ...v };
  return { items, logs };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    return raw ? migrate(JSON.parse(raw)) : empty();
  } catch {
    return empty();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ items: state.items, logs: state.logs }));
  } catch (e) {
    console.error('Speichern fehlgeschlagen', e);
  }
}

export function validateImport(data) {
  if (!data || !(Array.isArray(data.items) || Array.isArray(data.peptides))) throw new Error('Ungültige Datei');
  return migrate(data);
}

export function loadSyncConfig() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || null; } catch { return null; }
}

export function saveSyncConfig(cfg) {
  try {
    if (cfg) localStorage.setItem(SYNC_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(SYNC_KEY);
  } catch { /* ignorieren */ }
}
