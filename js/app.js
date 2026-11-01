import { dosesForDate, describeSchedule, toISODate, dayNumber } from './schedule.js';
import { load, save, validateImport } from './storage.js';

const state = load();
const today = () => toISODate(new Date());
let viewMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
let selectedDate = today();
let editingId = null;

const $ = (sel) => document.querySelector(sel);
const persist = () => save(state);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDose = (p) => (p.dose ? `${String(p.dose).replace('.', ',')} ${p.unit}` : '');
const fmtDate = (iso, opts) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', opts);
};

/* ---------- Kalender ---------- */

function dayStatus(iso) {
  const doses = dosesForDate(state.peptides, iso);
  if (!doses.length) return { doses, cls: '' };
  const taken = doses.filter((d) => state.logs[d.key]?.status === 'taken').length;
  const done = doses.filter((d) => state.logs[d.key]).length;
  let cls = 'has-doses';
  if (done === doses.length) cls += taken === doses.length ? ' complete' : ' done';
  else if (dayNumber(iso) < dayNumber(today())) cls += ' missed';
  return { doses, cls };
}

function renderCalendar() {
  $('#month-label').textContent = viewMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const grid = $('#calendar-grid');
  grid.innerHTML = '';

  const first = new Date(viewMonth);
  const lead = (first.getDay() + 6) % 7; // Montag als Wochenstart
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
  const todayIso = today();

  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
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
    const dots = [...seen.values()].slice(0, 5)
      .map((s) => `<i class="dot ${s.taken ? 'filled' : ''}" style="--c:${esc(s.color)}"></i>`).join('');
    btn.innerHTML = `<span class="num">${date.getDate()}</span><span class="dots">${dots}</span>`;
    btn.addEventListener('click', () => {
      selectedDate = iso;
      if (date.getMonth() !== viewMonth.getMonth()) viewMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      render();
    });
    grid.appendChild(btn);
  }
  if (lead + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate() <= 35) {
    [...grid.children].slice(35).forEach((el) => el.remove());
  }
}

function renderDay() {
  const label = selectedDate === today() ? 'Heute, ' : '';
  $('#day-title').textContent = label + fmtDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' });
  const list = $('#dose-list');
  const doses = dosesForDate(state.peptides, selectedDate);

  if (!state.peptides.length) {
    list.innerHTML = `<li class="empty">Noch keine Peptide angelegt.<br><button class="btn primary" data-action="go-add">Erstes Peptid hinzufügen</button></li>`;
    return;
  }
  if (!doses.length) {
    list.innerHTML = '<li class="empty">Keine Einnahme an diesem Tag geplant.</li>';
    return;
  }

  list.innerHTML = doses.map((d) => {
    const log = state.logs[d.key];
    const status = log?.status || '';
    const at = log?.at ? new Date(log.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
    const sub = [d.time && `${d.time} Uhr`, fmtDose(d.peptide)].filter(Boolean).join(' · ');
    const statusText = status === 'taken' ? `Eingenommen${at ? ` um ${at}` : ''}` : status === 'skipped' ? 'Ausgelassen' : '';
    return `
      <li class="dose ${status}" style="--c:${esc(d.peptide.color)}">
        <span class="swatch"></span>
        <div class="info">
          <strong>${esc(d.peptide.name)}</strong>
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
  if (btn.dataset.action === 'go-add') { switchView('peptides'); openForm(); return; }
  const { key, status } = btn.dataset;
  if (!key) return;
  if (state.logs[key]?.status === status) delete state.logs[key];
  else state.logs[key] = { status, at: new Date().toISOString() };
  persist();
  render();
});

/* ---------- Peptid-Liste ---------- */

function renderPeptides() {
  const list = $('#peptide-list');
  if (!state.peptides.length) {
    list.innerHTML = '<li class="empty">Noch keine Peptide. Tippe auf „+ Peptid“.</li>';
    return;
  }
  list.innerHTML = state.peptides.map((p) => {
    const times = (p.times || []).filter(Boolean).join(', ');
    const range = `ab ${fmtDate(p.startDate, { day: '2-digit', month: '2-digit', year: 'numeric' })}` +
      (p.endDate ? ` bis ${fmtDate(p.endDate, { day: '2-digit', month: '2-digit', year: 'numeric' })}` : '');
    return `
      <li class="peptide ${p.paused ? 'paused' : ''}" style="--c:${esc(p.color)}" data-id="${esc(p.id)}">
        <span class="swatch"></span>
        <div class="info">
          <strong>${esc(p.name)} ${p.paused ? '<em>(pausiert)</em>' : ''}</strong>
          <span class="muted">${esc([fmtDose(p), describeSchedule(p.schedule), times].filter(Boolean).join(' · '))}</span>
          <span class="muted small">${esc(range)}</span>
        </div>
        <button class="btn small" data-action="pause">${p.paused ? 'Fortsetzen' : 'Pausieren'}</button>
        <button class="btn small" data-action="edit">Bearbeiten</button>
      </li>`;
  }).join('');
}

$('#peptide-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const p = state.peptides.find((x) => x.id === btn.closest('li').dataset.id);
  if (!p) return;
  if (btn.dataset.action === 'edit') openForm(p);
  if (btn.dataset.action === 'pause') { p.paused = !p.paused; persist(); render(); }
});

/* ---------- Formular ---------- */

const dialog = $('#peptide-dialog');
const form = $('#peptide-form');

function addTimeInput(value = '') {
  const row = document.createElement('div');
  row.className = 'time-row';
  row.innerHTML = `<input type="time" name="time" value="${esc(value)}"><button type="button" class="icon-btn small" aria-label="Entfernen">✕</button>`;
  row.querySelector('button').addEventListener('click', () => row.remove());
  $('#time-list').appendChild(row);
}

function updateScheduleFields() {
  const type = form.scheduleType.value;
  form.querySelectorAll('.sched').forEach((el) => { el.hidden = !el.classList.contains(`sched-${type}`); });
}

function openForm(p = null) {
  editingId = p?.id || null;
  form.reset();
  $('#form-title').textContent = p ? 'Peptid bearbeiten' : 'Peptid hinzufügen';
  $('#delete-peptide').hidden = !p;
  $('#time-list').innerHTML = '';

  const s = p?.schedule || { type: 'daily' };
  form.name.value = p?.name || '';
  form.dose.value = p?.dose ?? '';
  form.unit.value = p?.unit || 'mcg';
  form.scheduleType.value = s.type;
  form.interval.value = s.interval || 2;
  form.onDays.value = s.onDays || 5;
  form.offDays.value = s.offDays ?? 2;
  form.querySelectorAll('input[name="wd"]').forEach((cb) => { cb.checked = (s.weekdays || []).includes(Number(cb.value)); });
  form.startDate.value = p?.startDate || selectedDate || today();
  form.endDate.value = p?.endDate || '';
  form.color.value = p?.color || randomColor();
  form.notes.value = p?.notes || '';
  (p?.times?.length ? p.times : ['08:00']).forEach(addTimeInput);

  updateScheduleFields();
  dialog.showModal();
}

const PALETTE = ['#0f766e', '#2563eb', '#9333ea', '#db2777', '#ea580c', '#ca8a04', '#16a34a', '#0891b2'];
const randomColor = () => PALETTE[state.peptides.length % PALETTE.length];

form.scheduleType.addEventListener('change', updateScheduleFields);
$('#add-time').addEventListener('click', () => addTimeInput(''));
$('#cancel-form').addEventListener('click', () => dialog.close());
$('#add-peptide').addEventListener('click', () => openForm());

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const type = form.scheduleType.value;
  const weekdays = [...form.querySelectorAll('input[name="wd"]:checked')].map((cb) => Number(cb.value));
  if (type === 'weekdays' && !weekdays.length) { alert('Bitte mindestens einen Wochentag wählen.'); return; }
  if (form.endDate.value && form.endDate.value < form.startDate.value) { alert('Das Enddatum liegt vor dem Startdatum.'); return; }

  const schedule = { type };
  if (type === 'interval') schedule.interval = Math.max(1, Number(form.interval.value) || 1);
  if (type === 'weekdays') schedule.weekdays = weekdays;
  if (type === 'cycle') {
    schedule.onDays = Math.max(1, Number(form.onDays.value) || 1);
    schedule.offDays = Math.max(0, Number(form.offDays.value) || 0);
  }
  const times = [...new Set([...form.querySelectorAll('input[name="time"]')].map((i) => i.value).filter(Boolean))].sort();

  const data = {
    name: form.name.value.trim(),
    dose: form.dose.value ? Number(form.dose.value) : null,
    unit: form.unit.value,
    schedule,
    times,
    startDate: form.startDate.value,
    endDate: form.endDate.value || null,
    color: form.color.value,
    notes: form.notes.value.trim(),
  };

  if (editingId) Object.assign(state.peptides.find((p) => p.id === editingId), data);
  else state.peptides.push({ id: uid(), paused: false, ...data });
  persist();
  dialog.close();
  render();
});

$('#delete-peptide').addEventListener('click', () => {
  const p = state.peptides.find((x) => x.id === editingId);
  if (!p || !confirm(`„${p.name}“ und alle zugehörigen Einträge löschen?`)) return;
  state.peptides = state.peptides.filter((x) => x.id !== editingId);
  for (const key of Object.keys(state.logs)) if (key.startsWith(`${editingId}|`)) delete state.logs[key];
  persist();
  dialog.close();
  render();
});

/* ---------- Export / Import ---------- */

$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `peptid-kalender-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = validateImport(JSON.parse(await file.text()));
    if (!confirm('Aktuelle Daten durch die importierten ersetzen?')) return;
    state.peptides = data.peptides;
    state.logs = data.logs;
    persist();
    render();
  } catch {
    alert('Die Datei konnte nicht importiert werden.');
  } finally {
    e.target.value = '';
  }
});

/* ---------- Navigation ---------- */

function switchView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));

$('#prev-month').addEventListener('click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); render(); });
$('#next-month').addEventListener('click', () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); render(); });
$('#month-label').addEventListener('click', () => {
  const d = new Date();
  viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  selectedDate = today();
  render();
});

function render() {
  renderCalendar();
  renderDay();
  renderPeptides();
}

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
