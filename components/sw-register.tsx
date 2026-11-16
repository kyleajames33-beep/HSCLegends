'use client';

import { useEffect } from 'react';

// Registers the service worker so the PWA is installable / opens offline.
export default function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // In development, unregister any existing SW and clear its caches so stale
    // assets never mask code changes. Only register the PWA SW in production.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => {
        const worker = r.active || r.waiting || r.installing;
        if (worker?.scriptURL === new URL('/sw.js', location.origin).href) void r.unregister();
      })).catch(() => {});
      if (typeof caches !== 'undefined') caches.keys().then((ks) => ks.forEach((k) => {
        if (k.startsWith('legends-shell-') || k.startsWith('legends-offline-')) void caches.delete(k);
      })).catch(() => {});
      return;
    }
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
  }, []);
  return null;
}
