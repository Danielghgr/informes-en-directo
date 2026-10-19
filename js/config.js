/* Configuración del envío de partidos finalizados.
   Mientras `syncUrl` esté vacío, la app NO envía nada y no muestra ningún aviso.
   Sigue la guía GUIA-ENVIO-DATOS.md para rellenar estos tres valores. */
self.RA_CONFIG = {
  env: '',        // entorno: vacío en PRO; 'pre' en el entorno de pruebas (datos y pestañas de la hoja separados)
  syncUrl: 'https://script.google.com/macros/s/AKfycbzU6UnpZd1_iWMrbysQq4zUuhXcatQCLIb6yYU8GYq2fZDN2xpYqu9ud6sFM_lmOjsoZg/exec',    // dirección de la aplicación web de Google Apps Script (termina en /exec)
  syncKey: 'tgv-8Kq2-pelota-9xLm',    // clave compartida: debe ser la misma que KEY en el script de Google
  adminName: 'Daniel'   // nombre que verán los usuarios en el aviso (por ejemplo, "Daniel")
};
