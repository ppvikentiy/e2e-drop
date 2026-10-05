import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'vd-theme';
const THEME_COLORS = { dark: '#0c1117', light: '#e7eef4', lite: '#f4f7fa', simple: '#ffffff' };
const listeners = new Set();

export const THEMES = ['dark', 'light', 'lite', 'simple'];

export function getTheme() {
  const theme = document.documentElement.getAttribute('data-theme');
  return THEMES.includes(theme) ? theme : 'dark';
}

function syncMeta(theme) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  syncMeta(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage may be unavailable (private mode); the choice then lasts for this page only
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme);
}

export const useSimple = () => useTheme() === 'simple';

/** Themes without animation or decoration: the simple (lite) and accessible (simple) ones. */
export const isStill = (theme) => theme === 'simple' || theme === 'lite';

syncMeta(getTheme());
