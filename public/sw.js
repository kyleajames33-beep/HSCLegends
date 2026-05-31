// Minimal service worker: cache the app shell so Legends opens instantly / offline.
const CACHE = 'legends-shell-v2';
const SHELL = ['/', '/play', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for navigations (fresh content), cache fallback when offline.
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/') || fetch(request)));
    return;
  }
});

// Web Push: show the notification.
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = {}; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'HSC Legends', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

// Focus/open the app when a notification is tapped.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow(url);
    })
  );
});
