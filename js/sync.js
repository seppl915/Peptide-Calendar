// Ende-zu-Ende-verschlüsselter Sync. Der Server speichert nur einen
// verschlüsselten Blob pro Sync-Raum und kennt weder Schlüssel noch Inhalt.
//
// Aus dem Sync-Schlüssel werden per HKDF abgeleitet:
//   - die Raum-ID (öffentlich, identifiziert den Datensatz auf dem Server)
//   - ein AES-GCM-Schlüssel (bleibt auf den Geräten)
import { mergeStates } from './merge.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O, 1/I
const enc = new TextEncoder();
const dec = new TextDecoder();

export function generateKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return chars.match(/.{4}/g).join('-');
}

export function normalizeKey(key) {
  return String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidKey(key) {
  const k = normalizeKey(key);
  return k.length >= 16 && [...k].every((c) => ALPHABET.includes(c));
}

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function deriveKeys(key) {
  const material = await crypto.subtle.importKey('raw', enc.encode(normalizeKey(key)), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const salt = enc.encode('peptide-calendar-sync-v1');
  const idBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('room-id') }, material, 256);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('encryption') },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
  return { roomId: hex(idBits), aesKey };
}

export async function encryptState(aesKey, state) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(JSON.stringify(state)));
  return { iv: b64(iv), data: b64(data) };
}

export async function decryptState(aesKey, { iv, data }) {
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, aesKey, unb64(data));
    return JSON.parse(dec.decode(plain));
  } catch {
    throw new Error('Entschlüsselung fehlgeschlagen – falscher Sync-Schlüssel?');
  }
}

function endpoint(serverUrl, roomId) {
  return `${String(serverUrl).replace(/\/+$/, '')}/api/sync/${roomId}`;
}

/**
 * Ein Sync-Durchlauf: Serverstand holen, mit lokalem Stand zusammenführen,
 * Ergebnis verschlüsselt hochladen. Bei gleichzeitigen Änderungen (409) wird
 * es erneut versucht. Gibt den zusammengeführten Stand zurück.
 */
export async function syncOnce({ serverUrl, key }, localState, fetchImpl = fetch) {
  const { roomId, aesKey } = await deriveKeys(key);
  const url = endpoint(serverUrl, roomId);

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetchImpl(url, { cache: 'no-store' });
    let remote = null;
    let version = 0;
    if (res.status === 200) {
      const body = await res.json();
      version = body.version || 0;
      if (body.data) remote = await decryptState(aesKey, body);
    } else if (res.status !== 404) {
      throw new Error(`Server antwortet mit Fehler ${res.status}`);
    }

    const merged = remote ? mergeStates(remote, localState) : mergeStates(localState, null);
    if (remote && JSON.stringify(mergeStates(remote, null)) === JSON.stringify(merged)) {
      return { state: merged, version }; // Server ist schon aktuell
    }

    const put = await fetchImpl(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseVersion: version, ...(await encryptState(aesKey, merged)) }),
    });
    if (put.status === 409) continue; // jemand anderes war schneller – neu zusammenführen
    if (!put.ok) throw new Error(`Hochladen fehlgeschlagen (${put.status})`);
    return { state: merged, version: (await put.json()).version };
  }
  throw new Error('Sync-Konflikt – bitte erneut versuchen');
}
