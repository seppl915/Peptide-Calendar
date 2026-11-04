// Oberfläche des Dosis-Rechners (Tab „Rechner“).
import { calculate, PRESETS } from './calculator.js';

const STORE_KEY = 'peptide-calendar:calc';
const DEFAULTS = {
  mode: 'syringe', solveFor: 'units', sourceId: '',
  vialAmount: 5, vialUnit: 'mg', dose: 250, doseUnit: 'mcg', waterMl: 2,
  targetUnits: 10, unitsPerMl: 100, syringeMl: 1, sprayMl: 0.1,
  components: [{ name: '', mg: null }, { name: '', mg: null }], anchor: '',
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n, d = 2) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: d });
const toNum = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));

function loadCalc() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY)) }; } catch { return { ...DEFAULTS }; }
}
function saveCalc(c) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(c)); } catch { /* ignorieren */ }
}

/** Konzentration lesbar: unter 1 mg/ml lieber in mcg/ml. */
function fmtConc(conc, unit) {
  if (unit === 'mg' && conc < 1) return `${num(conc * 1000, 1)} mcg/ml`;
  return `${num(conc, 3)} ${unit}/ml`;
}
function fmtAmount(v, unit) {
  if (unit === 'mg' && v < 1) return `${num(v * 1000, 1)} mcg`;
  return `${num(v, 3)} ${unit}`;
}

/** Spritze als SVG; Nadel links, Füllung wächst nach rechts. */
function syringeSvg(volumeMl, capacityMl, unitsPerMl) {
  const totalUnits = Math.round(capacityMl * unitsPerMl);
  const x0 = 46, x1 = 290, w = x1 - x0;
  const frac = Math.min(volumeMl / capacityMl, 1);
  const fillX = x0 + w * frac;
  const minor = totalUnits <= 50 ? 1 : 2;
  const major = totalUnits <= 30 ? 5 : 10;
  let ticks = '';
  for (let u = 0; u <= totalUnits; u += minor) {
    const x = x0 + (w * u) / totalUnits;
    const isMajor = u % major === 0;
    ticks += `<line x1="${x}" y1="22" x2="${x}" y2="${isMajor ? 36 : 30}" class="tick"/>`;
    if (isMajor) ticks += `<text x="${x}" y="58" class="tick-label">${u}</text>`;
  }
  return `
    <svg class="syringe" viewBox="0 0 340 66" role="img" aria-label="Spritze bis ${num(volumeMl * unitsPerMl, 1)} Einheiten gefüllt">
      <line x1="4" y1="35" x2="32" y2="35" class="needle"/>
      <rect x="32" y="29" width="14" height="12" rx="2" class="hub"/>
      <rect x="${x0}" y="20" width="${w}" height="30" rx="4" class="barrel"/>
      <rect x="${x0}" y="22" width="${Math.max(0, fillX - x0)}" height="26" rx="2" class="liquid"/>
      ${ticks}
      <rect x="${fillX - 2}" y="18" width="6" height="34" rx="2" class="plunger"/>
      <rect x="${fillX + 4}" y="32" width="${Math.max(0, 334 - fillX - 10)}" height="6" class="rod"/>
      <rect x="326" y="20" width="8" height="30" rx="2" class="plunger"/>
    </svg>`;
}

export function initCalculator({ getPeptides, openPeptideForm }) {
  const view = $('#view-calc');
  const form = $('#calc-form');
  let c = loadCalc();

  const field = (name) => form.elements[name];
  const persist = () => saveCalc(c);

  /* --- Eingaben aus dem Zustand setzen (nur bei Laden/Pill/Quelle, nicht beim Tippen) --- */
  function fillInputs() {
    for (const name of ['vialAmount', 'vialUnit', 'dose', 'doseUnit', 'waterMl', 'targetUnits', 'sprayMl']) {
      field(name).value = c[name] ?? '';
    }
    renderBlendRows();
  }

  function renderSourceSelect() {
    const sel = $('#calc-source');
    const items = getPeptides();
    if (c.sourceId && !items.some((i) => i.id === c.sourceId)) c.sourceId = '';
    sel.innerHTML = '<option value="">– keins –</option>'
      + items.map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('');
    sel.value = c.sourceId;
    sel.closest('label').hidden = !items.length;
  }

  function renderPills() {
    const sets = {
      vialAmount: PRESETS.vial, waterMl: c.mode === 'spray' ? PRESETS.sprayWater : PRESETS.water,
      targetUnits: PRESETS.targetUnits, syringeMl: PRESETS.syringeMl, sprayMl: PRESETS.sprayMl,
    };
    for (const box of $$('[data-pills]', view)) {
      const key = box.dataset.pills;
      const suffix = key === 'vialAmount' ? ` ${c.vialUnit}` : key === 'targetUnits' ? '' : ' ml';
      box.innerHTML = sets[key].map((v) => `<button type="button" class="pill ${Number(c[key]) === v ? 'active' : ''}" data-key="${key}" data-value="${v}">${num(v)}${suffix}</button>`).join('');
    }
  }

  function renderBlendRows() {
    const names = getPeptides().map((p) => p.name);
    $('#blend-rows').innerHTML = c.components.map((comp, idx) => `
      <div class="blend-row" data-idx="${idx}">
        <input class="grow" data-blend="name" list="blend-names" placeholder="Name, z. B. BPC-157" value="${esc(comp.name)}" aria-label="Name">
        <input data-blend="mg" type="number" step="any" min="0" inputmode="decimal" placeholder="mg" value="${comp.mg ?? ''}" aria-label="mg">
        <span class="unit-label">mg</span>
        <button type="button" class="icon-btn small" data-blend-remove aria-label="Entfernen">✕</button>
      </div>`).join('') + `<datalist id="blend-names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;
    renderAnchor();
  }

  function renderAnchor() {
    const sel = field('anchor');
    const names = [...new Set(c.components.map((x) => x.name.trim()).filter(Boolean))];
    if (c.anchor && !names.includes(c.anchor)) c.anchor = '';
    sel.innerHTML = '<option value="">Gesamten Blend</option>' + names.map((n) => `<option>${esc(n)}</option>`).join('');
    sel.value = c.anchor;
  }

  function renderVisibility() {
    const reverse = c.solveFor === 'water' && (c.mode === 'syringe' || c.mode === 'pen');
    const show = (sel, on) => $$(sel, view).forEach((el) => { el.hidden = !on; });
    show('.calc-only-blend', c.mode === 'blend');
    show('.calc-not-blend', c.mode !== 'blend');
    show('.calc-only-syringe', c.mode === 'syringe' && !reverse);
    show('.calc-only-spray', c.mode === 'spray');
    show('.calc-water', !reverse);
    show('.calc-target', reverse);
    $('#calc-solve').closest('.calc-step').hidden = c.mode === 'spray' || c.mode === 'blend';
    $$('#calc-mode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === c.mode));
    $$('#calc-solve button').forEach((b) => b.classList.toggle('active', b.dataset.solve === c.solveFor));
    $$('#calc-syringe-type button').forEach((b) => b.classList.toggle('active', Number(b.dataset.upm) === c.unitsPerMl));
    $$('.step-no', view).forEach((el) => { el.textContent = ''; });
    // Schritte fortlaufend nummerieren (nur sichtbare)
    let n = 0;
    $$('.calc-step', view).forEach((step) => {
      const no = $('.step-no', step);
      if (no && !step.hidden) no.textContent = ++n;
    });
  }

  function renderResult() {
    const r = calculate({ ...c, components: c.components.map((x) => ({ name: x.name.trim(), mg: toNum(x.mg) })) });
    const box = $('#calc-result');
    if (!r.ok) {
      box.className = 'calc-result pending';
      box.innerHTML = r.error ? `⚠️ ${esc(r.error)}` : 'Alle Werte eintragen, um die Dosis zu berechnen.';
      return;
    }
    box.className = 'calc-result';
    const notes = [];
    let headline, sub, visual = '';

    if (r.mode === 'spray') {
      const whole = Math.round(r.sprays);
      headline = `${num(r.sprays, 1)} ${Math.abs(r.sprays - 1) < 0.05 ? 'Sprühstoß' : 'Sprühstöße'}`;
      sub = `= ${num(r.volumeMl, 3)} ml pro Dosis`;
      if (Math.abs(r.sprays - whole) > 0.05 && whole > 0) {
        notes.push(`Für genau ${whole} Sprühstöße: ${num(c.waterMl * whole / r.sprays, 2)} ml Wasser verwenden.`);
      }
      visual = `<div class="spray-icons">${'💨'.repeat(Math.min(Math.max(whole, 1), 12))}</div>`;
    } else if (r.reverse) {
      headline = `${num(r.waterMl, 2)} ml Wasser`;
      sub = `zugeben – dann sind ${num(r.units, 1)} Einheiten (${num(r.volumeMl, 3)} ml) = ${num(c.dose)} ${c.doseUnit}`;
    } else {
      headline = `${num(r.units, 1)} ${Math.abs(r.units - 1) < 0.05 ? 'Einheit' : 'Einheiten'}`;
      sub = r.mode === 'pen' ? `am Pen einstellen (= ${num(r.volumeMl, 3)} ml)` : `aufziehen (= ${num(r.volumeMl, 3)} ml)`;
      const cap = r.mode === 'syringe' ? r.syringeMl : 1;
      if (r.mode !== 'pen') visual = syringeSvg(r.volumeMl, cap, r.unitsPerMl);
      if (r.exceedsSyringe) notes.push(`Passt nicht in eine ${num(r.syringeMl)}-ml-Spritze – größere Spritze oder weniger Wasser verwenden.`);
      if (r.units < 2) notes.push('Sehr kleine Menge – schwer genau abzulesen. Mehr Wasser verwenden.');
    }

    const details = [`<li><span>Konzentration</span><strong>${fmtConc(r.concentration, r.concentrationUnit)}</strong></li>`];
    if (r.perUnit) details.push(`<li><span>Pro Einheit (Teilstrich)</span><strong>${fmtAmount(r.perUnit, r.concentrationUnit)}</strong></li>`);
    details.push(`<li><span>Dosen pro Fläschchen</span><strong>ca. ${Math.floor(r.dosesPerVial + 1e-9)}</strong></li>`);
    if (r.mode === 'blend') {
      details.push(`<li><span>Gesamt im Fläschchen</span><strong>${num(r.totalMg)} mg</strong></li>`);
      for (const b of r.breakdown) {
        details.push(`<li class="sub"><span>${esc(b.name || 'Bestandteil')} pro Dosis</span><strong>${fmtAmount(b.perDoseMg, 'mg')}</strong></li>`);
      }
    }

    const source = getPeptides().find((p) => p.id === c.sourceId);
    box.innerHTML = `
      <div class="result-head"><div class="big">${headline}</div><div class="muted">${esc(sub)}</div></div>
      ${visual}
      ${notes.map((t) => `<p class="calc-note">⚠️ ${esc(t)}</p>`).join('')}
      <ul class="result-details">${details.join('')}</ul>
      <button type="button" class="btn primary" id="calc-apply">${source ? `In „${esc(source.name)}“ übernehmen` : 'Als Peptid anlegen'}</button>`;

    $('#calc-apply').addEventListener('click', () => {
      const water = r.reverse ? Math.round(r.waterMl * 100) / 100 : c.waterMl;
      const vialMg = r.mode === 'blend' ? r.totalMg : c.vialUnit === 'mg' ? c.vialAmount : null;
      openPeptideForm(source || null, {
        dose: c.dose, unit: c.doseUnit,
        ...(vialMg != null ? { vialMg } : {}),
        ...(water != null ? { waterMl: water } : {}),
      });
    });
  }

  function update() {
    renderVisibility();
    renderPills();
    renderResult();
    persist();
  }

  /* --- Ereignisse --- */
  $('#calc-mode').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    c.mode = b.dataset.mode;
    if (c.mode === 'spray' && !PRESETS.sprayWater.includes(c.waterMl)) { c.waterMl = 4; field('waterMl').value = 4; }
    update();
  });
  $('#calc-solve').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-solve]');
    if (b) { c.solveFor = b.dataset.solve; update(); }
  });
  $('#calc-syringe-type').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-upm]');
    if (b) { c.unitsPerMl = Number(b.dataset.upm); update(); }
  });
  view.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (pill) {
      c[pill.dataset.key] = Number(pill.dataset.value);
      if (field(pill.dataset.key)) field(pill.dataset.key).value = pill.dataset.value;
      update();
      return;
    }
    const rm = e.target.closest('[data-blend-remove]');
    if (rm) {
      c.components.splice(Number(rm.closest('.blend-row').dataset.idx), 1);
      if (!c.components.length) c.components.push({ name: '', mg: null });
      renderBlendRows();
      update();
    }
  });
  $('#blend-add').addEventListener('click', () => {
    c.components.push({ name: '', mg: null });
    renderBlendRows();
    update();
    $$('#blend-rows [data-blend="name"]').at(-1)?.focus();
  });

  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.blend) {
      const comp = c.components[Number(el.closest('.blend-row').dataset.idx)];
      comp[el.dataset.blend] = el.dataset.blend === 'mg' ? toNum(el.value) : el.value;
      if (el.dataset.blend === 'name') renderAnchor();
    } else if (el.name === 'anchor') {
      c.anchor = el.value;
    } else if (el.id === 'calc-source') {
      return; // eigener Handler
    } else if (el.name) {
      c[el.name] = el.tagName === 'SELECT' ? el.value : toNum(el.value);
    }
    update();
  });
  form.addEventListener('change', (e) => { if (e.target.name === 'anchor') { c.anchor = e.target.value; update(); } });

  $('#calc-source').addEventListener('change', (e) => {
    c.sourceId = e.target.value;
    const p = getPeptides().find((x) => x.id === c.sourceId);
    if (p) {
      if (p.dose != null && ['mcg', 'mg', 'IE'].includes(p.unit)) { c.dose = p.dose; c.doseUnit = p.unit; }
      if (p.recon?.vialMg) { c.vialAmount = p.recon.vialMg; c.vialUnit = 'mg'; }
      if (p.recon?.waterMl) c.waterMl = p.recon.waterMl;
      if (c.mode === 'blend') c.mode = 'syringe';
      fillInputs();
    }
    update();
  });

  fillInputs();
  renderSourceSelect();
  update();

  return {
    /** Wird bei jeder Datenänderung der App aufgerufen (z. B. neue Peptide). */
    render() {
      renderSourceSelect();
      const names = getPeptides().map((p) => `<option value="${esc(p.name)}">`).join('');
      const dl = $('#blend-names');
      if (dl) dl.innerHTML = names;
      renderResult();
    },
  };
}
