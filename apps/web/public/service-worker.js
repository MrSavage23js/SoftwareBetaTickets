/* global self */
// Service worker mínimo: solo hace que el navegador ofrezca "Instalar aplicación".
// No guarda nada en caché ni intercepta peticiones (sin manejador "fetch"): todo va directo al servidor,
// así que nunca se queda una versión vieja ni datos de otro usuario. La caché sin conexión se agregaría aquí.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
