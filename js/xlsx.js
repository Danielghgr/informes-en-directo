/* Generador mínimo de .xlsx (sin dependencias, funciona sin conexión).
   Un .xlsx es un ZIP con XML; aquí se escribe el ZIP sin compresión. */
(function (root) {
  'use strict';

  const C = root.Core || (typeof require !== 'undefined' ? require('./core.js') : null);
  const enc = new TextEncoder();

  // ---------- ZIP (método "store") ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function concat(chunks) {
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  function zip(files) {
    const parts = [];
    const central = [];
    let offset = 0;
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

    for (const f of files) {
      const name = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const size = data.length;

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);      // nombres en UTF-8
      lh.setUint16(8, 0, true);           // sin compresión
      lh.setUint16(10, time, true);
      lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true);
      lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true);
      ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true);
      ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true);
      ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true);
      ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);

      offset += 30 + name.length + size;
    }

    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return concat([...parts, ...central, new Uint8Array(end.buffer)]);
  }

  // ---------- XML de la hoja de cálculo ----------
  // Estilos (índices en styles.xml)
  const S = { def: 0, header: 1, wrap: 2, center: 3, ok: 4, doubt: 5, err: 6, omit: 7, label: 8, pct: 9, totNum: 10, totPct: 11, totLabel: 12 };

  const esc = (s) => String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function colName(i) {
    let s = '';
    i += 1;
    while (i > 0) {
      const r = (i - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  function cellXml(ref, c) {
    let v = c, s = 0;
    if (c !== null && typeof c === 'object') { v = c.v; s = c.s || 0; }
    const sa = s ? ' s="' + s + '"' : '';
    if (v === '' || v == null) return s ? '<c r="' + ref + '"' + sa + '/>' : '';
    if (typeof v === 'number') return '<c r="' + ref + '"' + sa + '><v>' + v + '</v></c>';
    return '<c r="' + ref + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  function sheetXml(sh, selected) {
    const rows = sh.rows;
    let maxC = 1;
    rows.forEach((r) => { maxC = Math.max(maxC, r.length); });
    const lastRef = colName(maxC - 1) + rows.length;
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:' + lastRef + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"' + (selected ? ' tabSelected="1"' : '') + '>';
    if (sh.freeze) {
      x += '<pane ySplit="' + sh.freeze + '" topLeftCell="A' + (sh.freeze + 1) +
        '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>';
    }
    x += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
    if (sh.cols) {
      x += '<cols>' + sh.cols.map((w, i) =>
        '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>';
    }
    x += '<sheetData>';
    rows.forEach((r, ri) => {
      const rowAttr = ri === 0 && sh.header ? ' ht="22" customHeight="1"' : '';
      x += '<row r="' + (ri + 1) + '"' + rowAttr + '>';
      r.forEach((c, ci) => { x += cellXml(colName(ci) + (ri + 1), c); });
      x += '</row>';
    });
    x += '</sheetData>';
    if (sh.filter) x += '<autoFilter ref="A1:' + lastRef + '"/>';
    x += '</worksheet>';
    return x;
  }

  const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="8">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0D1117"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFB7E4C7"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFD9A8"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF5B5AF"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE08A8A"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE4E7EB"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="13">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="6" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="7" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="9" fontId="2" fillId="7" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
    '<xf numFmtId="0" fontId="2" fillId="7" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  // sheets: [{ name, rows, cols?, freeze?, filter?, header? }]
  function buildXlsx(sheets) {
    const n = sheets.length;
    const files = [];
    const add = (name, text) => files.push({ name, data: enc.encode(text) });

    add('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
        '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>');

    add('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>');

    add('xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
      sheets.map((s, i) => '<sheet name="' + esc(s.name.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') +
      '</sheets></workbook>');

    add('xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>');

    add('xl/styles.xml', STYLES_XML);
    sheets.forEach((s, i) => add('xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s, i === 0)));

    return zip(files);
  }

  // ---------- Informe de partidos ----------
  const RES_STYLE = { 'Acierto': S.ok, 'Duda': S.doubt, 'Error': S.err, 'Omisión': S.omit };

  // Tabla de estadísticas en formato "largo" (una fila por árbitro/periodo): fácil de filtrar y de usar en tablas dinámicas
  function statsSheet(ordered, playsByMatch, multi) {
    const head = (multi ? ['Partido', 'Fecha'] : []).concat(
      ['Grupo', 'Periodo', 'Aciertos', '% Aciertos', 'Dudas', '% Dudas', 'Errores (con omisiones)', '% Errores', 'Jugadas']);
    const widths = (multi ? [30, 12] : []).concat([24, 11, 10, 11, 10, 9, 14, 10, 9]);
    const rows = [head.map((t) => ({ v: t, s: S.header }))];
    const ratio = (x, n) => (n ? x / n : '');

    ordered.forEach((m) => {
      C.computeStats(m, playsByMatch[m.id] || []).forEach((g) => {
        const grp = g.key === 'all' ? g.label : (g.custom ? g.label + ' (' + g.name + ')' : g.label);
        g.rows.concat([g.total]).forEach((r) => {
          const tot = r.key === 'T';
          const txt = tot ? S.totLabel : S.def;
          const num = tot ? S.totNum : S.center;
          const pc = tot ? S.totPct : S.pct;
          const row = [];
          if (multi) row.push({ v: C.matchTitle(m), s: txt }, { v: C.fmtDateNumeric(m.date), s: txt });
          row.push(
            { v: grp, s: txt }, { v: r.label, s: txt },
            { v: r.ok, s: num }, { v: ratio(r.ok, r.n), s: pc },
            { v: r.doubt, s: num }, { v: ratio(r.doubt, r.n), s: pc },
            { v: r.err, s: num }, { v: ratio(r.err, r.n), s: pc },
            { v: r.n, s: num });
          rows.push(row);
        });
      });
    });
    return { name: 'Estadísticas', header: true, freeze: 1, filter: true, cols: widths, rows };
  }

  function reportSheets(matches, playsByMatch) {
    const multi = matches.length > 1;
    const H = (t) => ({ v: t, s: S.header });
    const L = (t) => ({ v: t, s: S.label });
    const state = (m) => (m.status === 'done' ? 'Finalizado' : 'En curso');
    const sheets = [];

    const ordered = matches.slice().sort((a, b) =>
      String(a.date || '').localeCompare(String(b.date || '')) || (a.createdAt || 0) - (b.createdAt || 0));

    if (!multi) {
      const m = ordered[0];
      const n = (playsByMatch[m.id] || []).length;
      sheets.push({
        name: 'Partido', cols: [22, 46], header: true,
        rows: [
          [H('Dato'), H('Valor')],
          [L('Local'), m.local || ''],
          [L('Visitante'), m.visitor || ''],
          [L('Fecha'), C.fmtDateNumeric(m.date)],
          [L('Competición'), m.competition || ''],
          [L('Lugar'), m.venue || ''],
          [L('Árbitro 1'), C.refName(m, 1)],
          [L('Árbitro 2'), C.refName(m, 2)],
          [L('Notas'), { v: m.notes || '', s: S.wrap }],
          [L('Estado'), state(m)],
          [L('Nº de jugadas'), n]
        ]
      });
    } else {
      sheets.push({
        name: 'Partidos', header: true, freeze: 1, filter: true,
        cols: [30, 12, 22, 22, 18, 18, 12, 10, 40],
        rows: [
          ['Partido', 'Fecha', 'Competición', 'Lugar', 'Árbitro 1', 'Árbitro 2', 'Estado', 'Jugadas', 'Notas'].map(H)
        ].concat(ordered.map((m) => [
          C.matchTitle(m), C.fmtDateNumeric(m.date), m.competition || '', m.venue || '',
          C.refName(m, 1), C.refName(m, 2), state(m), (playsByMatch[m.id] || []).length,
          { v: m.notes || '', s: S.wrap }
        ]))
      });
    }

    const base = ['Nº', 'Periodo', 'Minuto', 'Árbitro(s)', 'Árbitro 1', 'Árbitro 2', 'Tipo', 'Resultado', 'Observaciones', 'Registrada'];
    const baseW = [6, 9, 9, 28, 10, 10, 13, 12, 52, 17];
    const head = (multi ? ['Partido', 'Fecha'] : []).concat(base);
    const widths = (multi ? [30, 12] : []).concat(baseW);
    const rows = [head.map(H)];

    ordered.forEach((m) => {
      C.sortPlays(playsByMatch[m.id] || []).forEach((p, i) => {
        const row = [];
        if (multi) row.push(C.matchTitle(m), C.fmtDateNumeric(m.date));
        row.push(
          i + 1,
          { v: p.periodo, s: S.center },
          { v: p.minuto, s: S.center },
          C.playRefNames(m, p).join(' + '),
          { v: p.r1 ? '✓' : '', s: S.center },
          { v: p.r2 ? '✓' : '', s: S.center },
          p.tipo,
          { v: p.resultado, s: RES_STYLE[p.resultado] || S.def },
          { v: p.obs || '', s: S.wrap },
          C.fmtDateTime(p.createdAt)
        );
        rows.push(row);
      });
    });

    sheets.push(statsSheet(ordered, playsByMatch, multi));
    sheets.push({ name: 'Jugadas', header: true, freeze: 1, filter: true, cols: widths, rows });
    return sheets;
  }

  function buildReport(matches, playsByMatch) {
    return buildXlsx(reportSheets(matches, playsByMatch));
  }

  const api = { buildXlsx, buildReport, reportSheets, zip, crc32 };
  root.Xlsx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
