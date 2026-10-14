/* Funciones puras compartidas (app + exportación a Excel). Sin dependencias. */
(function (root) {
  'use strict';

  const TYPES = ['Falta', 'Violación', 'Mecánica', 'AoS', 'Control', 'Otro'];
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

  const api = {
    TYPES, RESULTS, RES_CLASS, periodIndex, sortPlays, refName, matchTitle,
    playRefNames, todayISO, fmtDate, fmtDateNumeric, fmtDateTime, slug
  };
  root.Core = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
