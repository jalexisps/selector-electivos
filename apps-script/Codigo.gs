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
  Familias: ['ID', 'Nombre', 'Electivos', 'Cupo', 'Nivel'],
  Estudiantes: ['RUT', 'Nombre', 'Curso', 'ClaveInicial', 'ClaveHash', 'Sal', 'Familia', 'FechaInscripcion', 'InscritoPor', 'Nivel'],
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

// Niveles que participan del proceso. Cada familia pertenece a un nivel y cada estudiante
// solo ve (y solo puede inscribirse en) las familias de su nivel.
var NIVELES = ['2° Medio', '3° Medio'];

var FAMILIAS_INICIALES = [
  ['F1', 'Familia 1', 'Ciencias de la salud; Creación y composición musical; Comprensión histórica del presente', '25'],
  ['F2', 'Familia 2', 'Probabilidades y estadística descriptiva e inferencial; Estética; Física', '25'],
  ['F3', 'Familia 3', 'Ciencias de la salud; Comprensión histórica del presente; Probabilidades y estadística descriptiva e inferencial', '25']
];

/**
 * Textos que la UTP puede cambiar desde la pestaña "Textos" sin tocar el código.
 * Se guardan en la hoja Config con la clave "texto.<clave>"; si están vacíos se usa el original.
 *   **palabras** → negrita · {variable} → dato que pone el sistema · Enter → salto de línea
 *   linea: true    → campo de una sola línea
 *   opcional: true → puede quedar vacío (y entonces no se muestra)
 *   alcance        → quién lo ve: general, login (entrada), est (estudiantes de todos los niveles), ficha
 */
var TEXTOS = [
  { clave: 'app.titulo', alcance: 'general', grupo: 'General', titulo: 'Nombre del sistema', linea: true,
    ayuda: 'Aparece en la pantalla de entrada, la barra superior y las fichas de acceso.',
    def: 'Selector de Electivos' },

  { clave: 'login.aviso', alcance: 'login', grupo: 'Pantalla de entrada', titulo: 'Aviso en la entrada', opcional: true,
    ayuda: 'Opcional. Un recuadro destacado sobre el formulario (por ejemplo, las fechas del proceso). Déjalo vacío para no mostrarlo.',
    def: '' },
  { clave: 'login.ayudaEstudiante', alcance: 'login', grupo: 'Pantalla de entrada', titulo: 'Ayuda para estudiantes',
    ayuda: 'Debajo del botón Entrar, cuando está elegido "Estudiante".',
    def: 'Tu clave son los **últimos 4 dígitos de tu RUT**, contando el dígito verificador.\nEjemplo: 12.345.**678-5** → **6785**' },
  { clave: 'login.ayudaUtp', alcance: 'login', grupo: 'Pantalla de entrada', titulo: 'Ayuda para la UTP',
    ayuda: 'Debajo del botón Entrar, cuando está elegido "UTP".',
    def: 'Acceso para la Unidad Técnico Pedagógica.' },

  { clave: 'est.saludo', alcance: 'est', grupo: 'Página del estudiante', titulo: 'Saludo', linea: true, vars: ['nombre', 'nivel', 'nivelSiguiente'],
    def: 'Hola, {nombre}' },
  { clave: 'est.instruccion', alcance: 'est', grupo: 'Página del estudiante', titulo: 'Instrucción bajo el saludo', vars: ['nombre', 'nivel', 'nivelSiguiente'],
    def: 'Elige la familia de electivos que cursarás en **{nivelSiguiente}**. Cada familia agrupa tres asignaturas.' },
  { clave: 'est.aviso', alcance: 'est', grupo: 'Página del estudiante', titulo: 'Aviso para estudiantes', opcional: true, vars: ['nombre', 'nivel', 'nivelSiguiente'],
    ayuda: 'Opcional. Un recuadro destacado sobre las familias (por ejemplo, una charla o un plazo). Déjalo vacío para no mostrarlo.',
    def: '' },
  { clave: 'est.sinFamilias', alcance: 'est', grupo: 'Página del estudiante', titulo: 'Cuando su nivel no tiene familias', vars: ['nivel', 'nivelSiguiente'],
    def: 'Todavía no hay familias de electivos para {nivel}.\nConsulta con la Unidad Técnico Pedagógica.' },
  { clave: 'est.confirmar', alcance: 'est', grupo: 'Página del estudiante', titulo: 'Advertencia al confirmar la elección', vars: ['familia', 'nivelSiguiente'],
    ayuda: 'En la ventana que aparece al presionar "Elegir".',
    def: 'Tu elección es **definitiva**. Solo la UTP puede cambiarla después.' },

  { clave: 'proc.abiertoTitulo', alcance: 'est', grupo: 'Estado de la inscripción', titulo: 'Abierta · título', linea: true,
    def: 'La inscripción está abierta' },
  { clave: 'proc.abiertoTexto', alcance: 'est', grupo: 'Estado de la inscripción', titulo: 'Abierta · texto', vars: ['cupos'],
    ayuda: '{cupos} se reemplaza por "25 cupos" (o "cupos limitados" si las familias tienen cupos distintos).',
    def: 'Cada familia tiene {cupos} y se bloquea cuando se completa.' },
  { clave: 'proc.abiertoCierre', alcance: 'est', grupo: 'Estado de la inscripción', titulo: 'Abierta · fecha de cierre', opcional: true, vars: ['cierre'],
    ayuda: 'Se agrega al texto anterior solo cuando hay un cierre programado.',
    def: 'Cierra el {cierre}.' },
  { clave: 'proc.programadoTitulo', alcance: 'est', grupo: 'Estado de la inscripción', titulo: 'Programada · título', linea: true,
    def: 'La inscripción todavía no comienza' },
  { clave: 'proc.programadoTexto', alcance: 'est', grupo: 'Estado de la inscripción', titulo: 'Programada · texto', vars: ['apertura'],
    def: 'Abre el {apertura}. Mientras tanto puedes revisar las familias.' },
  { clave: 'proc.cerradoTitulo', alcance: 'est', grupo: 'Estado de la inscripción', titulo: 'Cerrada · título', linea: true,
    def: 'La inscripción está cerrada' },
  { clave: 'proc.cerradoTexto', alcance: 'est', grupo: 'Estado de la inscripción', titulo: 'Cerrada · texto',
    def: 'Si no alcanzaste a inscribirte, conversa con la Unidad Técnico Pedagógica.' },

  { clave: 'comp.titulo', alcance: 'est', grupo: 'Comprobante de inscripción', titulo: 'Título', linea: true, vars: ['nombre', 'familia', 'nivelSiguiente'],
    def: 'Quedaste inscrito' },
  { clave: 'comp.subtitulo', alcance: 'est', grupo: 'Comprobante de inscripción', titulo: 'Subtítulo', vars: ['nombre', 'familia', 'nivelSiguiente'],
    def: 'Tu elección quedó registrada.' },
  { clave: 'comp.nota', alcance: 'est', grupo: 'Comprobante de inscripción', titulo: 'Nota final', opcional: true, vars: ['nombre', 'familia', 'nivelSiguiente'],
    def: 'Si necesitas cambiar de familia, conversa con la Unidad Técnico Pedagógica.' },

  { clave: 'ficha.instrucciones', alcance: 'ficha', grupo: 'Fichas de acceso (impresas)', titulo: 'Instrucciones', vars: ['enlace'],
    ayuda: 'Al pie de cada ficha. {enlace} es el enlace para estudiantes configurado en Proceso.',
    def: 'Entra en: **{enlace}**\nElige “Estudiante”, escribe tu RUT y esta clave (los últimos 4 dígitos de tu RUT).' }
];
var TEXTO_MAX = 800;

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
  guardarApariencia: accGuardarApariencia_,
  guardarTextos: accGuardarTextos_,
  // Administración
  admin: accAdmin_,
  historial: accHistorial_,
  limpiar: accLimpiar_
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
  return { colegio: cfg.colegio || LICEO.nombre, tema: tema_(cfg), textos: textos_(cfg) };
}

/** Textos vigentes: los que guardó la UTP o, si no hay, los originales. */
function textos_(cfg) {
  var o = {};
  TEXTOS.forEach(function (t) {
    var v = cfg['texto.' + t.clave];
    o[t.clave] = v === undefined || (v === '' && !t.opcional) ? t.def : v;
  });
  return o;
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
    if (!familiaParaNivel_(f, nivelEstudiante_(u))) throw falla_('Esa familia no corresponde a tu nivel.');
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
  var nivel = nivelEstudiante_(u), propia = String(u.Familia || '');
  return {
    estudiante: {
      rut: normRut_(u.RUT), nombre: String(u.Nombre), curso: String(u.Curso || ''), nivel: nivel,
      familia: propia, fecha: String(u.FechaInscripcion || '')
    },
    // Solo las familias de su nivel (y la suya, si la UTP lo dejó en otra)
    familias: familiasConConteo_(t).filter(function (f) { return familiaParaNivel_(f, nivel) || f.id === propia; }),
    proceso: proceso_(cfg),
    colegio: cfg.colegio || LICEO.nombre,
    textos: textos_(cfg)
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
    textos: textos_(cfg),
    catalogoTextos: TEXTOS,
    niveles: NIVELES.slice(),
    estudiantes: t.filas.filter(function (f) { return String(f.RUT).trim(); }).map(function (f) {
      return {
        rut: normRut_(f.RUT) || String(f.RUT),
        nombre: String(f.Nombre || ''),
        curso: String(f.Curso || ''),
        nivel: nivelEstudiante_(f),
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
      var nivel = normNivel_(f.nivel) || nivelDeCurso_(curso);
      var err = !rut || !rutValido_(rut) ? 'RUT inválido' : !nombre ? 'Falta el nombre'
        : !nivel ? 'Falta el nivel (' + NIVELES.join(' o ') + ')' : vistos[rut] ? 'RUT repetido en la lista' : '';
      if (err) { errores.push({ linea: i + 1, rut: String(f.rut || ''), motivo: err }); return; }
      vistos[rut] = true;
      var ex = indice[rut];
      if (ex) {
        if (String(ex.Nombre) !== nombre || String(ex.Curso) !== curso || String(ex.RUT) !== rut || String(ex.Nivel || '') !== nivel) {
          if (ex.Familia && nivelEstudiante_(ex) !== nivel) {
            errores.push({ linea: i + 1, rut: rut, motivo: 'Ya está inscrito en una familia de ' + nivelEstudiante_(ex) + '; quítale la inscripción antes de cambiarle el nivel' });
            return;
          }
          ex.RUT = rut; ex.Nombre = nombre; ex.Curso = curso; ex.Nivel = nivel;
          actualizados++;
        } else sinCambios++;
      } else {
        nuevos.push({ RUT: rut, Nombre: nombre, Curso: curso, Nivel: nivel, ClaveInicial: claveRut_(rut) });
      }
    });
    if (actualizados) escribirTodo_(t);
    agregarFilas_(t, nuevos);
    registrar_(actor_(s), 'Registrar estudiantes', nuevos.length + ' nuevos, ' + actualizados + ' actualizados, ' + errores.length + ' con error');
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
      if (!familiaParaNivel_(f, nivelEstudiante_(u))) {
        throw falla_('La ' + f.nombre + ' es de ' + f.nivel + ' y este estudiante es de ' + (nivelEstudiante_(u) || 'un nivel sin definir') + '.', 'NIVEL');
      }
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
    var res = { hechos: 0, omitidos: 0, sinCupo: 0, otroNivel: 0 };
    if (accion === 'asignar') {
      var f = familiasConConteo_(t).filter(function (x) { return x.id === String(d.familia); })[0];
      if (!f) throw falla_('Esa familia no existe.');
      var libres = f.cupo - f.inscritos;
      objetivo.forEach(function (u) {
        if (String(u.Familia) === f.id) { res.omitidos++; return; }
        if (!familiaParaNivel_(f, nivelEstudiante_(u))) { res.otroNivel++; return; }
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
      (res.sinCupo ? ', ' + res.sinCupo + ' sin cupo' : '') + (res.otroNivel ? ', ' + res.otroNivel + ' de otro nivel' : ''));
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
    var nivel = d.nivel === undefined ? String(f.Nivel || '') : normNivel_(d.nivel);
    if (d.nivel && !nivel) throw falla_('Nivel inválido.');
    if (!nombre) throw falla_('La familia necesita un nombre.');
    if (!electivos.length) throw falla_('Agrega al menos un electivo.');
    if (!(cupo >= 1 && cupo <= APP.cupoMax)) throw falla_('El cupo debe ser un número entre 1 y ' + APP.cupoMax + '.');
    var conteo = familiasConConteo_(leer_('Estudiantes')).filter(function (x) { return x.id === f.ID; })[0];
    if (conteo && cupo < conteo.inscritos) {
      throw falla_('Esta familia ya tiene ' + conteo.inscritos + ' inscritos; el cupo no puede ser menor.');
    }
    if (nivel && conteo && conteo.inscritos) {
      var otro = leer_('Estudiantes').filas.filter(function (e) { return String(e.Familia) === f.ID && nivelEstudiante_(e) !== nivel; }).length;
      if (otro) throw falla_('No se puede dejar en ' + nivel + ': tiene ' + otro + ' inscrito' + (otro === 1 ? '' : 's') + ' de otro nivel.');
    }
    f.Nombre = nombre; f.Electivos = electivos.join('; '); f.Cupo = String(cupo); f.Nivel = nivel;
    escribirFila_(tf, f);
    registrar_(actor_(s), 'Editar familia', f.ID + ' ' + nombre + ' cupo ' + cupo + (nivel ? ' · ' + nivel : ''));
    return true;
  });
}

function accAgregarFamilia_(d, token) {
  var s = sesion_(token, 'utp');
  return conLock_(function () {
    var tf = leer_('Familias');
    var nivel = normNivel_(d.nivel);
    var max = 0;
    tf.filas.forEach(function (f) { var n = Number(String(f.ID).replace(/\D/g, '')); if (n > max) max = n; });
    var id = 'F' + (max + 1);
    var delNivel = tf.filas.filter(function (f) { return String(f.ID).trim() && String(f.Nivel || '') === nivel; }).length;
    agregarFilas_(tf, [{ ID: id, Nombre: 'Familia ' + (delNivel + 1), Electivos: 'Electivo 1; Electivo 2; Electivo 3', Cupo: '25', Nivel: nivel }]);
    registrar_(actor_(s), 'Agregar familia', id + (nivel ? ' · ' + nivel : ''));
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
    return [nombreFam[f.Familia] || (f.Familia ? f.Familia : 'Sin inscribir'), nivelEstudiante_(f), normRut_(f.RUT), f.Nombre, f.Curso, f.FechaInscripcion, f.InscritoPor];
  });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Exportación') || ss.insertSheet('Exportación');
  sh.clear();
  var datos = [['Familia', 'Nivel', 'RUT', 'Nombre', 'Curso', 'Fecha inscripción', 'Inscrito por']].concat(filas);
  sh.getRange(1, 1, datos.length, 7).setNumberFormat('@').setValues(datos);
  sh.getRange(1, 1, 1, 7).setFontWeight('bold');
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

/**
 * Guarda los textos editables. d.textos = { clave: texto }; solo se aceptan claves del catálogo.
 * Un texto igual al original (o vacío, si no es opcional) vuelve a seguir al original.
 */
function accGuardarTextos_(d, token) {
  var s = sesion_(token, 'utp');
  var entrada = d.textos && typeof d.textos === 'object' ? d.textos : {};
  var porClave = {};
  TEXTOS.forEach(function (t) { porClave[t.clave] = t; });
  var claves = Object.keys(entrada);
  if (!claves.length) throw falla_('No hay textos para guardar.');
  var guardar = {}, quitar = [], nombres = [];
  claves.forEach(function (k) {
    var t = porClave[k];
    if (!t) throw falla_('Texto desconocido: ' + k);
    var v = String(entrada[k] == null ? '' : entrada[k])
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
      .split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).join('\n')
      .replace(/^\s+|\s+$/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^[=+@]+/, '');
    if (t.linea) v = v.replace(/\s*\n\s*/g, ' ');
    if (v.length > TEXTO_MAX) throw falla_('«' + t.titulo + '» es demasiado largo (máximo ' + TEXTO_MAX + ' caracteres).');
    if (v === t.def || (!v && !t.opcional) || (!v && !t.def)) quitar.push('texto.' + k);
    else guardar['texto.' + k] = v;
    nombres.push(t.titulo);
  });
  return conLock_(function () {
    if (Object.keys(guardar).length) guardarConfig_(guardar);
    if (quitar.length) borrarConfig_(quitar);
    registrar_(actor_(s), 'Editar textos', nombres.join(', '));
    return textos_(config_());
  });
}

/* ---------- Administración ---------- */

/** Resumen para el panel de administración: tamaño del historial y sus últimos movimientos. */
function accAdmin_(d, token) {
  sesion_(token, 'utp');
  var r = leer_('Registro').filas.filter(function (f) { return String(f.Fecha || f.Accion).trim(); });
  return {
    historial: r.length,
    ultimos: r.slice(-40).reverse().map(function (f) {
      return { fecha: String(f.Fecha), usuario: String(f.Usuario), accion: String(f.Accion), detalle: String(f.Detalle || '') };
    })
  };
}

/** Historial completo (para el respaldo en Excel). */
function accHistorial_(d, token) {
  sesion_(token, 'utp');
  return leer_('Registro').filas.filter(function (f) { return String(f.Fecha || f.Accion).trim(); }).slice(-20000)
    .map(function (f) { return [String(f.Fecha), String(f.Usuario), String(f.Accion), String(f.Detalle || '')]; });
}

/**
 * Limpia registros del sistema.
 *   historial     → vacía la hoja Registro
 *   inscripciones → todos quedan sin familia (los estudiantes siguen cargados)
 *   claves        → todas las claves de estudiantes vuelven a los 4 dígitos del RUT
 *   estudiantes   → borra a los estudiantes
 *   todo          → borra estudiantes e historial y cierra el proceso (familias, usuarios y apariencia se mantienen)
 * "nivel" limita inscripciones, claves y estudiantes a un nivel. Las acciones que borran exigen escribir BORRAR.
 */
function accLimpiar_(d, token) {
  var s = sesion_(token, 'utp');
  var tipo = String(d.tipo || '');
  if (['historial', 'inscripciones', 'claves', 'estudiantes', 'todo'].indexOf(tipo) < 0) throw falla_('Acción desconocida.');
  var nivel = tipo === 'historial' || tipo === 'todo' ? '' : normNivel_(d.nivel);
  if (d.nivel && !nivel && tipo !== 'historial' && tipo !== 'todo') throw falla_('Nivel inválido.');
  if (['historial', 'estudiantes', 'todo'].indexOf(tipo) >= 0 && String(d.confirmacion || '').trim().toUpperCase() !== 'BORRAR') {
    throw falla_('Para confirmar escribe BORRAR.');
  }
  return conLock_(function () {
    var n = 0;
    if (tipo === 'historial' || tipo === 'todo') {
      var tr = leer_('Registro');
      n = tr.filas.length;
      if (n) tr.sh.getRange(2, 1, n, tr.enc.length).clearContent();
    }
    if (tipo !== 'historial') {
      var t = leer_('Estudiantes');
      var objetivo = t.filas.filter(function (f) { return String(f.RUT).trim() && (!nivel || nivelEstudiante_(f) === nivel); });
      if (tipo === 'inscripciones') {
        objetivo.forEach(function (u) { if (u.Familia) { u.Familia = ''; u.FechaInscripcion = ''; u.InscritoPor = ''; n++; } });
        if (n) escribirTodo_(t);
      } else if (tipo === 'claves') {
        objetivo.forEach(function (u) { if (u.ClaveHash) { u.ClaveHash = ''; u.Sal = ''; u.ClaveInicial = claveRut_(u.RUT); n++; } });
        if (n) escribirTodo_(t);
      } else {
        var borrar = {};
        objetivo.forEach(function (u) { borrar[u._fila] = true; });
        var quedan = t.filas.filter(function (f) { return String(f.RUT).trim() && !borrar[f._fila]; });
        var total = t.filas.length;
        if (quedan.length) t.sh.getRange(2, 1, quedan.length, t.enc.length).setValues(quedan.map(function (o) { return filaComoArreglo_(t, o); }));
        if (total > quedan.length) t.sh.getRange(2 + quedan.length, 1, total - quedan.length, t.enc.length).clearContent();
        if (tipo === 'todo') guardarConfig_({ procesoAbierto: 'NO' });
        n = objetivo.length;
      }
    }
    var nombres = { historial: 'Limpiar historial', inscripciones: 'Quitar inscripciones', claves: 'Restablecer claves', estudiantes: 'Eliminar estudiantes', todo: 'Reiniciar sistema' };
    registrar_(actor_(s), nombres[tipo], n + (tipo === 'historial' ? ' registros' : ' estudiantes') + (nivel ? ' de ' + nivel : ''));
    return { hechos: n };
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
      nivel: normNivel_(f.Nivel),
      electivos: String(f.Electivos || '').split(';').map(function (e) { return e.trim(); }).filter(String),
      cupo: cupo,
      inscritos: inscritos,
      libres: Math.max(0, cupo - inscritos)
    };
  });
}

/** Palabras y abreviaturas → número de nivel: "segundo", "2do", "2°" → "2". */
function numeroNivel_(v) {
  var t = String(v == null ? '' : v).toLowerCase().trim()
    .replace(/^primero?\b/, '1').replace(/^segundo\b/, '2').replace(/^tercero?\b/, '3').replace(/^cuarto\b/, '4');
  var m = /^([1-4])(?!\d)/.exec(t);
  return m ? m[1] : '';
}

/** "2° medio", "2do Medio", "2M", "2", "segundo medio" → "2° Medio" (solo niveles de NIVELES). */
function normNivel_(v) {
  var t = String(v == null ? '' : v).trim();
  if (!/^\S+(\s*(°|º))?(\s*(m|medio)\.?)?$/i.test(t)) return '';
  var n = numeroNivel_(t);
  return n && NIVELES.indexOf(n + '° Medio') >= 0 ? n + '° Medio' : '';
}

/** Deduce el nivel desde el curso: "2° Medio Ayun" → "2° Medio", "3°A" → "3° Medio". */
function nivelDeCurso_(curso) {
  var n = numeroNivel_(curso);
  return n && NIVELES.indexOf(n + '° Medio') >= 0 ? n + '° Medio' : '';
}

function nivelEstudiante_(f) {
  return normNivel_(f.Nivel) || nivelDeCurso_(f.Curso);
}

/** Una familia sin nivel la ven todos; una con nivel, solo los de ese nivel. */
function familiaParaNivel_(f, nivel) {
  return !f.nivel || f.nivel === nivel;
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
  // Si la planilla viene de una versión anterior, agrega solas las columnas nuevas (ej. Nivel).
  var faltan = enc.filter(String).length ? (HOJAS[nombre] || []).filter(function (c) { return enc.indexOf(c) < 0; }) : [];
  if (faltan.length) {
    while (enc.length && !enc[enc.length - 1]) enc.pop();
    sh.getRange(1, enc.length + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
    enc = enc.concat(faltan);
    valores = valores.map(function (fila) { fila = fila.slice(0, enc.length - faltan.length); while (fila.length < enc.length) fila.push(''); return fila; });
  }
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

/** Quita filas de Config (así esas claves vuelven a su valor original). */
function borrarConfig_(claves) {
  var t = leer_('Config');
  var quedan = t.filas.filter(function (f) { return String(f.Clave).trim() && claves.indexOf(String(f.Clave).trim()) < 0; });
  var total = t.filas.length;
  if (quedan.length === total) return;
  if (quedan.length) t.sh.getRange(2, 1, quedan.length, t.enc.length).setValues(quedan.map(function (o) { return filaComoArreglo_(t, o); }));
  t.sh.getRange(2 + quedan.length, 1, total - quedan.length, t.enc.length).clearContent();
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
