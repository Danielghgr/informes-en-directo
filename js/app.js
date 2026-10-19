/* Registro Arbitral · lógica de la aplicación
   Pantallas: inicio · datos del partido · anotación en directo · registro. */
(() => {
  'use strict';

  const APP_VERSION = '3.2.0';
  Sync.setVersion(APP_VERSION);

  // Entorno de pruebas: se nota en el título, en la cabecera y en el nombre del icono
  const ENV = Core.env();
  if (ENV) {
    const tag = ENV.toUpperCase();
    document.title = 'Registro Arbitral · ' + tag;
    document.body.dataset.env = ENV;
    document.documentElement.style.setProperty('--env-label', JSON.stringify(' · ' + tag));
    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (meta) meta.setAttribute('content', 'Arbitral ' + tag);
  }
  const { TYPES, RESULTS, RES_CLASS, sortPlays, refName, matchTitle, fmtDate, todayISO, playRefNames, slug } = Core;
  const app = document.getElementById('app');
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* ======================= Utilidades ======================= */

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    appendKids(el, kids);
    return el;
  }
  function appendKids(el, kids) {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (Array.isArray(k)) appendKids(el, k);
      else el.append(k.nodeType ? k : document.createTextNode(String(k)));
    }
  }

  const ICONS = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    menu: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.2 1-1.2 1.8M12 17h.01"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  function icon(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ico');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name]; // markup estático y de confianza
    return s;
  }

  const uid = () => (self.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const go = (path, replace) => {
    if (replace) location.replace('#' + path);
    else location.hash = '#' + path;
  };

  function bar({ title, back, actions }) {
    return h('header', { class: 'bar' },
      back ? h('a', { class: 'icon-btn', href: back, 'aria-label': 'Volver' }, icon('back')) : null,
      h('h1', { class: 'bar-title' }, title),
      h('div', { class: 'bar-actions' }, actions || []));
  }
  function iconBtn(name, label, onclick) {
    return h('button', { type: 'button', class: 'icon-btn', 'aria-label': label, onclick }, icon(name));
  }

  /* ---------- Aviso (toast) ---------- */
  let toastEl = null, toastTimer = null;
  function clearToast() {
    clearTimeout(toastTimer);
    if (toastEl) toastEl.remove();
    toastEl = null;
  }
  function toast(msg, opts) {
    const { action, onAction, ms } = opts || {};
    clearToast();
    toastEl = h('div', { class: 'toast', role: 'status' },
      h('span', {}, msg),
      action ? h('button', { type: 'button', class: 'toast-act', onclick: () => { clearToast(); if (onAction) onAction(); } }, action) : null);
    document.body.append(toastEl);
    toastTimer = setTimeout(clearToast, ms || (action ? 6000 : 3200));
  }

  /* ---------- Diálogos ---------- */
  function modal({ title, content, buttons }) {
    return new Promise((resolve) => {
      const form = h('form', { method: 'dialog' },
        h('h2', {}, title),
        content,
        // El primer botón del DOM es el de aceptar (Intro lo activa); se muestra a la derecha.
        h('div', { class: 'dlg-actions' }, buttons.map((b) =>
          h('button', { class: 'btn ' + (b.kind || ''), value: b.value, type: 'submit', formnovalidate: true }, b.label))));
      const dlg = h('dialog', { class: 'dlg' }, form);
      dlg.addEventListener('close', () => {
        const data = new FormData(form);
        const value = dlg.returnValue;
        dlg.remove();
        resolve({ value, data });
      });
      document.body.append(dlg);
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
  }
  async function confirmDlg(title, text, okLabel, danger) {
    const r = await modal({
      title, content: h('p', {}, text),
      buttons: [{ label: okLabel || 'Aceptar', value: 'ok', kind: danger ? 'danger' : 'primary' }, { label: 'Cancelar', value: 'cancel' }]
    });
    return r.value === 'ok';
  }
  async function promptDlg(title, label, value) {
    const r = await modal({
      title,
      content: h('label', { class: 'field' }, h('span', {}, label),
        h('input', { name: 'v', type: 'text', value: value || '', maxlength: '40', autocomplete: 'off', autofocus: true })),
      buttons: [{ label: 'Guardar', value: 'ok', kind: 'primary' }, { label: 'Cancelar', value: 'cancel' }]
    });
    return r.value === 'ok' ? String(r.data.get('v') || '').trim() : null;
  }
  function infoDlg(title, content) {
    return modal({ title, content, buttons: [{ label: 'Entendido', value: 'ok', kind: 'primary' }] });
  }

  /* ---------- Menú desplegable ---------- */
  let menuEl = null, menuAnchor = null;
  function onOutside(e) {
    if (menuEl && !menuEl.contains(e.target) && !(menuAnchor && menuAnchor.contains(e.target))) closeMenu();
  }
  function closeMenu() {
    if (menuEl) menuEl.remove();
    menuEl = null; menuAnchor = null;
    document.removeEventListener('pointerdown', onOutside, true);
  }
  function toggleMenu(anchor, items) {
    if (menuEl) return closeMenu();
    menuAnchor = anchor;
    menuEl = h('div', { class: 'menu', role: 'menu' }, items.map((it) =>
      h('button', {
        type: 'button', role: 'menuitem', class: 'menu-item' + (it.danger ? ' danger' : ''),
        onclick: () => { closeMenu(); it.run(); }
      }, it.label)));
    document.body.append(menuEl);
    document.addEventListener('pointerdown', onOutside, true);
  }

  /* ---------- Pulsación larga ---------- */
  function longPress(el, onLong, onTap, ms) {
    let timer = null, fired = false, x0 = 0, y0 = 0;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
    el.addEventListener('pointerdown', (e) => {
      fired = false; x0 = e.clientX; y0 = e.clientY;
      cancel();
      timer = setTimeout(() => {
        timer = null; fired = true;
        if (navigator.vibrate) navigator.vibrate(25);
        onLong();
      }, ms || 550);
    });
    el.addEventListener('pointermove', (e) => {
      if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 12) cancel();
    });
    el.addEventListener('pointerup', () => {
      const wasTimer = !!timer;
      cancel();
      if (!fired && wasTimer) onTap();
    });
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); }
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { e.preventDefault(); onLong(); }
    });
  }

  /* ---------- Entrega de archivos (descarga o menú compartir) ---------- */
  async function deliver(blob, name) {
    if (isIOS && navigator.canShare && navigator.share) {
      try {
        const file = new File([blob], name, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: name });
          return;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return; // el usuario cerró el menú
      }
    }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  async function exportMatches(ids) {
    const matches = [];
    const playsMap = {};
    for (const id of ids) {
      const m = await DB.get('matches', id);
      if (m) { matches.push(m); playsMap[id] = await DB.playsByMatch(id); }
    }
    if (!matches.length) return;
    const bytes = Xlsx.buildReport(matches, playsMap);
    const name = matches.length === 1
      ? 'Partido_' + slug(matchTitle(matches[0])) + (matches[0].date ? '_' + matches[0].date : '') + '.xlsx'
      : 'Partidos_' + todayISO() + '.xlsx';
    await deliver(new Blob([bytes], { type: XLSX_MIME }), name);
    toast('Excel generado');
  }

  /* ---------- Copia de seguridad ---------- */
  async function backup() {
    const matches = await DB.all('matches');
    const plays = await DB.all('plays');
    if (!matches.length) return toast('Todavía no hay partidos que guardar');
    const data = { app: 'registro-arbitral', version: 1, exportedAt: new Date().toISOString(), matches, plays };
    await deliver(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'copia-registro-arbitral-' + todayISO() + '.json');
    toast('Copia de seguridad generada');
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = h('input', { type: 'file', accept, class: 'hidden' });
      const done = (f) => { input.remove(); resolve(f); };
      input.addEventListener('change', () => done(input.files && input.files[0] ? input.files[0] : null));
      input.addEventListener('cancel', () => done(null));
      document.body.append(input);
      input.click();
    });
  }

  function validPlay(p) {
    return p && typeof p.id === 'string' && typeof p.matchId === 'string' &&
      /^[QP][1-4]$/.test(p.periodo) && Number.isInteger(p.minuto) &&
      TYPES.includes(p.tipo) && RESULTS.includes(p.resultado) && (p.r1 === true || p.r2 === true);
  }

  async function importBackup() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
    if (!data || data.app !== 'registro-arbitral' || !Array.isArray(data.matches) || !Array.isArray(data.plays)) {
      return infoDlg('Archivo no válido', h('p', {}, 'Este archivo no es una copia de seguridad de Registro Arbitral.'));
    }
    const matches = data.matches.filter((m) => m && typeof m.id === 'string');
    const ids = new Set(matches.map((m) => m.id));
    const plays = data.plays
      .map((p) => (p && typeof p === 'object' ? Object.assign({}, p, { tipo: Core.normTipo(p.tipo) }) : p))
      .filter((p) => validPlay(p) && ids.has(p.matchId));
    const ok = await confirmDlg('Importar copia',
      'Se importarán ' + matches.length + ' partido(s) y ' + plays.length + ' jugada(s). ' +
      'Si un partido ya existe en este dispositivo, se sustituirá por el de la copia.', 'Importar');
    if (!ok) return;
    await DB.bulkImport(matches, plays);
    toast('Copia importada');
    route();
  }

  /* ---------- Instalación y actualizaciones ---------- */
  let deferredInstall = null;
  let updateReg = null;
  let refreshing = false;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

  function applyUpdate() {
    if (updateReg && updateReg.waiting) {
      refreshing = true;
      updateReg.waiting.postMessage('SKIP_WAITING');
    } else location.reload();
  }

  function installHelp() {
    if (deferredInstall) {
      deferredInstall.prompt();
      deferredInstall = null;
      return;
    }
    infoDlg('Instalar la app', h('div', {},
      h('p', {}, 'Instalada, la app se abre como cualquier otra y funciona sin conexión.'),
      h('h3', {}, 'Android (Chrome)'),
      h('ol', {}, h('li', {}, 'Abre el menú ⋮ del navegador.'), h('li', {}, 'Pulsa «Instalar aplicación» (o «Añadir a pantalla de inicio»).')),
      h('h3', {}, 'iPhone'),
      h('ol', {}, h('li', {}, 'Pulsa el botón Compartir.'), h('li', {}, 'Elige «Añadir a pantalla de inicio».')),
      h('p', { class: 'muted small' }, 'En iPhone, si algo falla desde Chrome, instálala desde Safari. Abre siempre la app desde su icono, no desde el navegador.')));
  }

  function helpDlg() {
    const storage = h('p', { class: 'muted small' }, 'Comprobando almacenamiento…');
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((p) => {
        storage.textContent = p
          ? 'Almacenamiento protegido: el navegador no borrará tus datos automáticamente.'
          : 'Almacenamiento estándar: haz copias de seguridad con regularidad.';
      }).catch(() => { storage.textContent = ''; });
    } else storage.textContent = '';
    infoDlg('Ayuda', h('div', {},
      h('h3', {}, 'Anotar una jugada'),
      h('p', {}, 'Marca árbitro(s), cuarto y minuto, tipo de acción y resultado. «Guardar» se activa cuando están completos. Tras guardar se conservan el cuarto y el minuto.'),
      h('h3', {}, 'Pulsación larga'),
      h('ul', {},
        h('li', {}, 'En un árbitro: cambiar su nombre.'),
        h('li', {}, 'En un cuarto (Q1–Q4): pasar a prórroga (P1–P4) y volver.')),
      h('h3', {}, 'Estadísticas'),
      h('p', {}, 'En el registro de cada partido, «Ver estadísticas» muestra aciertos, dudas y errores (con omisiones) por árbitro y cuarto. También van en una hoja del Excel.'),
      h('h3', {}, 'Tus datos'),
      Sync.enabled()
        ? h('p', {}, 'Los partidos se guardan en este dispositivo y, al finalizarlos, se envía una copia a ' + Sync.adminName() + ' (ver menú ☰ → «Privacidad y envío»). Exporta a Excel los partidos finalizados y usa «Copia de seguridad» por si cambias de móvil.')
        : h('p', {}, 'Todo se guarda solo en este dispositivo. Exporta a Excel los partidos finalizados y usa «Copia de seguridad» del menú del inicio por si cambias de móvil.'),
      storage,
      h('p', { class: 'muted small' }, 'Versión ' + APP_VERSION)));
  }

  function tryPersist() {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  }

  /* ======================= Router ======================= */

  let cleanup = null;
  let routeToken = 0;
  let homeTab = 'active';

  const ROUTES = [
    [/^\/?$/, () => home()],
    [/^\/new$/, () => matchForm(null)],
    [/^\/match\/([\w-]+)\/edit$/, (id) => matchForm(id)],
    [/^\/live\/([\w-]+)$/, (id) => live(id, null)],
    [/^\/live\/([\w-]+)\/play\/([\w-]+)$/, (id, pid) => live(id, pid)],
    [/^\/log\/([\w-]+)$/, (id) => log(id)],
    [/^\/stats\/([\w-]+)$/, (id) => stats(id)]
  ];

  async function route() {
    const token = ++routeToken;
    if (cleanup) { try { cleanup(); } catch (e) { /* nada */ } cleanup = null; }
    closeMenu();
    clearToast();
    if (Sync.needsConsent()) {
      app.replaceChildren(consentView().el);
      window.scrollTo(0, 0);
      return;
    }
    const path = (location.hash || '#/').slice(1) || '/';
    let view = null;
    try {
      for (const [re, fn] of ROUTES) {
        const m = path.match(re);
        if (m) { view = await fn(...m.slice(1)); break; }
      }
      if (!view) view = notFound();
    } catch (e) {
      console.error(e);
      view = errorView(e);
    }
    if (token !== routeToken) return;
    app.replaceChildren(view.el);
    cleanup = view.cleanup || null;
    window.scrollTo(0, 0);
  }

  function notFound() {
    return {
      el: h('div', { class: 'screen' }, bar({ title: 'No encontrado', back: '#/' }),
        h('main', { class: 'page' }, h('div', { class: 'empty' }, h('b', {}, 'No se encuentra esta pantalla'), 'Puede que el partido se haya eliminado.')))
    };
  }
  function errorView(e) {
    return {
      el: h('div', { class: 'screen' }, bar({ title: 'Error' }),
        h('main', { class: 'page' }, h('div', { class: 'empty' }, h('b', {}, 'No se puede acceder al almacenamiento'),
          'Abre la app desde el icono instalado o desde el navegador normal (no en modo privado). ',
          h('div', { class: 'small' }, String((e && e.message) || e)))))
    };
  }
  const blank = () => ({ el: h('div') });

  /* ======================= Aviso de privacidad y envío ======================= */

  const syncLabel = (m) => (m.syncPending ? 'Pendiente de enviar' : (m.syncedAt ? 'Enviado' : ''));
  function syncLine(m, cls) {
    if (!Sync.enabled() || m.status !== 'done') return null;
    const t = syncLabel(m);
    return t ? h('div', { class: cls || 'card-meta sync', dataset: { sync: m.id } }, t) : null;
  }
  window.addEventListener('ra-synced', (e) => {
    document.querySelectorAll('[data-sync="' + e.detail.id + '"]').forEach((el) => { el.textContent = 'Enviado'; });
  });

  function sentList() {
    return h('ul', {},
      h('li', {}, 'Tu alias.'),
      h('li', {}, 'Los datos del partido: equipos, fecha, competición, lugar, nombres de los árbitros y notas.'),
      h('li', {}, 'Todas las jugadas: cuarto, minuto, árbitro, tipo, resultado y observaciones.'));
  }

  function consentView() {
    const admin = Sync.adminName();
    const alias = h('input', { type: 'text', maxlength: '30', placeholder: 'Tu nombre o alias', autocomplete: 'off', 'aria-label': 'Alias' });
    const btn = h('button', { type: 'button', class: 'btn big primary', 'aria-disabled': 'true' }, 'Aceptar y continuar');
    alias.addEventListener('input', () => btn.setAttribute('aria-disabled', String(!alias.value.trim())));
    btn.addEventListener('click', () => {
      const a = alias.value.trim();
      if (!a) return toast('Escribe un alias para continuar');
      Sync.accept(a);
      route();
      Sync.flush();
    });
    return {
      el: h('div', { class: 'screen' },
        h('header', { class: 'bar' }, h('h1', { class: 'bar-title' }, 'Registro Arbitral')),
        h('main', { class: 'page consent' },
          h('h2', {}, 'Antes de empezar'),
          h('p', {}, 'Esta app guarda tus partidos en tu móvil. Además, cuando ', h('b', {}, 'finalices un partido'),
            ', se envía automáticamente una copia a ' + admin + ' para llevar un control de uso y estadísticas.'),
          h('h3', {}, 'Qué se envía'),
          sentList(),
          h('p', {}, 'No se envía nada mientras el partido está en curso. El envío es automático, en segundo plano y cuando haya conexión.'),
          h('p', {}, 'Evita escribir datos personales que no quieras compartir, por ejemplo en las observaciones.'),
          h('p', {}, 'Para que se borren tus datos, pídeselo a ' + admin + '. Puedes consultar esta información cuando quieras en el menú ☰ → «Privacidad y envío».'),
          h('label', { class: 'field' }, h('span', {}, 'Alias (para que sepamos quién ha enviado cada partido)'), alias),
          h('p', { class: 'small muted' }, 'Al pulsar «Aceptar y continuar» consientes este envío. Si no estás de acuerdo, no uses la app.')),
        h('div', { class: 'foot' }, btn))
    };
  }

  async function privacyDlg() {
    if (!Sync.enabled()) {
      return infoDlg('Privacidad', h('p', {}, 'En esta versión no se envía ningún dato. Todo se guarda solo en este dispositivo.'));
    }
    const admin = Sync.adminName();
    const aliasEl = h('b', {}, Sync.alias());
    const status = h('p', { class: 'small muted' });
    const refresh = async () => {
      const n = await Sync.pendingCount();
      status.textContent = n ? 'Partidos pendientes de enviar: ' + n + '.' : 'No hay partidos pendientes de enviar.';
    };
    await refresh();
    infoDlg('Privacidad y envío', h('div', {},
      h('p', {}, 'Cuando finalizas un partido, se envía automáticamente una copia a ' + admin + '.'),
      h('h3', {}, 'Qué se envía'),
      sentList(),
      h('p', {}, 'Tu alias: ', aliasEl),
      h('div', { class: 'row2' },
        h('button', {
          type: 'button', class: 'btn small',
          onclick: async () => {
            const a = await promptDlg('Cambiar alias', 'Alias', Sync.alias());
            if (a) { Sync.setAlias(a); aliasEl.textContent = Sync.alias(); }
          }
        }, 'Cambiar alias'),
        h('button', {
          type: 'button', class: 'btn small',
          onclick: async () => { status.textContent = 'Enviando…'; await Sync.flush(); await refresh(); }
        }, 'Enviar ahora')),
      status,
      h('p', { class: 'small muted' }, 'Para que se borren tus datos, pídeselo a ' + admin + '.')));
  }

  /* ======================= Inicio ======================= */

  async function home() {
    const [matches, plays] = await Promise.all([DB.all('matches'), DB.all('plays')]);
    const counts = {};
    for (const p of plays) counts[p.matchId] = (counts[p.matchId] || 0) + 1;
    let selecting = false;
    const selected = new Set();

    const body = h('main', { class: 'page' });
    const foot = h('div', { class: 'foot' });
    const menuBtn = iconBtn('menu', 'Menú', () => toggleMenu(menuBtn, [
      { label: 'Copia de seguridad (JSON)', run: backup },
      { label: 'Importar copia de seguridad', run: importBackup },
      { label: deferredInstall ? 'Instalar la app' : 'Cómo instalar la app', run: installHelp },
      Sync.enabled() ? { label: 'Privacidad y envío', run: privacyDlg } : null,
      { label: 'Ayuda', run: helpDlg }
    ].filter(Boolean)));
    const root = h('div', { class: 'screen' }, bar({ title: 'Registro Arbitral', actions: [menuBtn] }), body, foot);

    function byTab(done) {
      return matches
        .filter((m) => (m.status === 'done') === done)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.createdAt - a.createdAt);
    }

    function card(m, isDone) {
      const n = counts[m.id] || 0;
      const meta = [fmtDate(m.date), m.competition, m.venue].filter(Boolean).join(' · ');
      const info = h('div', { class: 'card-body' },
        h('div', { class: 'card-title' }, matchTitle(m)),
        meta ? h('div', { class: 'card-meta' }, meta) : null,
        h('div', { class: 'card-meta' }, refName(m, 1) + ' · ' + refName(m, 2)),
        syncLine(m));
      const count = h('div', { class: 'card-count' }, h('b', {}, String(n)), n === 1 ? 'jugada' : 'jugadas');
      if (selecting && isDone) {
        const cb = h('input', {
          type: 'checkbox', checked: selected.has(m.id), 'aria-label': 'Seleccionar ' + matchTitle(m),
          onchange: (e) => { if (e.target.checked) selected.add(m.id); else selected.delete(m.id); drawFoot(); }
        });
        return h('label', { class: 'card' }, cb, info, count);
      }
      return h('a', { class: 'card', href: (isDone ? '#/log/' : '#/live/') + m.id }, info, count);
    }

    function tabBtn(id, label, n) {
      return h('button', {
        type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(homeTab === id),
        onclick: () => { homeTab = id; selecting = false; selected.clear(); draw(); }
      }, label, h('span', { class: 'n' }, String(n)));
    }

    function drawFoot() {
      foot.replaceChildren();
      const isDone = homeTab === 'done';
      if (isDone && selecting) {
        foot.append(
          h('button', { type: 'button', class: 'btn big', onclick: () => { selecting = false; selected.clear(); draw(); } }, 'Cancelar'),
          h('button', {
            type: 'button', class: 'btn big primary', 'aria-disabled': String(selected.size === 0),
            onclick: async () => { if (selected.size) await exportMatches([...selected]); }
          }, 'Exportar (' + selected.size + ')'));
        return;
      }
      foot.append(h('a', { class: 'btn big primary', href: '#/new' }, icon('plus'), 'Nuevo partido'));
      if (isDone && byTab(true).length > 1) {
        foot.append(h('button', { type: 'button', class: 'btn big', onclick: () => { selecting = true; selected.clear(); draw(); } }, 'Exportar varios'));
      }
    }

    function draw() {
      const isDone = homeTab === 'done';
      const list = byTab(isDone);
      body.replaceChildren();
      if (updateReg) {
        body.append(h('div', { class: 'banner' }, h('span', {}, 'Hay una versión nueva de la app.'),
          h('button', { type: 'button', class: 'btn small', onclick: applyUpdate }, 'Actualizar')));
      }
      body.append(h('div', { class: 'tabs', role: 'tablist' },
        tabBtn('active', 'En curso', byTab(false).length),
        tabBtn('done', 'Finalizados', byTab(true).length)));
      if (!list.length) {
        body.append(h('div', { class: 'empty' },
          h('b', {}, isDone ? 'Aún no hay partidos finalizados' : 'No hay partidos en curso'),
          isDone ? 'Cuando finalices un partido aparecerá aquí, listo para exportar a Excel.' : 'Pulsa «Nuevo partido» para empezar a anotar jugadas.'));
      } else {
        body.append(h('div', { class: 'cards' }, list.map((m) => card(m, isDone))));
      }
      drawFoot();
    }

    draw();
    return { el: root };
  }

  /* ======================= Datos del partido ======================= */

  async function matchForm(id) {
    const existing = id ? await DB.get('matches', id) : null;
    if (id && !existing) return notFound();
    const m = existing || { local: '', visitor: '', date: todayISO(), competition: '', venue: '', ref1: '', ref2: '', notes: '' };

    function field(label, name, o) {
      const opts = o || {};
      const control = opts.textarea
        ? h('textarea', { name, value: m[name] || '', maxlength: '500', placeholder: opts.placeholder })
        : h('input', {
          name, type: opts.type || 'text', value: m[name] || '', maxlength: '60',
          placeholder: opts.placeholder, autocomplete: 'off', enterkeyhint: 'next'
        });
      return h('label', { class: 'field' }, h('span', {}, label), control);
    }

    const form = h('form', { class: 'form', novalidate: true },
      h('div', { class: 'row2' }, field('Equipo local', 'local', { placeholder: 'Local' }), field('Equipo visitante', 'visitor', { placeholder: 'Visitante' })),
      field('Fecha', 'date', { type: 'date' }),
      field('Competición', 'competition', { placeholder: 'Opcional' }),
      field('Lugar', 'venue', { placeholder: 'Opcional' }),
      h('div', { class: 'section-title' }, 'Árbitros'),
      h('div', { class: 'row2' }, field('Árbitro 1', 'ref1', { placeholder: 'Árbitro 1' }), field('Árbitro 2', 'ref2', { placeholder: 'Árbitro 2' })),
      field('Notas del partido', 'notes', { textarea: true, placeholder: 'Opcional' }));

    async function submit() {
      const fd = new FormData(form);
      const val = (k) => String(fd.get(k) || '').trim();
      const data = {
        local: val('local'), visitor: val('visitor'), date: val('date') || todayISO(),
        competition: val('competition'), venue: val('venue'),
        ref1: val('ref1'), ref2: val('ref2'), notes: val('notes')
      };
      const now = Date.now();
      if (existing) {
        Object.assign(existing, data, { updatedAt: now });
        if (existing.status === 'done' && Sync.enabled()) existing.syncPending = true;
        await DB.put('matches', existing);
        Sync.flush();
        toast('Datos guardados');
        go('/log/' + existing.id, true);
      } else {
        const created = Object.assign({ id: uid(), createdAt: now, updatedAt: now, status: 'active' }, data);
        await DB.put('matches', created);
        tryPersist();
        go('/live/' + created.id, true);
      }
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

    const back = existing ? '#/log/' + existing.id : '#/';
    const root = h('div', { class: 'screen' },
      bar({ title: existing ? 'Datos del partido' : 'Nuevo partido', back }),
      h('main', { class: 'page' }, form),
      h('div', { class: 'foot' },
        h('a', { class: 'btn big', href: back }, 'Cancelar'),
        h('button', { type: 'button', class: 'btn big primary', onclick: submit }, existing ? 'Guardar' : 'Empezar a anotar')));
    return { el: root };
  }

  /* ======================= Anotación en directo ======================= */

  const blankForm = () => ({ r1: false, r2: false, ot: false, per: 1, min: 9, tipo: null, res: null, obs: '' });

  function cleanForm(d) {
    const f = blankForm();
    if (d && typeof d === 'object') {
      f.r1 = !!d.r1; f.r2 = !!d.r2; f.ot = !!d.ot;
      f.per = [1, 2, 3, 4].includes(d.per) ? d.per : 1;
      const max = f.ot ? 4 : 9;
      f.min = Number.isInteger(d.min) ? clamp(d.min, 0, max) : max;
      f.tipo = TYPES.includes(Core.normTipo(d.tipo)) ? Core.normTipo(d.tipo) : null;
      f.res = RESULTS.includes(d.res) ? d.res : null;
      f.obs = typeof d.obs === 'string' ? d.obs.slice(0, 500) : '';
    }
    return f;
  }
  function loadDraft(matchId) {
    try { return cleanForm(JSON.parse(localStorage.getItem(Core.lsKey('draft:' + matchId)))); } catch (e) { return blankForm(); }
  }
  function saveDraft(matchId, f) {
    try { localStorage.setItem(Core.lsKey('draft:' + matchId), JSON.stringify(f)); } catch (e) { /* nada */ }
  }
  const formFromPlay = (p) => cleanForm({
    r1: p.r1, r2: p.r2, ot: p.periodo.charAt(0) === 'P', per: Number(p.periodo.slice(1)),
    min: p.minuto, tipo: p.tipo, res: p.resultado, obs: p.obs
  });

  // Barra de minutos: se arrastra (o se toca). Izquierda = más minutos restantes.
  function makeSlider(getMax, getMin, setMin) {
    const thumb = h('div', { class: 'thumb' });
    const ticks = h('div', { class: 'ticks' });
    const track = h('div', { class: 'track' }, ticks, h('div', { class: 'rail' }), thumb);
    const el = h('div', { class: 'slider', role: 'slider', tabindex: '0', 'aria-label': 'Minuto del reloj', 'aria-valuemin': '0' }, track);
    let builtMax = -1;
    let dragging = false;

    function sync() {
      const max = getMax(), min = getMin();
      if (builtMax !== max) {
        ticks.replaceChildren();
        for (let m = max; m >= 0; m--) {
          ticks.append(h('span', { style: 'left:' + ((max - m) / max * 100) + '%', dataset: { m: String(m) } }, String(m)));
        }
        builtMax = max;
      }
      thumb.style.left = ((max - min) / max * 100) + '%';
      thumb.textContent = min + "'";
      el.setAttribute('aria-valuemax', String(max));
      el.setAttribute('aria-valuenow', String(min));
      el.setAttribute('aria-valuetext', min + (min === 1 ? ' minuto' : ' minutos'));
      ticks.querySelectorAll('span').forEach((s) => s.classList.toggle('cur', Number(s.dataset.m) === min));
    }
    function fromEvent(e) {
      const r = track.getBoundingClientRect();
      const max = getMax();
      const ratio = r.width > 0 ? clamp((e.clientX - r.left) / r.width, 0, 1) : 0;
      setMin(max - Math.round(ratio * max));
    }
    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
      fromEvent(e);
    });
    el.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
    const stop = () => { dragging = false; };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('keydown', (e) => {
      const min = getMin(), max = getMax();
      let next = null;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = min + 1;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = min - 1;
      else if (e.key === 'Home') next = max;
      else if (e.key === 'End') next = 0;
      if (next !== null) { e.preventDefault(); setMin(clamp(next, 0, max)); }
    });
    return { el, sync };
  }

  async function live(matchId, playId) {
    const match = await DB.get('matches', matchId);
    if (!match) return notFound();
    let editing = null;
    if (playId) {
      editing = await DB.get('plays', playId);
      if (!editing || editing.matchId !== matchId) { go('/log/' + matchId, true); return blank(); }
    } else if (match.status === 'done') {
      go('/log/' + matchId, true);
      return blank();
    }

    let f = editing ? formFromPlay(editing) : loadDraft(matchId);
    let total = await DB.countPlays(matchId);
    let saving = false;

    const maxMin = () => (f.ot ? 4 : 9);
    const valid = () => (f.r1 || f.r2) && !!f.tipo && !!f.res;

    function changed() {
      update();
      if (!editing) saveDraft(matchId, f);
    }

    /* --- Árbitros --- */
    const refBtns = [1, 2].map((n) => {
      const b = h('button', { type: 'button', class: 'tog', 'aria-pressed': 'false' });
      longPress(b, () => renameRef(n), () => { f['r' + n] = !f['r' + n]; changed(); });
      return b;
    });
    async function renameRef(n) {
      const name = await promptDlg('Nombre del árbitro ' + n, 'Nombre', match['ref' + n] || '');
      if (name === null) return;
      match['ref' + n] = name;
      match.updatedAt = Date.now();
      await DB.put('matches', match);
      update();
    }

    /* --- Periodo y minuto --- */
    const perBtns = [1, 2, 3, 4].map((n) => {
      const b = h('button', { type: 'button', class: 'tog', 'aria-pressed': 'false' });
      longPress(b, toggleOvertime, () => { f.per = n; changed(); });
      return b;
    });
    function toggleOvertime() {
      f.ot = !f.ot;
      f.min = clamp(f.min, 0, maxMin());
      changed();
      toast(f.ot ? 'Prórroga: P1–P4 · minutos 4 a 0' : 'Tiempo reglamentario: Q1–Q4 · minutos 9 a 0');
    }
    const periodsEl = h('div', { class: 'periods', role: 'group', 'aria-label': 'Cuarto' },
      perBtns[0], perBtns[1], h('i', { 'aria-hidden': 'true' }), perBtns[2], perBtns[3]);
    const slider = makeSlider(maxMin, () => f.min, (v) => { if (v !== f.min) { f.min = v; changed(); } });

    /* --- Tipo y resultado --- */
    const typeBtns = TYPES.map((t) => {
      const b = h('button', { type: 'button', class: 'tog', 'aria-pressed': 'false', onclick: () => { f.tipo = f.tipo === t ? null : t; changed(); } }, t);
      return b;
    });
    const resBtns = RESULTS.map((r) =>
      h('button', { type: 'button', class: 'tog res ' + RES_CLASS[r], 'aria-pressed': 'false', onclick: () => { f.res = f.res === r ? null : r; changed(); } }, r));

    /* --- Observaciones --- */
    const obs = h('textarea', { rows: '2', maxlength: '500', placeholder: 'Observaciones', 'aria-label': 'Observaciones', value: f.obs });
    obs.addEventListener('input', () => { f.obs = obs.value; if (!editing) saveDraft(matchId, f); });

    /* --- Acciones --- */
    const saveBtn = h('button', { type: 'button', class: 'btn primary save', 'aria-disabled': 'true' }, editing ? 'Guardar cambios' : 'Guardar');
    saveBtn.addEventListener('click', () => {
      if (valid()) return doSave();
      const miss = [];
      if (!f.r1 && !f.r2) miss.push('árbitro');
      if (!f.tipo) miss.push('tipo de acción');
      if (!f.res) miss.push('resultado');
      toast('Falta: ' + miss.join(', '));
    });
    const sideBtn = h('a', { class: 'btn', href: '#/log/' + matchId }, editing ? 'Cancelar' : 'Ver registro');

    /* --- Cabecera --- */
    const countEl = h('span', { class: 'count' });
    const helpBtn = iconBtn('help', 'Ayuda', helpDlg);
    const title = h('h1', { class: 'bar-title' });
    const header = h('header', { class: 'bar' },
      h('a', { class: 'icon-btn', href: editing ? '#/log/' + matchId : '#/', 'aria-label': 'Volver' }, icon('back')),
      title,
      h('div', { class: 'bar-actions' }, editing ? iconBtn('trash', 'Eliminar jugada', deletePlay) : countEl, helpBtn));

    /* --- Sincroniza la interfaz con el estado --- */
    function update() {
      refBtns.forEach((b, i) => {
        const n = i + 1;
        const custom = String(match['ref' + n] || '').trim();
        b.replaceChildren();
        if (custom) b.append(h('span', { class: 'cap' }, 'Árbitro ' + n), h('span', {}, custom));
        else b.append(h('span', {}, 'Árbitro'), h('span', {}, String(n)));
        const on = f['r' + n];
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
        b.setAttribute('aria-label', 'Árbitro ' + n + (custom ? ', ' + custom : '') + '. Mantén pulsado para cambiar el nombre');
      });
      periodsEl.classList.toggle('ot', f.ot);
      perBtns.forEach((b, i) => {
        b.textContent = (f.ot ? 'P' : 'Q') + (i + 1);
        const on = f.per === i + 1;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      slider.sync();
      typeBtns.forEach((b, i) => { const on = f.tipo === TYPES[i]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      resBtns.forEach((b, i) => { const on = f.res === RESULTS[i]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      if (obs.value !== f.obs) obs.value = f.obs;
      saveBtn.setAttribute('aria-disabled', String(!valid()));
      title.textContent = editing ? 'Editar jugada' : matchTitle(match);
      countEl.textContent = total + (total === 1 ? ' jugada' : ' jugadas');
    }

    /* --- Guardar --- */
    async function doSave() {
      if (saving) return;
      saving = true;
      try {
        const now = Date.now();
        const periodo = (f.ot ? 'P' : 'Q') + f.per;
        if (editing) {
          Object.assign(editing, {
            r1: f.r1, r2: f.r2, periodo, minuto: f.min, tipo: f.tipo, resultado: f.res,
            obs: f.obs.trim(), updatedAt: now
          });
          await DB.put('plays', editing);
          toast('Cambios guardados');
          go('/log/' + matchId, true);
          return;
        }
        const play = {
          id: uid(), matchId, createdAt: now, updatedAt: now,
          r1: f.r1, r2: f.r2, periodo, minuto: f.min, tipo: f.tipo, resultado: f.res, obs: f.obs.trim()
        };
        await DB.put('plays', play);
        tryPersist();
        const snapshot = Object.assign({}, f);
        total += 1;
        // Se conservan cuarto y minuto; el resto se limpia para la siguiente jugada
        f = Object.assign(blankForm(), { ot: f.ot, per: f.per, min: f.min });
        changed();
        if (navigator.vibrate) navigator.vibrate(30);
        toast('Jugada guardada · ' + total + ' en total', {
          action: 'Deshacer',
          onAction: async () => {
            await DB.del('plays', play.id);
            total = Math.max(0, total - 1);
            f = snapshot;
            changed();
          }
        });
      } catch (e) {
        console.error(e);
        toast('No se pudo guardar. Inténtalo de nuevo.');
      } finally {
        saving = false;
      }
    }

    async function deletePlay() {
      const ok = await confirmDlg('Eliminar jugada', 'Esta jugada se borrará del registro.', 'Eliminar', true);
      if (!ok) return;
      await DB.del('plays', editing.id);
      toast('Jugada eliminada');
      go('/log/' + matchId, true);
    }

    /* --- Pantalla encendida mientras se anota --- */
    let wake = null;
    let active = true;
    async function lockScreen() {
      try {
        if (active && navigator.wakeLock && document.visibilityState === 'visible') {
          wake = await navigator.wakeLock.request('screen');
        }
      } catch (e) { /* no disponible */ }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') lockScreen(); };
    document.addEventListener('visibilitychange', onVisible);
    lockScreen();

    /* --- Montaje --- */
    const root = h('div', { class: 'screen fixed' },
      header,
      h('main', { class: 'live' },
        h('section', { class: 'refs' }, refBtns),
        h('section', {}, periodsEl, slider.el),
        h('section', { class: 'types' }, typeBtns),
        h('section', { class: 'results' }, resBtns),
        h('section', { class: 'obs' }, obs),
        h('section', { class: 'actions' }, sideBtn, saveBtn)));
    update();

    if (!editing) {
      let seen = false;
      try { seen = localStorage.getItem(Core.lsKey('hint1')) === '1'; } catch (e) { /* nada */ }
      if (!seen) {
        try { localStorage.setItem(Core.lsKey('hint1'), '1'); } catch (e) { /* nada */ }
        setTimeout(() => toast('Mantén pulsado un árbitro para cambiar su nombre y un cuarto para pasar a prórroga.', { ms: 8000 }), 400);
      }
    }

    return {
      el: root,
      cleanup: () => {
        active = false;
        document.removeEventListener('visibilitychange', onVisible);
        if (wake) { try { wake.release(); } catch (e) { /* nada */ } wake = null; }
      }
    };
  }

  /* ======================= Registro de jugadas ======================= */

  async function log(matchId) {
    const match = await DB.get('matches', matchId);
    if (!match) return notFound();
    const plays = sortPlays(await DB.playsByMatch(matchId));
    const done = match.status === 'done';
    homeTab = done ? 'done' : 'active';
    const flt = { ref: '', tipo: '', res: '' };

    const listEl = h('div', { class: 'plays' });
    const countEl = h('div', { class: 'small muted' });

    function playCard(p, n) {
      const refs = playRefNames(match, p).join(' + ');
      const kids = [
        h('div', { class: 'play-when' }, h('b', {}, p.periodo), h('span', {}, p.minuto + "'")),
        h('div', { class: 'play-main' },
          h('div', { class: 'play-type' }, h('span', { class: 'n' }, '#' + n), p.tipo),
          h('div', { class: 'play-refs' }, refs),
          p.obs ? h('div', { class: 'play-obs' }, p.obs) : null),
        h('span', { class: 'badge ' + RES_CLASS[p.resultado] }, p.resultado)
      ];
      return done
        ? h('div', { class: 'play' }, kids)
        : h('a', { class: 'play', href: '#/live/' + matchId + '/play/' + p.id, 'aria-label': 'Editar jugada ' + n }, kids);
    }

    function drawList() {
      const shown = plays.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) =>
        (!flt.ref || (flt.ref === '1' ? p.r1 : p.r2)) &&
        (!flt.tipo || p.tipo === flt.tipo) &&
        (!flt.res || p.resultado === flt.res));
      listEl.replaceChildren();
      if (!plays.length) {
        listEl.append(h('div', { class: 'empty' }, h('b', {}, 'Aún no hay jugadas'), done ? 'Este partido no tiene jugadas registradas.' : 'Pulsa «Anotar jugada» para añadir la primera.'));
      } else if (!shown.length) {
        listEl.append(h('div', { class: 'empty' }, 'Ninguna jugada coincide con los filtros.'));
      } else {
        shown.forEach(({ p, n }) => listEl.append(playCard(p, n)));
      }
      countEl.textContent = shown.length === plays.length
        ? plays.length + (plays.length === 1 ? ' jugada' : ' jugadas')
        : shown.length + ' de ' + plays.length + ' jugadas';
    }

    function select(label, key, options) {
      return h('label', { class: 'flt' }, h('span', {}, label),
        h('select', { onchange: (e) => { flt[key] = e.target.value; drawList(); } },
          options.map((o) => h('option', { value: o.v }, o.t))));
    }

    async function finish() {
      const ok = await confirmDlg('Finalizar partido', 'Pasará a «Finalizados» y podrás exportarlo a Excel. Podrás reabrirlo si necesitas corregir algo.', 'Finalizar');
      if (!ok) return;
      match.status = 'done';
      match.updatedAt = Date.now();
      if (Sync.enabled()) match.syncPending = true;
      await DB.put('matches', match);
      Sync.flush();
      toast('Partido finalizado');
      route();
    }
    async function reopen() {
      const ok = await confirmDlg('Reabrir partido', 'Volverá a «En curso» y podrás editar o añadir jugadas.', 'Reabrir');
      if (!ok) return;
      match.status = 'active';
      match.updatedAt = Date.now();
      await DB.put('matches', match);
      toast('Partido reabierto');
      route();
    }
    async function removeMatch() {
      const ok = await confirmDlg('Eliminar partido', 'Se borrarán el partido y todas sus jugadas. No se puede deshacer.', 'Eliminar', true);
      if (!ok) return;
      await DB.deleteMatch(matchId);
      try { localStorage.removeItem(Core.lsKey('draft:' + matchId)); } catch (e) { /* nada */ }
      toast('Partido eliminado');
      go('/', true);
    }

    const menuBtn = iconBtn('menu', 'Más opciones', () => toggleMenu(menuBtn, [
      { label: 'Editar datos del partido', run: () => go('/match/' + matchId + '/edit') },
      { label: 'Estadísticas', run: () => go('/stats/' + matchId) },
      { label: 'Exportar a Excel', run: () => exportMatches([matchId]) },
      done ? { label: 'Reabrir partido', run: reopen } : { label: 'Finalizar partido', run: finish },
      { label: 'Eliminar partido', run: removeMatch, danger: true }
    ]));

    const meta = [fmtDate(match.date), match.competition, match.venue].filter(Boolean).join(' · ');
    const summary = h('div', { class: 'summary' },
      h('div', { class: 't' }, matchTitle(match)),
      meta ? h('div', { class: 'small muted' }, meta) : null,
      h('div', { class: 'small muted' }, refName(match, 1) + ' · ' + refName(match, 2) + (done ? ' · Finalizado' : ' · En curso')),
      syncLine(match, 'small sync'),
      match.notes ? h('div', { class: 'small', style: 'margin-top:6px' }, match.notes) : null);

    const filters = h('div', { class: 'filters' },
      select('Árbitro', 'ref', [{ v: '', t: 'Todos' }, { v: '1', t: refName(match, 1) }, { v: '2', t: refName(match, 2) }]),
      select('Tipo', 'tipo', [{ v: '', t: 'Todos' }].concat(TYPES.map((t) => ({ v: t, t })))),
      select('Resultado', 'res', [{ v: '', t: 'Todos' }].concat(RESULTS.map((t) => ({ v: t, t })))));

    const foot = h('div', { class: 'foot' },
      done
        ? [h('button', { type: 'button', class: 'btn big primary', onclick: () => exportMatches([matchId]) }, 'Exportar a Excel'),
          h('button', { type: 'button', class: 'btn big', onclick: reopen }, 'Reabrir')]
        : [h('a', { class: 'btn big primary', href: '#/live/' + matchId }, icon('plus'), 'Anotar jugada'),
          h('button', { type: 'button', class: 'btn big', onclick: finish }, 'Finalizar')]);

    drawList();
    const root = h('div', { class: 'screen' },
      bar({ title: 'Registro', back: done ? '#/' : '#/live/' + matchId, actions: [menuBtn] }),
      h('main', { class: 'page' }, summary,
        plays.length ? h('a', { class: 'btn statlink', href: '#/stats/' + matchId }, 'Ver estadísticas') : null,
        plays.length ? filters : null, countEl, listEl),
      foot);
    return { el: root };
  }

  /* ======================= Estadísticas ======================= */

  async function stats(matchId) {
    const match = await DB.get('matches', matchId);
    if (!match) return notFound();
    const plays = await DB.playsByMatch(matchId);
    const data = Core.computeStats(match, plays);
    const done = match.status === 'done';

    const COLS = [['ok', 'Aciertos'], ['doubt', 'Dudas'], ['err', 'Errores']];

    function cell(r, key) {
      if (!r.n) return h('td', { class: 'zero' }, '–');
      return h('td', { class: r[key] ? '' : 'dim' }, h('b', {}, String(r[key])), h('small', {}, Core.pct(r[key], r.n) + '%'));
    }
    function row(r, isTotal) {
      return h('tr', { class: isTotal ? 'total' : '' },
        h('th', { scope: 'row' }, r.label),
        COLS.map(([key]) => cell(r, key)),
        h('td', { class: r.n ? '' : 'zero' }, r.n ? h('b', {}, String(r.n)) : '–'));
    }

    function block(g) {
      const t = g.total;
      const title = g.key === 'all' ? 'Total partido'
        : (g.custom ? g.label + ' · ' + g.name : g.label);
      const table = h('table', { class: 'st' },
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, 'Cuarto'),
          COLS.map(([key, label]) => h('th', { scope: 'col', class: key }, label)),
          h('th', { scope: 'col' }, 'Jugadas'))),
        h('tbody', {}, g.rows.map((r) => row(r, false))),
        h('tfoot', {}, row(t, true)));
      const prop = t.n
        ? h('div', { class: 'prop', role: 'img', 'aria-label': 'Aciertos ' + t.ok + ', dudas ' + t.doubt + ', errores ' + t.err },
          COLS.map(([key]) => (t[key] ? h('span', { class: key, style: 'flex:' + t[key] }) : null)))
        : null;
      return h('section', { class: 'stblock' + (g.key === 'all' ? ' all' : '') }, h('h2', {}, title), h('div', { class: 'st-wrap' }, table), prop);
    }

    const body = h('main', { class: 'page' },
      h('div', { class: 'summary' },
        h('div', { class: 't' }, matchTitle(match)),
        h('div', { class: 'small muted' }, plays.length + (plays.length === 1 ? ' jugada' : ' jugadas') + (done ? ' · Finalizado' : ' · En curso'))));
    if (!plays.length) {
      body.append(h('div', { class: 'empty' }, h('b', {}, 'Aún no hay jugadas'), 'Las estadísticas aparecerán cuando anotes la primera jugada.'));
    } else {
      data.forEach((g) => body.append(block(g)));
      body.append(h('p', { class: 'small muted stnote' },
        'Errores incluye las omisiones. Una jugada marcada con los dos árbitros cuenta para cada uno y una sola vez en el total del partido. Los porcentajes son sobre las jugadas de cada fila.'));
    }

    const root = h('div', { class: 'screen' },
      bar({ title: 'Estadísticas', back: '#/log/' + matchId }),
      body,
      h('div', { class: 'foot' },
        h('a', { class: 'btn big', href: '#/log/' + matchId }, 'Registro'),
        h('button', { type: 'button', class: 'btn big primary', onclick: () => exportMatches([matchId]) }, 'Exportar a Excel')));
    return { el: root };
  }

  /* ======================= Arranque ======================= */

  window.addEventListener('hashchange', route);

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      const watch = (worker) => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            updateReg = reg;
            if (!location.hash || location.hash === '#/') route();
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) updateReg = reg;
      reg.addEventListener('updatefound', () => watch(reg.installing));
    }).catch((e) => console.warn('Service worker no registrado:', e));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) location.reload();
    });
  }

  window.addEventListener('online', () => Sync.flush());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.flush(); });
  // Renombra en los datos guardados los tipos de acción con nombre antiguo (p. ej. «AoS» → «DI/FL/D»)
  async function migrateTypes() {
    const legacy = Object.keys(Core.LEGACY_TYPES);
    const old = (await DB.all('plays')).filter((p) => legacy.includes(p.tipo));
    if (!old.length) return;
    await DB.putPlays(old.map((p) => Object.assign({}, p, { tipo: Core.normTipo(p.tipo) })));
    if (!Sync.enabled()) return;
    // Los partidos ya enviados se reenvían para que la hoja de Google también quede actualizada
    for (const id of new Set(old.map((p) => p.matchId))) {
      const m = await DB.get('matches', id);
      if (m && m.status === 'done' && m.syncedAt) { m.syncPending = true; await DB.put('matches', m); }
    }
  }
  async function boot() {
    try { await migrateTypes(); } catch (e) { console.warn('Migración de tipos:', e); }
    route();
    Sync.flush();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('load', registerServiceWorker);
  tryPersist();
})();
