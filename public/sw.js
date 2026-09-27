// Sidecar service worker. Bare-minimum: enables scheduled notifications via
// TimestampTrigger. No fetch handler, no caching — this SW exists solely so
// showNotification({ showTrigger }) can persist across page/tab lifecycle.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
      const existing = list.find(c => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    }),
  );
});
