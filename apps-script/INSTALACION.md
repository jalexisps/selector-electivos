# Selector de Electivos · v1.5 — Instalación

Funciona con una planilla de Google Sheets (la base de datos) y Apps Script (el programa). La página para los estudiantes se publica en GitHub Pages. No necesita servidor ni pagar nada.

## 1. Planilla y código (10 minutos)

1. Crea una planilla nueva en Google Sheets, por ejemplo **«Selector de Electivos 2027»**.
2. En la planilla: **Extensiones → Apps Script**. Ponle nombre al proyecto, por ejemplo «Selector de Electivos».
3. Borra el contenido de `Código.gs` y pega **todo** el archivo `Codigo.gs`.
4. Haz clic en **＋ → HTML**, nombra el archivo exactamente **`Index`** y pega todo `Index.html`.
5. Haz clic en **＋ → Secuencia de comandos**, nómbrala **`Logo`** y pega todo `Logo.gs` (el logo del liceo).
6. En **Configuración del proyecto** (engranaje), elige la zona horaria **(GMT-03:00) Santiago**.
7. Guarda (Ctrl+S) y vuelve a la planilla. Recárgala (F5).
8. Aparece el menú **Selector de Electivos → Instalar o reparar**. Al usarlo la primera vez Google pide permisos:
   - «Google no verificó esta app» es normal en scripts propios: **Configuración avanzada → Ir a Selector de Electivos**.
9. Se crean las hojas y aparece una ventana con el **usuario `utp` y su clave inicial**. Anótala.

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
3. **Familias**: revisa que cada familia tenga su **nivel** (2° Medio o 3° Medio).
4. **Registrar alumnos**: escribe una fila por alumno en las casillas (RUT, Nombre, Curso, Nivel), pega las columnas copiadas desde Excel en la grilla o sube el Excel (.xlsx; hay una plantilla en el mismo panel) → revisa el estado de cada fila → **Registrar N alumnos**. El nivel se completa solo si el curso empieza con él (ej. «2° Medio Ayun»); si no, elígelo en la fila o con «Nivel para todas las filas». Si el RUT viene en dos columnas (RUN y DV) se junta solo.
5. Opcional: **Estudiantes → Imprimir fichas de acceso** (RUT y clave de cada estudiante, para recortar). Se puede filtrar por curso.
6. **Proceso**: activa **Inscripción habilitada**. Opcional: programa fecha y hora de apertura y cierre.

## Cómo funciona

- **Dos perfiles.** Estudiantes entran con **RUT + clave**; la UTP con **usuario + clave**. Tras 5 claves equivocadas, ese usuario queda bloqueado 10 minutos.
- **Clave de estudiantes**: los **últimos 4 dígitos del RUT, contando el dígito verificador** (12.345.678-5 → `6785`; si termina en K, la K va incluida: 7.654.321-K → `321K`). Si un estudiante quiere, puede cambiarla por una propia desde el botón «Clave»; la UTP la devuelve a los 4 dígitos con «Restablecer clave».
- **UTP**: la primera vez debe crear su propia clave.
- **Apariencia**: logo y colores del liceo (verde, amarillo y gris) vienen puestos. Se cambian en el panel → **Apariencia** (se pueden subir dos logos y elegir colores; sugiere colores a partir del logo).
- **Textos**: los mensajes que ven los estudiantes (saludo, avisos, estado de la inscripción, comprobante y fichas) se cambian en el panel → **Textos**, con vista previa para cada nivel. Cada texto es uno solo para todos los niveles; `{nivel}` es el curso actual y `{nivelSiguiente}` el nivel en que se cursan los electivos (2° → 3°, 3° → 4°). Se guardan en la hoja Config (claves `texto.…`), así que se mantienen al publicar versiones nuevas del código.
- **Cupos.** Cada familia tiene 25 cupos (se cambia en **Familias**). Al inscribirse el estudiante número 25, la familia se bloquea sola. Las inscripciones se procesan de a una, así que nunca se pasa del cupo aunque varios elijan al mismo tiempo.
- **Elección definitiva.** El estudiante no puede cambiarse. La UTP puede reasignarlo o quitarle la inscripción (libera el cupo) desde **Estudiantes → Familia**.
- **Claves olvidadas.** En **Estudiantes → Restablecer clave** vuelve a ser los 4 dígitos del RUT.
- **Exportar a Excel.** En **Resumen**: un Excel con hoja Resumen, Todas y una hoja por familia (más «Sin inscribir»); también por familia o solo los sin inscribir. En **Estudiantes** se exporta la lista filtrada o los seleccionados. Sigue disponible «Abrir en planilla de Google».
- **Selección múltiple.** En **Estudiantes**, marca casillas (o haz clic en las filas; la casilla del encabezado marca toda la lista) y aplica a todos: asignar familia (respeta el cupo), quitar inscripción, restablecer clave, imprimir fichas, Excel o eliminar.
- **Niveles.** Cada familia tiene un nivel (2° Medio o 3° Medio) y cada estudiante solo ve y elige las de su nivel; la UTP tampoco puede asignarlo a una familia de otro nivel. Una familia «sin nivel» la ven todos (el panel avisa cuando hay alguna). Los niveles disponibles están en `NIVELES`, al inicio de `Codigo.gs`.
- **Historial.** La hoja *Registro* guarda quién hizo qué y cuándo.
- **Administración.** Descarga un respaldo en Excel (estudiantes, familias e historial) y limpia registros: quitar inscripciones, restablecer claves o eliminar estudiantes (de un nivel o de todos), limpiar el historial, o reiniciar el sistema para un año nuevo (borra estudiantes e historial y cierra la inscripción; mantiene familias, usuarios UTP y apariencia). Lo que borra pide escribir **BORRAR** para confirmar.

## Otra persona de la UTP

Planilla → menú **Selector de Electivos → Crear nuevo usuario UTP**. Te muestra su usuario y clave inicial.

## Actualizar a una versión nueva sin cambiar el enlace

Pega el código nuevo en Apps Script y luego: **Implementar → Administrar implementaciones → lápiz → Versión: Nueva versión → Implementar**. No crees una implementación nueva: eso cambiaría el enlace `/exec`.

## Hojas de la planilla

| Hoja | Contenido |
|---|---|
| Config | Estado del proceso, fechas, nombre del colegio y enlace |
| Familias | ID, nombre, electivos (separados por `;`), cupo y nivel |
| Estudiantes | RUT, nombre, curso, clave inicial pendiente, clave cifrada, familia, fecha y nivel |
| UTP | Usuarios de la UTP |
| Registro | Historial de actividad |

No cambies los nombres de las hojas ni de las columnas. Si la planilla viene de una versión anterior, la columna **Nivel** se agrega sola. Las claves personales se guardan cifradas: nadie puede leerlas, ni siquiera desde la planilla.
