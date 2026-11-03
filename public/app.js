/* MedMinder — a private record of what you take and how you're doing,
   ready to hand to a pharmacist. Everything lives in localStorage. */
(() => {
'use strict';

// ── Constants ───────────────────────────────────────────────
const KEY = 'medminder.v1';
const GRACE_MIN = 60;   // after this long an unlogged dose shows as "not logged"

const COLORS = ['#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#ef4444', '#64748b'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FORM_ICONS = {
  tablet:   '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5v15"/>',
  capsule:  '<rect x="2.2" y="8.2" width="19.6" height="7.6" rx="3.8" transform="rotate(-45 12 12)"/><path d="M8.46 8.46 15.54 15.54"/>',
  liquid:   '<path d="M7 3h10l-1 7.5a4.6 4.6 0 0 1-8 0Z"/><path d="M7.6 8h8.8"/><path d="M12 15v6M9 21h6"/>',
  drops:    '<path d="M12 3.5c3.2 4 5.2 6.7 5.2 9.2A5.2 5.2 0 0 1 6.8 12.7c0-2.5 2-5.2 5.2-9.2Z"/>',
  injection:'<path d="M14 4.5 19.5 10"/><path d="M11.5 7 17 12.5l-6 6H6v-5Z"/><path d="M9 12.5 12 15.5"/>',
  inhaler:  '<rect x="6" y="9" width="9" height="12" rx="2"/><path d="M15 12h3.5M8.5 9V5.5h5V9"/>',
  cream:    '<rect x="5.5" y="8" width="13" height="13" rx="2.5"/><path d="M9.5 8V5a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v3"/>',
  other:    '<circle cx="12" cy="12" r="8"/>'
};

const MEASURES = {
  bp:     { label: 'Blood pressure', short: 'BP', unit: 'mmHg', color: '#ef4444',
            fields: [{ k: 'sys', label: 'Systolic', ph: '120' }, { k: 'dia', label: 'Diastolic', ph: '80' }],
            fmt: v => v.sys + '/' + v.dia, plot: v => Number(v.sys) },
  sugar:  { label: 'Blood sugar', short: 'Sugar', unit: 'mg/dL', color: '#8b5cf6',
            fields: [{ k: 'v', label: 'Reading', ph: '110' }],
            tags: ['Fasting', 'Before a meal', 'After a meal', 'Random', 'Bedtime'],
            fmt: v => String(v.v), plot: v => Number(v.v) },
  weight: { label: 'Weight', short: 'Weight', unit: 'kg', color: '#3b82f6',
            fields: [{ k: 'v', label: 'Weight', ph: '70', step: '0.1' }],
            fmt: v => String(v.v), plot: v => Number(v.v) },
  pulse:  { label: 'Pulse', short: 'Pulse', unit: 'bpm', color: '#ec4899',
            fields: [{ k: 'v', label: 'Pulse', ph: '72' }],
            fmt: v => String(v.v), plot: v => Number(v.v) },
  temp:   { label: 'Temperature', short: 'Temp', unit: '°C', color: '#f59e0b',
            fields: [{ k: 'v', label: 'Temperature', ph: '36.8', step: '0.1' }],
            fmt: v => String(v.v), plot: v => Number(v.v) },
  spo2:   { label: 'Oxygen (SpO₂)', short: 'SpO₂', unit: '%', color: '#14b8a6',
            fields: [{ k: 'v', label: 'SpO₂', ph: '98' }],
            fmt: v => String(v.v), plot: v => Number(v.v) }
};

// ── State ───────────────────────────────────────────────────
let db = load();
let viewDate = startOfDay(new Date());
let editingId = null;
let editingReading = null;
let draft = { color: COLORS[0], days: [0, 1, 2, 3, 4, 5, 6], times: ['08:00'] };
let mType = 'bp';

// ── Storage ─────────────────────────────────────────────────
function blank() { return { meds: [], log: {}, readings: [], profile: { name: '' }, theme: null }; }

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const d = JSON.parse(raw);
    const merged = { ...blank(), ...d };
    if (!Array.isArray(merged.readings)) merged.readings = [];
    if (!merged.profile || typeof merged.profile !== 'object') merged.profile = { name: '' };
    return merged;
  } catch {
    return blank();
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { toast('Could not save — storage is full or blocked.'); }
}

// ── Date helpers ────────────────────────────────────────────
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fromIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }
function minutesOf(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function hhmmOf(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

function prettyTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function prettyDate(d) { return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }); }
function shortDate(d) { return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }); }
function relativeDay(d) {
  const diff = daysBetween(new Date(), d);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long' });
}

// ── Schedule ────────────────────────────────────────────────
function activeOn(med, date) {
  if (med.paused) return false;
  if (med.start && date < fromIso(med.start)) return false;
  if (med.end && date > fromIso(med.end)) return false;
  return true;
}

function timesOn(med, date) {
  if (!activeOn(med, date)) return [];
  switch (med.freq) {
    case 'daily':    return med.times;
    case 'weekly':   return med.days.includes(date.getDay()) ? med.times : [];
    case 'interval': {
      const base = med.start ? fromIso(med.start) : fromIso(med.created);
      const n = daysBetween(base, date);
      return n >= 0 && n % (med.interval || 2) === 0 ? med.times : [];
    }
    default:         return [];
  }
}

function dosesOn(date) {
  const out = [];
  for (const med of db.meds) {
    for (const t of timesOn(med, date)) out.push({ med, time: t, key: doseKey(med.id, date, t) });
  }
  return out.sort((a, b) => minutesOf(a.time) - minutesOf(b.time) || a.med.name.localeCompare(b.med.name));
}

function doseKey(medId, date, time) { return medId + '|' + iso(date) + '|' + time; }
function statusOf(key) { return db.log[key]?.status || null; }

function doseState(dose, date) {
  const s = statusOf(dose.key);
  if (s) return s;
  const due = new Date(date); const [h, m] = dose.time.split(':').map(Number);
  due.setHours(h, m, 0, 0);
  const diff = (Date.now() - due) / 60000;
  if (diff > GRACE_MIN) return 'missed';
  if (diff >= 0) return 'due';
  return 'upcoming';
}

function freqPhrase(med) {
  if (med.freq === 'prn') return 'only when needed';
  const n = med.times.length;
  const per = n === 1 ? 'once daily' : n === 2 ? 'twice daily' : n + ' times daily';
  if (med.freq === 'weekly' && med.days.length < 7) {
    return per + ' on ' + med.days.slice().sort().map(d => DAY_NAMES[d]).join(', ');
  }
  if (med.freq === 'interval') return per + ', every ' + (med.interval || 2) + ' days';
  return per;
}

/** "1 tablet twice daily", or "2 puffs, only when needed". */
function dosePhrase(med) {
  const sep = med.freq === 'prn' ? ', ' : ' ';
  return [med.amount, freqPhrase(med)].filter(Boolean).join(sep);
}

// ── Actions ─────────────────────────────────────────────────
function setDose(dose, date, status) {
  const existing = db.log[dose.key];
  if (existing && existing.status === status) {
    delete db.log[dose.key];
    if (status === 'taken' && typeof dose.med.stock === 'number') dose.med.stock += 1;
  } else {
    if (existing?.status === 'taken' && typeof dose.med.stock === 'number') dose.med.stock += 1;
    db.log[dose.key] = { status, at: Date.now(), medId: dose.med.id, time: dose.time, date: iso(date) };
    if (status === 'taken' && typeof dose.med.stock === 'number') {
      dose.med.stock = Math.max(0, dose.med.stock - 1);
      if (dose.med.stock === 0) toast(dose.med.name + ' has run out.');
      else if (dose.med.stock <= (dose.med.low ?? 7)) toast(dose.med.name + ': only ' + dose.med.stock + ' left — time to refill.');
    }
  }
  save(); render();
}

// ── Rendering ───────────────────────────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function render() { renderToday(); renderMeds(); renderHealth(); renderHistory(); }

function renderToday() {
  const date = viewDate;
  $('#day-title').textContent = relativeDay(date);
  $('#day-sub').textContent = prettyDate(date);

  const doses = dosesOn(date);
  const states = doses.map(d => doseState(d, date));
  const taken = states.filter(s => s === 'taken').length;
  const skipped = states.filter(s => s === 'skipped').length;
  const missed = states.filter(s => s === 'missed').length;
  const left = states.filter(s => s === 'due' || s === 'upcoming').length;
  const settled = taken + skipped + missed;
  const pct = settled ? Math.round((taken / settled) * 100) : (doses.length ? 100 : 0);

  $('#stat-taken').textContent = taken;
  $('#stat-left').textContent = left;
  $('#stat-missed').textContent = missed;
  $('#ring-pct').textContent = doses.length ? pct + '%' : '—';
  const C = 2 * Math.PI * 18.5;
  $('#ring-fg').style.strokeDashoffset = String(C - (doses.length ? pct : 0) / 100 * C);

  const tl = $('#timeline');
  if (!db.meds.length) {
    tl.innerHTML = emptyState('No medicines yet',
      'Add what you take and MedMinder keeps the record.', 'Add medicine', 'add');
    return;
  }
  if (!doses.length) {
    tl.innerHTML = emptyState('Nothing scheduled', 'None of your medicines are due on this day.', null, null);
    return;
  }

  const groups = new Map();
  doses.forEach((d, i) => {
    if (!groups.has(d.time)) groups.set(d.time, []);
    groups.get(d.time).push({ ...d, state: states[i] });
  });

  let html = '';
  for (const [time, list] of groups) {
    html += '<div class="slot"><div class="slot-head"><span class="slot-time">' + prettyTime(time) +
            '</span><span class="slot-rule"></span></div>';
    for (const d of list) html += doseRow(d);
    html += '</div>';
  }
  tl.innerHTML = html;
}

function doseRow(d) {
  const m = d.med;
  const done = d.state === 'taken' || d.state === 'skipped';
  const bits = [];
  if (m.amount) bits.push(esc(m.amount));
  if (m.dosage) bits.push(esc(m.dosage));
  if (m.notes) bits.push(esc(m.notes));
  if (d.state === 'missed') bits.push('<span class="warn">not logged</span>');
  if (typeof m.stock === 'number' && m.stock <= (m.low ?? 7)) bits.push('<span class="warn">' + m.stock + ' left</span>');

  return '<div class="dose' + (done ? ' done' : '') + '" style="--c:' + m.color +
    ';--c-soft:color-mix(in srgb, ' + m.color + ' 15%, transparent)">' +
    '<div class="pill"><svg viewBox="0 0 24 24">' + (FORM_ICONS[m.form] || FORM_ICONS.other) + '</svg></div>' +
    '<div class="dose-main"><div class="dose-name">' + esc(m.name) + '</div>' +
    (bits.length ? '<div class="dose-sub">' + bits.map((b, i) => '<span>' + (i ? '· ' : '') + b + '</span>').join('') + '</div>' : '') +
    '</div>' +
    '<div class="dose-actions">' +
      (d.state === 'skipped' ? '<span class="status-chip skipped">skipped</span>' : '') +
      '<button class="act skip' + (d.state === 'skipped' ? ' is-on' : '') + '" data-dose="' + d.key +
        '" data-status="skipped" title="Skip this dose" aria-label="Skip ' + esc(m.name) + '">' +
        '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '<button class="act take' + (d.state === 'taken' ? ' is-on' : '') + '" data-dose="' + d.key +
        '" data-status="taken" title="Mark as taken" aria-label="Take ' + esc(m.name) + '">' +
        '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7"/></svg></button>' +
    '</div></div>';
}

function emptyState(title, body, btnLabel, act) {
  return '<div class="empty"><svg viewBox="0 0 24 24"><rect x="2.2" y="8.2" width="19.6" height="7.6" rx="3.8" transform="rotate(-45 12 12)"/><path d="M8.46 8.46 15.54 15.54"/></svg>' +
    '<h3>' + title + '</h3><p>' + body + '</p>' +
    (btnLabel ? '<button class="btn primary" data-empty-act="' + act + '">' + btnLabel + '</button>' : '') + '</div>';
}

function renderMeds() {
  const el = $('#med-list');
  if (!db.meds.length) {
    el.innerHTML = emptyState('No medicines yet',
      'Add what you take, and the pharmacist sheet writes itself.', 'Add medicine', 'add');
    return;
  }
  el.innerHTML = db.meds.map(m => {
    const stockPct = typeof m.stock === 'number'
      ? Math.max(0, Math.min(100, (m.stock / Math.max(m.stock, (m.low ?? 7) * 4, 1)) * 100)) : null;
    const low = typeof m.stock === 'number' && m.stock <= (m.low ?? 7);
    const meta = [m.amount, m.dosage, freqPhrase(m)].filter(Boolean).map(esc).join(' · ');
    return '<div class="med-card' + (m.paused ? ' off' : '') + '" data-med="' + m.id +
      '" style="--c:' + m.color + ';--c-soft:color-mix(in srgb, ' + m.color + ' 15%, transparent)">' +
      '<div class="pill"><svg viewBox="0 0 24 24">' + (FORM_ICONS[m.form] || FORM_ICONS.other) + '</svg></div>' +
      '<div class="med-info">' +
        '<div class="med-name">' + esc(m.name) + (m.paused ? ' <span class="time-chip">paused</span>' : '') + '</div>' +
        '<div class="med-meta">' + meta + '</div>' +
        (m.reason ? '<div class="med-meta">for ' + esc(m.reason) + '</div>' : '') +
        (m.freq !== 'prn' ? '<div class="med-times">' + m.times.map(t => '<span class="time-chip">' + prettyTime(t) + '</span>').join('') + '</div>' : '') +
        (stockPct !== null
          ? '<div class="stock-bar' + (low ? ' low' : '') + '"><i style="width:' + stockPct + '%"></i></div>' +
            '<div class="med-meta" style="margin-top:5px">' + m.stock + ' left' + (low ? ' — refill soon' : '') + '</div>'
          : '') +
      '</div>' +
      '<svg viewBox="0 0 24 24" style="color:var(--text-faint);flex:none"><path d="M9.5 5 16 12l-6.5 7"/></svg>' +
      '</div>';
  }).join('');
}

// ── Health ──────────────────────────────────────────────────
function readingsOf(type) {
  return db.readings.filter(r => r.type === type).sort((a, b) => a.at - b.at);
}

function sparkline(list, color) {
  const def = MEASURES[list[0]?.type];
  if (!def || list.length < 2) return '';
  const pts = list.slice(-24).map(r => def.plot(r.values)).filter(n => Number.isFinite(n));
  if (pts.length < 2) return '';
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const W = 100, H = 28;
  const d = pts.map((v, i) =>
    (i / (pts.length - 1) * W).toFixed(1) + ',' + (H - ((v - min) / span) * (H - 4) - 2).toFixed(1)).join(' ');
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<polyline points="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
}

function renderHealth() {
  const cards = $('#measure-cards');
  const any = db.readings.length > 0;

  if (!any) {
    cards.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24"><path d="M3 12h4l2.5-6 4 12 2.5-6h5"/></svg>' +
      '<h3>No readings yet</h3><p>Record blood pressure, sugar, weight and more. They go on the pharmacist sheet too.</p>' +
      '<button class="btn primary" data-empty-act="reading">Add reading</button></div>';
    $('#readings-head').hidden = true;
    $('#reading-list').innerHTML = '';
    return;
  }

  cards.innerHTML = Object.entries(MEASURES).map(([type, def]) => {
    const list = readingsOf(type);
    if (!list.length) return '';
    const last = list[list.length - 1];
    const prev = list.length > 1 ? list[list.length - 2] : null;
    let delta = '';
    if (prev) {
      const a = def.plot(last.values), b = def.plot(prev.values);
      if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
        const up = a > b;
        delta = '<span class="delta ' + (up ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' +
          Math.abs(Math.round((a - b) * 10) / 10) + '</span>';
      }
    }
    return '<div class="measure-card" style="--c:' + def.color + '">' +
      '<div class="mc-head"><span class="mc-label">' + def.label + '</span>' + delta + '</div>' +
      '<div class="mc-value">' + esc(def.fmt(last.values)) + '<small>' + def.unit + '</small></div>' +
      sparkline(list, def.color) +
      '<div class="mc-when">' + shortDate(new Date(last.at)) +
      (last.tag ? ' · ' + esc(last.tag) : '') + '</div>' +
      '</div>';
  }).join('');

  $('#readings-head').hidden = false;
  $('#reading-list').innerHTML = db.readings.slice().sort((a, b) => b.at - a.at).slice(0, 30).map(r => {
    const def = MEASURES[r.type];
    if (!def) return '';
    const d = new Date(r.at);
    return '<div class="log-row reading-row" data-reading="' + r.id + '">' +
      '<span class="log-dot" style="background:' + def.color + '"></span>' +
      '<span><strong>' + def.short + '</strong> ' + esc(def.fmt(r.values)) + ' ' + def.unit + '</span>' +
      (r.tag ? '<span style="color:var(--text-faint)">' + esc(r.tag) + '</span>' : '') +
      '<span class="log-when">' + d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ', ' +
      d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</span></div>';
  }).join('');
}

function renderHistory() {
  const today = startOfDay(new Date());
  const offset = (today.getDay() + 6) % 7;
  const weekEnd = addDays(today, 6 - offset);
  const first = addDays(weekEnd, -34);

  let cells = '';
  for (let i = 0; i < 35; i++) {
    const d = addDays(first, i);
    const doses = dosesOn(d);
    const future = d > today;
    let lv = 0;
    if (doses.length && !future) {
      const t = doses.filter(x => statusOf(x.key) === 'taken').length;
      const ratio = t / doses.length;
      lv = ratio >= 1 ? 3 : ratio >= 0.5 ? 2 : ratio > 0 ? 1 : 0;
    }
    cells += '<div class="hm-day lv' + lv + (future ? ' future' : '') + '" title="' + prettyDate(d) +
      (doses.length ? ' — ' + doses.filter(x => statusOf(x.key) === 'taken').length + '/' + doses.length + ' taken' : ' — nothing scheduled') +
      '">' + d.getDate() + '</div>';
  }
  $('#heatmap').innerHTML = cells;

  const { taken, total } = adherence(30);
  let streak = 0, broken = false;
  for (let i = 0; i < 365 && !broken; i++) {
    const d = addDays(today, -i);
    const doses = dosesOn(d);
    if (!doses.length) continue;
    const t = doses.filter(x => statusOf(x.key) === 'taken').length;
    if (t === doses.length) streak++;
    else if (i === 0) continue;
    else broken = true;
  }

  $('#h-streak').textContent = streak;
  $('#h-rate').textContent = total ? Math.round(taken / total * 100) + '%' : '—';
  $('#h-doses').textContent = Object.values(db.log).filter(l => l.status === 'taken').length;

  const pm = $('#per-med');
  pm.innerHTML = db.meds.length
    ? db.meds.map(m => {
        const { taken: got, total: due } = adherence(30, m);
        const pct = due ? Math.round(got / due * 100) : null;
        return '<div class="pm-row" style="--c:' + m.color + '"><span class="pm-name">' + esc(m.name) + '</span>' +
          '<span class="pm-track"><i style="width:' + (pct ?? 0) + '%"></i></span>' +
          '<span class="pm-pct">' + (pct === null ? '—' : pct + '%') + '</span></div>';
      }).join('')
    : '<p style="color:var(--text-faint);font-size:14px">Nothing to show yet.</p>';

  const rows = Object.entries(db.log).map(([k, v]) => ({ ...v, k })).sort((a, b) => b.at - a.at).slice(0, 25);
  $('#log-list').innerHTML = rows.length
    ? rows.map(r => {
        const med = db.meds.find(m => m.id === r.medId);
        const when = new Date(r.at);
        return '<div class="log-row"><span class="log-dot ' + r.status + '"></span>' +
          '<span>' + esc(med ? med.name : 'Removed medicine') + '</span>' +
          '<span style="color:var(--text-faint)">' + r.status + ' · ' + prettyTime(r.time) + ' dose</span>' +
          '<span class="log-when">' + when.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ', ' +
          when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</span></div>';
      }).join('')
    : '<p style="color:var(--text-faint);font-size:14px">No doses logged yet.</p>';
}

/** Scheduled vs taken over the last `days` days, optionally for one medicine. */
function adherence(days, med) {
  const today = startOfDay(new Date());
  const meds = med ? [med] : db.meds;
  let taken = 0, total = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i);
    for (const m of meds) {
      for (const t of timesOn(m, d)) {
        total++;
        if (statusOf(doseKey(m.id, d, t)) === 'taken') taken++;
      }
    }
  }
  return { taken, total };
}

// ── Pharmacist report ───────────────────────────────────────
function buildReport(days) {
  const name = (db.profile.name || '').trim();
  const now = new Date();
  const active = db.meds.filter(m => !m.paused && (!m.end || fromIso(m.end) >= startOfDay(now)));
  const stopped = db.meds.filter(m => !active.includes(m));

  // ---- plain text (for WhatsApp / email) ----
  const T = [];
  T.push('MEDICATION LIST' + (name ? ' — ' + name : ''));
  T.push('Generated ' + shortDate(now));
  T.push('');
  T.push('CURRENT MEDICINES (' + active.length + ')');
  T.push('');
  if (!active.length) T.push('  (none recorded)');
  active.forEach((m, i) => {
    T.push('  ' + (i + 1) + '. ' + m.name + (m.dosage ? ' ' + m.dosage : '') + (m.form ? ' — ' + m.form : ''));
    T.push('     ' + dosePhrase(m) +
      (m.freq !== 'prn' && m.times.length ? ' at ' + m.times.map(prettyTime).join(', ') : ''));
    if (m.reason) T.push('     For: ' + m.reason);
    if (m.notes) T.push('     Note: ' + m.notes);
    const extra = [];
    if (m.start) extra.push('Started ' + shortDate(fromIso(m.start)));
    if (m.end) extra.push('Until ' + shortDate(fromIso(m.end)));
    if (typeof m.stock === 'number') extra.push(m.stock + ' left');
    if (extra.length) T.push('     ' + extra.join(' · '));
    if (days > 0) {
      const { taken, total } = adherence(days, m);
      if (total) T.push('     Taken ' + Math.round(taken / total * 100) + '% of ' + total + ' doses in the last ' + days + ' days');
    }
    T.push('');
  });

  if (stopped.length) {
    T.push('STOPPED / PAUSED (' + stopped.length + ')');
    stopped.forEach(m => T.push('  · ' + m.name + (m.dosage ? ' ' + m.dosage : '')));
    T.push('');
  }

  const recent = days > 0
    ? db.readings.filter(r => r.at >= Date.now() - days * 86400000).sort((a, b) => b.at - a.at)
    : [];
  if (recent.length) {
    T.push('HEALTH READINGS (last ' + days + ' days)');
    T.push('');
    for (const [type, def] of Object.entries(MEASURES)) {
      const list = recent.filter(r => r.type === type);
      if (!list.length) continue;
      const nums = list.map(r => def.plot(r.values)).filter(Number.isFinite);
      const avg = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10 : null;
      T.push('  ' + def.label + ' (' + def.unit + ') — ' + list.length + ' reading' + (list.length === 1 ? '' : 's') +
        (avg !== null ? ', average ' + avg : ''));
      list.slice(0, 12).forEach(r => {
        T.push('     ' + shortDate(new Date(r.at)) + '  ' + def.fmt(r.values) +
          (r.tag ? '  (' + r.tag + ')' : '') + (r.note ? '  — ' + r.note : ''));
      });
      if (list.length > 12) T.push('     …and ' + (list.length - 12) + ' more');
      T.push('');
    }
  }

  T.push('Kept with MedMinder. A personal record, not a clinical document.');
  const text = T.join('\n');

  // ---- printable / preview HTML ----
  const H = [];
  H.push('<div class="sheet-doc">');
  H.push('<div class="doc-head"><h1>Medication list</h1>' +
    '<div class="doc-meta">' + (name ? '<strong>' + esc(name) + '</strong><br>' : '') +
    'Generated ' + shortDate(now) + '</div></div>');

  H.push('<h2>Current medicines <span class="count">' + active.length + '</span></h2>');
  if (!active.length) H.push('<p class="muted">None recorded.</p>');
  else {
    H.push('<table class="doc-table"><thead><tr><th>Medicine</th><th>Dose &amp; frequency</th><th>Details</th>' +
      (days > 0 ? '<th class="num">Taken</th>' : '') + '</tr></thead><tbody>');
    for (const m of active) {
      const det = [];
      if (m.reason) det.push('For ' + esc(m.reason));
      if (m.notes) det.push(esc(m.notes));
      if (m.start) det.push('Started ' + shortDate(fromIso(m.start)));
      if (m.end) det.push('Until ' + shortDate(fromIso(m.end)));
      if (typeof m.stock === 'number') det.push(m.stock + ' left');
      let pctCell = '';
      if (days > 0) {
        const { taken, total } = adherence(days, m);
        pctCell = '<td class="num">' + (total ? Math.round(taken / total * 100) + '%' : '—') + '</td>';
      }
      H.push('<tr><td><strong>' + esc(m.name) + '</strong>' +
        (m.dosage ? ' ' + esc(m.dosage) : '') +
        '<br><span class="muted">' + esc(m.form || '') + '</span></td>' +
        '<td>' + esc(dosePhrase(m)) +
        (m.freq !== 'prn' && m.times.length ? '<br><span class="muted">' + m.times.map(prettyTime).join(', ') + '</span>' : '') + '</td>' +
        '<td class="muted">' + (det.join('<br>') || '—') + '</td>' + pctCell + '</tr>');
    }
    H.push('</tbody></table>');
  }

  if (stopped.length) {
    H.push('<h2>Stopped or paused <span class="count">' + stopped.length + '</span></h2>');
    H.push('<p class="muted">' + stopped.map(m => esc(m.name) + (m.dosage ? ' ' + esc(m.dosage) : '')).join(' · ') + '</p>');
  }

  if (recent.length) {
    H.push('<h2>Health readings <span class="count">last ' + days + ' days</span></h2>');
    for (const [type, def] of Object.entries(MEASURES)) {
      const list = recent.filter(r => r.type === type);
      if (!list.length) continue;
      const nums = list.map(r => def.plot(r.values)).filter(Number.isFinite);
      const avg = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10 : null;
      H.push('<h3>' + def.label + ' <span class="muted">(' + def.unit + ')' +
        (avg !== null ? ' · average ' + avg : '') + '</span></h3>');
      H.push('<table class="doc-table compact"><tbody>');
      list.slice(0, 15).forEach(r => {
        H.push('<tr><td>' + shortDate(new Date(r.at)) + '</td>' +
          '<td><strong>' + esc(def.fmt(r.values)) + '</strong></td>' +
          '<td class="muted">' + esc([r.tag, r.note].filter(Boolean).join(' · ')) + '</td></tr>');
      });
      H.push('</tbody></table>');
      if (list.length > 15) H.push('<p class="muted">…and ' + (list.length - 15) + ' more.</p>');
    }
  }

  H.push('<p class="doc-foot">Kept with MedMinder. A personal record, not a clinical document.</p>');
  H.push('</div>');

  return { text, html: H.join('') };
}

function openReport() {
  $('#r-name').value = db.profile.name || '';
  $('#r-share').hidden = !navigator.share;
  refreshReport();
  $('#report-dialog').showModal();
}

function refreshReport() {
  const days = Number($('#r-range').value);
  const { html } = buildReport(days);
  $('#report-preview').innerHTML = html;
  $('#print-area').innerHTML = html;
}

function reportText() { return buildReport(Number($('#r-range').value)).text; }

// ── Medicine dialog ─────────────────────────────────────────
const dlg = $('#med-dialog');

function openDialog(med) {
  editingId = med ? med.id : null;
  $('#dialog-title').textContent = med ? 'Edit medicine' : 'Add medicine';
  $('#btn-delete').hidden = !med;

  draft.color = med ? med.color : COLORS[db.meds.length % COLORS.length];
  draft.days = med && med.days ? [...med.days] : [0, 1, 2, 3, 4, 5, 6];
  draft.times = med ? [...med.times] : ['08:00'];

  $('#f-name').value = med?.name || '';
  $('#f-dose').value = med?.dosage || '';
  $('#f-form').value = med?.form || 'tablet';
  $('#f-amount').value = med?.amount || '';
  $('#f-reason').value = med?.reason || '';
  $('#f-freq').value = med?.freq || 'daily';
  $('#f-interval').value = med?.interval || 2;
  $('#f-start').value = med?.start || iso(new Date());
  $('#f-end').value = med?.end || '';
  $('#f-stock').value = typeof med?.stock === 'number' ? med.stock : '';
  $('#f-low').value = med?.low ?? 7;
  $('#f-notes').value = med?.notes || '';

  paintColors(); paintDays(); paintTimes(); syncFreq();
  dlg.showModal();
  if (!med) setTimeout(() => $('#f-name').focus(), 60);
}

function paintColors() {
  $('#f-colors').innerHTML = COLORS.map(c =>
    '<button type="button" class="swatch' + (c === draft.color ? ' is-on' : '') +
    '" style="background:' + c + '" data-color="' + c + '" aria-label="Colour ' + c + '"></button>').join('');
}

function paintDays() {
  $('#f-days').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d =>
    '<button type="button" class="' + (draft.days.includes(d) ? 'is-on' : '') + '" data-day="' + d + '">' +
    DAY_NAMES[d][0] + DAY_NAMES[d][1].toLowerCase() + '</button>').join('');
}

function paintTimes() {
  $('#f-times').innerHTML = draft.times.map((t, i) =>
    '<div class="time-row"><input type="time" value="' + t + '" data-time-idx="' + i + '" required>' +
    (draft.times.length > 1
      ? '<button type="button" class="icon-btn sm" data-rm-time="' + i + '" aria-label="Remove this time"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>'
      : '') + '</div>').join('');
}

function syncFreq() {
  const f = $('#f-freq').value;
  $('#wrap-days').hidden = f !== 'weekly';
  $('#wrap-interval').hidden = f !== 'interval';
  $('#wrap-times').hidden = f === 'prn';
}

function saveMed(e) {
  e.preventDefault();
  const name = $('#f-name').value.trim();
  if (!name) return;
  const freq = $('#f-freq').value;
  const times = [...new Set(draft.times)].sort((a, b) => minutesOf(a) - minutesOf(b));
  if (freq !== 'prn' && !times.length) { toast('Add at least one time.'); return; }
  if (freq === 'weekly' && !draft.days.length) { toast('Pick at least one day.'); return; }

  const stockRaw = $('#f-stock').value;
  const data = {
    name,
    dosage: $('#f-dose').value.trim(),
    form: $('#f-form').value,
    amount: $('#f-amount').value.trim(),
    reason: $('#f-reason').value.trim(),
    color: draft.color,
    freq,
    days: draft.days,
    interval: Math.max(2, Number($('#f-interval').value) || 2),
    times,
    start: $('#f-start').value || iso(new Date()),
    end: $('#f-end').value || '',
    stock: stockRaw === '' ? null : Math.max(0, Number(stockRaw) || 0),
    low: Math.max(0, Number($('#f-low').value) || 0),
    notes: $('#f-notes').value.trim()
  };

  if (editingId) {
    Object.assign(db.meds.find(x => x.id === editingId), data);
    toast(name + ' updated.');
  } else {
    db.meds.push({ id: uid(), created: iso(new Date()), paused: false, ...data });
    toast(name + ' added.');
  }
  save(); render(); dlg.close();
}

// ── Reading dialog ──────────────────────────────────────────
const mdlg = $('#measure-dialog');

function openMeasure(reading) {
  editingReading = reading ? reading.id : null;
  $('#measure-title').textContent = reading ? 'Edit reading' : 'Add reading';
  $('#m-delete').hidden = !reading;
  mType = reading ? reading.type : mType;

  const when = reading ? new Date(reading.at) : new Date();
  $('#m-date').value = iso(when);
  $('#m-time').value = hhmmOf(when);
  $('#m-note').value = reading?.note || '';

  paintTypes();
  paintMeasureFields(reading?.values, reading?.tag);
  mdlg.showModal();
}

function paintTypes() {
  $('#m-types').innerHTML = Object.entries(MEASURES).map(([k, d]) =>
    '<button type="button" class="type-btn' + (k === mType ? ' is-on' : '') + '" data-mtype="' + k +
    '" style="--c:' + d.color + '">' + d.label + '</button>').join('');
}

function paintMeasureFields(values, tag) {
  const def = MEASURES[mType];
  $('#m-fields').innerHTML = def.fields.map(f =>
    '<div class="field"><label for="mf-' + f.k + '">' + f.label + ' <small>(' + def.unit + ')</small></label>' +
    '<input id="mf-' + f.k + '" data-mf="' + f.k + '" type="number" inputmode="decimal" step="' + (f.step || '1') +
    '" placeholder="' + f.ph + '" required value="' + esc(values?.[f.k] ?? '') + '"></div>').join('');

  const wrap = $('#m-wrap-tag');
  if (def.tags) {
    wrap.hidden = false;
    $('#m-tag').innerHTML = '<option value="">—</option>' +
      def.tags.map(t => '<option' + (t === tag ? ' selected' : '') + '>' + t + '</option>').join('');
  } else {
    wrap.hidden = true;
  }
}

function saveMeasure(e) {
  e.preventDefault();
  const def = MEASURES[mType];
  const values = {};
  for (const f of def.fields) {
    const v = $('#mf-' + f.k).value.trim();
    if (v === '') { toast('Fill in ' + f.label.toLowerCase() + '.'); return; }
    values[f.k] = Number(v);
  }
  const at = new Date($('#m-date').value + 'T' + ($('#m-time').value || '00:00')).getTime();
  if (!Number.isFinite(at)) { toast('That date and time look wrong.'); return; }

  const entry = {
    type: mType, values,
    tag: def.tags ? $('#m-tag').value : '',
    note: $('#m-note').value.trim(),
    at
  };

  if (editingReading) {
    Object.assign(db.readings.find(r => r.id === editingReading), entry);
    toast('Reading updated.');
  } else {
    db.readings.push({ id: uid(), ...entry });
    toast(def.label + ' recorded.');
  }
  save(); renderHealth(); mdlg.close();
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ── Toast / theme ───────────────────────────────────────────
function toast(msg) {
  const t = $('#toast');
  t.hidden = false; t.textContent = msg;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}

function applyTheme() {
  if (db.theme) document.documentElement.dataset.theme = db.theme;
  else delete document.documentElement.dataset.theme;
}

function toggleTheme() {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  db.theme = (db.theme || (dark ? 'dark' : 'light')) === 'dark' ? 'light' : 'dark';
  applyTheme(); save();
}

// ── Backup / restore / sample ───────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'medminder-' + iso(new Date()) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backed up.');
}

function importData(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (!Array.isArray(d.meds)) throw new Error('bad shape');
      db = { ...blank(), ...d };
      if (!Array.isArray(db.readings)) db.readings = [];
      if (!db.profile) db.profile = { name: '' };
      save(); applyTheme(); render();
      toast('Restored ' + db.meds.length + ' medicine' + (db.meds.length === 1 ? '' : 's') + '.');
    } catch {
      toast('That file does not look like a MedMinder backup.');
    }
  };
  fr.readAsText(file);
}

function loadDemo() {
  const samples = [
    { name: 'Metformin',    dosage: '500 mg',  form: 'tablet',  amount: '1 tablet',  reason: 'type 2 diabetes', freq: 'daily',  times: ['08:00', '20:00'], notes: 'with food', stock: 42, color: COLORS[0] },
    { name: 'Vitamin D',    dosage: '1000 IU', form: 'capsule', amount: '1 capsule', reason: 'deficiency',      freq: 'daily',  times: ['08:00'],          notes: '',          stock: 12, color: COLORS[4] },
    { name: 'Amlodipine',   dosage: '5 mg',    form: 'tablet',  amount: '1 tablet',  reason: 'blood pressure',  freq: 'daily',  times: ['08:00'],          notes: '',          stock: 24, color: COLORS[1] },
    { name: 'Atorvastatin', dosage: '10 mg',   form: 'tablet',  amount: '1 tablet',  reason: 'cholesterol',     freq: 'daily',  times: ['21:00'],          notes: '',          stock: 18, color: COLORS[3] },
    { name: 'Salbutamol',   dosage: '2 puffs', form: 'inhaler', amount: '2 puffs',   reason: 'breathlessness',  freq: 'prn',    times: [],                 notes: 'as needed', stock: null, color: COLORS[5] }
  ];
  for (const s of samples) {
    db.meds.push({
      id: uid(), created: iso(new Date()), paused: false,
      days: [0, 1, 2, 3, 4, 5, 6], interval: 2,
      start: iso(addDays(new Date(), -40)), end: '', low: 7, ...s
    });
  }
  for (let i = 1; i <= 30; i++) {
    const d = addDays(startOfDay(new Date()), -i);
    for (const dose of dosesOn(d)) {
      if (Math.random() > 0.12) {
        db.log[dose.key] = { status: 'taken', at: fromIso(iso(d)).getTime() + minutesOf(dose.time) * 60000, medId: dose.med.id, time: dose.time, date: iso(d) };
      }
    }
  }
  const rnd = (a, b) => Math.round(a + Math.random() * (b - a));
  for (let i = 28; i >= 0; i -= 2) {
    const at = addDays(startOfDay(new Date()), -i).getTime() + 8 * 3600000;
    db.readings.push({ id: uid(), type: 'bp', values: { sys: rnd(118, 140), dia: rnd(74, 90) }, tag: '', note: '', at });
    if (i % 4 === 0) db.readings.push({ id: uid(), type: 'sugar', values: { v: rnd(95, 150) }, tag: 'Fasting', note: '', at: at + 600000 });
    if (i % 6 === 0) db.readings.push({ id: uid(), type: 'weight', values: { v: Math.round((72 + Math.random() * 3) * 10) / 10 }, tag: '', note: '', at: at + 1200000 });
  }
  save(); render();
  toast('Sample data loaded.');
}

// ── Wiring ──────────────────────────────────────────────────
function switchView(name) {
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('click', e => {
  const t = e.target;

  const tab = t.closest('.tab');
  if (tab) return switchView(tab.dataset.view);

  const doseBtn = t.closest('[data-dose]');
  if (doseBtn) {
    const [medId, dateStr, time] = doseBtn.dataset.dose.split('|');
    const med = db.meds.find(m => m.id === medId);
    if (med) setDose({ med, time, key: doseBtn.dataset.dose }, fromIso(dateStr), doseBtn.dataset.status);
    return;
  }

  const card = t.closest('[data-med]');
  if (card) return openDialog(db.meds.find(m => m.id === card.dataset.med));

  const rrow = t.closest('[data-reading]');
  if (rrow) return openMeasure(db.readings.find(r => r.id === rrow.dataset.reading));

  const emptyAct = t.closest('[data-empty-act]');
  if (emptyAct) {
    if (emptyAct.dataset.emptyAct === 'reading') return openMeasure(null);
    switchView('meds'); return openDialog(null);
  }

  const sw = t.closest('[data-color]');
  if (sw) { draft.color = sw.dataset.color; paintColors(); return; }

  const day = t.closest('[data-day]');
  if (day) {
    const d = Number(day.dataset.day);
    draft.days = draft.days.includes(d) ? draft.days.filter(x => x !== d) : [...draft.days, d];
    paintDays(); return;
  }

  const rm = t.closest('[data-rm-time]');
  if (rm) { draft.times.splice(Number(rm.dataset.rmTime), 1); paintTimes(); return; }

  const mt = t.closest('[data-mtype]');
  if (mt) { mType = mt.dataset.mtype; paintTypes(); paintMeasureFields(); return; }

  if (t.closest('[data-close]')) {
    return t.closest('dialog')?.close();
  }

  if (t.closest('#btn-add')) return openDialog(null);
  if (t.closest('#btn-add-reading')) return openMeasure(null);
  if (t.closest('#btn-report')) return openReport();
  if (t.closest('#btn-theme')) return toggleTheme();
  if (t.closest('#day-prev')) { viewDate = addDays(viewDate, -1); return renderToday(); }
  if (t.closest('#day-next')) { viewDate = addDays(viewDate, 1); return renderToday(); }

  if (t.closest('#btn-menu')) { $('#menu').hidden = !$('#menu').hidden; return; }
  const act = t.closest('[data-act]');
  if (act) {
    $('#menu').hidden = true;
    switch (act.dataset.act) {
      case 'name': {
        const n = prompt('Your name, as it should appear on the pharmacist sheet:', db.profile.name || '');
        if (n !== null) { db.profile.name = n.trim(); save(); toast('Name saved.'); }
        return;
      }
      case 'export': return exportData();
      case 'import': return $('#file-import').click();
      case 'demo': return loadDemo();
      case 'wipe':
        if (confirm('Erase every medicine, reading and log entry on this device? This cannot be undone.')) {
          db = blank(); save(); applyTheme(); render(); toast('Everything erased.');
        }
        return;
    }
  }
  if (!t.closest('#menu')) $('#menu').hidden = true;
});

$('#btn-delete').addEventListener('click', () => {
  const m = db.meds.find(x => x.id === editingId);
  if (!m || !confirm('Delete ' + m.name + '? Its dose history stays in your log.')) return;
  db.meds = db.meds.filter(x => x.id !== editingId);
  save(); render(); dlg.close();
  toast(m.name + ' deleted.');
});

$('#m-delete').addEventListener('click', () => {
  if (!confirm('Delete this reading?')) return;
  db.readings = db.readings.filter(r => r.id !== editingReading);
  save(); renderHealth(); mdlg.close();
  toast('Reading deleted.');
});

$('#med-form').addEventListener('submit', saveMed);
$('#measure-form').addEventListener('submit', saveMeasure);
$('#f-freq').addEventListener('change', syncFreq);
$('#add-time').addEventListener('click', () => {
  const last = draft.times[draft.times.length - 1] || '08:00';
  const next = Math.min(23 * 60 + 30, minutesOf(last) + 240);
  draft.times.push(String(Math.floor(next / 60)).padStart(2, '0') + ':' + String(next % 60).padStart(2, '0'));
  paintTimes();
});
$('#f-times').addEventListener('change', e => {
  const i = e.target.dataset.timeIdx;
  if (i !== undefined && e.target.value) draft.times[Number(i)] = e.target.value;
});
$('#file-import').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });

$('#r-range').addEventListener('change', refreshReport);
$('#r-name').addEventListener('input', e => { db.profile.name = e.target.value; save(); refreshReport(); });
$('#r-print').addEventListener('click', () => window.print());
$('#r-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(reportText()); toast('Copied — paste it anywhere.'); }
  catch { toast('Could not copy. Use Print / Save PDF instead.'); }
});
$('#r-share').addEventListener('click', async () => {
  try { await navigator.share({ title: 'Medication list', text: reportText() }); }
  catch { /* the user dismissed the share sheet */ }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') $('#menu').hidden = true;
  if (document.querySelector('dialog[open]')) return;
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === 'n') { switchView('meds'); openDialog(null); }
  if (e.key === 'r') openReport();
  if (e.key === '1') switchView('today');
  if (e.key === '2') switchView('meds');
  if (e.key === '3') switchView('health');
  if (e.key === '4') switchView('history');
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { viewDate = startOfDay(new Date()); render(); }
});

// ── Boot ────────────────────────────────────────────────────
applyTheme();
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
}

})();
