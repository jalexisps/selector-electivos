# Selector de Electivos · v1.0

Sistema para que los estudiantes elijan su **familia de electivos** y la **Unidad Técnico Pedagógica** administre el proceso.

- **Estudiantes**: entran con RUT y clave, ven las familias con sus cupos en tiempo real, eligen una y reciben su comprobante.
- **UTP**: resumen de inscritos y cupos, carga de listas desde Excel, fichas de acceso para imprimir, apertura y cierre del proceso, reasignaciones y exportación.
- **Cupos**: 25 por familia; al inscribirse el último, la familia se bloquea sola.

## Familias 2026

| Familia | Electivos |
|---|---|
| Familia 1 | Ciencias de la salud · Creación y composición musical · Comprensión histórica del presente |
| Familia 2 | Probabilidades y estadística descriptiva e inferencial · Estética · Física |
| Familia 3 | Ciencias de la salud · Comprensión histórica del presente · Probabilidades y estadística descriptiva e inferencial |

## Estructura

```
index.html              Página de GitHub Pages: muestra la app sin el aviso de Google
apps-script/
  Codigo.gs             Backend (la planilla funciona como base de datos)
  Index.html            Interfaz de estudiantes y UTP
  appsscript.json       Manifiesto (zona horaria Santiago, aplicación web)
  INSTALACION.md        Paso a paso para instalar y publicar
test/
  backend.test.js       68 pruebas del backend con Google simulado (node test/backend.test.js)
  build-harness.js      Arma una versión local de la interfaz con datos de ejemplo
```

Instalación: ver [`apps-script/INSTALACION.md`](apps-script/INSTALACION.md).
