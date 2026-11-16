/* XLSX-INICIO — Excel sin librerías externas: escribir (zip sin compresión) y leer (.xlsx de Excel o Google). */
const XLSX = (() => {
  const enc = new TextEncoder();
  // Armado por partes: Apps Script interpreta los signos de plantilla si aparecen juntos en el HTML.
  const DECL = '<' + '?xml version="1.0" encoding="UTF-8" standalone="yes"?' + '>';
  // Apps Script borra todo lo que sigue a dos barras seguidas en una línea: por eso la URL se arma por partes.
  const NS = 'http:' + '/' + '/schemas.openxmlformats.org';
  const TABLA_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = TABLA_CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const xml = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const col = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  function zip(archivos) {
    const partes = [], central = []; let off = 0;
    archivos.forEach(({ nombre, texto }) => {
      const n = enc.encode(nombre), d = enc.encode(texto), crc = crc32(d);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
      partes.push(new Uint8Array(h.buffer), n, d);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true);
      c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), n);
      off += 30 + n.length + d.length;
    });
    const tam = central.reduce((a, p) => a + p.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tam, true); fin.setUint32(16, off, true);
    return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function hojaXml(filas, anchos) {
    const nc = Math.max(1, ...filas.map((f) => f.length));
    const datos = filas.map((f, i) => `<row r="${i + 1}">` + f.map((v, j) => {
      const ref = col(j) + (i + 1), est = i === 0 ? ' s="1"' : '';
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${est}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${est}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('') + '</row>').join('');
    const cols = Array.from({ length: nc }, (_, j) => {
      const w = anchos && anchos[j] ? anchos[j] : Math.min(60, Math.max(8, ...filas.map((f) => String(f[j] == null ? '' : f[j]).length + 2)));
      return `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`;
    }).join('');
    const ref = `A1:${col(nc - 1)}${Math.max(1, filas.length)}`;
    return DECL +
      `<worksheet xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships">` +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      `<cols>${cols}</cols><sheetData>${datos}</sheetData>` + (filas.length > 1 ? `<autoFilter ref="${ref}"/>` : '') + '</worksheet>';
  }

  /** hojas: [{ nombre, filas: [[encabezados], [fila], ...], anchos? }] → Blob .xlsx */
  function crear(hojas, colorEncabezado) {
    const usados = {};
    hojas = hojas.map((h) => {
      let n = String(h.nombre || 'Hoja').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Hoja', k = 2;
      while (usados[n.toLowerCase()]) n = n.slice(0, 28) + ' ' + k++;
      usados[n.toLowerCase()] = 1;
      return Object.assign({}, h, { nombre: n });
    });
    const color = 'FF' + String(colorEncabezado || '#067D3E').replace('#', '').toUpperCase();
    const ns = NS;
    const archivos = [
      { nombre: '[Content_Types].xml', texto: DECL +
        `<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas.map((h, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>' },
      { nombre: '_rels/.rels', texto: DECL +
        `<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { nombre: 'xl/workbook.xml', texto: DECL +
        `<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets>` +
        hojas.map((h, i) => `<sheet name="${xml(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
        (() => {
          const dn = hojas.map((h, i) => h.filas.length > 1
            ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(h.nombre.replace(/'/g, "''"))}'!$A$1:$${col(Math.max(1, ...h.filas.map((f) => f.length)) - 1)}$${h.filas.length}</definedName>` : '').join('');
          return dn ? `<definedNames>${dn}</definedNames>` : '';
        })() + '</workbook>' },
      { nombre: 'xl/_rels/workbook.xml.rels', texto: DECL +
        `<Relationships xmlns="${ns}/package/2006/relationships">` +
        hojas.map((h, i) => `<Relationship Id="rId${i + 1}" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${hojas.length + 1}" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { nombre: 'xl/styles.xml', texto: DECL +
        `<styleSheet xmlns="${ns}/spreadsheetml/2006/main">` +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
        `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill></fills>` +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' }
    ].concat(hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, texto: hojaXml(h.filas, h.anchos) })));
    return zip(archivos);
  }

  /** Lee la primera hoja de un .xlsx → arreglo de filas (texto). */
  async function leer(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder();
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('El archivo no es un Excel (.xlsx) válido.');
    const total = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const dir = {};
    for (let i = 0; i < total; i++) {
      const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true),
        xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      dir[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { metodo, tam, off };
      p += 46 + nl + xl + cl;
    }
    const sacar = async (nombre) => {
      const f = dir[nombre]; if (!f) return null;
      const ini = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const datos = u8.subarray(ini, ini + f.tam);
      if (f.metodo === 0) return dec.decode(datos);
      if (typeof DecompressionStream === 'undefined') throw new Error('Tu navegador no puede abrir Excel. Copia y pega las columnas.');
      return new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    };
    const parse = (t) => new DOMParser().parseFromString(t, 'application/xml');
    const porNombre = (doc, tag) => Array.from(doc.getElementsByTagNameNS('*', tag));
    const compartidos = [];
    const sst = await sacar('xl/sharedStrings.xml');
    if (sst) porNombre(parse(sst), 'si').forEach((si) => compartidos.push(porNombre(si, 't').map((t) => t.textContent).join('')));
    let ruta = 'xl/worksheets/sheet1.xml';
    const wb = await sacar('xl/workbook.xml'), rels = await sacar('xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      const hoja = porNombre(parse(wb), 'sheet')[0];
      const rid = hoja && (hoja.getAttribute('r:id') || hoja.getAttributeNS(NS + '/officeDocument/2006/relationships', 'id'));
      const rel = porNombre(parse(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid);
      if (rel) { const t = rel.getAttribute('Target'); ruta = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\x2F/, ''); }
    }
    const hx = await sacar(ruta);
    if (!hx) throw new Error('No encontré la primera hoja del Excel.');
    const filas = [];
    porNombre(parse(hx), 'row').forEach((row) => {
      const fila = [];
      porNombre(row, 'c').forEach((c, k) => {
        const r = c.getAttribute('r'); let j = k;
        if (r) { j = 0; for (const ch of r.replace(/\d+/g, '')) j = j * 26 + (ch.charCodeAt(0) - 64); j--; }
        const tipo = c.getAttribute('t'), v = porNombre(c, 'v')[0];
        let val = tipo === 'inlineStr' ? porNombre(c, 't').map((t) => t.textContent).join('') : v ? v.textContent : '';
        if (tipo === 's') val = compartidos[Number(val)] || '';
        fila[j] = val;
      });
      if (fila.some((x) => String(x || '').trim())) filas.push(Array.from(fila, (x) => (x == null ? '' : String(x))));
    });
    return filas;
  }

  return { crear, leer };
})();
/* XLSX-FIN */
