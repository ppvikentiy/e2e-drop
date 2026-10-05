// Service worker. Emitted into dist/sw.js at build time, with __BUILD_ID__ replaced.
// Caches only the app shell and static assets (all precached on install). API calls and file downloads always go to the network.
import { removeCipherDir } from './bgFiles.js';
import { isDownloadRequest, registerDownloadMessages, respondDownload } from './sw-download.js';
import { getSession, markReady, waitForReady } from './uploadStore.js';

const BUILD = __BUILD_ID__;
const ASSET_CACHE = `vd-assets-${BUILD}`;
const SHELL_CACHE = `vd-shell-${BUILD}`;
const SHARE_CACHE = 'vd-share';
const SHELL_KEY = '/__shell';

const OFFLINE_HTML = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Нет подключения</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#000;font:18px/1.5 system-ui,sans-serif;text-align:center;padding:24px}h1{font-size:26px;margin:0 0 8px}p{margin:0 0 20px;color:#333}button{font:inherit;font-weight:600;padding:12px 22px;border:2px solid #000;border-radius:10px;background:#000;color:#fff;cursor:pointer}</style></head><body><div><h1>Нет подключения к интернету</h1><p>Для отправки и скачивания файлов нужен интернет. Проверьте соединение и повторите.</p><button onclick="location.reload()">Повторить</button></div></body></html>`;

// Every built asset (scripts, styles, fonts, the QR decoder's WebAssembly), filled in at build time.
const PRECACHE = __PRECACHE__;
const PRECACHE_EXTRA = ['/manifest.webmanifest', '/theme-init.js', '/icons/logo-white.png', '/icons/logo-black.png'];

registerDownloadMessages(self);

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache());
});

// Fetch everything up front so that the offline QR pages work even if they were never opened online.
async function precache() {
  const assets = await caches.open(ASSET_CACHE);
  await Promise.all([...PRECACHE, ...PRECACHE_EXTRA].map((url) => assets.add(url).catch(() => {})));
  try {
    const shell = await fetch('/offline', { cache: 'no-store' });
    const type = shell.headers.get('content-type') || '';
    if (shell.ok && type.includes('text/html')) await (await caches.open(SHELL_CACHE)).put(SHELL_KEY, shell);
  } catch {
    // offline during install: the shell is cached on the next navigation instead
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([ASSET_CACHE, SHELL_CACHE, SHARE_CACHE]);
      for (const name of await caches.keys()) if (!keep.has(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // In-browser decrypted download (end-to-end encrypted drops): stream plaintext to the browser.
  if (request.method === 'GET' && isDownloadRequest(url)) {
    event.respondWith(respondDownload(url));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShare(request));
    return;
  }
  if (request.method !== 'GET' || url.pathname.startsWith('/api/') || request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  } else if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest' || url.pathname === '/theme-init.js') {
    // theme-init.js applies the saved theme before paint; it must be available offline too,
    // so the installed app keeps the chosen theme (and language/font) with no network.
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function navigate(request) {
  try {
    const response = await fetch(request);
    const type = response.headers.get('content-type') || '';
    if (response.ok && type.includes('text/html')) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(SHELL_KEY, response.clone());
    }
    return response;
  } catch {
    const cached = await (await caches.open(SHELL_CACHE)).match(SHELL_KEY);
    return cached || new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit || refresh;
}

// Chrome on Android keeps uploading after the page closes. When every file has landed, publish the drop.
async function notifyReady(dropId) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of all) client.postMessage({ type: 'vd-bg-ready', dropId });
}

async function publishBackgroundDrop(dropId) {
  const session = await getSession(dropId);
  if (!session?.uploadSecret) return;
  if (session.status === 'ready' && session.token) {
    await removeCipherDir(dropId);
    await notifyReady(dropId);
    return;
  }
  const res = await fetch(`/api/drops/${dropId}/finalize`, {
    method: 'POST',
    headers: { 'X-Upload-Secret': session.uploadSecret },
  });
  if (res.status === 409) {
    const saved = await waitForReady(dropId);
    if (!saved?.token) return;
    await removeCipherDir(dropId);
    await notifyReady(dropId);
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'finalize failed');
  await markReady(dropId, { token: data.token, expiresAt: data.expiresAt, maxDownloads: data.maxDownloads });
  await removeCipherDir(dropId);
  await notifyReady(dropId);
}

self.addEventListener('backgroundfetchsuccess', (event) => {
  const dropId = event.registration.id;
  event.waitUntil(
    (async () => {
      try {
        await publishBackgroundDrop(dropId);
        await event.updateUI({ title: 'Файлы отправлены' }).catch(() => {});
      } catch (err) {
        console.error('[bg] finalize failed:', err.message);
        await event.updateUI({ title: 'Не удалось завершить отправку' }).catch(() => {});
      }
    })(),
  );
});

self.addEventListener('backgroundfetchfail', (event) => {
  event.waitUntil(event.updateUI({ title: 'Отправка прервалась' }).catch(() => {}));
});

self.addEventListener('backgroundfetchclick', (event) => {
  event.waitUntil(self.clients.openWindow('/upload'));
});

// Share Target: files shared from other apps arrive as a POST; keep them in a cache for the page to pick up.
async function handleShare(request) {
  const to = (query) => Response.redirect(new URL(`/upload${query}`, self.location.origin).href, 303);
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter((f) => typeof f !== 'string');
    const cache = await caches.open(SHARE_CACHE);
    for (const key of await cache.keys()) await cache.delete(key);
    let i = 0;
    for (const file of files) {
      await cache.put(
        `/__shared/${i++}`,
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name),
            'X-Last-Modified': String(file.lastModified || Date.now()),
          },
        }),
      );
    }
    return to(files.length ? `?shared=${files.length}` : '');
  } catch {
    return to('');
  }
}
