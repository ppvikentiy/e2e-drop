import { isStandalone } from './pwa.js';

let blockMessage = null;

export function setNavigationBlock(message) {
  blockMessage = message;
}

// The installed app's "home base": offline it's the QR hub, online it's the upload page.
export function basePath() {
  return navigator.onLine === false ? '/offline' : '/upload';
}

const norm = (p) => p.replace(/\/+$/, '') || '/';

// Online, both /upload and /home resolve to the upload page in the installed app (see App.currentPath),
// so either counts as the base.
function isBasePath(path) {
  const n = norm(path);
  if (navigator.onLine === false) return n === '/offline';
  return n === '/upload' || n === '/home';
}

export function navigate(to) {
  if (blockMessage && !window.confirm(blockMessage)) return;
  blockMessage = null;

  // In the installed app, keep the history stack shallow so the hardware Back key is predictable:
  // Back from any screen returns to the base page, and Back on the base page lets the OS close the app.
  if (isStandalone()) {
    const onBase = isBasePath(window.location.pathname);
    if (isBasePath(to)) {
      if (onBase) {
        window.history.replaceState(null, '', to);
      } else {
        // A sub-page sits on top of the base entry; pop it so a further Back exits the app.
        window.history.back();
        return;
      }
    } else if (onBase) {
      window.history.pushState(null, '', to); // base → sub: one entry above base
    } else {
      window.history.replaceState(null, '', to); // sub → sub: never stack deeper than base + current
    }
  } else {
    window.history.pushState(null, '', to);
  }

  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

// Make sure the base page sits beneath the current one when the installed app launches deep
// (e.g. a shortcut), so Back always has the base page to return to before the app closes.
export function ensureBaseBeneath() {
  if (!isStandalone()) return;
  if (isBasePath(window.location.pathname)) return;
  const here = window.location.pathname + window.location.search + window.location.hash;
  window.history.replaceState(null, '', basePath());
  window.history.pushState(null, '', here);
}

export function Link({ to, onClick, ...props }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
      {...props}
    />
  );
}
