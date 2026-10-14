/* Almacenamiento local (IndexedDB). Los datos nunca salen del dispositivo. */
(function (root) {
  'use strict';

  const NAME = 'registro-arbitral';
  const VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error('IndexedDB no disponible'));
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('matches')) db.createObjectStore('matches', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('plays')) {
          const s = db.createObjectStore('plays', { keyPath: 'id' });
          s.createIndex('matchId', 'matchId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Base de datos bloqueada por otra pestaña'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }

  // Ejecuta fn dentro de una transacción. fn debe lanzar las peticiones de forma síncrona
  // y puede devolver una IDBRequest cuyo resultado será el valor devuelto.
  async function run(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let out;
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transacción cancelada'));
      const ret = fn(...stores.map((s) => tx.objectStore(s)));
      if (ret && typeof ret === 'object' && 'onsuccess' in ret) {
        ret.onsuccess = () => { out = ret.result; };
      }
    });
  }

  const all = (store) => run([store], 'readonly', (s) => s.getAll());
  const get = (store, id) => run([store], 'readonly', (s) => s.get(id));
  const put = (store, obj) => run([store], 'readwrite', (s) => s.put(obj));
  const del = (store, id) => run([store], 'readwrite', (s) => s.delete(id));
  const playsByMatch = (matchId) => run(['plays'], 'readonly', (s) => s.index('matchId').getAll(matchId));
  const countPlays = (matchId) => run(['plays'], 'readonly', (s) => s.index('matchId').count(matchId));

  // Borra el partido y todas sus jugadas
  async function deleteMatch(matchId) {
    const plays = await playsByMatch(matchId);
    return run(['matches', 'plays'], 'readwrite', (ms, ps) => {
      ms.delete(matchId);
      plays.forEach((p) => ps.delete(p.id));
    });
  }

  // Importación: sustituye por completo las jugadas de los partidos importados
  async function bulkImport(matches, plays) {
    const ids = new Set(matches.map((m) => m.id));
    const existing = (await all('plays')).filter((p) => ids.has(p.matchId));
    return run(['matches', 'plays'], 'readwrite', (ms, ps) => {
      existing.forEach((p) => ps.delete(p.id));
      matches.forEach((m) => ms.put(m));
      plays.forEach((p) => ps.put(p));
    });
  }

  root.DB = { all, get, put, del, playsByMatch, countPlays, deleteMatch, bulkImport };
})(typeof self !== 'undefined' ? self : globalThis);
