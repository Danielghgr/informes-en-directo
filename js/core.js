/* Funciones puras compartidas (app + exportación a Excel). Sin dependencias. */
(function (root) {
  'use strict';

  const TYPES = ['Falta', 'Violación', 'Mecánica', 'DI/FL/D', 'Control', 'Otro'];
  // Nombres antiguos de tipos de acción -> nombre actual (para datos guardados con versiones anteriores)
  const LEGACY_TYPES = { 'AoS': 'DI/FL/D' };
  const normTipo = (t) => (Object.prototype.hasOwnProperty.call(LEGACY_TYPES, t) ? LEGACY_TYPES[t] : t);
  const RESULTS = ['Acierto', 'Duda', 'Error', 'Omisión'];
  const RES_CLASS = { 'Acierto': 'ok', 'Duda': 'doubt', 'Error': 'err', 'Omisión': 'omit' };
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const pad = (n) => String(n).padStart(2, '0');

  // Q1..Q4 -> 1..4, P1..P4 (prórrogas) -> 5..8
  function periodIndex(p) {
    return (String(p).charAt(0) === 'P' ? 4 : 0) + Number(String(p).slice(1));
  }

  // Orden cronológico del partido: periodo, minuto del reloj (9' antes que 0'), y orden de registro.
  function sortPlays(plays) {
    return plays.slice().sort((a, b) =>
      periodIndex(a.periodo) - periodIndex(b.periodo) ||
      b.minuto - a.minuto ||
      a.createdAt - b.createdAt);
  }

  function refName(match, n) {
    return String(match['ref' + n] || '').trim() || ('Árbitro ' + n);
  }

  function matchTitle(m) {
    return (String(m.local || '').trim() || 'Local') + ' – ' + (String(m.visitor || '').trim() || 'Visitante');
  }

  function playRefNames(match, play) {
    const out = [];
    if (play.r1) out.push(refName(match, 1));
    if (play.r2) out.push(refName(match, 2));
    return out;
  }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // "2026-10-14" -> "14 oct 2026"
  function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : (iso || '');
  }

  // "2026-10-14" -> "14/10/2026"
  function fmtDateNumeric(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : (iso || '');
  }

  function fmtDateTime(ts) {
    const d = new Date(ts);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // Texto seguro para nombres de archivo
  function slug(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'partido';
  }

  // ---------- Estadísticas ----------
  // Aciertos, dudas y errores (errores = "Error" + "Omisión"), por árbitro y cuarto.
  // Una jugada con los dos árbitros cuenta para cada uno y una sola vez en el total.
  function statClass(resultado) {
    return resultado === 'Acierto' ? 'ok' : resultado === 'Duda' ? 'doubt' : 'err';
  }

  function computeStats(match, plays) {
    const hasOT = plays.some((p) => String(p.periodo).charAt(0) === 'P');
    const keys = ['Q1', 'Q2', 'Q3', 'Q4'].concat(hasOT ? ['P'] : []);
    const groups = [
      { key: 'r1', name: refName(match, 1), custom: String(match.ref1 || '').trim(), label: 'Árbitro 1', sel: (p) => !!p.r1 },
      { key: 'r2', name: refName(match, 2), custom: String(match.ref2 || '').trim(), label: 'Árbitro 2', sel: (p) => !!p.r2 },
      { key: 'all', name: 'Total partido', custom: '', label: 'Total partido', sel: () => true }
    ];
    return groups.map((g) => {
      const rows = keys.map((k) => ({ key: k, label: k === 'P' ? 'Prórroga' : k, ok: 0, doubt: 0, err: 0, n: 0 }));
      const total = { key: 'T', label: 'Total', ok: 0, doubt: 0, err: 0, n: 0 };
      plays.filter(g.sel).forEach((p) => {
        const k = String(p.periodo).charAt(0) === 'P' ? 'P' : p.periodo;
        const row = rows.find((r) => r.key === k);
        const c = statClass(p.resultado);
        if (row) { row[c] += 1; row.n += 1; }
        total[c] += 1; total.n += 1;
      });
      return { key: g.key, name: g.name, custom: g.custom, label: g.label, rows, total };
    });
  }

  // Porcentaje entero para mostrar (null si no hay jugadas)
  const pct = (x, n) => (n ? Math.round(x * 100 / n) : null);

  // ---------- Entorno (PRO = vacío, PRE = "pre", ...) ----------
  // Dos instalaciones en la misma cuenta de GitHub Pages comparten dominio y, por tanto, almacenamiento
  // del navegador. Cada entorno usa su propia base de datos y sus propias claves para no mezclar datos.
  function env() {
    const e = String((root.RA_CONFIG || {}).env || '').trim().toLowerCase();
    return /^[a-z0-9-]{1,12}$/.test(e) ? e : '';
  }
  // En PRO (entorno vacío) las claves son 'ra:...', exactamente como en las versiones anteriores.
  function lsKey(name) {
    const e = env();
    return 'ra' + (e ? '-' + e : '') + ':' + name;
  }
  function dbName() {
    const e = env();
    return 'registro-arbitral' + (e ? '-' + e : '');
  }

  const api = {
    TYPES, RESULTS, RES_CLASS, periodIndex, sortPlays, refName, matchTitle,
    playRefNames, todayISO, fmtDate, fmtDateNumeric, fmtDateTime, slug,
    statClass, computeStats, pct, env, lsKey, dbName, LEGACY_TYPES, normTipo
  };
  root.Core = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
