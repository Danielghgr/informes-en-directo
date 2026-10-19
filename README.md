# Registro Arbitral

App web instalable (PWA) para registrar jugadas de baloncesto y valorar si están bien arbitradas.
Funciona sin conexión, guarda los datos solo en el móvil de cada usuario, calcula estadísticas y exporta a Excel.
Coste: 0 €. No necesita servidor ni cuentas.

## Contenido

```
index.html            pantalla única de la app
manifest.webmanifest  datos de instalación (nombre, iconos, colores)
sw.js                 modo sin conexión (service worker)
css/styles.css        estilos
js/core.js            reglas comunes (tipos, resultados, orden de jugadas)
js/db.js              almacenamiento local (IndexedDB)
js/config.js          configuración del envío de partidos (vacío = desactivado)
js/sync.js            envío automático al finalizar un partido
js/xlsx.js            generador de Excel sin librerías
js/app.js             pantallas y lógica
icons/                iconos de la app
```

## Versión 2: estadísticas

En el registro de cada partido, **Ver estadísticas** muestra tres bloques: árbitro 1, árbitro 2 y total del partido.
Cada bloque desglosa **aciertos, dudas y errores** por cuarto (con una fila de prórroga si la hay) y su total, con
números y porcentajes.

- **Errores** = errores + omisiones.
- Una jugada marcada con los dos árbitros cuenta para cada uno y **una sola vez** en el total del partido
  (por eso la suma de los dos árbitros puede superar el total).
- Los porcentajes son sobre las jugadas de cada fila.
- El Excel incluye una hoja nueva **Estadísticas** con las mismas tablas.

## Versión 3: envío de partidos finalizados

Al finalizar un partido, la app puede enviar una copia a una Hoja de Google del administrador, en segundo plano y
cuando haya conexión. Está **desactivado por defecto**: solo se activa si `js/config.js` tiene una dirección
`syncUrl`. Al activarlo, cada usuario ve un aviso de privacidad al abrir la app y debe aceptarlo con un alias.

Configuración paso a paso: `GUIA-ENVIO-DATOS.md`. El script de Google es `Code.gs` (no se sube al repositorio).

## Entornos PRE y PRO

El mismo código sirve para un entorno de pruebas y para producción. Solo cambian `js/config.js` (`env: 'pre'`
en pruebas, `env: ''` en producción), `manifest.webmanifest` e `icons/`. Cada entorno guarda sus datos por
separado en el móvil. Procedimiento completo, promoción a producción y vuelta atrás: `GUIA-ENTORNOS.md`.

## Publicar con GitHub Pages (recomendado)

Necesitas una cuenta gratuita en github.com. Una sola vez:

1. **Crear el repositorio.** En GitHub: botón **+** → **New repository**. Ponle un nombre sin espacios
   (por ejemplo `registro-arbitral`), déjalo en **Public** y pulsa **Create repository**.
2. **Subir los archivos.** En el repositorio: **Add file** → **Upload files**. Descomprime este zip y arrastra
   **todo su contenido** (las carpetas `css`, `js`, `icons` y los archivos sueltos), no la carpeta contenedora.
   Pulsa **Commit changes**.
3. **Activar Pages.** **Settings** → **Pages** → en *Build and deployment* elige **Deploy from a branch**,
   rama **main**, carpeta **/ (root)** → **Save**.
4. **Esperar 1–2 minutos** y recargar la página de Settings → Pages. Aparecerá la dirección:
   `https://TU-USUARIO.github.io/registro-arbitral/`

Esa es la dirección que compartes con los usuarios.

> Si prefieres que el código no sea público, usa Cloudflare Pages (gratis): *Workers & Pages* → *Create* →
> *Pages* → *Upload assets*, y sube la carpeta descomprimida.

## Instalar en el móvil

- **Android (Chrome):** abrir la dirección → menú ⋮ → **Instalar aplicación**.
- **iPhone:** abrir la dirección → botón **Compartir** → **Añadir a pantalla de inicio**.
  Si algo falla desde Chrome (no abre sin conexión, no guarda), repetirlo desde **Safari**.

Después, abrir siempre la app **desde su icono**. La primera vez hace falta internet; luego funciona sin conexión.

## Actualizar la app

1. Cambia lo que quieras en los archivos.
2. **Sube el número de versión en `sw.js`** (`const VERSION = 'v1.0.1';`). Sin esto, los móviles seguirán
   usando la versión antigua guardada.
3. Sube los archivos modificados al repositorio (Add file → Upload files, sobrescribe).

La próxima vez que un usuario abra la app con conexión verá el aviso «Hay una versión nueva» en el inicio.
Sus datos no se pierden.

## Probar en tu ordenador antes de publicar

Con Python instalado, desde esta carpeta: `python3 -m http.server 8000` y abre `http://localhost:8000`.
(Abrir `index.html` con doble clic no funciona: hace falta un servidor, aunque sea local.)

## Datos y copias de seguridad

- Los datos viven en el navegador del dispositivo. Si se borran los datos del navegador, se pierden.
- Menú ☰ del inicio → **Copia de seguridad (JSON)** guarda todos los partidos; **Importar** los restaura
  (útil al cambiar de móvil).
- En iPhone, Safari puede borrar datos de webs que no se usan durante semanas, salvo que la app esté
  instalada en la pantalla de inicio. Conviene exportar a Excel cada partido finalizado.

## Personalizar

- **Nombre de la app:** `index.html` (`<title>`), `manifest.webmanifest` y el título en `js/app.js`.
- **Tipos de acción y resultados:** listas `TYPES` y `RESULTS` en `js/core.js`. Si cambias los nombres, las
  jugadas ya guardadas con los nombres antiguos no se reconocerán al importar copias.
- **Colores:** variables al principio de `css/styles.css`.
