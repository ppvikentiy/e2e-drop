import { useSyncExternalStore } from 'react';

const KEY = 'vd-consent';
const listeners = new Set();

function read() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'accepted' || value === 'declined' ? value : null;
  } catch {
    return null;
  }
}

let choice = read();

function emit() {
  listeners.forEach((fn) => fn());
}

export function setConsent(next) {
  choice = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // private mode: the choice lasts for this page load
  }
  emit();
}

export function useConsent() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => choice,
  );
}
