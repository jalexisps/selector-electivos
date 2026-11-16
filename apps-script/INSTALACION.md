# Selector de Electivos · v1.0 — Instalación

Funciona con una planilla de Google Sheets (la base de datos) y Apps Script (el programa). La página para los estudiantes se publica en GitHub Pages. No necesita servidor ni pagar nada.

## 1. Planilla y código (10 minutos)

1. Crea una planilla nueva en Google Sheets, por ejemplo **«Selector de Electivos 2027»**.
2. En la planilla: **Extensiones → Apps Script**. Ponle nombre al proyecto, por ejemplo «Selector de Electivos».
3. Borra el contenido de `Código.gs` y pega **todo** el archivo `Codigo.gs`.
4. Haz clic en **＋ → HTML**, nombra el archivo exactamente **`Index`** y pega todo `Index.html`.
5. En **Configuración del proyecto** (engranaje), elige la zona horaria **(GMT-03:00) Santiago**.
6. Guarda (Ctrl+S) y vuelve a la planilla. Recárgala (F5).
7. Aparece el menú **Selector de Electivos → Instalar o reparar**. Al usarlo la primera vez Google pide permisos:
   - «Google no verificó esta app» es normal en scripts propios: **Configuración avanzada → Ir a Selector de Electivos**.
8. Se crean las hojas y aparece una ventana con el **usuario `utp` y su clave inicial**. Anótala.

## 2. Publicar la aplicación web

1. En Apps Script: **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
3. **Implementar** y copia el enlace que termina en `/exec`.

## 3. Página en GitHub (sin el aviso de Google)

1. En el repositorio `selector-electivos`, abre `index.html` → lápiz (editar).
2. Reemplaza `PEGA_AQUI_EL_ENLACE_EXEC` por el enlace `/exec` y guarda (Commit changes).
3. **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
4. En uno o dos minutos queda en `https://jalexisps.github.io/selector-electivos/`. Ese es el enlace para estudiantes y UTP.

## 4. Primer uso (UTP)

1. Entra en el enlace → pestaña **UTP** → usuario `utp` y la clave inicial → crea tu clave personal.
2. **Proceso**: escribe el nombre del colegio y el enlace de GitHub Pages (se imprime en las fichas).
3. **Cargar lista**: pega desde Excel las columnas **RUT, Nombre, Curso** → revisa la vista previa → Guardar.
4. **Estudiantes → Imprimir fichas de acceso**: una ficha por estudiante con su RUT y clave inicial, para recortar y entregar. Se puede filtrar por curso antes de imprimir.
5. **Proceso**: activa **Inscripción habilitada**. Opcional: programa fecha y hora de apertura y cierre.

## Cómo funciona

- **Dos perfiles.** Estudiantes entran con **RUT + clave**; la UTP con **usuario + clave**. La primera vez todos deben crear su propia clave. Tras 5 claves equivocadas, ese usuario queda bloqueado 10 minutos.
- **Cupos.** Cada familia tiene 25 cupos (se cambia en **Familias**). Al inscribirse el estudiante número 25, la familia se bloquea sola. Las inscripciones se procesan de a una, así que nunca se pasa del cupo aunque varios elijan al mismo tiempo.
- **Elección definitiva.** El estudiante no puede cambiarse. La UTP puede reasignarlo o quitarle la inscripción (libera el cupo) desde **Estudiantes → Familia**.
- **Claves olvidadas.** En **Estudiantes → Nueva clave** se genera otra clave inicial.
- **Exportar.** En **Resumen**: CSV por familia, todo junto o solo los que no se inscribieron, o «Abrir en planilla de Google» (llena la hoja *Exportación*).
- **Historial.** La hoja *Registro* guarda quién hizo qué y cuándo.

## Otra persona de la UTP

Planilla → menú **Selector de Electivos → Crear nuevo usuario UTP**. Te muestra su usuario y clave inicial.

## Actualizar a una versión nueva sin cambiar el enlace

Pega el código nuevo en Apps Script y luego: **Implementar → Administrar implementaciones → lápiz → Versión: Nueva versión → Implementar**. No crees una implementación nueva: eso cambiaría el enlace `/exec`.

## Hojas de la planilla

| Hoja | Contenido |
|---|---|
| Config | Estado del proceso, fechas, nombre del colegio y enlace |
| Familias | ID, nombre, electivos (separados por `;`) y cupo |
| Estudiantes | RUT, nombre, curso, clave inicial pendiente, clave cifrada, familia y fecha |
| UTP | Usuarios de la UTP |
| Registro | Historial de actividad |

No cambies los nombres de las hojas ni de las columnas. Las claves personales se guardan cifradas: nadie puede leerlas, ni siquiera desde la planilla.
