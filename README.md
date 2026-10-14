# Registro Arbitral

App web instalable (PWA) para registrar jugadas de baloncesto y valorar si están bien arbitradas.
Funciona sin conexión, guarda los datos solo en el móvil de cada usuario y exporta a Excel.
Coste: 0 €. No necesita servidor ni cuentas.

## Contenido

```
index.html            pantalla única de la app
manifest.webmanifest  datos de instalación (nombre, iconos, colores)
sw.js                 modo sin conexión (service worker)
css/styles.css        estilos
js/core.js            reglas comunes (tipos, resultados, orden de jugadas)
js/db.js              almacenamiento local (IndexedDB)
js/xlsx.js            generador de Excel sin librerías
js/app.js             pantallas y lógica
icons/                iconos de la app
```

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
