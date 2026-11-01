// Persistence in localStorage.
const KEY = 'peptide-calendar:v1';

const empty = () => ({ peptides: [], logs: {} });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw);
    return { peptides: data.peptides || [], logs: data.logs || {} };
  } catch {
    return empty();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Speichern fehlgeschlagen', e);
  }
}

export function validateImport(data) {
  if (!data || !Array.isArray(data.peptides) || typeof (data.logs || {}) !== 'object') {
    throw new Error('Ungültige Datei');
  }
  return { peptides: data.peptides, logs: data.logs || {} };
}
