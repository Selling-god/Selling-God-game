'use client';

import { useEffect } from 'react';

export default function CacheReset() {
  useEffect(() => {
    const run = async () => {
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
      } catch {}

      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch {}

      try {
        const previousBuild = localStorage.getItem('kx-build-id');
        const currentBuild = 'KX-STOCK-20260903-HARDRESET-2';
        if (previousBuild !== currentBuild) {
          localStorage.setItem('kx-build-id', currentBuild);
          sessionStorage.setItem('kx-first-load', 'done');
        }
      } catch {}
    };
    void run();
  }, []);

  return null;
}
