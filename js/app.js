import { dosesForDate, describeSchedule, toISODate, dayNumber } from './schedule.js';
import { load, save, validateImport, loadSyncConfig, saveSyncConfig } from './storage.js';
import { convert, hasStock, remaining, forecast, reconstitution } from './inventory.js';
import { generateKey, isValidKey, syncOnce } from './sync.js';
import { mergeStates, sameState } from './merge.js';
import { initCalculator } from './calc-ui.js';

const CATEGORIES = {
  peptide: {
    label: 'Peptid', plural: 'Peptide', icon: '💉', placeholder: 'z. B. BPC-157', notes: 'z. B. subkutan, Bauch',
    units: ['mcg', 'mg', 'IE', 'ml', 'Einheiten'], defaultUnit: 'mcg',
  },
  supplement: {
    label: 'Supplement', plural: 'Supplements', icon: '💊', placeholder: 'z. B. Magnesium', notes: 'z. B. zum Essen',
    units: ['Kapseln', 'Tabletten', 'mg', 'g', 'mcg', 'IE', 'ml', 'Tropfen', 'Messlöffel', 'Stück'], defaultUnit: 'Kapseln',
  },
};

let state = load();
let syncConfig = loadSyncConfig();
const today = () => toISODate(new Date());
let viewMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
let selectedDate = today();
let editing = { id: null, category: 'peptide' };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const now = () => Date.now();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n, digits = 2) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: digits });
const fmtAmount = (n, unit) => (n == null || n === '' ? '' : `${num(n)} ${unit}`);
const fmtDate = (iso, opts) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', opts);
};
const shortDate = (iso) => fmtDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });

const activeItems = () => state.items.filter((i) => !i.deleted);
const itemById = (id) => state.items.find((i) => i.id === id);
const category = (item) => CATEGORIES[item?.category] || CATEGORIES.peptide;

function commit() {
  save(state);
  render();
  scheduleSync();
}

/* ---------- Vorrat ---------- */

function stockInfo(item) {
  if (!hasStock(item)) return null;
  const f = forecast(item, state.logs, today());
  const warnDays = Number(item.stock.warnDays ?? 7);
  const empty = f.remaining <= 1e-9 || (f.runsOutOn && f.daysLeft === 0);
  const low = empty || (f.runsOutOn && f.daysLeft <= warnDays);
  let text = `Vorrat: ${fmtAmount(f.remaining, item.unit)}`;
  if (empty) text += ' · leer';
  else if (f.runsOutOn) text += ` · reicht bis ${fmtDate(f.runsOutOn, { day: '2-digit', month: '2-digit' })} (${f.dosesLeft} Einnahmen)`;
  else if (f.dosesLeft != null) text += ' · reicht bis Kursende';
  return { ...f, low, empty, text };
}

/* ---------- Kalender ---------- */

function dayStatus(iso) {
  const doses = dosesForDate(activeItems(), iso);
  if (!doses.length) return { doses, cls: '' };
  const status = (d) => state.logs[d.key]?.status;
  const taken = doses.filter((d) => status(d) === 'taken').length;
  const done = doses.filter((d) => status(d)).length;
  let cls = 'has-doses';
  if (done === doses.length) cls += taken === doses.length ? ' complete' : ' done';
  else if (dayNumber(iso) < dayNumber(today())) cls += ' missed';
  return { doses, cls };
}

function renderAlerts() {
  const alerts = activeItems().filter((i) => !i.paused)
    .map((i) => ({ item: i, info: stockInfo(i) }))
    .filter((a) => a.info?.low);
  $('#stock-alerts').innerHTML = alerts.map(({ item, info }) => {
    const when = info.empty ? 'ist aufgebraucht' : info.daysLeft === 1 ? 'reicht nur noch bis morgen' : `reicht noch ${info.daysLeft} Tage`;
    return `<div class="alert" style="--c:${esc(item.color)}">⚠️ <strong>${esc(item.name)}</strong> ${when}
      <button class="btn small" data-refill="${esc(item.id)}">Nachfüllen</button></div>`;
  }).join('');
}

function renderCalendar() {
  $('#month-label').textContent = viewMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const grid = $('#calendar-grid');
  grid.innerHTML = '';

  const first = new Date(viewMonth);
  const lead = (first.getDay() + 6) % 7; // Montag als Wochenstart
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = lead + daysInMonth <= 35 ? 35 : 42;
  const todayIso = today();

  for (let i = 0; i < cells; i++) {
    const date = new Date(first.getFullYear(), first.getMonth(), 1 - lead + i);
    const iso = toISODate(date);
    const { doses, cls } = dayStatus(iso);
    const btn = document.createElement('button');
    btn.className = `day ${cls}`;
    if (date.getMonth() !== viewMonth.getMonth()) btn.classList.add('other-month');
    if (iso === todayIso) btn.classList.add('today');
    if (iso === selectedDate) btn.classList.add('selected');
    btn.setAttribute('aria-label', fmtDate(iso, { day: 'numeric', month: 'long' }) + (doses.length ? `, ${doses.length} Einnahmen` : ''));

    const seen = new Map();
    for (const d of doses) {
      const taken = state.logs[d.key]?.status === 'taken';
      const prev = seen.get(d.peptide.id);
      seen.set(d.peptide.id, { color: d.peptide.color, taken: prev ? prev.taken && taken : taken });
    }
    const dots = [...seen.values()].slice(0, 6)
      .map((s) => `<i class="dot ${s.taken ? 'filled' : ''}" style="--c:${esc(s.color)}"></i>`).join('');
    btn.innerHTML = `<span class="num">${date.getDate()}</span><span class="dots">${dots}</span>`;
    btn.addEventListener('click', () => {
      selectedDate = iso;
      if (date.getMonth() !== viewMonth.getMonth()) viewMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      render();
    });
    grid.appendChild(btn);
  }
}

function doseDetail(item) {
  const parts = [fmtAmount(item.dose, item.unit)];
  const r = item.recon && reconstitution(item.dose, item.unit, item.recon.vialMg, item.recon.waterMl);
  if (r) parts.push(`${num(r.ml, 3)} ml = ${num(r.units, 1)} E. (U-100)`);
  return parts.filter(Boolean).join(' · ');
}

function renderDay() {
  const label = selectedDate === today() ? 'Heute, ' : '';
  $('#day-title').textContent = label + fmtDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' });
  const list = $('#dose-list');
  const doses = dosesForDate(activeItems(), selectedDate);

  if (!activeItems().length) {
    list.innerHTML = `<li class="empty">Noch nichts angelegt.
      <span class="row center"><button class="btn primary" data-action="go-add" data-category="peptide">+ Peptid</button>
      <button class="btn primary" data-action="go-add" data-category="supplement">+ Supplement</button></span></li>`;
    return;
  }
  if (!doses.length) {
    list.innerHTML = '<li class="empty">Keine Einnahme an diesem Tag geplant.</li>';
    return;
  }

  list.innerHTML = doses.map((d) => {
    const item = d.peptide;
    const log = state.logs[d.key];
    const status = log?.status || '';
    const at = log?.at ? new Date(log.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
    const sub = [d.time && `${d.time} Uhr`, doseDetail(item)].filter(Boolean).join(' · ');
    const statusText = status === 'taken' ? `Eingenommen${at ? ` um ${at}` : ''}` : status === 'skipped' ? 'Ausgelassen' : '';
    return `
      <li class="dose ${status}" style="--c:${esc(item.color)}">
        <span class="swatch"></span>
        <div class="info">
          <strong><span class="cat" title="${category(item).label}">${category(item).icon}</span> ${esc(item.name)}</strong>
          <span class="muted">${esc(sub)}</span>
          ${statusText ? `<span class="status">${statusText}</span>` : ''}
        </div>
        <button class="skip-btn" data-key="${esc(d.key)}" data-status="skipped" aria-label="Auslassen" title="Auslassen">✕</button>
        <button class="check-btn" data-key="${esc(d.key)}" data-status="taken" aria-label="Als eingenommen markieren" title="Eingenommen">✓</button>
      </li>`;
  }).join('');
}

$('#dose-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.action === 'go-add') { switchView(btn.dataset.category); openForm(btn.dataset.category); return; }
  const { key, status } = btn.dataset;
  if (!key) return;
  const item = itemById(key.split('|')[0]);
  if (state.logs[key]?.status === status) {
    state.logs[key] = { status: null, updatedAt: now() };
  } else {
    state.logs[key] = {
      status, at: new Date().toISOString(), updatedAt: now(),
      ...(status === 'taken' ? { used: Number(item?.dose) || 0 } : {}),
    };
  }
  commit();
});

$('#stock-alerts').addEventListener('click', (e) => {
  const id = e.target.closest('[data-refill]')?.dataset.refill;
  if (id) refill(itemById(id));
});

/* ---------- Listen ---------- */

function renderLists() {
  for (const section of $$('.view[data-category]')) {
    const cat = section.dataset.category;
    const list = $('.item-list', section);
    const items = activeItems().filter((i) => (i.category || 'peptide') === cat);
    if (!items.length) {
      list.innerHTML = `<li class="empty">Noch keine ${CATEGORIES[cat].plural}. Tippe auf „+ ${CATEGORIES[cat].label}“.</li>`;
      continue;
    }
    list.innerHTML = items.map((p) => {
      const times = (p.times || []).filter(Boolean).join(', ');
      const range = `ab ${shortDate(p.startDate)}` + (p.endDate ? ` bis ${shortDate(p.endDate)}` : '');
      const stock = stockInfo(p);
      return `
        <li class="item ${p.paused ? 'paused' : ''}" style="--c:${esc(p.color)}" data-id="${esc(p.id)}">
          <span class="swatch"></span>
          <div class="info">
            <strong>${esc(p.name)} ${p.paused ? '<em>(pausiert)</em>' : ''}</strong>
            <span class="muted">${esc([doseDetail(p), describeSchedule(p.schedule), times].filter(Boolean).join(' · '))}</span>
            ${stock ? `<span class="stock ${stock.low ? 'low' : ''}">${esc(stock.text)}</span>` : ''}
            <span class="muted small">${esc(range)}</span>
          </div>
          <div class="item-actions">
            ${hasStock(p) ? '<button class="btn small" data-action="refill">Nachfüllen</button>' : ''}
            <button class="btn small" data-action="pause">${p.paused ? 'Fortsetzen' : 'Pausieren'}</button>
            <button class="btn small" data-action="edit">Bearbeiten</button>
          </div>
        </li>`;
    }).join('');
  }
}

for (const section of $$('.view[data-category]')) {
  section.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'add') { openForm(section.dataset.category); return; }
    const p = itemById(btn.closest('li')?.dataset.id);
    if (!p) return;
    if (btn.dataset.action === 'edit') openForm(p.category, p);
    if (btn.dataset.action === 'pause') { p.paused = !p.paused; p.updatedAt = now(); commit(); }
    if (btn.dataset.action === 'refill') refill(p);
  });
}

function refill(item) {
  if (!item) return;
  const pack = Number(item.stock?.pack) || '';
  const answer = prompt(`Wie viel ${item.unit} von „${item.name}“ kommen dazu?`, pack ? String(pack).replace('.', ',') : '');
  if (answer == null) return;
  const amount = Number(answer.replace(',', '.'));
  if (!(amount > 0)) { alert('Bitte eine positive Menge eingeben.'); return; }
  const rest = remaining(item, state.logs) ?? 0;
  item.stock = { ...(item.stock || {}), base: rest + amount, baseAt: new Date().toISOString() };
  item.updatedAt = now();
  commit();
}

/* ---------- Formular ---------- */

const dialog = $('#item-dialog');
const form = $('#item-form');

function addTimeInput(value = '') {
  const row = document.createElement('div');
  row.className = 'time-row';
  row.innerHTML = `<input type="time" name="time" value="${esc(value)}"><button type="button" class="icon-btn small" aria-label="Entfernen">✕</button>`;
  row.querySelector('button').addEventListener('click', () => row.remove());
  $('#time-list').appendChild(row);
}

function fillSelect(select, units, value) {
  const all = value && !units.includes(value) ? [...units, value] : units;
  select.innerHTML = all.map((u) => `<option>${esc(u)}</option>`).join('');
  select.value = value || units[0];
}

function updateFormState() {
  const type = form.scheduleType.value;
  $$('.sched', form).forEach((el) => { el.hidden = !el.classList.contains(`sched-${type}`); });
  const r = reconstitution(Number(form.dose.value), form.unit.value, Number(form.vialMg.value), Number(form.waterMl.value));
  $('#recon-result').textContent = r
    ? `Konzentration ${num(r.mgPerMl, 3)} mg/ml → pro Dosis ${num(r.ml, 3)} ml = ${num(r.units, 1)} Einheiten auf einer U-100-Spritze · ca. ${r.dosesPerVial} Dosen pro Fläschchen`
    : 'Dosis (in mcg/mg), Wirkstoffmenge und Wasser eintragen, um die Spritzenmenge zu berechnen.';
}

const PALETTE = ['#0f766e', '#2563eb', '#9333ea', '#db2777', '#ea580c', '#ca8a04', '#16a34a', '#0891b2'];
const nextColor = () => PALETTE[activeItems().length % PALETTE.length];

function openForm(cat = 'peptide', p = null, prefill = null) {
  const c = CATEGORIES[cat];
  editing = { id: p?.id || null, category: cat };
  form.reset();
  $('#form-title').textContent = `${c.label} ${p ? 'bearbeiten' : 'hinzufügen'}`;
  $('#delete-item').hidden = !p;
  $('#time-list').innerHTML = '';
  form.name.placeholder = c.placeholder;
  form.notes.placeholder = c.notes;
  $('.recon-fields', form).hidden = cat !== 'peptide';

  const s = p?.schedule || { type: 'daily' };
  form.name.value = p?.name || '';
  form.dose.value = p?.dose ?? '';
  fillSelect(form.unit, c.units, p?.unit || c.defaultUnit);
  form.scheduleType.value = s.type;
  form.interval.value = s.interval || 2;
  form.onDays.value = s.onDays || 5;
  form.offDays.value = s.offDays ?? 2;
  $$('input[name="wd"]', form).forEach((cb) => { cb.checked = (s.weekdays || []).includes(Number(cb.value)); });
  form.startDate.value = p?.startDate || selectedDate || today();
  form.endDate.value = p?.endDate || '';
  form.color.value = p?.color || nextColor();
  form.notes.value = p?.notes || '';
  (p?.times?.length ? p.times : ['08:00']).forEach(addTimeInput);

  const rest = remaining(p, state.logs);
  form.stock.value = rest != null ? +rest.toFixed(4) : '';
  form.stock.dataset.initial = form.stock.value;
  fillSelect(form.stockUnit, c.units, p?.unit || c.defaultUnit);
  form.pack.value = p?.stock?.pack ?? '';
  form.warnDays.value = p?.stock?.warnDays ?? 7;
  form.vialMg.value = p?.recon?.vialMg ?? '';
  form.waterMl.value = p?.recon?.waterMl ?? '';

  // Vorbelegung, z. B. aus dem Rechner
  if (prefill) {
    if (prefill.dose != null) form.dose.value = prefill.dose;
    if (prefill.unit) { fillSelect(form.unit, c.units, prefill.unit); if (!form.stock.value) form.stockUnit.value = prefill.unit; }
    if (prefill.vialMg != null) form.vialMg.value = prefill.vialMg;
    if (prefill.waterMl != null) form.waterMl.value = prefill.waterMl;
  }

  updateFormState();
  dialog.showModal();
}

form.addEventListener('input', updateFormState);
form.unit.addEventListener('change', () => { if (!form.stock.value) form.stockUnit.value = form.unit.value; });
$('#add-time').addEventListener('click', () => addTimeInput(''));
$('#cancel-form').addEventListener('click', () => dialog.close());

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const type = form.scheduleType.value;
  const weekdays = $$('input[name="wd"]:checked', form).map((cb) => Number(cb.value));
  if (type === 'weekdays' && !weekdays.length) { alert('Bitte mindestens einen Wochentag wählen.'); return; }
  if (form.endDate.value && form.endDate.value < form.startDate.value) { alert('Das Enddatum liegt vor dem Startdatum.'); return; }

  const unit = form.unit.value;
  const existing = editing.id ? itemById(editing.id) : null;

  // Vorrat in Dosis-Einheit umrechnen
  let stock = null;
  if (form.stock.value !== '') {
    const amount = convert(Number(form.stock.value), form.stockUnit.value, unit);
    const pack = form.pack.value !== '' ? convert(Number(form.pack.value), form.stockUnit.value, unit) : null;
    if (amount == null || (form.pack.value !== '' && pack == null)) {
      alert(`Der Vorrat in „${form.stockUnit.value}“ lässt sich nicht in die Dosis-Einheit „${unit}“ umrechnen.`);
      return;
    }
    const unchanged = existing && hasStock(existing) && form.stock.value === form.stock.dataset.initial
      && form.stockUnit.value === existing.unit && unit === existing.unit;
    stock = {
      base: unchanged ? existing.stock.base : amount,
      baseAt: unchanged ? existing.stock.baseAt : new Date().toISOString(),
      pack,
      warnDays: Math.max(0, Number(form.warnDays.value) || 0),
    };
  }

  const schedule = { type };
  if (type === 'interval') schedule.interval = Math.max(1, Number(form.interval.value) || 1);
  if (type === 'weekdays') schedule.weekdays = weekdays;
  if (type === 'cycle') {
    schedule.onDays = Math.max(1, Number(form.onDays.value) || 1);
    schedule.offDays = Math.max(0, Number(form.offDays.value) || 0);
  }
  const times = [...new Set($$('input[name="time"]', form).map((i) => i.value).filter(Boolean))].sort();
  const recon = editing.category === 'peptide' && form.vialMg.value && form.waterMl.value
    ? { vialMg: Number(form.vialMg.value), waterMl: Number(form.waterMl.value) } : null;

  const data = {
    category: editing.category,
    name: form.name.value.trim(),
    dose: form.dose.value ? Number(form.dose.value) : null,
    unit, schedule, times, stock, recon,
    startDate: form.startDate.value,
    endDate: form.endDate.value || null,
    color: form.color.value,
    notes: form.notes.value.trim(),
    updatedAt: now(),
  };

  if (existing) Object.assign(existing, data);
  else state.items.push({ id: uid(), paused: false, ...data });
  dialog.close();
  commit();
});

$('#delete-item').addEventListener('click', () => {
  const p = itemById(editing.id);
  if (!p || !confirm(`„${p.name}“ und alle zugehörigen Einträge löschen?`)) return;
  // Grabstein statt Entfernen, damit die Löschung synchronisiert wird
  const t = now();
  Object.keys(p).forEach((k) => { if (!['id', 'category'].includes(k)) delete p[k]; });
  Object.assign(p, { deleted: true, updatedAt: t });
  for (const key of Object.keys(state.logs)) if (key.startsWith(`${editing.id}|`)) state.logs[key] = { status: null, updatedAt: t };
  dialog.close();
  commit();
});

/* ---------- Export / Import ---------- */

$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ items: state.items, logs: state.logs }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `peptid-kalender-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = validateImport(JSON.parse(await file.text()));
    if (!confirm('Aktuelle Daten durch die importierten ersetzen?')) return;
    // Importierte Daten als neueste Version markieren, damit sie sich beim Sync durchsetzen
    const t = now();
    const ids = new Set(data.items.map((i) => i.id));
    const gone = state.items.filter((i) => !ids.has(i.id)).map((i) => ({ id: i.id, category: i.category, deleted: true, updatedAt: t }));
    state = {
      items: [...data.items.map((i) => ({ ...i, updatedAt: t })), ...gone],
      logs: Object.fromEntries(Object.entries(data.logs).map(([k, v]) => [k, { ...v, updatedAt: t }])),
    };
    commit();
  } catch {
    alert('Die Datei konnte nicht importiert werden.');
  } finally {
    e.target.value = '';
  }
});

/* ---------- Sync ---------- */

let syncTimer = null;
let syncing = false;
let syncAgain = false;
let syncError = '';

function scheduleSync(delay = 1500) {
  if (!syncConfig) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}

async function runSync() {
  if (!syncConfig) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  renderSync();
  try {
    const before = structuredClone(state);
    const { state: merged } = await syncOnce(syncConfig, before);
    // Änderungen, die während des Syncs lokal passiert sind, behalten (neuere gewinnen)
    state = mergeStates(merged, state);
    if (!sameState(state, merged)) syncAgain = true;
    if (!sameState(before, state)) { save(state); render(); }
    syncConfig.lastSync = new Date().toISOString();
    saveSyncConfig(syncConfig);
    syncError = '';
  } catch (e) {
    syncError = e.message || 'Sync fehlgeschlagen';
  } finally {
    syncing = false;
    renderSync();
    if (syncAgain) { syncAgain = false; scheduleSync(0); }
  }
}

function renderSync() {
  const on = !!syncConfig;
  $('#sync-off').hidden = on;
  $('#sync-on').hidden = !on;
  if (!on) {
    if (!$('#sync-server').value) $('#sync-server').value = location.protocol.startsWith('http') ? location.origin : '';
    return;
  }
  $('#sync-key').textContent = syncConfig.key;
  $('#sync-server-label').textContent = syncConfig.serverUrl;
  const st = $('#sync-status');
  st.className = `sync-status ${syncError ? 'error' : ''}`;
  st.textContent = syncing ? 'Synchronisiere …'
    : syncError ? `⚠️ ${syncError}`
      : syncConfig.lastSync ? `✓ Zuletzt synchronisiert: ${new Date(syncConfig.lastSync).toLocaleString('de-DE')}` : 'Noch nicht synchronisiert';
  $('#sync-now').disabled = syncing;
}

function serverUrlInput() {
  const url = $('#sync-server').value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+/.test(url)) { alert('Bitte eine gültige Server-Adresse (https://…) eingeben.'); return null; }
  if (!crypto?.subtle) { alert('Sync benötigt eine sichere Verbindung (HTTPS).'); return null; }
  return url;
}

async function connect(serverUrl, key) {
  syncConfig = { serverUrl, key, lastSync: null };
  saveSyncConfig(syncConfig);
  syncError = '';
  await runSync();
  if (syncError) {
    alert(`Verbindung fehlgeschlagen: ${syncError}`);
    syncConfig = null;
    saveSyncConfig(null);
    renderSync();
  }
}

$('#sync-create').addEventListener('click', () => {
  const url = serverUrlInput();
  if (url) connect(url, generateKey());
});

$('#sync-join').addEventListener('click', () => {
  const url = serverUrlInput();
  if (!url) return;
  const key = prompt('Sync-Schlüssel vom anderen Gerät eingeben:');
  if (key == null) return;
  if (!isValidKey(key)) { alert('Das sieht nicht nach einem gültigen Sync-Schlüssel aus.'); return; }
  connect(url, key.trim().toUpperCase());
});

$('#sync-now').addEventListener('click', runSync);
$('#sync-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(syncConfig.key); $('#sync-copy').textContent = 'Kopiert ✓'; } catch { prompt('Schlüssel kopieren:', syncConfig.key); }
  setTimeout(() => { $('#sync-copy').textContent = 'Kopieren'; }, 1500);
});
$('#sync-disconnect').addEventListener('click', () => {
  if (!confirm('Sync auf diesem Gerät beenden? Die lokalen Daten bleiben erhalten.')) return;
  syncConfig = null;
  saveSyncConfig(null);
  renderSync();
});

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(0); });
window.addEventListener('online', () => scheduleSync(0));
setInterval(() => { if (document.visibilityState === 'visible') scheduleSync(0); }, 60_000);

/* ---------- Navigation ---------- */

function switchView(name) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  window.scrollTo(0, 0);
}
$$('.tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));

$('#prev-month').addEventListener('click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); render(); });
$('#next-month').addEventListener('click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); render(); });
$('#month-label').addEventListener('click', () => {
  const d = new Date();
  viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  selectedDate = today();
  render();
});

const calculator = initCalculator({
  getPeptides: () => activeItems().filter((i) => (i.category || 'peptide') === 'peptide'),
  openPeptideForm: (item, prefill) => { switchView('peptide'); openForm('peptide', item, prefill); },
});

function render() {
  calculator.render();
  renderAlerts();
  renderCalendar();
  renderDay();
  renderLists();
  renderSync();
}

render();
scheduleSync(0);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
