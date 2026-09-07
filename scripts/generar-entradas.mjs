#!/usr/bin/env node
/**
 * Generador de entradas para tracker_digestivo (versión de línea de comandos).
 *
 * Misma lógica que generador.html, pero ejecutable sin navegador. Requiere que
 * el host de Supabase esté permitido en la política de red de egreso.
 *
 *   node scripts/generar-entradas.mjs                 # simulación: analiza, genera y muestra la propuesta
 *   node scripts/generar-entradas.mjs --insert        # inserta de verdad en Supabase
 *
 * Opciones:
 *   --hasta=YYYY-MM-DD   fecha final incluida (por defecto: hoy)
 *   --seed=N             semilla aleatoria (por defecto: 20260907)
 *   --por-dia=3-5        entradas por día (mín-máx)
 *   --mezcla=80/15/4/1   % tipo 5 / tipo 6 / tipo 4 / solo gases
 *   --franja=06:45-07:10 franja de la primera entrada del día
 *   --dur1=27-33         duración en minutos de la primera entrada
 *   --huecos             rellenar también los huecos anteriores a la última entrada
 *   --sangre             permitir sangre según la tasa histórica (por defecto: nunca)
 *   --sql=archivo.sql    volcar los INSERT a un archivo en vez de/además de insertar
 *   --limite=N           mostrar solo las N primeras filas en la tabla de previsualización
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SUPABASE_URL = 'https://vwznzwwrpnylpzlkpziy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3em56d3dycG55bHB6bGtweml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTczNjksImV4cCI6MjA5ODE5MzM2OX0.iLivOSTwmB8KNPDSZYdhBbNE-7nGTQna4BQ34CLH-9o';
const TABLE = 'tracker_digestivo';

const T5 = 'Tipo 5: Trozos blandos';
const T6 = 'Tipo 6: Acuosa / Puré';
const T4 = 'Tipo 4: Salchicha lisa y suave (Ideal)';
const CAT_FULL = 'Deposición completa', CAT_GAS = 'Solo gases';

// ---------- argumentos ----------
const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = (n, d) => { const a = argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const parseRange = (s, a, b) => { const m = String(s).match(/(\d+)\s*[-–]\s*(\d+)/); return m ? [+m[1], +m[2]] : [a, b]; };

const DO_INSERT = flag('insert');
const SEED = parseInt(opt('seed', '20260907'), 10);
const [P_MIN, P_MAX] = parseRange(opt('por-dia', '3-5'), 3, 5);
const [FD0, FD1] = parseRange(opt('dur1', '27-33'), 27, 33);
const MIX = String(opt('mezcla', '80/15/4/1')).split('/').map(Number);
const FRANJA = (() => {
  const m = String(opt('franja', '06:45-07:10')).match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  return m ? [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]] : [405, 430];
})();
const FILL_GAPS = flag('huecos');
const ALLOW_BLOOD = flag('sangre');
const SQL_OUT = opt('sql', null);
const LIMIT = parseInt(opt('limite', '0'), 10);

// ---------- utilidades ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let rnd = mulberry32(SEED);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pad = n => String(n).padStart(2, '0');

const parseDayKey = s => { if (!s) return null; const p = String(s).trim().split('/'); if (p.length !== 3) return null; const d = +p[0], m = +p[1], y = +p[2]; return (d && m && y) ? `${y}-${pad(m)}-${pad(d)}` : null; };
const keyToDate = k => { const p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
const dateToKey = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const fmtDay = (dt, p) => p ? `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}` : `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
const toMin = t => { if (!t) return null; const p = String(t).split(':'); const h = +p[0], m = +p[1]; return (isNaN(h) || isNaN(m)) ? null : h * 60 + m; };
const fmtTime = (s, ws) => { s = ((s % 86400) + 86400) % 86400; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return ws ? `${pad(h)}:${pad(m)}:${pad(x)}` : `${pad(h)}:${pad(m)}`; };
const durSecs = d => { const m = String(d || '').match(/(\d+)\s*m\s*(\d+)\s*s/); if (m) return +m[1] * 60 + +m[2]; const m2 = String(d || '').match(/(\d+)\s*m/); return m2 ? +m2[1] * 60 : 0; };
const fmtDur = s => `${Math.floor(s / 60)}m ${s % 60}s`;
const fmtMS = s => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
const esKey = k => k.split('-').reverse().join('/');

// ---------- acceso a Supabase (vía curl: respeta el proxy y el CA del entorno) ----------
function curl(args) {
  try {
    return execFileSync('curl', ['-sS', '--fail-with-body', '-m', '60', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    throw new Error(`Fallo de red o de la API.\n${out.trim().slice(0, 500)}`);
  }
}
const AUTH = ['-H', `apikey: ${SUPABASE_KEY}`, '-H', `Authorization: Bearer ${SUPABASE_KEY}`];

function fetchAll() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const body = curl([`${SUPABASE_URL}/rest/v1/${TABLE}?select=*`, ...AUTH, '-H', `Range: ${from}-${from + PAGE - 1}`]);
    const batch = JSON.parse(body);
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

function insertRows(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'trk-'));
  const CHUNK = 50;
  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const f = join(dir, `batch-${i}.json`);
    writeFileSync(f, JSON.stringify(batch));
    curl([`${SUPABASE_URL}/rest/v1/${TABLE}`, ...AUTH, '-H', 'Content-Type: application/json', '-H', 'Prefer: return=minimal', '-X', 'POST', '--data-binary', `@${f}`]);
    done += batch.length;
    process.stdout.write(`\r  insertadas ${done}/${rows.length}…`);
  }
  process.stdout.write('\n');
  return done;
}

// ---------- análisis ----------
function analyze(rows) {
  const byDay = {};
  let paddedDay = 0, secsFmt = 0, valid = 0;
  for (const r of rows) {
    const k = parseDayKey(r.day); if (!k) continue;
    valid++;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(r.day).trim())) paddedDay++;
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(String(r.start_time || '').trim())) secsFmt++;
    (byDay[k] = byDay[k] || []).push(r);
  }
  const days = Object.keys(byDay).sort();
  const perDay = [], firstStarts = [], laterStarts = [], laterDurs = [];
  for (const k of days) {
    const list = byDay[k].slice().sort((a, b) => (toMin(a.start_time) ?? 0) - (toMin(b.start_time) ?? 0));
    perDay.push(list.length);
    list.forEach((r, i) => {
      const st = toMin(r.start_time), ds = durSecs(r.duration);
      if (i === 0) { if (st != null) firstStarts.push(st); }
      else { if (st != null) laterStarts.push(st); if (ds > 0) laterDurs.push(ds); }
    });
  }
  const yes = v => v === 'Sí' || v === 'Si';
  const rate = (arr, f) => arr.length ? arr.filter(f).length / arr.length : 0;
  const t6rows = rows.filter(r => String(r.type || '').startsWith('Tipo 6'));
  const allDurs = rows.map(r => durSecs(r.duration)).filter(s => s > 0);
  const sum = allDurs.reduce((a, b) => a + b, 0);
  const typeCount = {};
  for (const r of rows) { const k = r.category === CAT_GAS ? 'Solo gases' : String(r.type || '?').split(':')[0]; typeCount[k] = (typeCount[k] || 0) + 1; }

  return {
    byDay, days, firstKey: days[0], lastKey: days[days.length - 1],
    paddedDay: valid > 0 && paddedDay / valid >= .5,
    timeWithSecs: valid > 0 && secsFmt / valid >= .5,
    perDay, meanPerDay: perDay.reduce((a, b) => a + b, 0) / (perDay.length || 1),
    firstStarts,
    laterStarts: laterStarts.length ? laterStarts : [660, 810, 1020, 1230],
    laterDurs: laterDurs.length ? laterDurs : [540, 720, 900],
    meanDur: allDurs.length ? sum / allDurs.length : 600,
    meanDayTime: days.length ? sum / days.length : 0,
    rates: {
      pain: rate(rows, r => yes(r.pain)), urgency: rate(rows, r => yes(r.urgency)), blood: rate(rows, r => yes(r.blood)),
      painT6: t6rows.length >= 5 ? rate(t6rows, r => yes(r.pain)) : null,
      urgencyT6: t6rows.length >= 5 ? rate(t6rows, r => yes(r.urgency)) : null
    },
    typeCount, total: rows.length
  };
}

// ---------- generación ----------
function generate(a, untilKey) {
  const startKey = FILL_GAPS ? a.firstKey : a.lastKey;
  const targetKeys = [];
  for (let d = keyToDate(startKey); dateToKey(d) <= untilKey; d.setDate(d.getDate() + 1)) {
    const k = dateToKey(d);
    if (!a.byDay[k]) targetKeys.push(k);
  }
  if (!targetKeys.length) return { rows: [], targetKeys };

  const D = targetKeys.length;
  const meanTarget = Math.min(P_MAX, Math.max(P_MIN, a.meanPerDay));
  const counts = new Array(D).fill(P_MIN);
  let extra = Math.max(0, Math.min(Math.round(meanTarget * D) - P_MIN * D, (P_MAX - P_MIN) * D));
  const idxPool = shuffle(counts.map((_, i) => i));
  for (let p = 0; extra > 0 && p < D * (P_MAX - P_MIN) + D; p++) {
    const i = idxPool[p % D];
    if (counts[i] < P_MAX) { counts[i]++; extra--; }
  }

  const total = counts.reduce((x, y) => x + y, 0);
  const [p5, p6, p4, pg] = MIX;
  const sum = (p5 + p6 + p4 + pg) || 100;
  const nGas = Math.round(total * pg / sum);
  const n4 = Math.min(Math.round(total * p4 / sum), D);
  let n6 = Math.round(total * p6 / sum);
  if (total - nGas - n4 - n6 < 0) n6 = Math.max(0, total - nGas - n4);

  const slots = [];
  counts.forEach((c, di) => { for (let s = 0; s < c; s++) slots.push({ day: di, idx: s, type: null }); });
  const dayHasT4 = new Array(D).fill(false);
  for (const di of shuffle(counts.map((_, i) => i)).slice(0, n4)) {
    dayHasT4[di] = true;
    pick(slots.filter(s => s.day === di && s.type === null)).type = T4;
  }
  const t6cand = shuffle(slots.filter(s => s.type === null && !dayHasT4[s.day]));
  for (let i = 0; i < Math.min(n6, t6cand.length); i++) t6cand[i].type = T6;
  const gasCand = shuffle(slots.filter(s => s.type === null && s.idx > 0));
  for (let i = 0; i < Math.min(nGas, gasCand.length); i++) gasCand[i].type = 'GAS';
  for (const s of slots) if (s.type === null) s.type = T5;

  const rows = [];
  targetKeys.forEach((k, di) => {
    const dt = keyToDate(k);
    const daySlots = slots.filter(s => s.day === di).sort((x, y) => x.idx - y.idx);

    const firstStart = ri(FRANJA[0], FRANJA[1]) * 60 + ri(0, 59);
    const firstDur = ri(FD0 * 60, FD1 * 60);
    const times = [{ start: firstStart, dur: firstDur }];

    const sampled = [];
    for (let i = 1; i < daySlots.length; i++) sampled.push(pick(a.laterStarts) * 60 + ri(-12, 12) * 60 + ri(0, 59));
    sampled.sort((x, y) => x - y);
    let prevEnd = firstStart + firstDur;
    sampled.forEach((st, i) => {
      const isGas = daySlots[i + 1].type === 'GAS';
      let dur = isGas ? ri(60, 300) : Math.round(pick(a.laterDurs) * (0.85 + rnd() * 0.3));
      dur = Math.max(60, Math.min(2400, dur));
      let start = Math.max(st, prevEnd + 25 * 60);
      if (start + dur > 23 * 3600 + 50 * 60) start = 23 * 3600 + 50 * 60 - dur;
      if (start < prevEnd + 10 * 60) start = prevEnd + 10 * 60;
      times.push({ start, dur });
      prevEnd = start + dur;
    });

    times.forEach((t, i) => {
      const s = daySlots[i];
      const isGas = s.type === 'GAS';
      const t6 = s.type === T6;
      const pPain = (t6 && a.rates.painT6 != null) ? a.rates.painT6 : a.rates.pain;
      const pUrg = (t6 && a.rates.urgencyT6 != null) ? a.rates.urgencyT6 : a.rates.urgency;
      rows.push({
        day: fmtDay(dt, a.paddedDay),
        start_time: fmtTime(t.start, a.timeWithSecs),
        end_time: fmtTime(t.start + t.dur, a.timeWithSecs),
        duration: fmtDur(t.dur),
        category: isGas ? CAT_GAS : CAT_FULL,
        type: isGas ? 'No aplica' : s.type,
        pain: (!isGas && rnd() < pPain) ? 'Sí' : 'No',
        urgency: (rnd() < pUrg) ? 'Sí' : 'No',
        blood: (ALLOW_BLOOD && !isGas && rnd() < a.rates.blood) ? 'Sí' : 'No',
        _key: k, _secs: t.dur
      });
    });
  });
  return { rows, targetKeys };
}

// ---------- comprobaciones ----------
function verify(rows, a) {
  const byDay = {};
  for (const r of rows) (byDay[r._key] = byDay[r._key] || []).push(r);
  const toS = t => { const q = t.split(':'); return +q[0] * 3600 + +q[1] * 60 + (+(q[2] || 0)); };
  const problems = [];
  for (const [k, l] of Object.entries(byDay)) {
    if (l.some(r => r.type === T4) && l.some(r => r.type === T6)) problems.push(`${esKey(k)}: mezcla tipo 4 y tipo 6`);
    if (l.length < P_MIN || l.length > P_MAX) problems.push(`${esKey(k)}: ${l.length} entradas (fuera de ${P_MIN}-${P_MAX})`);
    const f = toS(l[0].start_time);
    if (f < FRANJA[0] * 60 || f > FRANJA[1] * 60 + 59) problems.push(`${esKey(k)}: 1ª entrada a las ${l[0].start_time}`);
    const fd = Math.floor(l[0]._secs / 60);
    if (fd < FD0 || fd > FD1) problems.push(`${esKey(k)}: 1ª entrada dura ${fd} min`);
    if (l[0].category === CAT_GAS) problems.push(`${esKey(k)}: la 1ª entrada es solo gases`);
    for (let i = 1; i < l.length; i++) {
      if (toS(l[i].start_time) < toS(l[i - 1].end_time)) problems.push(`${esKey(k)}: solape a las ${l[i].start_time}`);
    }
    if (toS(l[l.length - 1].end_time) > 23 * 3600 + 59 * 60) problems.push(`${esKey(k)}: se pasa de medianoche`);
    if (a.byDay[k]) problems.push(`${esKey(k)}: ¡ese día ya tenía registros!`);
  }
  return problems;
}

function toSQL(rows) {
  const cols = ['day', 'start_time', 'end_time', 'duration', 'category', 'type', 'pain', 'urgency', 'blood'];
  const esc = v => "'" + String(v).replace(/'/g, "''") + "'";
  return `-- Entradas generadas por scripts/generar-entradas.mjs (semilla ${SEED})\nINSERT INTO ${TABLE} (${cols.join(', ')}) VALUES\n` +
    rows.map(r => '  (' + cols.map(c => esc(r[c])).join(', ') + ')').join(',\n') + ';\n';
}

// ---------- principal ----------
const hoy = new Date();
const UNTIL = opt('hasta', dateToKey(hoy));

console.log('Leyendo Supabase…');
const raw = fetchAll();
if (!raw.length) { console.error('La tabla está vacía: no hay patrón que imitar.'); process.exit(1); }
const a = analyze(raw);

console.log(`\n=== HISTÓRICO ===`);
console.log(`  ${a.total} registros en ${a.days.length} días (${esKey(a.firstKey)} → ${esKey(a.lastKey)})`);
console.log(`  Media veces/día : ${a.meanPerDay.toFixed(2)}`);
console.log(`  T. medio/visita : ${fmtMS(a.meanDur)}`);
console.log(`  T. medio/día    : ${fmtMS(a.meanDayTime)}`);
console.log(`  Dolor ${(a.rates.pain * 100).toFixed(0)}% · Urgencia ${(a.rates.urgency * 100).toFixed(0)}% · Sangre ${(a.rates.blood * 100).toFixed(1)}%`);
console.log(`  Reparto actual  : ` + Object.entries(a.typeCount).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${(v / a.total * 100).toFixed(0)}%`).join(' · '));
if (a.firstStarts.length) console.log(`  1ª entrada del día, histórico: ${fmtTime(Math.min(...a.firstStarts) * 60)}–${fmtTime(Math.max(...a.firstStarts) * 60)}`);
console.log(`  Formato: fecha ${a.paddedDay ? 'DD/MM/YYYY' : 'D/M/YYYY'}, hora ${a.timeWithSecs ? 'HH:MM:SS' : 'HH:MM'}`);

const { rows, targetKeys } = generate(a, UNTIL);
if (!rows.length) { console.log(`\nNo hay ningún día vacío entre ${esKey(a.lastKey)} y ${esKey(UNTIL)}. Nada que generar.`); process.exit(0); }

const D = targetKeys.length;
const secs = rows.reduce((x, r) => x + r._secs, 0);
const cnt = t => rows.filter(r => t === 'GAS' ? r.category === CAT_GAS : String(r.type).startsWith(t)).length;
const pc = n => (n / rows.length * 100).toFixed(1) + '%';

console.log(`\n=== PROPUESTA ===`);
console.log(`  ${rows.length} entradas nuevas en ${D} días (${esKey(targetKeys[0])} → ${esKey(targetKeys[D - 1])})`);
console.log(`  Veces/día       : ${(rows.length / D).toFixed(2)}   (histórico ${a.meanPerDay.toFixed(2)})`);
console.log(`  T. medio/visita : ${fmtMS(secs / rows.length)}   (histórico ${fmtMS(a.meanDur)})`);
console.log(`  T. medio/día    : ${fmtMS(secs / D)}   (histórico ${fmtMS(a.meanDayTime)})`);
console.log(`  Dolor ${(rows.filter(r => r.pain === 'Sí').length / rows.length * 100).toFixed(0)}% · Urgencia ${(rows.filter(r => r.urgency === 'Sí').length / rows.length * 100).toFixed(0)}% · Sangre ${rows.filter(r => r.blood === 'Sí').length} registros`);
console.log(`  Reparto: Tipo 5 ${cnt('Tipo 5')} (${pc(cnt('Tipo 5'))}) · Tipo 6 ${cnt('Tipo 6')} (${pc(cnt('Tipo 6'))}) · Tipo 4 ${cnt('Tipo 4')} (${pc(cnt('Tipo 4'))}) · Solo gases ${cnt('GAS')} (${pc(cnt('GAS'))})`);

const problems = verify(rows, a);
console.log(`\n=== COMPROBACIONES ===`);
if (problems.length) { console.log('  ⚠️ ' + problems.length + ' problema(s):'); problems.slice(0, 20).forEach(p => console.log('   - ' + p)); }
else console.log('  ✅ Sin conflictos tipo 4 + tipo 6, sin solapes, franjas y duraciones correctas, ningún día pisado.');

const show = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;
console.log(`\n=== ENTRADAS ${LIMIT > 0 ? `(${LIMIT} primeras de ${rows.length})` : ''} ===`);
let lastDay = null;
for (const r of show) {
  if (r.day !== lastDay) { console.log(`\n  ${r.day}`); lastDay = r.day; }
  const extras = [r.pain === 'Sí' ? 'dolor' : null, r.urgency === 'Sí' ? 'urgencia' : null, r.blood === 'Sí' ? 'SANGRE' : null].filter(Boolean).join(', ');
  console.log(`    ${r.start_time}–${r.end_time}  ${r.duration.padEnd(9)} ${(r.category === CAT_GAS ? 'Solo gases' : r.type.split(':')[0]).padEnd(12)}${extras ? ' (' + extras + ')' : ''}`);
}

const clean = rows.map(({ _key, _secs, ...r }) => r);
if (SQL_OUT) { writeFileSync(SQL_OUT, toSQL(clean)); console.log(`\nSQL escrito en ${SQL_OUT}`); }

if (!DO_INSERT) {
  console.log(`\nSimulación. Para insertar de verdad:  node scripts/generar-entradas.mjs --insert --seed=${SEED}`);
  process.exit(problems.length ? 1 : 0);
}
if (problems.length) { console.error('\nNo inserto: hay comprobaciones fallidas.'); process.exit(1); }

console.log(`\nInsertando ${clean.length} entradas…`);
const done = insertRows(clean);
const after = fetchAll();
console.log(`✅ Insertadas ${done}. La tabla tiene ahora ${after.length} registros (antes ${raw.length}).`);
