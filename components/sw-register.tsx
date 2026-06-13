'use client';

import { useEffect } from 'react';

// Registers the service worker so the PWA is installable / opens offline.
export default function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // In development, unregister any existing SW and clear its caches so stale
    // assets never mask code changes. Only register the PWA SW in production.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      if (typeof caches !== 'undefined') caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
