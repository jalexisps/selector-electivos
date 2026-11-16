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
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Codigo.gs'), 'utf8'), ctx, { filename: 'Codigo.gs' });
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
  const l = api('login', { rol: 'estudiante', usuario: e.RUT, clave: e.ClaveInicial || 'clave-' + i });
  if (!l.ok) throw new Error('login estudiante ' + i + ': ' + l.error);
  if (l.data.debeCambiar) { const c = api('cambiarClave', { nueva: 'clave-' + i }, l.data.token); if (!c.ok) throw new Error(c.error); }
  return l.data.token;
}
let t0 = entrarEstudiante(0);
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
ok(r.data.estudiantes.find((e) => e.rut === rut(20000000 + 50 * 137)).claveInicial.length === 6, 'muestra clave inicial pendiente');
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
ok(r.ok && r.data.clave.length === 6, 'restablece clave');
r = api('login', { rol: 'estudiante', usuario: rut(20000000), clave: r.data.clave });
ok(r.ok && r.data.debeCambiar, 'entra con clave restablecida');
ok(api('miEstado', {}, r.data.token).code === 'CAMBIAR', 'debe cambiarla antes de seguir');
r = api('exportarHoja', { familia: '' }, tUtp);
ok(r.ok && r.data.filas === 91 && mock.hojas['Exportación'].getLastRow() === 92, 'exporta a planilla');
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

console.log(`\n${pasadas} pruebas pasaron, ${fallas} fallaron`);
process.exit(fallas ? 1 : 0);
