# Selector de Electivos · v1.5 — Liceo Polivalente Nahuelbuta, Contulmo

Sistema para que los estudiantes elijan su **familia de electivos** y la **Unidad Técnico Pedagógica** administre el proceso.

- **Estudiantes**: entran con su RUT y, como clave, los últimos 4 dígitos del RUT (con el dígito verificador), ven las familias con sus cupos en tiempo real, eligen una y reciben su comprobante.
- **UTP**: resumen de inscritos y cupos por nivel, registro de muchos alumnos de una vez (casillas por dato, pegar desde Excel o subir el archivo), selección múltiple de estudiantes, fichas de acceso, apertura y cierre del proceso, reasignaciones, exportación a Excel pestaña **Textos** para cambiar los mensajes que ven los estudiantes (avisos, saludos, comprobante, fichas) sin tocar el código, y panel de **Administración** para respaldar y limpiar registros.
- **Niveles**: cada familia pertenece a un nivel (2° Medio o 3° Medio). Cada estudiante solo ve y solo puede elegir las familias de su nivel.
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
  Logo.gs               Logo del liceo (predeterminado; se cambia en Apariencia)
  appsscript.json       Manifiesto (zona horaria Santiago, aplicación web)
  INSTALACION.md        Paso a paso para instalar y publicar
test/
  backend.test.js       146 pruebas del backend con Google simulado (node test/backend.test.js)
  build-harness.js      Arma una versión local de la interfaz con datos de ejemplo
```

Instalación: ver [`apps-script/INSTALACION.md`](apps-script/INSTALACION.md).
