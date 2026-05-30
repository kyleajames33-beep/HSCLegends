'use client';

import { useEffect } from 'react';

// Registers the service worker so the PWA is installable / opens offline.
export default function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
