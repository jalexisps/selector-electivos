// Simulación mínima de los servicios de Google Apps Script para pruebas locales.
(function (global) {
  function crearMock(opciones) {
    opciones = opciones || {};
    var hojas = {};
    var idSig = 100;

    function Hoja(nombre) { this.nombre = nombre; this.data = []; this.id = idSig++; }
    Hoja.prototype.getLastRow = function () {
      for (var i = this.data.length - 1; i >= 0; i--) {
        if ((this.data[i] || []).some(function (v) { return v !== '' && v != null; })) return i + 1;
      }
      return 0;
    };
    Hoja.prototype.getLastColumn = function () {
      var m = 0;
      this.data.forEach(function (r) { for (var j = (r || []).length - 1; j >= 0; j--) if (r[j] !== '' && r[j] != null) { m = Math.max(m, j + 1); break; } });
      return m;
    };
    Hoja.prototype.getRange = function (r, c, nr, nc) { return new Rango(this, r, c, nr || 1, nc || 1); };
    Hoja.prototype.getDataRange = function () { return new Rango(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); };
    Hoja.prototype.appendRow = function (a) { this.data[this.getLastRow()] = a.slice(); return this; };
    Hoja.prototype.deleteRow = function (r) { this.data.splice(r - 1, 1); };
    Hoja.prototype.getMaxRows = function () { return Math.max(1000, this.data.length); };
    Hoja.prototype.setFrozenRows = function () {};
    Hoja.prototype.clear = function () { this.data = []; return this; };
    Hoja.prototype.getSheetId = function () { return this.id; };

    function Rango(h, r, c, nr, nc) { this.h = h; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
    Rango.prototype.getValues = function () {
      var out = [];
      for (var i = 0; i < this.nr; i++) {
        var fila = this.h.data[this.r - 1 + i] || [];
        var o = [];
        for (var j = 0; j < this.nc; j++) { var v = fila[this.c - 1 + j]; o.push(v == null ? '' : v); }
        out.push(o);
      }
      return out;
    };
    Rango.prototype.setValues = function (v) {
      if (v.length !== this.nr || v.some(function (f) { return f.length !== this.nc; }, this)) {
        throw new Error('setValues: dimensiones no coinciden (' + v.length + 'x' + (v[0] || []).length + ' vs ' + this.nr + 'x' + this.nc + ')');
      }
      for (var i = 0; i < this.nr; i++) {
        var idx = this.r - 1 + i;
        this.h.data[idx] = this.h.data[idx] || [];
        for (var j = 0; j < this.nc; j++) this.h.data[idx][this.c - 1 + j] = v[i][j];
      }
      return this;
    };
    Rango.prototype.setNumberFormat = function () { return this; };
    Rango.prototype.setFontWeight = function () { return this; };

    var ss = {
      getSheetByName: function (n) { return hojas[n] || null; },
      insertSheet: function (n) { return (hojas[n] = new Hoja(n)); },
      getUrl: function () { return 'https://docs.google.com/spreadsheets/d/PRUEBA/edit'; }
    };

    var cache = {};
    var hash = opciones.digest || function (s) {
      // Hash simple (no criptográfico) para el navegador; en Node se usa SHA-256 real.
      var out = [], h1 = 0x811c9dc5, h2 = 0x1234567;
      for (var k = 0; k < 32; k++) {
        for (var i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619); h2 = Math.imul(h2 + s.charCodeAt(i) + k, 2246822519); }
        out.push(((h1 ^ h2) >>> (k % 24)) & 255);
      }
      return out;
    };

    var activo = opciones.activo === undefined ? 'dueno@gmail.com' : opciones.activo;
    return {
      hojas: hojas,
      fijarUsuarioActivo: function (e) { activo = e; },
      globals: {
        SpreadsheetApp: {
          getActiveSpreadsheet: function () { return ss; },
          flush: function () {},
          getUi: function () { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); }
        },
        CacheService: {
          getScriptCache: function () {
            return {
              get: function (k) { return Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null; },
              put: function (k, v) { if (k.length > 250) throw new Error('clave de cache muy larga'); cache[k] = String(v); },
              remove: function (k) { delete cache[k]; }
            };
          }
        },
        LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
        Utilities: {
          getUuid: function () { return (global.crypto && global.crypto.randomUUID) ? global.crypto.randomUUID() : require('crypto').randomUUID(); },
          computeDigest: function (alg, s) { return hash(s); },
          base64Encode: function (bytes) {
            var b = bytes.map(function (x) { return x & 255; });
            return typeof Buffer !== 'undefined' ? Buffer.from(b).toString('base64') : btoa(String.fromCharCode.apply(null, b));
          },
          formatDate: function (d) {
            var p = function (n) { return String(n).padStart(2, '0'); };
            return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
          },
          DigestAlgorithm: { SHA_256: 'SHA_256' },
          Charset: { UTF_8: 'UTF_8' }
        },
        Session: {
          getScriptTimeZone: function () { return 'America/Santiago'; },
          getActiveUser: function () { return { getEmail: function () { return activo; } }; },
          getEffectiveUser: function () { return { getEmail: function () { return 'dueno@gmail.com'; } }; }
        },
        HtmlService: { XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' } },
        Logger: { log: function (m) { (opciones.log || function () {})(m); } }
      }
    };
  }
  global.crearMockGAS = crearMock;
  if (typeof module !== 'undefined') module.exports = crearMock;
})(typeof window !== 'undefined' ? window : globalThis);
