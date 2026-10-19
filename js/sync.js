/* Envío de partidos finalizados al administrador (Hoja de Google vía Apps Script).
   - Solo se activa si js/config.js tiene syncUrl.
   - Requiere que el usuario haya aceptado el aviso de privacidad (alias incluido).
   - Se envía al finalizar un partido; si no hay conexión, se reintenta más tarde. */
(function (root) {
  'use strict';

  const CONSENT_VERSION = 1;
  const cfg = () => root.RA_CONFIG || {};
  let version = '';
  let running = false;
  let memConsent = null; // por si localStorage no está disponible

  const enabled = () => /^https:\/\//.test(String(cfg().syncUrl || ''));

  function readConsent() {
    let c = memConsent;
    try { c = JSON.parse(localStorage.getItem(Core.lsKey('consent'))) || memConsent; } catch (e) { /* nada */ }
    return c && c.v === CONSENT_VERSION && c.alias ? c : null;
  }
  const needsConsent = () => enabled() && !readConsent();

  function writeConsent(alias) {
    const c = { v: CONSENT_VERSION, alias: String(alias).trim().slice(0, 30), at: Date.now() };
    memConsent = c;
    try { localStorage.setItem(Core.lsKey('consent'), JSON.stringify(c)); } catch (e) { /* nada */ }
  }
  const accept = (alias) => writeConsent(alias);
  const alias = () => { const c = readConsent(); return c ? c.alias : ''; };
  const setAlias = (a) => { if (String(a).trim()) writeConsent(a); };
  const adminName = () => String(cfg().adminName || '').trim() || 'el administrador de la app';

  function installId() {
    let id = null;
    try { id = localStorage.getItem(Core.lsKey('install')); } catch (e) { /* nada */ }
    if (!id) {
      id = (root.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'i-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(Core.lsKey('install'), id); } catch (e) { /* nada */ }
    }
    return id;
  }

  function buildPayload(m, plays) {
    const c = readConsent();
    return {
      key: String(cfg().syncKey || ''),
      env: Core.env(),
      installId: installId(),
      alias: c ? c.alias : '',
      appVersion: version,
      sentAt: new Date().toISOString(),
      match: {
        id: m.id, createdAt: m.createdAt, updatedAt: m.updatedAt, status: m.status, date: m.date || '',
        local: m.local || '', visitor: m.visitor || '', competition: m.competition || '', venue: m.venue || '',
        ref1: m.ref1 || '', ref2: m.ref2 || '', notes: m.notes || ''
      },
      plays: plays.map((p) => ({
        id: p.id, createdAt: p.createdAt, periodo: p.periodo, minuto: p.minuto,
        r1: !!p.r1, r2: !!p.r2, tipo: p.tipo, resultado: p.resultado, obs: p.obs || ''
      }))
    };
  }

  function withTimeout(ms) {
    if (typeof AbortController === 'undefined') return { signal: undefined, done() { } };
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    return { signal: ctl.signal, done() { clearTimeout(t); } };
  }

  // Devuelve true si el envío se considera entregado.
  async function post(payload) {
    if (typeof fetch !== 'function' || navigator.onLine === false) return false;
    const body = JSON.stringify(payload);
    const headers = { 'Content-Type': 'text/plain;charset=utf-8' }; // evita la petición previa (preflight)
    const url = cfg().syncUrl;

    let t = withTimeout(20000);
    try {
      const r = await fetch(url, { method: 'POST', headers, body, redirect: 'follow', signal: t.signal });
      const j = await r.json();
      t.done();
      return !!(j && j.ok === true);
    } catch (e) {
      t.done();
    }
    // Si el navegador no deja leer la respuesta, se reintenta sin leerla.
    // (El servidor guarda por ID de partido, así que repetir un envío no duplica datos.)
    t = withTimeout(20000);
    try {
      await fetch(url, { method: 'POST', mode: 'no-cors', headers, body, signal: t.signal });
      t.done();
      return true;
    } catch (e) {
      t.done();
      return false;
    }
  }

  async function pendingMatches() {
    return (await DB.all('matches')).filter((m) => m.status === 'done' && m.syncPending);
  }
  async function pendingCount() { return enabled() ? (await pendingMatches()).length : 0; }

  async function flush() {
    if (!enabled() || !readConsent() || running) return 0;
    running = true;
    let sent = 0;
    try {
      for (const m of await pendingMatches()) {
        const plays = Core.sortPlays(await DB.playsByMatch(m.id));
        const ok = await post(buildPayload(m, plays));
        if (!ok) break; // sin conexión o error: se reintenta en la próxima ocasión
        const fresh = await DB.get('matches', m.id);
        if (fresh && fresh.updatedAt === m.updatedAt) {
          fresh.syncPending = false;
          fresh.syncedAt = Date.now();
          await DB.put('matches', fresh);
          sent += 1;
          root.dispatchEvent(new CustomEvent('ra-synced', { detail: { id: m.id } }));
        }
      }
    } catch (e) {
      console.warn('Envío pendiente:', e);
    } finally {
      running = false;
    }
    return sent;
  }

  root.Sync = {
    enabled, needsConsent, accept, alias, setAlias, adminName, flush, pendingCount,
    setVersion(v) { version = String(v || ''); },
    buildPayload
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Sync;
})(typeof self !== 'undefined' ? self : globalThis);
