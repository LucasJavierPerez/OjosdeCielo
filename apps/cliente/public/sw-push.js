/**
 * Manejo de push en el service worker.
 *
 * Se inyecta en el SW generado por vite-plugin-pwa mediante `importScripts`
 * (ver injectManifest en vite.config.ts). Va en JS plano porque corre en el
 * contexto del worker, no en el bundle de la app.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let datos;
  try {
    datos = event.data.json();
  } catch {
    // Un push sin JSON válido no debería llegar, pero si llega no se rompe.
    datos = { titulo: 'Ojos de Cielo', cuerpo: event.data.text(), url: '/' };
  }

  event.waitUntil(
    self.registration.showNotification(datos.titulo ?? 'Ojos de Cielo', {
      body: datos.cuerpo ?? '',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      lang: 'es-AR',
      // El tag agrupa avisos del mismo tipo: si llegan tres recordatorios de
      // vacuna, el usuario ve el último en vez de tres notificaciones apiladas.
      tag: datos.tipo ?? 'general',
      renotify: true,
      data: { url: datos.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = event.notification.data?.url ?? '/';

  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Si la app ya está abierta se reutiliza esa ventana en vez de abrir otra.
      for (const ventana of ventanas) {
        if ('focus' in ventana) {
          await ventana.focus();
          if ('navigate' in ventana) await ventana.navigate(destino);
          return;
        }
      }

      await self.clients.openWindow(destino);
    })(),
  );
});
