import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'vd-font';
const listeners = new Set();
let facePromise;

function loadFace() {
  facePromise ??= Promise.all([
    import('@fontsource/andika/400.css'),
    import('@fontsource/andika/700.css'),
    import('@fontsource/andika/cyrillic-400.css'),
    import('@fontsource/andika/cyrillic-700.css'),
  ]);
  return facePromise;
}

export function dyslexiaEnabled() {
  return document.documentElement.getAttribute('data-font') === 'dyslexia';
}

export function setDyslexia(on) {
  if (on) {
    document.documentElement.setAttribute('data-font', 'dyslexia');
    loadFace();
    try {
      localStorage.setItem(STORAGE_KEY, 'dyslexia');
    } catch {
      // private mode: the choice lasts for this page only
    }
  } else {
    document.documentElement.removeAttribute('data-font');
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing stored to remove
    }
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useDyslexia() {
  return useSyncExternalStore(subscribe, dyslexiaEnabled);
}

if (dyslexiaEnabled()) loadFace();
