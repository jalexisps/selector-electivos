/** @OnlyCurrentDoc */
/**
 * ============================================================
 *  SELECTOR DE ELECTIVOS — Backend (Google Apps Script)
 * ============================================================
 *  La planilla de Google a la que está unido este script funciona
 *  como base de datos. Hojas:
 *    Config       → estado del proceso y nombre del colegio
 *    Familias     → familias de electivos y su cupo
 *    Estudiantes  → RUT, nombre, curso, clave y familia elegida
 *    UTP          → usuarios de la Unidad Técnico Pedagógica
 *    Registro     → historial de todo lo que pasa en el sistema
 *
 *  Primer uso: abre la planilla → menú "Selector de Electivos"
 *  → "Instalar o reparar". Después implementa como aplicación web.
 * ============================================================
 */

var APP = {
  nombre: 'Selector de Electivos',
  sesionSeg: 6 * 60 * 60,   // duración de una sesión (6 horas)
  maxIntentos: 5,           // intentos de clave antes de bloquear
  bloqueoSeg: 10 * 60,      // tiempo de bloqueo (10 minutos)
  largoClaveMin: 6,
  cupoMax: 500
};

var HOJAS = {
  Config: ['Clave', 'Valor'],
  Familias: ['ID', 'Nombre', 'Electivos', 'Cupo'],
  Estudiantes: ['RUT', 'Nombre', 'Curso', 'ClaveInicial', 'ClaveHash', 'Sal', 'Familia', 'FechaInscripcion', 'InscritoPor'],
  UTP: ['Usuario', 'Nombre', 'ClaveInicial', 'ClaveHash', 'Sal'],
  Registro: ['Fecha', 'Usuario', 'Accion', 'Detalle']
};

var CONFIG_INICIAL = [
  ['colegio', ''],
  ['enlace', ''],
  ['procesoAbierto', 'NO'],
  ['apertura', ''],
  ['cierre', '']
];

// Identidad del liceo: se usa mientras la UTP no guarde otra en Apariencia.
var LICEO = {
  nombre: 'Liceo Polivalente Nahuelbuta · Contulmo',
  primario: '#067D3E',   // verde
  secundario: '#EAEA17'  // amarillo
};

var FAMILIAS_INICIALES = [
  ['F1', 'Familia 1', 'Ciencias de la salud; Creación y composición musical; Comprensión histórica del presente', '25'],
  ['F2', 'Familia 2', 'Probabilidades y estadística descriptiva e inferencial; Estética; Física', '25'],
  ['F3', 'Familia 3', 'Ciencias de la salud; Comprensión histórica del presente; Probabilidades y estadística descriptiva e inferencial', '25']
];

/* ------------------------------------------------------------
 *  Entrada web y menú de la planilla
 * ------------------------------------------------------------ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP.nombre)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // Permite mostrar la app dentro de la página de GitHub Pages (sin el aviso de Google)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Selector de Electivos')
    .addItem('Instalar o reparar', 'instalar')
    .addItem('Crear nuevo usuario UTP', 'crearUsuarioUtp')
    .addToUi();
}

/** Crea las hojas que falten y el primer usuario UTP. Se puede ejecutar varias veces. */
function instalar() {
  if (!esDueno_()) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HOJAS).forEach(function (n) { prepararHoja_(ss, n, HOJAS[n]); });

  var cfg = leer_('Config');
  var claves = cfg.filas.map(function (f) { return String(f.Clave); });
  var faltan = CONFIG_INICIAL.filter(function (p) { return claves.indexOf(p[0]) < 0; })
    .map(function (p) { return { Clave: p[0], Valor: p[1] }; });
  agregarFilas_(cfg, faltan);

  var fam = leer_('Familias');
  if (!fam.filas.length) {
    agregarFilas_(fam, FAMILIAS_INICIALES.map(function (f) {
      return { ID: f[0], Nombre: f[1], Electivos: f[2], Cupo: f[3] };
    }));
  }

  var mensaje = 'Las hojas están listas.';
  var utp = leer_('UTP');
  if (!utp.filas.length) {
    var clave = generarClave_();
    agregarFilas_(utp, [{ Usuario: 'utp', Nombre: 'Unidad Técnico Pedagógica', ClaveInicial: clave }]);
    mensaje += '\n\nSe creó el usuario de la UTP:\n\n   Usuario: utp\n   Clave inicial: ' + clave +
      '\n\nAl entrar por primera vez el sistema pedirá cambiar la clave.';
  }
  registrar_('sistema', 'Instalar o reparar', '');
  avisar_(mensaje);
}

/** Agrega otra persona de la UTP (pide usuario y nombre por ventana). */
function crearUsuarioUtp() {
  if (!esDueno_()) return;
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt('Nuevo usuario UTP', 'Nombre de usuario (sin espacios, ej: mperez):', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var usuario = String(r1.getResponseText()).trim().toLowerCase().replace(/\s+/g, '');
  if (!usuario) return;
  var r2 = ui.prompt('Nuevo usuario UTP', 'Nombre completo de la persona:', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var t = leer_('UTP');
  if (buscar_(t, 'Usuario', usuario, normUsuario_)) { ui.alert('Ese usuario ya existe.'); return; }
  var clave = generarClave_();
  agregarFilas_(t, [{ Usuario: usuario, Nombre: limpiar_(r2.getResponseText(), 80), ClaveInicial: clave }]);
  registrar_('sistema', 'Crear usuario UTP', usuario);
  ui.alert('Usuario creado.\n\n   Usuario: ' + usuario + '\n   Clave inicial: ' + clave);
}

/* ------------------------------------------------------------
 *  API: única puerta de entrada desde la página
 * ------------------------------------------------------------ */

var ACCIONES = {
  publico: accPublico_,
  login: accLogin_,
  logout: accLogout_,
  cambiarClave: accCambiarClave_,
  // Estudiante
  miEstado: accMiEstado_,
  inscribir: accInscribir_,
  // UTP
  panel: accPanel_,
  guardarProceso: accGuardarProceso_,
  importar: accImportar_,
  asignar: accAsignar_,
  restablecerClave: accRestablecerClave_,
  eliminarEstudiante: accEliminarEstudiante_,
  guardarFamilia: accGuardarFamilia_,
  agregarFamilia: accAgregarFamilia_,
  eliminarFamilia: accEliminarFamilia_,
  exportarHoja: accExportarHoja_,
  masivo: accMasivo_,
  guardarApariencia: accGuardarApariencia_
};

function api(req) {
  req = req || {};
  try {
    var fn = ACCIONES[req.accion];
    if (!fn) throw falla_('Acción desconocida.');
    return { ok: true, data: fn(req.datos || {}, req.token || '') };
  } catch (e) {
    if (!e.mensajeUsuario) console.error(e);
    return {
      ok: false,
      error: e.mensajeUsuario || ('Ocurrió un error inesperado: ' + (e && e.message)),
      code: e.code || ''
    };
  }
}

/* ---------- Acceso ---------- */

function accPublico_() {
  var cfg = config_();
  return { colegio: cfg.colegio || LICEO.nombre, tema: tema_(cfg) };
}

function tema_(cfg) {
  var v = function (k, def) { return cfg[k] === undefined ? def : cfg[k]; };
  var logo1 = v('logo1', typeof LOGO_LICEO === 'string' ? LOGO_LICEO : ''), logo2 = v('logo2', '');
  return {
    primario: v('colorPrimario', LICEO.primario),
    secundario: v('colorSecundario', LICEO.secundario),
    logo1: logo1,
    logo2: logo2,
    logos: [logo1, logo2].filter(String),
    liceo: { primario: LICEO.primario, secundario: LICEO.secundario }
  };
}

function accLogin_(d) {
  var rol = d.rol === 'utp' ? 'utp' : 'estudiante';
  var id = rol === 'utp' ? normUsuario_(d.usuario) : normRut_(d.usuario);
  var clave = String(d.clave || '');
  if (!id || !clave) throw falla_(rol === 'utp' ? 'Ingresa tu usuario y tu clave.' : 'Ingresa tu RUT y tu clave.');

  var cache = CacheService.getScriptCache();
  var kIntentos = 'I' + rol + id;
  var intentos = Number(cache.get(kIntentos) || 0);
  if (intentos >= APP.maxIntentos) {
    throw falla_('Demasiados intentos fallidos. Espera 10 minutos y vuelve a intentarlo.');
  }

  var t = leer_(rol === 'utp' ? 'UTP' : 'Estudiantes');
  var u = rol === 'utp' ? buscar_(t, 'Usuario', id, normUsuario_) : buscar_(t, 'RUT', id, normRut_);
  var ok = false, debeCambiar = false;
  if (u) {
    if (u.ClaveHash) {
      ok = hash_(clave, String(u.Sal)) === String(u.ClaveHash);
    } else if (rol === 'estudiante') {
      // Clave de estudiante: últimos 4 dígitos del RUT, contando el dígito verificador
      ok = clave.trim().toUpperCase() === claveRut_(u.RUT);
    } else if (u.ClaveInicial) {
      ok = clave.trim().toUpperCase() === String(u.ClaveInicial).trim().toUpperCase();
      debeCambiar = ok;
    }
  }
  if (!ok) {
    cache.put(kIntentos, String(intentos + 1), APP.bloqueoSeg);
    throw falla_(rol === 'utp' ? 'Usuario o clave incorrectos.' : 'RUT o clave incorrectos.');
  }
  cache.remove(kIntentos);
  var s = { rol: rol, id: id, nombre: String(u.Nombre || ''), debeCambiar: debeCambiar };
  registrar_(actor_(s), 'Entrar', '');
  return { token: crearSesion_(s), rol: rol, nombre: s.nombre, debeCambiar: debeCambiar };
}

function accLogout_(d, token) {
  if (token) CacheService.getScriptCache().remove('S' + token);
  return true;
}

function accCambiarClave_(d, token) {
  var s = sesion_(token, null, true);
  var nueva = String(d.nueva || '');
  var actual = String(d.actual || '');
  if (nueva.length < APP.largoClaveMin) throw falla_('La nueva clave debe tener al menos ' + APP.largoClaveMin + ' caracteres.');
  if (nueva.length > 64) throw falla_('La nueva clave es demasiado larga.');
  return conLock_(function () {
    var t = leer_(s.rol === 'utp' ? 'UTP' : 'Estudiantes');
    var u = buscarUsuario_(t, s);
    if (!u) throw falla_('Tu cuenta ya no existe. Consulta con la UTP.', 'SESION');
    if (!s.debeCambiar) {
      var okActual = u.ClaveHash
        ? hash_(actual, String(u.Sal)) === String(u.ClaveHash)
        : actual.trim().toUpperCase() === (s.rol === 'estudiante' ? claveRut_(u.RUT) : String(u.ClaveInicial).trim().toUpperCase());
      if (!okActual) throw falla_('La clave actual no es correcta.');
    }
    var inicial = s.rol === 'estudiante' ? claveRut_(u.RUT) : String(u.ClaveInicial || '').trim().toUpperCase();
    if (inicial && nueva.trim().toUpperCase() === inicial) {
      throw falla_('La nueva clave tiene que ser distinta a la clave inicial.');
    }
    u.Sal = Utilities.getUuid();
    u.ClaveHash = hash_(nueva, u.Sal);
    u.ClaveInicial = '';
    escribirFila_(t, u);
    s.debeCambiar = false;
    guardarSesion_(token, s);
    registrar_(actor_(s), 'Cambiar clave', '');
    return true;
  });
}

/* ---------- Estudiante ---------- */

function accMiEstado_(d, token) {
  return estadoEstudiante_(sesion_(token, 'estudiante'));
}

function accInscribir_(d, token) {
  var s = sesion_(token, 'estudiante');
  return conLock_(function () {
    var cfg = config_();
    if (!proceso_(cfg).abierto) throw falla_('La inscripción no está abierta en este momento.', 'CERRADO');
    var t = leer_('Estudiantes');
    var u = buscarUsuario_(t, s);
    if (!u) throw falla_('Tu RUT ya no está en la lista. Consulta con la UTP.', 'SESION');
    if (u.Familia) throw falla_('Ya estás inscrito. Si necesitas un cambio, conversa con la UTP.', 'YA');
    var f = familiasConConteo_(t).filter(function (x) { return x.id === String(d.familia); })[0];
    if (!f) throw falla_('Esa familia no existe.');
    if (f.inscritos >= f.cupo) {
      throw falla_('La ' + f.nombre + ' acaba de completar sus ' + f.cupo + ' cupos. Elige otra familia.', 'LLENO');
    }
    u.Familia = f.id;
    u.FechaInscripcion = ahora_();
    u.InscritoPor = 'Estudiante';
    escribirFila_(t, u);
    registrar_(actor_(s), 'Inscripción', f.nombre + ' (' + (f.inscritos + 1) + '/' + f.cupo + ')');
    return estadoEstudiante_(s, t);
  });
}

function estadoEstudiante_(s, t) {
  t = t || leer_('Estudiantes');
  var u = buscarUsuario_(t, s);
  if (!u) throw falla_('Tu RUT ya no está en la lista. Consulta con la UTP.', 'SESION');
  var cfg = config_();
  return {
    estudiante: {
      rut: normRut_(u.RUT), nombre: String(u.Nombre), curso: String(u.Curso || ''),
      familia: String(u.Familia || ''), fecha: String(u.FechaInscripcion || '')
    },
    familias: familiasConConteo_(t),
    proceso: proceso_(cfg),
    colegio: cfg.colegio || LICEO.nombre
  };
}

/* ---------- UTP ---------- */

function accPanel_(d, token) {
  sesion_(token, 'utp');
  var t = leer_('Estudiantes');
  var cfg = config_();
  return {
    familias: familiasConConteo_(t),
    proceso: proceso_(cfg),
    colegio: cfg.colegio || LICEO.nombre,
    enlace: cfg.enlace || '',
    tema: tema_(cfg),
    estudiantes: t.filas.filter(function (f) { return String(f.RUT).trim(); }).map(function (f) {
      return {
        rut: normRut_(f.RUT) || String(f.RUT),
        nombre: String(f.Nombre || ''),
        curso: String(f.Curso || ''),
        familia: String(f.Familia || ''),
        fecha: String(f.FechaInscripcion || ''),
        por: String(f.InscritoPor || ''),
        claveInicial: f.ClaveHash ? '' : claveRut_(f.RUT)
      };
    })
  };
}

function accGuardarProceso_(d, token) {
  var s = sesion_(token, 'utp');
  return conLock_(function () {
    var cambios = {
      procesoAbierto: d.abierto ? 'SI' : 'NO',
      apertura: Number(d.apertura) > 0 ? String(Number(d.apertura)) : '',
      cierre: Number(d.cierre) > 0 ? String(Number(d.cierre)) : ''
    };
    if (d.colegio !== undefined) cambios.colegio = limpiar_(d.colegio, 120);
    if (d.enlace !== undefined) {
      var enlace = String(d.enlace || '').trim().slice(0, 300);
      if (enlace && !/^https:\/\/\S+$/.test(enlace)) throw falla_('El enlace debe empezar con https://');
      cambios.enlace = enlace;
    }
    if (cambios.apertura && cambios.cierre && Number(cambios.cierre) <= Number(cambios.apertura)) {
      throw falla_('El cierre tiene que ser posterior a la apertura.');
    }
    guardarConfig_(cambios);
    registrar_(actor_(s), 'Configurar proceso', JSON.stringify(cambios));
    return proceso_(config_());
  });
}

function accImportar_(d, token) {
  var s = sesion_(token, 'utp');
  var filas = Array.isArray(d.filas) ? d.filas : [];
  if (!filas.length) throw falla_('No hay filas para cargar.');
  if (filas.length > 3000) throw falla_('Son demasiadas filas de una vez (máximo 3000).');
  return conLock_(function () {
    var t = leer_('Estudiantes');
    var indice = {};
    t.filas.forEach(function (f) { var r = normRut_(f.RUT); if (r) indice[r] = f; });
    var nuevos = [], actualizados = 0, sinCambios = 0, errores = [], vistos = {};
    filas.forEach(function (f, i) {
      var rut = normRut_(f.rut);
      var nombre = limpiar_(f.nombre, 120);
      var curso = limpiar_(f.curso, 40);
      var err = !rut || !rutValido_(rut) ? 'RUT inválido' : !nombre ? 'Falta el nombre' : vistos[rut] ? 'RUT repetido en la lista' : '';
      if (err) { errores.push({ linea: i + 1, rut: String(f.rut || ''), motivo: err }); return; }
      vistos[rut] = true;
      var ex = indice[rut];
      if (ex) {
        if (String(ex.Nombre) !== nombre || String(ex.Curso) !== curso || String(ex.RUT) !== rut) {
          ex.RUT = rut; ex.Nombre = nombre; ex.Curso = curso; ex._cambio = true;
          actualizados++;
        } else sinCambios++;
      } else {
        nuevos.push({ RUT: rut, Nombre: nombre, Curso: curso, ClaveInicial: claveRut_(rut) });
      }
    });
    if (actualizados) escribirTodo_(t);
    agregarFilas_(t, nuevos);
    registrar_(actor_(s), 'Cargar estudiantes', nuevos.length + ' nuevos, ' + actualizados + ' actualizados, ' + errores.length + ' con error');
    return { nuevos: nuevos.length, actualizados: actualizados, sinCambios: sinCambios, errores: errores };
  });
}

function accAsignar_(d, token) {
  var s = sesion_(token, 'utp');
  return conLock_(function () {
    var t = leer_('Estudiantes');
    var u = buscar_(t, 'RUT', normRut_(d.rut), normRut_);
    if (!u) throw falla_('No encontré a ese estudiante.');
    var destino = String(d.familia || '');
    var antes = String(u.Familia || '');
    if (destino === antes) return true;
    if (destino) {
      var f = familiasConConteo_(t).filter(function (x) { return x.id === destino; })[0];
      if (!f) throw falla_('Esa familia no existe.');
      if (f.inscritos >= f.cupo) throw falla_('La ' + f.nombre + ' no tiene cupos disponibles.', 'LLENO');
      u.Familia = destino;
      u.FechaInscripcion = ahora_();
      u.InscritoPor = 'UTP (' + s.id + ')';
    } else {
      u.Familia = ''; u.FechaInscripcion = ''; u.InscritoPor = '';
    }
    escribirFila_(t, u);
    registrar_(actor_(s), destino ? 'Asignar familia' : 'Quitar inscripción',
      normRut_(u.RUT) + ': ' + (antes || '—') + ' → ' + (destino || '—'));
    return true;
  });
}

/** Acciones sobre varios estudiantes a la vez: asignar, quitar, restablecer o eliminar. */
function accMasivo_(d, token) {
  var s = sesion_(token, 'utp');
  var ruts = (Array.isArray(d.ruts) ? d.ruts : []).map(normRut_).filter(String);
  if (!ruts.length) throw falla_('No hay estudiantes seleccionados.');
  if (ruts.length > 3000) throw falla_('Son demasiados estudiantes de una vez.');
  var accion = String(d.accion || '');
  return conLock_(function () {
    var t = leer_('Estudiantes');
    var marcados = {};
    ruts.forEach(function (r) { marcados[r] = true; });
    var objetivo = t.filas.filter(function (f) { return marcados[normRut_(f.RUT)]; });
    var res = { hechos: 0, omitidos: 0, sinCupo: 0 };
    if (accion === 'asignar') {
      var f = familiasConConteo_(t).filter(function (x) { return x.id === String(d.familia); })[0];
      if (!f) throw falla_('Esa familia no existe.');
      var libres = f.cupo - f.inscritos;
      objetivo.forEach(function (u) {
        if (String(u.Familia) === f.id) { res.omitidos++; return; }
        if (libres <= 0) { res.sinCupo++; return; }
        u.Familia = f.id; u.FechaInscripcion = ahora_(); u.InscritoPor = 'UTP (' + s.id + ')';
        libres--; res.hechos++;
      });
      if (res.hechos) escribirTodo_(t);
    } else if (accion === 'quitar') {
      objetivo.forEach(function (u) {
        if (!u.Familia) { res.omitidos++; return; }
        u.Familia = ''; u.FechaInscripcion = ''; u.InscritoPor = ''; res.hechos++;
      });
      if (res.hechos) escribirTodo_(t);
    } else if (accion === 'restablecer') {
      objetivo.forEach(function (u) {
        if (!u.ClaveHash) { res.omitidos++; return; }
        u.ClaveHash = ''; u.Sal = ''; u.ClaveInicial = claveRut_(u.RUT); res.hechos++;
      });
      if (res.hechos) escribirTodo_(t);
    } else if (accion === 'eliminar') {
      var quedan = t.filas.filter(function (f) { return !marcados[normRut_(f.RUT)]; });
      var borrar = t.filas.length - quedan.length;
      if (borrar) {
        if (quedan.length) t.sh.getRange(2, 1, quedan.length, t.enc.length).setValues(quedan.map(function (o) { return filaComoArreglo_(t, o); }));
        t.sh.getRange(2 + quedan.length, 1, borrar, t.enc.length).clearContent();
      }
      res.hechos = borrar;
    } else {
      throw falla_('Acción desconocida.');
    }
    registrar_(actor_(s), 'Acción masiva: ' + accion, res.hechos + ' estudiantes' + (d.familia ? ' → ' + d.familia : '') +
      (res.sinCupo ? ', ' + res.sinCupo + ' sin cupo' : ''));
    return res;
  });
}

function accRestablecerClave_(d, token) {
  var s = sesion_(token, 'utp');
  return conLock_(function () {
    var t = leer_('Estudiantes');
    var u = buscar_(t, 'RUT', normRut_(d.rut), normRut_);
    if (!u) throw falla_('No encontré a ese estudiante.');
    u.ClaveInicial = claveRut_(u.RUT);
    u.ClaveHash = ''; u.Sal = '';
    escribirFila_(t, u);
    registrar_(actor_(s), 'Restablecer clave', normRut_(u.RUT));
    return { clave: u.ClaveInicial };
  });
}

function accEliminarEstudiante_(d, token) {
  var s = sesion_(token, 'utp');
  return conLock_(function () {
    var t = leer_('Estudiantes');
    var u = buscar_(t, 'RUT', normRut_(d.rut), normRut_);
    if (!u) throw falla_('No encontré a ese estudiante.');
    t.sh.deleteRow(u._fila);
    registrar_(actor_(s), 'Eliminar estudiante', normRut_(u.RUT) + ' ' + u.Nombre);
    return true;
  });
}

function accGuardarFamilia_(d, token) {
  var s = sesion_(token, 'utp');
  return conLock_(function () {
    var tf = leer_('Familias');
    var f = buscar_(tf, 'ID', String(d.id));
    if (!f) throw falla_('Esa familia no existe.');
    var nombre = limpiar_(d.nombre, 60);
    var electivos = (Array.isArray(d.electivos) ? d.electivos : String(d.electivos || '').split(/[;\n]/))
      .map(function (e) { return limpiar_(e, 80); }).filter(String);
    var cupo = Math.floor(Number(d.cupo));
    if (!nombre) throw falla_('La familia necesita un nombre.');
    if (!electivos.length) throw falla_('Agrega al menos un electivo.');
    if (!(cupo >= 1 && cupo <= APP.cupoMax)) throw falla_('El cupo debe ser un número entre 1 y ' + APP.cupoMax + '.');
    var conteo = familiasConConteo_(leer_('Estudiantes')).filter(function (x) { return x.id === f.ID; })[0];
    if (conteo && cupo < conteo.inscritos) {
      throw falla_('Esta familia ya tiene ' + conteo.inscritos + ' inscritos; el cupo no puede ser menor.');
    }
    f.Nombre = nombre; f.Electivos = electivos.join('; '); f.Cupo = String(cupo);
    escribirFila_(tf, f);
    registrar_(actor_(s), 'Editar familia', f.ID + ' ' + nombre + ' cupo ' + cupo);
    return true;
  });
}

function accAgregarFamilia_(d, token) {
  var s = sesion_(token, 'utp');
  return conLock_(function () {
    var tf = leer_('Familias');
    var max = 0;
    tf.filas.forEach(function (f) { var n = Number(String(f.ID).replace(/\D/g, '')); if (n > max) max = n; });
    var id = 'F' + (max + 1);
    agregarFilas_(tf, [{ ID: id, Nombre: 'Familia ' + (max + 1), Electivos: 'Electivo 1; Electivo 2; Electivo 3', Cupo: '25' }]);
    registrar_(actor_(s), 'Agregar familia', id);
    return { id: id };
  });
}

function accEliminarFamilia_(d, token) {
  var s = sesion_(token, 'utp');
  return conLock_(function () {
    var tf = leer_('Familias');
    var f = buscar_(tf, 'ID', String(d.id));
    if (!f) throw falla_('Esa familia no existe.');
    var c = familiasConConteo_(leer_('Estudiantes')).filter(function (x) { return x.id === f.ID; })[0];
    if (c && c.inscritos > 0) throw falla_('No se puede eliminar: tiene ' + c.inscritos + ' estudiantes inscritos.');
    tf.sh.deleteRow(f._fila);
    registrar_(actor_(s), 'Eliminar familia', f.ID + ' ' + f.Nombre);
    return true;
  });
}

/** Copia las inscripciones a una hoja "Exportación" y devuelve su enlace. */
function accExportarHoja_(d, token) {
  var s = sesion_(token, 'utp');
  var t = leer_('Estudiantes');
  var fams = familiasConConteo_(t);
  var nombreFam = {};
  fams.forEach(function (f) { nombreFam[f.id] = f.nombre; });
  var orden = {};
  fams.forEach(function (f, i) { orden[f.id] = i; });
  var filtro = String(d.familia || '');
  var filas = t.filas.filter(function (f) {
    return String(f.RUT).trim() && (!filtro || (filtro === 'SIN' ? !f.Familia : String(f.Familia) === filtro));
  }).sort(function (a, b) {
    var oa = a.Familia ? orden[a.Familia] : 999, ob = b.Familia ? orden[b.Familia] : 999;
    return oa - ob || String(a.Curso).localeCompare(String(b.Curso)) || String(a.Nombre).localeCompare(String(b.Nombre));
  }).map(function (f) {
    return [nombreFam[f.Familia] || (f.Familia ? f.Familia : 'Sin inscribir'), normRut_(f.RUT), f.Nombre, f.Curso, f.FechaInscripcion, f.InscritoPor];
  });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Exportación') || ss.insertSheet('Exportación');
  sh.clear();
  var datos = [['Familia', 'RUT', 'Nombre', 'Curso', 'Fecha inscripción', 'Inscrito por']].concat(filas);
  sh.getRange(1, 1, datos.length, 6).setNumberFormat('@').setValues(datos);
  sh.getRange(1, 1, 1, 6).setFontWeight('bold');
  sh.setFrozenRows(1);
  registrar_(actor_(s), 'Exportar a planilla', filtro || 'todas');
  return { url: ss.getUrl() + '#gid=' + sh.getSheetId(), filas: filas.length };
}

function accGuardarApariencia_(d, token) {
  var s = sesion_(token, 'utp');
  var color = function (c) {
    c = String(c || '').trim();
    if (c && !/^#[0-9a-fA-F]{6}$/.test(c)) throw falla_('Color inválido: ' + c);
    return c.toUpperCase();
  };
  var logo = function (l) {
    l = String(l || '');
    if (l && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(l)) throw falla_('El logo debe ser una imagen PNG, JPG o WEBP.');
    if (l.length > 48000) throw falla_('El logo es demasiado pesado. Usa una imagen más pequeña.');
    return l;
  };
  var cambios = { colorPrimario: color(d.primario), colorSecundario: color(d.secundario), logo1: logo(d.logo1), logo2: logo(d.logo2) };
  return conLock_(function () {
    guardarConfig_(cambios);
    registrar_(actor_(s), 'Cambiar apariencia', 'colores ' + cambios.colorPrimario + ' ' + cambios.colorSecundario +
      ', logos: ' + [cambios.logo1, cambios.logo2].filter(String).length);
    return tema_(config_());
  });
}

/* ------------------------------------------------------------
 *  Reglas del proceso
 * ------------------------------------------------------------ */

function proceso_(cfg) {
  var ahora = Date.now();
  var apertura = Number(cfg.apertura) || 0;
  var cierre = Number(cfg.cierre) || 0;
  var manual = String(cfg.procesoAbierto).toUpperCase() === 'SI';
  var estado = !manual ? 'cerrado'
    : apertura && ahora < apertura ? 'programado'
    : cierre && ahora >= cierre ? 'finalizado'
    : 'abierto';
  return { manual: manual, apertura: apertura || null, cierre: cierre || null, estado: estado, abierto: estado === 'abierto', ahora: ahora };
}

function familiasConConteo_(tEstudiantes) {
  var conteo = {};
  tEstudiantes.filas.forEach(function (f) {
    var id = String(f.Familia || '');
    if (id && String(f.RUT).trim()) conteo[id] = (conteo[id] || 0) + 1;
  });
  return leer_('Familias').filas.filter(function (f) { return String(f.ID).trim(); }).map(function (f) {
    var cupo = Math.max(0, Math.floor(Number(f.Cupo) || 0));
    var inscritos = conteo[String(f.ID)] || 0;
    return {
      id: String(f.ID),
      nombre: String(f.Nombre || f.ID),
      electivos: String(f.Electivos || '').split(';').map(function (e) { return e.trim(); }).filter(String),
      cupo: cupo,
      inscritos: inscritos,
      libres: Math.max(0, cupo - inscritos)
    };
  });
}

/* ------------------------------------------------------------
 *  Sesiones, claves y RUT
 * ------------------------------------------------------------ */

function crearSesion_(s) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  guardarSesion_(token, s);
  return token;
}

function guardarSesion_(token, s) {
  CacheService.getScriptCache().put('S' + token, JSON.stringify(s), APP.sesionSeg);
}

function sesion_(token, rol, permitirCambioClave) {
  if (!token) throw falla_('Tu sesión expiró. Vuelve a entrar.', 'SESION');
  var raw = CacheService.getScriptCache().get('S' + token);
  if (!raw) throw falla_('Tu sesión expiró. Vuelve a entrar.', 'SESION');
  var s = JSON.parse(raw);
  if (rol && s.rol !== rol) throw falla_('No tienes permiso para hacer esto.', 'SESION');
  if (s.debeCambiar && !permitirCambioClave) throw falla_('Primero debes cambiar tu clave.', 'CAMBIAR');
  guardarSesion_(token, s); // renueva la duración
  return s;
}

function buscarUsuario_(t, s) {
  return s.rol === 'utp' ? buscar_(t, 'Usuario', s.id, normUsuario_) : buscar_(t, 'RUT', s.id, normRut_);
}

function actor_(s) {
  return (s.rol === 'utp' ? 'UTP ' : '') + s.id;
}

function hash_(clave, sal) {
  var d = String(sal) + '|' + String(clave);
  for (var i = 0; i < 100; i++) {
    d = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, d, Utilities.Charset.UTF_8));
  }
  return d;
}

function generarClave_() {
  var abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin letras/números que se confunden (0/O, 1/I/L)
  var hex = Utilities.getUuid().replace(/-/g, '');
  var out = '';
  for (var i = 0; i < 6; i++) out += abc.charAt(parseInt(hex.substr(i * 2, 2), 16) % abc.length);
  return out;
}

/** Clave de estudiante: últimos 4 caracteres del RUT sin puntos ni guion (incluye el dígito verificador). */
function claveRut_(rut) {
  return normRut_(rut).replace('-', '').slice(-4);
}

function normUsuario_(u) {
  return String(u || '').trim().toLowerCase();
}

/** "12.345.678-k" → "12345678-K" */
function normRut_(r) {
  r = String(r || '').toUpperCase().replace(/[^0-9K]/g, '');
  if (r.length < 2) return '';
  var cuerpo = r.slice(0, -1).replace(/^0+/, '');
  if (!cuerpo || /K/.test(cuerpo)) return '';
  return cuerpo + '-' + r.slice(-1);
}

function rutValido_(rut) {
  var m = /^(\d{1,9})-([\dK])$/.exec(rut);
  if (!m) return false;
  var suma = 0, mul = 2;
  for (var i = m[1].length - 1; i >= 0; i--) {
    suma += Number(m[1].charAt(i)) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  var dv = 11 - (suma % 11);
  return (dv === 11 ? '0' : dv === 10 ? 'K' : String(dv)) === m[2];
}

/* ------------------------------------------------------------
 *  Acceso a la planilla
 * ------------------------------------------------------------ */

function hoja_(nombre) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!sh) throw falla_('Falta la hoja "' + nombre + '". Abre la planilla y usa el menú Selector de Electivos → Instalar o reparar.');
  return sh;
}

/** Lee una hoja completa como lista de objetos { columna: valor, _fila: n }. */
function leer_(nombre) {
  var sh = hoja_(nombre);
  var valores = sh.getDataRange().getValues();
  var enc = (valores[0] || []).map(function (h) { return String(h).trim(); });
  var filas = [];
  for (var i = 1; i < valores.length; i++) {
    var o = { _fila: i + 1 };
    for (var j = 0; j < enc.length; j++) o[enc[j]] = valores[i][j] === null ? '' : valores[i][j];
    filas.push(o);
  }
  return { sh: sh, enc: enc, filas: filas };
}

function filaComoArreglo_(t, o) {
  return t.enc.map(function (k) { return o[k] === undefined || o[k] === null ? '' : o[k]; });
}

function escribirFila_(t, o) {
  t.sh.getRange(o._fila, 1, 1, t.enc.length).setValues([filaComoArreglo_(t, o)]);
}

function escribirTodo_(t) {
  if (!t.filas.length) return;
  t.sh.getRange(2, 1, t.filas.length, t.enc.length).setValues(t.filas.map(function (o) { return filaComoArreglo_(t, o); }));
}

function agregarFilas_(t, objs) {
  if (!objs.length) return;
  var inicio = t.sh.getLastRow() + 1;
  t.sh.getRange(inicio, 1, objs.length, t.enc.length).setValues(objs.map(function (o) { return filaComoArreglo_(t, o); }));
  objs.forEach(function (o, i) { o._fila = inicio + i; t.filas.push(o); });
}

function buscar_(t, col, valor, norm) {
  norm = norm || function (x) { return String(x).trim(); };
  var v = norm(valor);
  if (!v) return null;
  for (var i = 0; i < t.filas.length; i++) if (norm(t.filas[i][col]) === v) return t.filas[i];
  return null;
}

function config_() {
  var o = {};
  leer_('Config').filas.forEach(function (f) { if (f.Clave) o[String(f.Clave).trim()] = String(f.Valor); });
  return o;
}

function guardarConfig_(cambios) {
  var t = leer_('Config');
  var nuevos = [];
  Object.keys(cambios).forEach(function (k) {
    var f = buscar_(t, 'Clave', k);
    if (f) { f.Valor = cambios[k]; escribirFila_(t, f); }
    else nuevos.push({ Clave: k, Valor: cambios[k] });
  });
  agregarFilas_(t, nuevos);
}

function prepararHoja_(ss, nombre, columnas) {
  var sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  var enc = sh.getLastRow() ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String) : [];
  var faltan = columnas.filter(function (c) { return enc.indexOf(c) < 0; });
  if (!enc.filter(String).length) {
    sh.getRange(1, 1, 1, columnas.length).setValues([columnas]);
  } else if (faltan.length) {
    sh.getRange(1, enc.length + 1, 1, faltan.length).setValues([faltan]);
  }
  sh.getRange(1, 1, sh.getMaxRows(), Math.max(sh.getLastColumn(), columnas.length)).setNumberFormat('@');
  sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), columnas.length)).setFontWeight('bold');
  sh.setFrozenRows(1);
}

function registrar_(quien, accion, detalle) {
  try {
    hoja_('Registro').appendRow([ahora_(), String(quien), String(accion), String(detalle || '').slice(0, 500)]);
  } catch (e) { console.error(e); }
}

/* ------------------------------------------------------------
 *  Utilidades
 * ------------------------------------------------------------ */

function conLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw falla_('Hay muchas personas usando el sistema en este momento. Inténtalo de nuevo en unos segundos.');
  }
  try {
    var r = fn();
    SpreadsheetApp.flush();
    return r;
  } finally {
    lock.releaseLock();
  }
}

function falla_(mensaje, code) {
  var e = new Error(mensaje);
  e.mensajeUsuario = mensaje;
  e.code = code || '';
  return e;
}

function ahora_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm:ss');
}

/** Quita espacios extra y evita que un texto se interprete como fórmula. */
function limpiar_(v, max) {
  return String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, max || 200);
}

function esDueno_() {
  try {
    var a = Session.getActiveUser().getEmail();
    var e = Session.getEffectiveUser().getEmail();
    return !!a && a === e;
  } catch (err) {
    return false;
  }
}

function avisar_(m) {
  try { SpreadsheetApp.getUi().alert(m); } catch (e) { Logger.log(m); }
}
