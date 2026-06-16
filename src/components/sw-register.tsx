'use client';
import { useEffect } from 'react';

// Registers the service worker for offline shell + caching.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registration failures are non-fatal */
      });
    }
  }, []);
  return null;
}
