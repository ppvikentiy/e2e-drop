import { useEffect, useState, useSyncExternalStore } from 'react';

let installEvent = null;
let installed = false;
const listeners = new Set();
let snapshot = { canPrompt: false, installed: false };

function emit() {
  snapshot = { canPrompt: installEvent !== null, installed };
  listeners.forEach((fn) => fn());
}

// Registered at import time: the browser may fire this before React mounts.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  emit();
});
window.addEventListener('appinstalled', () => {
  installEvent = null;
  installed = true;
  emit();
});

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const APP_DISPLAY = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];

export const isStandalone = () =>
  APP_DISPLAY.some((mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches) ||
  window.navigator.standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function useInstall() {
  const state = useSyncExternalStore(subscribe, () => snapshot);
  const standalone = isStandalone() || state.installed;
  return {
    standalone,
    canPrompt: !standalone && state.canPrompt,
    iosHint: !standalone && !state.canPrompt && isIos(),
    async prompt() {
      if (!installEvent) return;
      const event = installEvent;
      installEvent = null;
      emit();
      await event.prompt();
      await event.userChoice.catch(() => {});
    },
  };
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

// Files delivered by the service worker's Share Target handler.
export async function takeSharedFiles() {
  if (!('caches' in window)) return [];
  try {
    const cache = await caches.open('vd-share');
    const files = [];
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (!response) continue;
      const blob = await response.blob();
      const name = decodeURIComponent(response.headers.get('X-File-Name') || 'file');
      files.push(
        new File([blob], name, {
          type: response.headers.get('Content-Type') || '',
          lastModified: Number(response.headers.get('X-Last-Modified')) || Date.now(),
        }),
      );
      await cache.delete(request);
    }
    return files;
  } catch {
    return [];
  }
}
