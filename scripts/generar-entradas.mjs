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
 *   --desde=YYYY-MM-DD   fecha inicial (por defecto: el día de la última entrada)
 *   --seed=N             semilla aleatoria (por defecto: 20260907)
 *   --por-dia=4-6        entradas por día (mín-máx)
 *   --minutos-dia=90-120 minutos totales de baño al día (mín-máx). Sin esta opción
 *                        las duraciones se muestrean del histórico sin presupuesto.
 *   --mezcla=80/15/4/1   % tipo 5 / tipo 6 / tipo 4 / solo gases
 *   --franja=06:45-07:10 franja de la primera entrada del día
 *   --dur1=27-33         duración en minutos de la primera entrada
 *   --completar          añadir entradas también a los días que ya tienen registros,
 *                        hasta llegar al número y a los minutos diarios pedidos.
 *                        Nunca borra ni modifica lo que ya está guardado.
 *   --sangre             permitir sangre según la tasa histórica (por defecto: nunca)
 *   --sql=archivo.sql    volcar los INSERT a un archivo en vez de/además de insertar
 *   --limite=N           mostrar solo las N primeras filas en la tabla de previsualización
 *   --json=archivo.json  analizar un volcado local en vez de leer por red (incompatible
 *                        con --insert: en ese caso usa --sql y ejecuta el SQL aparte)
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SUPABASE_URL = 'https://vwznzwwrpnylpzlkpziy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3em56d3dycG55bHB6bGtweml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTczNjksImV4cCI6MjA5ODE5MzM2OX0.iLivOSTwmB8KNPDSZYdhBbNE-7nGTQna4BQ34CLH-9o';
const TABLE = 'tracker_digestivo';

const T5 = 'Tipo 5: Trozos blandos';
const T6 = 'Tipo 6: Acuosa / Puré';
const T4 = 'Tipo 4: Salchicha lisa y suave (Ideal)';
const CAT_FULL = 'Deposición completa', CAT_GAS = 'Solo gases';

const MIN_DUR = 60;          // duración mínima de una entrada generada (1 min)
const MAX_DUR = 45 * 60;     // duración máxima (45 min)
const MIN_GAP = 10 * 60;     // separación mínima entre entradas
const DAY_FROM = 6 * 3600;   // no se coloca nada antes de las 06:00
const DAY_TO = 23 * 3600 + 55 * 60;
const MORNING_CUT = 9 * 3600; // si el día ya tiene algo antes de esta hora, ya tiene "mañana"

// ---------- argumentos ----------
const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = (n, d) => { const a = argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const parseRange = (s, a, b) => { const m = String(s).match(/(\d+)\s*[-–]\s*(\d+)/); return m ? [+m[1], +m[2]] : [a, b]; };

const DO_INSERT = flag('insert');
const SEED = parseInt(opt('seed', '20260907'), 10);
const [P_MIN, P_MAX] = parseRange(opt('por-dia', '4-6'), 4, 6);
const [FD0, FD1] = parseRange(opt('dur1', '27-33'), 27, 33);
const MINUTOS = opt('minutos-dia', null);
const [DAY_MIN, DAY_MAX] = MINUTOS ? parseRange(MINUTOS, 90, 120).map(x => x * 60) : [null, null];
const MIX = String(opt('mezcla', '80/15/4/1')).split('/').map(Number);
const FRANJA = (() => {
  const m = String(opt('franja', '06:45-07:10')).match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  return m ? [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]] : [405, 430];
})();
const COMPLETE = flag('completar');
const ALLOW_BLOOD = flag('sangre');
const SQL_OUT = opt('sql', null);
const LIMIT = parseInt(opt('limite', '0'), 10);
const JSON_IN = opt('json', null);

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
const toSec = t => { if (!t) return null; const p = String(t).split(':'); const h = +p[0], m = +p[1]; return (isNaN(h) || isNaN(m)) ? null : h * 3600 + m * 60 + (+(p[2] || 0)); };
const fmtTime = (s, ws) => { s = ((s % 86400) + 86400) % 86400; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return ws ? `${pad(h)}:${pad(m)}:${pad(x)}` : `${pad(h)}:${pad(m)}`; };
const durSecs = d => { const m = String(d || '').match(/(\d+)\s*m\s*(\d+)\s*s/); if (m) return +m[1] * 60 + +m[2]; const m2 = String(d || '').match(/(\d+)\s*m/); return m2 ? +m2[1] * 60 : 0; };
const fmtDur = s => `${Math.floor(s / 60)}m ${s % 60}s`;
const fmtMS = s => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
const esKey = k => k.split('-').reverse().join('/');

// Duración real de un registro. El campo `duration` a veces está corrupto (la app
// ha llegado a guardar cosas como "1529m 5s" para un tramo de 90 min), así que
// cuando no cuadra con inicio/fin manda el tramo horario.
function realSecs(r) {
  const ds = durSecs(r.duration);
  const st = toSec(r.start_time), et = toSec(r.end_time);
  if (st != null && et != null) {
    let span = et - st;
    if (span < 0) span += 86400;
    if (span > 0 && (ds <= 0 || Math.abs(ds - span) > 120)) return span;
  }
  return ds;
}

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
    byDay[k] = list;
    perDay.push(list.length);
    list.forEach((r, i) => {
      const st = toMin(r.start_time), ds = realSecs(r);
      if (i === 0) { if (st != null) firstStarts.push(st); }
      else { if (st != null) laterStarts.push(st); if (ds > 0) laterDurs.push(ds); }
    });
  }
  const yes = v => v === 'Sí' || v === 'Si';
  const rate = (arr, f) => arr.length ? arr.filter(f).length / arr.length : 0;
  const t6rows = rows.filter(r => String(r.type || '').startsWith('Tipo 6'));
  const allDurs = rows.map(r => realSecs(r)).filter(s => s > 0);
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

// ---------- reparto de duraciones con presupuesto ----------
// Devuelve n duraciones que suman exactamente `total`, muestreadas del histórico
// y ajustadas a escala, respetando [MIN_DUR, MAX_DUR].
function repartirDuraciones(total, n, pool) {
  if (n <= 0) return total === 0 ? [] : null;
  if (total < n * MIN_DUR || total > n * MAX_DUR) return null;
  const acotar = x => Math.min(MAX_DUR, Math.max(MIN_DUR, x));
  let d = Array.from({ length: n }, () => acotar(pick(pool)));
  const escala = total / d.reduce((a, b) => a + b, 0);
  d = d.map(x => acotar(Math.round(x * escala)));
  // repartir el residuo que deje el escalado, sin salirse de los topes
  for (let guard = 0; guard < 1000; guard++) {
    let diff = total - d.reduce((a, b) => a + b, 0);
    if (diff === 0) break;
    const paso = Math.sign(diff);
    let movido = false;
    for (const i of shuffle(d.map((_, j) => j))) {
      const margen = paso > 0 ? MAX_DUR - d[i] : d[i] - MIN_DUR;
      if (margen <= 0) continue;
      const inc = paso * Math.min(Math.abs(diff), margen, 60);
      d[i] += inc; diff -= inc; movido = true;
      if (diff === 0) break;
    }
    if (!movido) break;
  }
  return d.reduce((a, b) => a + b, 0) === total ? d : null;
}

// ---------- colocación horaria ----------
function huecosLibres(ocupado) {
  const bloques = ocupado.map(([a, b]) => [a - MIN_GAP, b + MIN_GAP]).sort((x, y) => x[0] - y[0]);
  const libres = [];
  let cursor = DAY_FROM;
  for (const [a, b] of bloques) {
    if (a > cursor) libres.push([cursor, Math.min(a, DAY_TO)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < DAY_TO) libres.push([cursor, DAY_TO]);
  return libres.filter(([a, b]) => b > a);
}

// Coloca una entrada de duración `dur` lo más cerca posible de `preferido`.
function colocar(dur, ocupado, preferido) {
  const cands = huecosLibres(ocupado).filter(([a, b]) => b - a >= dur);
  if (!cands.length) return null;
  const dist = ([a, b]) => preferido < a ? a - preferido : (preferido > b - dur ? preferido - (b - dur) : 0);
  cands.sort((x, y) => dist(x) - dist(y));
  const [a, b] = cands[0];
  return Math.min(Math.max(preferido, a), b - dur);
}

// ---------- generación ----------
function generate(a, desdeKey, hastaKey) {
  const dias = [];
  for (let d = keyToDate(desdeKey); dateToKey(d) <= hastaKey; d.setDate(d.getDate() + 1)) {
    const k = dateToKey(d);
    const existentes = a.byDay[k] || [];
    if (existentes.length && !COMPLETE) continue;
    dias.push({ key: k, existentes });
  }
  if (!dias.length) return { rows: [], dias: [], avisos: [] };

  const avisos = [];

  // --- 1. cuántas entradas añadir cada día y con cuánto tiempo ---
  for (const dia of dias) {
    const Ce = dia.existentes.length;
    const Te = dia.existentes.reduce((s, r) => s + realSecs(r), 0);
    dia.Ce = Ce; dia.Te = Te;

    if (DAY_MIN == null) {           // sin presupuesto: solo número de entradas
      dia.add = Math.max(0, ri(P_MIN, P_MAX) - Ce);
      dia.objetivo = null;
      continue;
    }
    // con presupuesto: buscar un (nº de entradas, minutos totales) que encaje
    const opciones = [];
    for (let C = Math.max(P_MIN, Ce); C <= P_MAX; C++) {
      const n = C - Ce;
      const lo = Math.max(DAY_MIN, Te + n * MIN_DUR);
      const hi = Math.min(DAY_MAX, Te + n * MAX_DUR);
      if (lo <= hi) opciones.push({ C, n, lo, hi });
    }
    if (!opciones.length) {
      avisos.push(`${esKey(dia.key)}: no se puede llegar a ${P_MIN}-${P_MAX} entradas y ${DAY_MIN / 60}-${DAY_MAX / 60} min sin borrar lo ya guardado (tiene ${Ce} entradas y ${fmtMS(Te)})`);
      dia.add = 0; dia.objetivo = null;
      continue;
    }
    const el = pick(opciones);
    dia.add = el.n;
    dia.objetivo = ri(el.lo, el.hi);
  }

  // --- 2. tipos, con el reparto global pedido ---
  const slots = [];
  dias.forEach((dia, di) => { for (let s = 0; s < dia.add; s++) slots.push({ di, s, type: null }); });
  const N = slots.length;
  const [p5, p6, p4, pg] = MIX;
  const sum = (p5 + p6 + p4 + pg) || 100;
  const nGas = Math.round(N * pg / sum);
  let n6 = Math.round(N * p6 / sum);
  let n4 = Math.round(N * p4 / sum);

  // un día no puede mezclar tipo 4 y tipo 6, ni siquiera con lo que ya tenía guardado
  const yaT4 = dias.map(d => d.existentes.some(r => String(r.type || '').startsWith('Tipo 4')));
  const yaT6 = dias.map(d => d.existentes.some(r => String(r.type || '').startsWith('Tipo 6')));
  const ponT4 = dias.map((_, i) => yaT4[i]);
  const candT4 = shuffle(dias.map((_, i) => i).filter(i => !yaT6[i] && !yaT4[i] && dias[i].add > 0));
  n4 = Math.min(n4, candT4.length);
  for (let i = 0; i < n4; i++) {
    const di = candT4[i];
    ponT4[di] = true;
    pick(slots.filter(s => s.di === di && s.type === null)).type = T4;
  }
  const candT6 = shuffle(slots.filter(s => s.type === null && !ponT4[s.di]));
  n6 = Math.min(n6, candT6.length);
  for (let i = 0; i < n6; i++) candT6[i].type = T6;
  // los gases nunca son la entrada larga de la mañana
  const candGas = shuffle(slots.filter(s => s.type === null && s.s > 0));
  for (let i = 0; i < Math.min(nGas, candGas.length); i++) candGas[i].type = 'GAS';
  for (const s of slots) if (s.type === null) s.type = T5;

  // --- 3. horas y duraciones ---
  const rows = [];
  dias.forEach((dia, di) => {
    if (!dia.add) return;
    const dt = keyToDate(dia.key);
    const misSlots = slots.filter(s => s.di === di);
    const ocupado = dia.existentes.map(r => { const st = toSec(r.start_time); return [st, st + realSecs(r)]; });

    // ¿le toca entrada de mañana? Solo si ese día no tiene ya algo temprano.
    const tieneMañana = dia.existentes.some(r => toSec(r.start_time) < MORNING_CUT);
    let restante = dia.objetivo != null ? dia.objetivo - dia.Te : null;
    let n = dia.add;
    const colocadas = [];

    if (!tieneMañana) {
      const durM = ri(FD0 * 60, FD1 * 60);
      const cabe = restante == null || (restante - durM >= (n - 1) * MIN_DUR && restante - durM <= (n - 1) * MAX_DUR);
      const inicio = cabe ? colocar(durM, ocupado, ri(FRANJA[0], FRANJA[1]) * 60 + ri(0, 59)) : null;
      const enFranja = inicio != null && inicio >= FRANJA[0] * 60 && inicio <= FRANJA[1] * 60 + 59;
      if (enFranja) {
        colocadas.push({ start: inicio, dur: durM, slot: misSlots[0] });
        ocupado.push([inicio, inicio + durM]);
        if (restante != null) restante -= durM;
        n -= 1;
      } else {
        avisos.push(`${esKey(dia.key)}: sin entrada de mañana (no cabe en 06:45-07:10 con lo que ya hay ese día)`);
      }
    }

    // duraciones del resto. Los gases se resuelven aparte: duran un par de
    // minutos, no se les puede repartir presupuesto como a una deposición.
    const pendientes = misSlots.slice(colocadas.length);
    const durs = new Array(pendientes.length);
    let presupuesto = restante;
    pendientes.forEach((s, i) => {
      if (s.type !== 'GAS') return;
      durs[i] = ri(60, 300);
      if (presupuesto != null) presupuesto -= durs[i];
    });
    const otros = pendientes.map((_, i) => i).filter(i => durs[i] === undefined);
    if (presupuesto != null) {
      const rep = repartirDuraciones(presupuesto, otros.length, a.laterDurs);
      if (rep) otros.forEach((i, j) => { durs[i] = rep[j]; });
      else {
        avisos.push(`${esKey(dia.key)}: no se pudo repartir ${fmtMS(presupuesto)} en ${otros.length} entradas`);
        otros.forEach(i => { durs[i] = Math.min(MAX_DUR, Math.max(MIN_DUR, pick(a.laterDurs))); });
      }
    } else {
      otros.forEach(i => { durs[i] = Math.min(MAX_DUR, Math.max(MIN_DUR, Math.round(pick(a.laterDurs) * (0.85 + rnd() * 0.3)))); });
    }

    // colocar de mayor a menor, así las largas encuentran hueco
    const pend = pendientes.map((slot, i) => ({ dur: durs[i], slot }))
      .sort((x, y) => y.dur - x.dur);
    for (const p of pend) {
      const pref = pick(a.laterStarts) * 60 + ri(-20, 20) * 60 + ri(0, 59);
      const inicio = colocar(p.dur, ocupado, Math.max(DAY_FROM, Math.min(DAY_TO - p.dur, pref)));
      if (inicio == null) { avisos.push(`${esKey(dia.key)}: no cabe una entrada de ${fmtMS(p.dur)}`); continue; }
      colocadas.push({ start: inicio, dur: p.dur, slot: p.slot });
      ocupado.push([inicio, inicio + p.dur]);
    }

    for (const c of colocadas.sort((x, y) => x.start - y.start)) {
      const esGas = c.slot.type === 'GAS';
      const t6 = c.slot.type === T6;
      const pPain = (t6 && a.rates.painT6 != null) ? a.rates.painT6 : a.rates.pain;
      const pUrg = (t6 && a.rates.urgencyT6 != null) ? a.rates.urgencyT6 : a.rates.urgency;
      rows.push({
        day: fmtDay(dt, a.paddedDay),
        start_time: fmtTime(c.start, a.timeWithSecs),
        end_time: fmtTime(c.start + c.dur, a.timeWithSecs),
        duration: fmtDur(c.dur),
        category: esGas ? CAT_GAS : CAT_FULL,
        type: esGas ? 'No aplica' : c.slot.type,
        pain: (!esGas && rnd() < pPain) ? 'Sí' : 'No',
        urgency: (rnd() < pUrg) ? 'Sí' : 'No',
        blood: (ALLOW_BLOOD && !esGas && rnd() < a.rates.blood) ? 'Sí' : 'No',
        _key: dia.key, _secs: c.dur
      });
    }
  });

  return { rows, dias, avisos };
}

// ---------- comprobaciones (sobre el resultado final: lo guardado + lo nuevo) ----------
function verify(rows, a, dias) {
  const problems = [];
  const nuevasPorDia = {};
  for (const r of rows) (nuevasPorDia[r._key] = nuevasPorDia[r._key] || []).push(r);

  for (const dia of dias) {
    const nuevas = nuevasPorDia[dia.key] || [];
    const todas = [
      ...dia.existentes.map(r => ({ s: toSec(r.start_time), d: realSecs(r), t: r.type, cat: r.category, real: true })),
      ...nuevas.map(r => ({ s: toSec(r.start_time), d: r._secs, t: r.type, cat: r.category, real: false }))
    ].sort((x, y) => x.s - y.s);

    const k = esKey(dia.key);
    if (todas.length < P_MIN || todas.length > P_MAX) problems.push(`${k}: ${todas.length} entradas (fuera de ${P_MIN}-${P_MAX})`);
    const total = todas.reduce((s, x) => s + x.d, 0);
    if (DAY_MIN != null && (total < DAY_MIN || total > DAY_MAX)) problems.push(`${k}: ${fmtMS(total)} al día (fuera de ${DAY_MIN / 60}-${DAY_MAX / 60} min)`);
    if (todas.some(x => String(x.t).startsWith('Tipo 4')) && todas.some(x => String(x.t).startsWith('Tipo 6'))) problems.push(`${k}: mezcla tipo 4 y tipo 6`);
    for (let i = 1; i < todas.length; i++) {
      if (todas[i].s < todas[i - 1].s + todas[i - 1].d) problems.push(`${k}: solape a las ${fmtTime(todas[i].s)}`);
    }
    if (todas.length && todas[todas.length - 1].s + todas[todas.length - 1].d > 86400) problems.push(`${k}: se pasa de medianoche`);
    for (const r of nuevas) {
      const fd = Math.floor(r._secs / 60);
      const st = toSec(r.start_time);
      const esPrimera = todas[0] && !todas[0].real && todas[0].s === st;
      if (esPrimera && (st < FRANJA[0] * 60 || st > FRANJA[1] * 60 + 59)) problems.push(`${k}: 1ª entrada generada a las ${r.start_time}`);
      if (esPrimera && (fd < FD0 || fd > FD1)) problems.push(`${k}: 1ª entrada generada dura ${fd} min`);
    }
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
if (JSON_IN && DO_INSERT) { console.error('--json y --insert son incompatibles: con un volcado local no hay conexión. Usa --sql y ejecuta el SQL aparte.'); process.exit(1); }

let raw;
if (JSON_IN) { console.log(`Leyendo volcado local ${JSON_IN}…`); raw = JSON.parse(readFileSync(JSON_IN, 'utf8')); }
else { console.log('Leyendo Supabase…'); raw = fetchAll(); }
if (!raw.length) { console.error('La tabla está vacía: no hay patrón que imitar.'); process.exit(1); }
const a = analyze(raw);

const UNTIL = opt('hasta', dateToKey(new Date()));
const FROM = opt('desde', a.lastKey);

console.log(`\n=== HISTÓRICO ===`);
console.log(`  ${a.total} registros en ${a.days.length} días (${esKey(a.firstKey)} → ${esKey(a.lastKey)})`);
console.log(`  Media veces/día : ${a.meanPerDay.toFixed(2)}`);
console.log(`  T. medio/visita : ${fmtMS(a.meanDur)}`);
console.log(`  T. medio/día    : ${fmtMS(a.meanDayTime)}`);
console.log(`  Dolor ${(a.rates.pain * 100).toFixed(0)}% · Urgencia ${(a.rates.urgency * 100).toFixed(0)}% · Sangre ${(a.rates.blood * 100).toFixed(1)}%`);
console.log(`  Reparto actual  : ` + Object.entries(a.typeCount).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${(v / a.total * 100).toFixed(0)}%`).join(' · '));
console.log(`  Formato: fecha ${a.paddedDay ? 'DD/MM/YYYY' : 'D/M/YYYY'}, hora ${a.timeWithSecs ? 'HH:MM:SS' : 'HH:MM'}`);

const { rows, dias, avisos } = generate(a, FROM, UNTIL);
if (!rows.length) { console.log(`\nNada que generar entre ${esKey(FROM)} y ${esKey(UNTIL)}.`); process.exit(0); }

const D = dias.length;
const conNuevas = new Set(rows.map(r => r._key)).size;
const secs = rows.reduce((x, r) => x + r._secs, 0);
const cnt = t => rows.filter(r => t === 'GAS' ? r.category === CAT_GAS : String(r.type).startsWith(t)).length;
const pc = n => (n / rows.length * 100).toFixed(1) + '%';
const totalDia = dias.map(d => d.Te + rows.filter(r => r._key === d.key).reduce((s, r) => s + r._secs, 0));
const cntDia = dias.map(d => d.Ce + rows.filter(r => r._key === d.key).length);

console.log(`\n=== PROPUESTA ===`);
console.log(`  ${rows.length} entradas nuevas repartidas en ${conNuevas} días (rango ${esKey(FROM)} → ${esKey(UNTIL)}, ${D} días)`);
console.log(`  Entradas/día resultantes : ${Math.min(...cntDia)}–${Math.max(...cntDia)} (media ${(cntDia.reduce((x, y) => x + y, 0) / D).toFixed(2)})`);
console.log(`  Minutos/día resultantes  : ${fmtMS(Math.min(...totalDia))}–${fmtMS(Math.max(...totalDia))} (media ${fmtMS(totalDia.reduce((x, y) => x + y, 0) / D)})`);
console.log(`  T. medio/visita nueva    : ${fmtMS(secs / rows.length)}   (histórico ${fmtMS(a.meanDur)})`);
console.log(`  Dolor ${(rows.filter(r => r.pain === 'Sí').length / rows.length * 100).toFixed(0)}% · Urgencia ${(rows.filter(r => r.urgency === 'Sí').length / rows.length * 100).toFixed(0)}% · Sangre ${rows.filter(r => r.blood === 'Sí').length} registros`);
console.log(`  Reparto nuevas: Tipo 5 ${cnt('Tipo 5')} (${pc(cnt('Tipo 5'))}) · Tipo 6 ${cnt('Tipo 6')} (${pc(cnt('Tipo 6'))}) · Tipo 4 ${cnt('Tipo 4')} (${pc(cnt('Tipo 4'))}) · Solo gases ${cnt('GAS')} (${pc(cnt('GAS'))})`);

const problems = verify(rows, a, dias);
console.log(`\n=== COMPROBACIONES ===`);
if (problems.length) { console.log(`  ⚠️ ${problems.length} problema(s):`); problems.slice(0, 30).forEach(p => console.log('   - ' + p)); }
else console.log('  ✅ Entradas por día y minutos diarios en rango, sin tipo 4 y tipo 6 el mismo día, sin solapes, primera entrada en franja.');
if (avisos.length) { console.log(`\n  ${avisos.length} aviso(s):`); avisos.slice(0, 30).forEach(p => console.log('   - ' + p)); }

const show = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;
console.log(`\n=== ENTRADAS NUEVAS ${LIMIT > 0 ? `(${LIMIT} primeras de ${rows.length})` : ''} ===`);
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
