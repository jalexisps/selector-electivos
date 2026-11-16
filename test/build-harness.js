// Genera test/harness.html: la interfaz real + backend real + Google simulado, con datos de ejemplo.
const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(base, 'apps-script/Index.html'), 'utf8');
const mock = fs.readFileSync(path.join(__dirname, 'mock-gas.js'), 'utf8');
const codigo = fs.readFileSync(path.join(base, 'apps-script/Codigo.gs'), 'utf8') + '\n' + fs.readFileSync(path.join(base, 'apps-script/Logo.gs'), 'utf8');

const seed = `
(function(){
  const M = crearMockGAS({}); window.__M = M; Object.assign(window, M.globals);
})();
</script><script>${codigo}</script><script>
(function(){
  function dv(n){let s=0,m=2;String(n).split('').reverse().forEach(d=>{s+=+d*m;m=m===7?2:m+1});const r=11-(s%11);return r===11?'0':r===10?'K':String(r)}
  instalar();
  const claveUtp = __M.hojas.UTP.data[1][2];
  let r = api({accion:'login', datos:{rol:'utp', usuario:'utp', clave:claveUtp}});
  const tu = r.data.token; api({accion:'cambiarClave', token:tu, datos:{nueva:'utp12345'}});
  const nombres=['Sofía','Benjamín','Isidora','Vicente','Florencia','Martín','Amanda','Agustín','Josefa','Tomás','Antonia','Matías','Emilia','Joaquín','Trinidad','Maximiliano','Catalina','Lucas','Fernanda','Cristóbal'];
  const ap=['González','Muñoz','Rojas','Díaz','Pérez','Soto','Contreras','Silva','Martínez','Sepúlveda','Morales','Rodríguez','López','Fuentes','Hernández','Torres','Araya','Flores','Espinoza','Valenzuela'];
  const filas=[];
  for(let i=0;i<72;i++){ const n=21000000+i*7919; filas.push({rut:n+'-'+dv(n), nombre: ap[i%20]+' '+ap[(i*7+3)%20]+', '+nombres[(i*3)%20], curso: ['2° Medio Ayun','2° Medio Lafken','3° Medio Ayun','3° Medio Lafken'][i%4]}); }
  api({accion:'importar', token:tu, datos:{filas}});
  api({accion:'guardarFamilia', token:tu, datos:{id:'F1', nombre:'Familia 1', cupo:25, nivel:'2° Medio', electivos:['Ciencias de la salud','Creación y composición musical','Comprensión histórica del presente']}});
  api({accion:'guardarFamilia', token:tu, datos:{id:'F2', nombre:'Familia 2', cupo:25, nivel:'2° Medio', electivos:['Probabilidades y estadística descriptiva e inferencial','Estética','Física']}});
  api({accion:'guardarFamilia', token:tu, datos:{id:'F3', nombre:'Familia 1', cupo:25, nivel:'3° Medio', electivos:['Biología de los ecosistemas','Lectura y escritura especializadas','Geografía, territorio y desafíos socioambientales']}});
  const f4 = api({accion:'agregarFamilia', token:tu, datos:{nivel:'3° Medio'}}).data.id;
  api({accion:'guardarFamilia', token:tu, datos:{id:f4, nombre:'Familia 2', cupo:25, nivel:'3° Medio', electivos:['Límites, derivadas e integrales','Química','Filosofía política']}});
  api({accion:'guardarProceso', token:tu, datos:{abierto:true, cierre: Date.now()+3*864e5, enlace:'https://jalexisps.github.io/selector-electivos/'}});
  filas.slice(2, 52).forEach((fr, k)=>{ const dos = fr.curso.startsWith('2'); const f = dos ? (k%3 ? 'F1':'F2') : (k%2 ? 'F3' : f4);
    const l=api({accion:'login', datos:{rol:'estudiante', usuario:fr.rut, clave:claveRut_(fr.rut)}});
    api({accion:'inscribir', token:l.data.token, datos:{familia:f}}); });
  const libre = filas[0], fila0 = __M.hojas.Estudiantes.data.find(x=>x[0]===libre.rut);
  window.__seed = { rut: libre.rut, clave: claveRut_(libre.rut), utp: 'utp12345' };
  function runner(ok, fail){ return {
    withSuccessHandler(fn){ return runner(fn, fail); }, withFailureHandler(fn){ return runner(ok, fn); },
    api(req){ setTimeout(()=>{ try{ const res = api(JSON.parse(JSON.stringify(req))); ok && ok(JSON.parse(JSON.stringify(res))); }catch(e){ console.error(e); fail && fail(e); } }, 120); } }; }
  window.google = { script: { run: runner() } };
})();
`;
const html = index.replace('<script>\n/* ====', `<script>${mock}\n${seed}</script>\n<script>\n/* ====`);
if (html === index) throw new Error('no se pudo inyectar');
fs.writeFileSync(path.join(__dirname, 'harness.html'), html);
console.log('harness.html listo');
