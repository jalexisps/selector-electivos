// Pruebas del backend: node test/backend.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const crearMock = require('./mock-gas.js');

let fallas = 0, pasadas = 0;
function ok(cond, msg) { if (cond) pasadas++; else { fallas++; console.log('  ✗ ' + msg); } }
function seccion(t) { console.log('• ' + t); }

const logs = [];
const mock = crearMock({
  digest: (s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
  log: (m) => logs.push(m)
});
const ctx = vm.createContext(Object.assign({ console }, mock.globals));
['Codigo.gs', 'Logo.gs'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script', f), 'utf8'), ctx, { filename: f }));
const api = (accion, datos, token) => JSON.parse(JSON.stringify(ctx.api({ accion, datos, token })));

function dv(n) { let s = 0, m = 2; String(n).split('').reverse().forEach((d) => { s += +d * m; m = m === 7 ? 2 : m + 1; }); const r = 11 - (s % 11); return r === 11 ? '0' : r === 10 ? 'K' : String(r); }
const rut = (n) => n + '-' + dv(n);
const fila = (h, o) => mock.hojas[h].data.slice(1).map((r) => Object.fromEntries(mock.hojas[h].data[0].map((k, i) => [k, r[i]]))).find(o);

seccion('RUT');
ok(ctx.rutValido_('11111111-1'), '11111111-1 válido');
ok(ctx.rutValido_(ctx.normRut_('12.345.678-5')), '12.345.678-5 válido');
ok(!ctx.rutValido_('12345678-9'), '12345678-9 inválido');
ok(ctx.normRut_('7.654.321-k') === '7654321-K', 'normaliza K');
ok(ctx.rutValido_(rut(100123456)), 'RUT provisorio 9 dígitos');
ok(ctx.claveRut_('12.345.678-5') === '6785', 'clave = últimos 4 con DV');
ok(ctx.claveRut_('7654321-k') === '321K', 'clave con K');
ok(ctx.claveRut_('123-4') === '1234', 'ejemplo 123-4 → 1234');

seccion('Instalación');
mock.fijarUsuarioActivo('');
ctx.instalar();
ok(!mock.hojas.Config, 'desde la web (usuario anónimo) no instala');
mock.fijarUsuarioActivo('dueno@gmail.com');
ctx.instalar();
['Config', 'Familias', 'Estudiantes', 'UTP', 'Registro'].forEach((h) => ok(!!mock.hojas[h], 'hoja ' + h));
ok(mock.hojas.Familias.getLastRow() === 4, '3 familias creadas');
const claveUtp = fila('UTP', (r) => r.Usuario === 'utp').ClaveInicial;
ok(/^[A-Z2-9]{6}$/.test(claveUtp), 'clave UTP generada: ' + claveUtp);
ok(logs.some((l) => l.includes(claveUtp)), 'clave UTP mostrada al dueño');
ctx.instalar();
ok(/Nahuelbuta/.test(api('publico', {}).data.colegio), 'nombre del liceo por defecto');
ok(mock.hojas.Familias.getLastRow() === 4 && mock.hojas.UTP.getLastRow() === 2 && mock.hojas.Config.getLastRow() === 6, 'reinstalar no duplica');

seccion('Acceso UTP');
let r = api('login', { rol: 'utp', usuario: 'UTP', clave: 'malaa' });
ok(!r.ok && /incorrectos/.test(r.error), 'clave mala rechazada');
r = api('login', { rol: 'utp', usuario: 'utp', clave: claveUtp.toLowerCase() });
ok(r.ok && r.data.debeCambiar, 'entra con clave inicial y debe cambiarla');
let tUtp = r.data.token;
ok(api('panel', {}, tUtp).code === 'CAMBIAR', 'no puede usar el panel antes de cambiar clave');
ok(!api('cambiarClave', { nueva: '123' }, tUtp).ok, 'clave corta rechazada');
ok(api('cambiarClave', { nueva: 'utp-segura-2026' }, tUtp).ok, 'cambia clave');
ok(api('panel', {}, tUtp).ok, 'panel disponible');
ok(api('login', { rol: 'utp', usuario: 'utp', clave: claveUtp }).ok === false, 'clave inicial ya no sirve');
ok(api('login', { rol: 'utp', usuario: 'utp', clave: 'utp-segura-2026' }).ok, 'entra con clave nueva');
ok(api('cambiarClave', { actual: 'otra', nueva: 'abcdefg' }, tUtp).ok === false, 'cambiar clave exige la actual');

seccion('Carga de estudiantes');
const filas = [];
for (let i = 0; i < 90; i++) filas.push({ rut: rut(20000000 + i * 137), nombre: 'Estudiante ' + i, curso: i % 2 ? '3°A' : '3°B' });
filas.push({ rut: '12345678-9', nombre: 'DV malo', curso: '3°A' });
filas.push({ rut: rut(20000000), nombre: 'Repetido', curso: '3°A' });
filas.push({ rut: rut(30000001), nombre: '', curso: '3°A' });
filas.push({ rut: rut(30000002), nombre: '=HYPERLINK("x")', curso: '3°A' });
r = api('importar', { filas }, tUtp);
ok(r.ok && r.data.nuevos === 91 && r.data.errores.length === 3, 'importa 91 y rechaza 3: ' + JSON.stringify(r.data && { n: r.data.nuevos, e: r.data.errores }));
ok(!String(fila('Estudiantes', (x) => x.RUT === rut(30000002)).Nombre).startsWith('='), 'evita fórmulas');
r = api('importar', { filas: [{ rut: rut(20000000), nombre: 'Estudiante 0 Corregido', curso: '3°B' }, { rut: rut(20000137), nombre: 'Estudiante 1', curso: '3°A' }] }, tUtp);
ok(r.ok && r.data.actualizados === 1 && r.data.sinCambios === 1 && r.data.nuevos === 0, 'actualiza existentes');
ok(fila('Estudiantes', (x) => x.RUT === rut(20000000)).Nombre === 'Estudiante 0 Corregido', 'nombre actualizado');
ok(api('importar', { filas }, 'token-falso').code === 'SESION', 'importar exige sesión');

seccion('Proceso');
const est = (i) => fila('Estudiantes', (x) => x.RUT === rut(20000000 + i * 137));
function entrarEstudiante(i) {
  const e = est(i);
  const l = api('login', { rol: 'estudiante', usuario: e.RUT, clave: ctx.claveRut_(e.RUT).toLowerCase() });
  if (!l.ok) throw new Error('login estudiante ' + i + ': ' + l.error);
  if (l.data.debeCambiar) throw new Error('estudiante no debería tener que cambiar clave');
  return l.data.token;
}
ok(fila('Estudiantes', (x) => x.RUT === rut(20000000 + 5 * 137)).ClaveInicial === ctx.claveRut_(rut(20000000 + 5 * 137)), 'clave inicial guardada = 4 dígitos');
ok(!api('login', { rol: 'estudiante', usuario: rut(20000000 + 6 * 137), clave: '0000' }).ok, 'clave de 4 dígitos equivocada rechazada');
let t0 = entrarEstudiante(0);
r = api('cambiarClave', { actual: ctx.claveRut_(rut(20000000)), nueva: 'mi-clave-propia' }, t0);
ok(r.ok, 'estudiante puede cambiar su clave voluntariamente');
ok(!api('login', { rol: 'estudiante', usuario: rut(20000000), clave: ctx.claveRut_(rut(20000000)) }).ok, 'tras cambiarla, los 4 dígitos ya no sirven');
t0 = api('login', { rol: 'estudiante', usuario: rut(20000000), clave: 'mi-clave-propia' }).data.token;
r = api('miEstado', {}, t0);
ok(r.ok && r.data.proceso.estado === 'cerrado' && r.data.familias.length === 3, 'estado inicial cerrado');
ok(api('inscribir', { familia: 'F1' }, t0).code === 'CERRADO', 'no inscribe con proceso cerrado');
ok(api('guardarProceso', { abierto: true }, t0).code === 'SESION', 'estudiante no puede abrir el proceso');
r = api('guardarProceso', { abierto: true, apertura: Date.now() + 3600e3 }, tUtp);
ok(r.ok && r.data.estado === 'programado', 'programado');
ok(api('inscribir', { familia: 'F1' }, t0).code === 'CERRADO', 'no inscribe antes de la apertura');
ok(api('guardarProceso', { abierto: true, apertura: Date.now() + 10, cierre: Date.now() }, tUtp).ok === false, 'cierre antes de apertura rechazado');
ok(api('guardarProceso', { abierto: true, enlace: 'javascript:alert(1)' }, tUtp).ok === false, 'enlace inválido rechazado');
r = api('guardarProceso', { abierto: true, colegio: 'Liceo de Prueba', enlace: 'https://jalexisps.github.io/selector-electivos/' }, tUtp);
ok(r.ok && r.data.estado === 'abierto', 'abierto');

seccion('Inscripción y cupos');
r = api('inscribir', { familia: 'F9' }, t0);
ok(!r.ok, 'familia inexistente');
r = api('inscribir', { familia: 'F2' }, t0);
ok(r.ok && r.data.estudiante.familia === 'F2', 'inscribe en F2');
ok(api('inscribir', { familia: 'F1' }, t0).code === 'YA', 'no puede inscribirse dos veces');
for (let i = 1; i < 25; i++) { const t = entrarEstudiante(i); const x = api('inscribir', { familia: 'F2' }, t); if (!x.ok) ok(false, 'inscribir ' + i + ': ' + x.error); }
r = api('miEstado', {}, t0);
const f2 = r.data.familias.find((f) => f.id === 'F2');
ok(f2.inscritos === 25 && f2.libres === 0, 'F2 llena con 25');
const t25 = entrarEstudiante(25);
r = api('inscribir', { familia: 'F2' }, t25);
ok(r.code === 'LLENO', 'el estudiante 26 queda bloqueado en F2');
ok(api('inscribir', { familia: 'F1' }, t25).ok, 'puede elegir otra familia');

seccion('Panel UTP');
r = api('panel', {}, tUtp);
ok(r.ok && r.data.estudiantes.length === 91 && r.data.colegio === 'Liceo de Prueba', 'panel con estudiantes');
ok(r.data.estudiantes.find((e) => e.rut === rut(20000000)).claveInicial === '', 'no expone clave de quien ya la cambió');
ok(r.data.estudiantes.find((e) => e.rut === rut(20000000 + 50 * 137)).claveInicial.length === 4, 'muestra clave de 4 dígitos');
ok(api('asignar', { rut: rut(20000000 + 30 * 137), familia: 'F2' }, tUtp).code === 'LLENO', 'UTP respeta el cupo');
ok(api('asignar', { rut: rut(20000000 + 3 * 137), familia: '' }, tUtp).ok, 'UTP libera un cupo');
ok(api('asignar', { rut: rut(20000000 + 30 * 137), familia: 'F2' }, tUtp).ok, 'UTP asigna el cupo liberado');
ok(fila('Estudiantes', (x) => x.RUT === rut(20000000 + 30 * 137)).InscritoPor === 'UTP (utp)', 'queda registrado quién asignó');
ok(api('guardarFamilia', { id: 'F2', nombre: 'Familia 2', electivos: ['A', 'B'], cupo: 10 }, tUtp).ok === false, 'cupo bajo inscritos rechazado');
ok(api('guardarFamilia', { id: 'F1', nombre: 'Familia 1', electivos: ['Uno', ' Dos ', ''], cupo: 30 }, tUtp).ok, 'edita familia');
ok(fila('Familias', (x) => x.ID === 'F1').Electivos === 'Uno; Dos', 'electivos guardados');
r = api('agregarFamilia', {}, tUtp);
ok(r.ok && r.data.id === 'F4', 'agrega F4');
ok(api('eliminarFamilia', { id: 'F2' }, tUtp).ok === false, 'no elimina familia con inscritos');
ok(api('eliminarFamilia', { id: 'F4' }, tUtp).ok, 'elimina F4 vacía');
r = api('restablecerClave', { rut: rut(20000000) }, tUtp);
ok(r.ok && r.data.clave === ctx.claveRut_(rut(20000000)), 'restablece a los 4 dígitos del RUT');
r = api('login', { rol: 'estudiante', usuario: rut(20000000), clave: r.data.clave });
ok(r.ok && !r.data.debeCambiar && api('miEstado', {}, r.data.token).ok, 'entra con clave restablecida');

seccion('Acciones masivas');
r = api('panel', {}, tUtp).data;
const libresF3 = r.familias.find((f) => f.id === 'F3').libres;
const sinFam = r.estudiantes.filter((e) => !e.familia).map((e) => e.rut);
r = api('masivo', { accion: 'asignar', familia: 'F3', ruts: sinFam }, tUtp);
ok(r.ok && r.data.hechos === Math.min(libresF3, sinFam.length) && r.data.sinCupo === Math.max(0, sinFam.length - libresF3), 'asigna hasta llenar el cupo: ' + JSON.stringify(r.data));
ok(api('panel', {}, tUtp).data.familias.find((f) => f.id === 'F3').inscritos <= 25, 'F3 no supera 25');
const algunos = sinFam.slice(0, 3);
r = api('masivo', { accion: 'quitar', ruts: algunos }, tUtp);
ok(r.ok && r.data.hechos === 3, 'quita inscripción a varios');
r = api('masivo', { accion: 'restablecer', ruts: [rut(20000000), rut(20000137)] }, tUtp);
ok(r.ok, 'restablece claves en lote');
const total = api('panel', {}, tUtp).data.estudiantes.length;
r = api('masivo', { accion: 'eliminar', ruts: algunos }, tUtp);
const despues = api('panel', {}, tUtp).data;
ok(r.ok && r.data.hechos === 3 && despues.estudiantes.length === total - 3 && !despues.estudiantes.some((e) => algunos.includes(e.rut)), 'elimina varios');
ok(despues.estudiantes.every((e) => e.rut && e.nombre), 'sin filas vacías tras eliminar');
ok(api('masivo', { accion: 'eliminar', ruts: [] }, tUtp).ok === false, 'sin selección rechazado');
ok(api('masivo', { accion: 'asignar', familia: 'F1', ruts: [rut(20000000)] }, t25).code === 'SESION', 'estudiante no usa acciones masivas');

seccion('Apariencia');
r = api('publico', {}).data;
ok(r.tema.logos.length === 1 && r.tema.logos[0].startsWith('data:image/webp;base64,'), 'logo del liceo por defecto');
ok(r.tema.primario === '#067D3E' && r.tema.secundario === '#EAEA17', 'colores del liceo por defecto');
ok(r.colegio === 'Liceo de Prueba', 'nombre configurado por la UTP manda');
ok(!api('guardarApariencia', { primario: 'rojo' }, tUtp).ok, 'color inválido rechazado');
ok(!api('guardarApariencia', { logo1: 'data:image/svg+xml;base64,PHN2Zz4=' }, tUtp).ok, 'SVG rechazado');
ok(!api('guardarApariencia', { logo1: 'data:image/png;base64,' + 'A'.repeat(50000) }, tUtp).ok, 'logo pesado rechazado');
ok(api('guardarApariencia', { primario: '#8a1c2b' }, t25).code === 'SESION', 'estudiante no cambia apariencia');
r = api('guardarApariencia', { primario: '#8a1c2b', secundario: '#f2b705', logo1: 'data:image/png;base64,iVBORw0KGgo=', logo2: '' }, tUtp);
ok(r.ok && r.data.primario === '#8A1C2B' && r.data.logos.length === 1, 'guarda apariencia');
ok(api('publico', {}).data.tema.secundario === '#F2B705', 'apariencia pública');
ok(api('guardarApariencia', { primario: '#067D3E', secundario: '#EAEA17', logo1: '', logo2: '' }, tUtp).ok && api('publico', {}).data.tema.logos.length === 0, 'quitar logo queda sin logo');
r = api('exportarHoja', { familia: '' }, tUtp);
const nEst = api('panel', {}, tUtp).data.estudiantes.length;
ok(r.ok && r.data.filas === nEst && mock.hojas['Exportación'].getLastRow() === nEst + 1, 'exporta a planilla');
ok(mock.hojas['Exportación'].data[1][0] === 'Familia 1', 'exportación ordenada por familia');
const antes = mock.hojas.Estudiantes.getLastRow();
ok(api('eliminarEstudiante', { rut: rut(20000000 + 89 * 137) }, tUtp).ok && mock.hojas.Estudiantes.getLastRow() === antes - 1, 'elimina estudiante');

seccion('Seguridad');
for (let i = 0; i < 5; i++) api('login', { rol: 'estudiante', usuario: rut(20000000 + 60 * 137), clave: 'nop' + i });
const e60 = est(60);
r = api('login', { rol: 'estudiante', usuario: e60.RUT, clave: e60.ClaveInicial });
ok(!r.ok && /Demasiados/.test(r.error), 'bloquea tras 5 intentos');
ok(api('noExiste', {}).ok === false, 'acción desconocida');
ok(api('panel', {}, t25).code === 'SESION', 'estudiante no ve el panel');
api('logout', {}, t25);
ok(api('miEstado', {}, t25).code === 'SESION', 'cerrar sesión invalida el token');
api('guardarProceso', { abierto: false }, tUtp);
ok(api('inscribir', { familia: 'F3' }, entrarEstudiante(70)).code === 'CERRADO', 'cerrar el proceso bloquea inscripciones');
ok(mock.hojas.Registro.getLastRow() > 20, 'registro de actividad (' + mock.hojas.Registro.getLastRow() + ' filas)');

seccion('Niveles');
function nuevoSistema() {
  const m = crearMock({ digest: (x) => Array.from(crypto.createHash('sha256').update(x, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)) });
  const c = vm.createContext(Object.assign({ console }, m.globals));
  ['Codigo.gs', 'Logo.gs'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script', f), 'utf8'), c, { filename: f }));
  c.instalar();
  const call = (accion, datos, token) => JSON.parse(JSON.stringify(c.api({ accion, datos, token })));
  const cu = m.hojas.UTP.data[1][2];
  const tk = call('login', { rol: 'utp', usuario: 'utp', clave: cu }).data.token;
  call('cambiarClave', { nueva: 'clave-utp-2026' }, tk);
  return { m, c, call, tk };
}
{
  const { m, c, call, tk } = nuevoSistema();
  ok(m.hojas.Familias.data[0].includes('Nivel') && m.hojas.Estudiantes.data[0].includes('Nivel'), 'columna Nivel en Familias y Estudiantes');
  ok(c.normNivel_('2do medio') === '2° Medio' && c.normNivel_('3') === '3° Medio' && c.normNivel_('4° Medio') === '', 'normaliza niveles');
  ok(c.nivelDeCurso_('2° Medio Ayun') === '2° Medio' && c.nivelDeCurso_('3°B') === '3° Medio', 'deduce nivel desde el curso');
  call('guardarFamilia', { id: 'F1', nombre: 'Familia 1', electivos: ['A'], cupo: 2, nivel: '2° Medio' }, tk);
  call('guardarFamilia', { id: 'F2', nombre: 'Familia 2', electivos: ['B'], cupo: 25, nivel: '2° Medio' }, tk);
  call('guardarFamilia', { id: 'F3', nombre: 'Familia 1', electivos: ['C'], cupo: 25, nivel: '3° Medio' }, tk);
  let x = call('agregarFamilia', { nivel: '3° Medio' }, tk);
  ok(x.ok && fila2(m, 'Familias', (f) => f.ID === x.data.id).Nivel === '3° Medio' && fila2(m, 'Familias', (f) => f.ID === x.data.id).Nombre === 'Familia 2', 'agrega familia al nivel con su número');
  const L = [
    { rut: rut(15000001), nombre: 'Ana Dos', curso: '2° Medio Ayun' },
    { rut: rut(15000002), nombre: 'Beto Dos', curso: 'Ayun', nivel: '2° Medio' },
    { rut: rut(15000003), nombre: 'Caro Tres', curso: '3°A' },
    { rut: rut(15000004), nombre: 'Dani Tres', curso: 'B', nivel: '3' },
    { rut: rut(15000005), nombre: 'Sin Nivel', curso: 'Ayun' }
  ];
  x = call('importar', { filas: L }, tk);
  ok(x.ok && x.data.nuevos === 4 && x.data.errores.length === 1 && /nivel/i.test(x.data.errores[0].motivo), 'registro en una acción; exige nivel: ' + JSON.stringify(x.data));
  ok(fila2(m, 'Estudiantes', (f) => f.RUT === rut(15000002)).Nivel === '2° Medio', 'nivel guardado');
  const ent = (r) => call('login', { rol: 'estudiante', usuario: r, clave: c.claveRut_(r) }).data.token;
  call('guardarProceso', { abierto: true }, tk);
  const tA = ent(rut(15000001)), tC = ent(rut(15000003));
  let e = call('miEstado', {}, tA).data;
  ok(e.estudiante.nivel === '2° Medio' && e.familias.map((f) => f.id).join() === 'F1,F2', '2° Medio ve solo sus familias');
  e = call('miEstado', {}, tC).data;
  ok(e.familias.every((f) => f.nivel === '3° Medio') && e.familias.length === 2, '3° Medio ve solo sus familias');
  ok(call('inscribir', { familia: 'F1' }, tC).ok === false, 'no se inscribe en familia de otro nivel');
  ok(call('inscribir', { familia: 'F3' }, tC).ok, 'se inscribe en familia de su nivel');
  ok(call('asignar', { rut: rut(15000002), familia: 'F3' }, tk).code === 'NIVEL', 'UTP no asigna a otro nivel');
  x = call('masivo', { accion: 'asignar', familia: 'F1', ruts: [rut(15000001), rut(15000002), rut(15000004)] }, tk);
  ok(x.ok && x.data.hechos === 2 && x.data.otroNivel === 1, 'masivo omite otro nivel: ' + JSON.stringify(x.data));
  ok(call('guardarFamilia', { id: 'F3', nombre: 'Familia 1', electivos: ['C'], cupo: 25, nivel: '2° Medio' }, tk).ok === false, 'no cambia de nivel una familia con inscritos de otro nivel');
  x = call('importar', { filas: [{ rut: rut(15000003), nombre: 'Caro Tres', curso: '2°A' }] }, tk);
  ok(x.ok && x.data.errores.length === 1 && x.data.actualizados === 0, 'no cambia de nivel a un inscrito');
  const P = call('panel', {}, tk).data;
  ok(P.niveles.join() === '2° Medio,3° Medio' && P.estudiantes.find((s) => s.rut === rut(15000004)).nivel === '3° Medio', 'panel con niveles');

  seccion('Administración');
  ok(call('admin', {}, tA).code === 'SESION', 'estudiante no entra a administración');
  let a = call('admin', {}, tk).data;
  ok(a.historial > 5 && a.ultimos.length && a.ultimos[0].accion, 'muestra historial: ' + a.historial);
  ok(call('historial', {}, tk).data.length === a.historial, 'historial completo para respaldo');
  ok(call('limpiar', { tipo: 'historial' }, tk).ok === false, 'limpiar historial exige BORRAR');
  x = call('limpiar', { tipo: 'historial', confirmacion: 'borrar' }, tk);
  a = call('admin', {}, tk).data;
  ok(x.ok && a.historial === 1 && a.ultimos[0].accion === 'Limpiar historial', 'limpia historial y deja constancia');
  call('cambiarClave', { actual: c.claveRut_(rut(15000001)), nueva: 'propia-123' }, tA);
  x = call('limpiar', { tipo: 'claves', nivel: '2° Medio' }, tk);
  ok(x.ok && x.data.hechos === 1 && fila2(m, 'Estudiantes', (f) => f.RUT === rut(15000001)).ClaveHash === '', 'restablece claves del nivel');
  x = call('limpiar', { tipo: 'inscripciones', nivel: '3° Medio' }, tk);
  ok(x.ok && x.data.hechos === 1 && call('panel', {}, tk).data.estudiantes.filter((s) => s.familia).length === 2, 'quita inscripciones solo de 3° Medio');
  ok(call('limpiar', { tipo: 'estudiantes', nivel: '3° Medio' }, tk).ok === false, 'eliminar estudiantes exige BORRAR');
  x = call('limpiar', { tipo: 'estudiantes', nivel: '3° Medio', confirmacion: 'BORRAR' }, tk);
  let ests = call('panel', {}, tk).data.estudiantes;
  ok(x.ok && x.data.hechos === 2 && ests.length === 2 && ests.every((s) => s.nivel === '2° Medio' && s.nombre), 'elimina estudiantes de un nivel');
  x = call('limpiar', { tipo: 'todo', confirmacion: 'BORRAR' }, tk);
  const P2 = call('panel', {}, tk).data;
  ok(x.ok && P2.estudiantes.length === 0 && P2.proceso.estado === 'cerrado' && P2.familias.length === 4, 'reinicio: sin estudiantes, proceso cerrado, familias intactas');
  ok(call('admin', {}, tk).data.historial === 1, 'reinicio deja solo su constancia en el historial');
  ok(call('limpiar', { tipo: 'nada' }, tk).ok === false, 'tipo de limpieza desconocido');
}
{
  seccion('Planilla de una versión anterior');
  const { m, call, tk } = nuevoSistema();
  ['Familias', 'Estudiantes'].forEach((h) => { const i = m.hojas[h].data[0].indexOf('Nivel'); m.hojas[h].data.forEach((r) => r.splice(i, 1)); });
  call('importar', { filas: [{ rut: rut(16000001), nombre: 'Viejo', curso: '2° Medio Ayun' }] }, tk);
  const P = call('panel', {}, tk).data;
  ok(m.hojas.Estudiantes.data[0].includes('Nivel') && m.hojas.Familias.data[0].includes('Nivel'), 'agrega la columna Nivel sola');
  ok(P.estudiantes[0].nivel === '2° Medio' && P.familias.every((f) => f.nivel === ''), 'datos antiguos siguen funcionando');
}
{
  seccion('Textos editables');
  const { m, c, call, tk } = nuevoSistema();
  const def = (k) => c.TEXTOS.find((t) => t.clave === k).def;
  let pub = call('publico', {}).data;
  ok(pub.textos['est.saludo'] === 'Hola, {nombre}' && pub.textos['login.aviso'] === '', 'textos originales sin configurar');
  const P = call('panel', {}, tk).data;
  ok(P.catalogoTextos.length === c.TEXTOS.length && P.textos['comp.titulo'] === 'Quedaste inscrito', 'el panel trae catálogo y textos');
  ok(new Set(c.TEXTOS.map((t) => t.clave)).size === c.TEXTOS.length, 'claves de textos únicas');
  let x = call('guardarTextos', { textos: { 'comp.titulo': 'Quedaste inscrito/a', 'login.aviso': '  La inscripción abre el **lunes**.\r\n\r\n\r\n\rTrae tu RUT.  ', 'est.saludo': '¡Hola,\n{nombre}!' } }, tk);
  ok(x.ok && x.data['comp.titulo'] === 'Quedaste inscrito/a', 'guarda un texto');
  ok(x.data['login.aviso'] === 'La inscripción abre el **lunes**.\n\nTrae tu RUT.', 'limpia espacios y saltos de más');
  ok(x.data['est.saludo'] === '¡Hola, {nombre}!', 'campo de una línea queda en una línea');
  pub = call('publico', {}).data;
  ok(pub.textos['login.aviso'].startsWith('La inscripción') && pub.textos['comp.titulo'] === 'Quedaste inscrito/a', 'la pantalla de entrada recibe los textos');
  call('importar', { filas: [{ rut: rut(17000001), nombre: 'Ana', curso: '2° Medio Ayun' }] }, tk);
  const te = call('login', { rol: 'estudiante', usuario: rut(17000001), clave: c.claveRut_(rut(17000001)) }).data.token;
  ok(call('miEstado', {}, te).data.textos['comp.titulo'] === 'Quedaste inscrito/a', 'el estudiante recibe los textos');
  ok(call('guardarTextos', { textos: { 'comp.titulo': 'x' } }, te).code === 'SESION', 'un estudiante no puede cambiar textos');
  ok(!call('guardarTextos', { textos: { 'otro.texto': 'x' } }, tk).ok, 'rechaza claves desconocidas');
  ok(!call('guardarTextos', { textos: { 'comp.subtitulo': 'a'.repeat(c.TEXTO_MAX + 1) } }, tk).ok, 'rechaza textos demasiado largos');
  ok(!call('guardarTextos', { textos: {} }, tk).ok, 'rechaza envío vacío');
  x = call('guardarTextos', { textos: { 'comp.subtitulo': '=IMPORTXML("x")' } }, tk);
  ok(x.ok && !x.data['comp.subtitulo'].startsWith('='), 'evita fórmulas');
  x = call('guardarTextos', { textos: { 'comp.titulo': '', 'comp.nota': '', 'login.aviso': '' } }, tk);
  ok(x.data['comp.titulo'] === def('comp.titulo'), 'vacío en texto obligatorio vuelve al original');
  ok(x.data['comp.nota'] === '', 'texto opcional puede quedar vacío');
  ok(x.data['login.aviso'] === '', 'aviso vacío no se muestra');
  const claves = () => m.hojas.Config.data.map((r) => r[0]).filter((k) => String(k).startsWith('texto.'));
  ok(!claves().includes('texto.comp.titulo') && !claves().includes('texto.login.aviso') && claves().includes('texto.comp.nota'), 'lo restaurado se quita de Config');
  x = call('guardarTextos', { textos: { 'comp.nota': def('comp.nota'), 'est.saludo': def('est.saludo'), 'comp.subtitulo': def('comp.subtitulo') } }, tk);
  ok(x.ok && claves().length === 0 && call('panel', {}, tk).data.colegio, 'restaurar todo deja Config limpia y el resto intacto');
  ok(call('admin', {}, tk).data.ultimos.some((l) => l.accion === 'Editar textos'), 'queda en el historial');
}
function fila2(m, h, o) { return m.hojas[h].data.slice(1).map((r) => Object.fromEntries(m.hojas[h].data[0].map((k, i) => [k, r[i]]))).find(o); }

seccion('Interfaz');
const html = fs.readFileSync(path.join(__dirname, '../apps-script/Index.html'), 'utf8');
ok(!/<\?|\?>/.test(html), 'Index.html sin signos de plantilla de Apps Script (rompen la página)');
ok(!/:\/\/|\\\/\//.test(html), 'Index.html sin "//" dentro de textos o expresiones (Apps Script los borra como comentario)');

console.log(`\n${pasadas} pruebas pasaron, ${fallas} fallaron`);
process.exit(fallas ? 1 : 0);
