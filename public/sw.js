// Cache only self-contained public play. Account pages and live-room responses
// must always come from the network and never become an offline snapshot.
const CACHE = 'legends-offline-v3';
const PUBLIC_FILES = ['/offline.html', '/lab-rush.html'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => (key.startsWith('legends-shell-') || key.startsWith('legends-offline-')) && key !== CACHE)
      .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && PUBLIC_FILES.includes(url.pathname)) {
        try {
          const cache = await caches.open(CACHE);
          await cache.put(url.pathname, response.clone());
        } catch { /* Cache limits must not discard a successful network response. */ }
      }
      return response;
    } catch {
      let fallback;
      try {
        const cache = await caches.open(CACHE);
        fallback = await cache.match(url.pathname === '/demo' || url.pathname === '/lab-rush.html' ? '/lab-rush.html' : '/offline.html');
      } catch { /* Storage can be unavailable in private or limited browsers. */ }
      return fallback || new Response('You are offline. Reconnect to open HSC Legends.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* Show a generic notification. */ }
  event.waitUntil(self.registration.showNotification(data.title || 'HSC Legends', {
    body: data.body || '', icon: '/icon-192.png', badge: '/icon-192.png', data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  let url = new URL('/', self.location.origin);
  try {
    const target = new URL(event.notification.data?.url || '/', self.location.origin);
    if (target.origin === self.location.origin) url = target;
  } catch { /* Keep the home destination. */ }
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    for (const client of list) if (client.url === url.href && 'focus' in client) return client.focus();
    return self.clients.openWindow(url.href);
  }));
});
