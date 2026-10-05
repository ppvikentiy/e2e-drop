import { useEffect, useState } from 'react';

// Optional site password (set by the operator at deploy time). The server is the gate: without the
// session cookie every API call answers 401 "site-locked". This module only decides what to show.
// The last known answer is kept in localStorage so the installed app can tell, offline, whether it may
// open the QR transfer (which never talks to the server).

const KEY = 'vd-site'; // 'open' (no password) | 'ok' (signed in) | 'locked'
export const LOCKED_EVENT = 'vd-site-locked';

const remember = (value) => {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: the answer lasts for this page load
  }
};
const recall = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** @returns {'checking'|'open'|'locked'} plus a setter for a successful sign-in */
export function useSiteGate() {
  const [state, setState] = useState(() => (recall() === 'locked' ? 'locked' : 'checking'));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/site', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const { locked, allowed } = await res.json();
        if (!alive) return;
        const next = !locked ? 'open' : allowed ? 'ok' : 'locked';
        remember(next);
        setState(next === 'locked' ? 'locked' : 'open');
      } catch {
        // No server (offline, or an old server without the gate): go by the last known answer.
        if (alive) setState(recall() === 'locked' ? 'locked' : 'open');
      }
    })();
    const onLocked = () => {
      remember('locked');
      setState('locked');
    };
    window.addEventListener(LOCKED_EVENT, onLocked);
    return () => {
      alive = false;
      window.removeEventListener(LOCKED_EVENT, onLocked);
    };
  }, []);

  const unlocked = () => {
    remember('ok');
    setState('open');
  };
  return [state, unlocked];
}

/** Called by the API layer when the server says the site is locked. */
export function reportSiteLocked() {
  window.dispatchEvent(new Event(LOCKED_EVENT));
}

export async function siteLogin(password) {
  let res;
  try {
    res = await fetch('/api/site/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  } catch {
    return { ok: false, network: true };
  }
  if (res.ok) return { ok: true };
  const data = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, error: data.error };
}
