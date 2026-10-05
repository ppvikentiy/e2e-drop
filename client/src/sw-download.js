// SPDX-License-Identifier: Apache-2.0
// Streaming decryption of downloads inside the service worker: ciphertext is fetched from the server
// (with Range, segment by segment), authenticated and decrypted in constant memory, and handed to
// the browser as an ordinary download. Several files are zipped on the fly. The keys never leave the
// device: the page passes the drop's master key in a message, held in memory for this download only.
import { fileCipher, fromBase64Url, KEY_BYTES } from './crypto/vde2.js';
import { fetchSegment } from './vdeFetch.js';
import { downloadZip } from 'client-zip';

const plans = new Map(); // id -> { plan, port }, consumed once

// filename*=UTF-8'' per RFC 5987, plus an ASCII fallback.
function contentDisposition(name) {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function registerDownloadMessages(self) {
  self.addEventListener('message', (event) => {
    const d = event.data;
    if (d?.type !== 'vde-prepare') return;
    const port = event.ports?.[0] ?? null;
    plans.set(d.id, { plan: d.plan, port });
    // Expire the plan (and the key it carries) if the download never starts.
    setTimeout(() => plans.delete(d.id), 60000);
    // tracking: this worker reports progress, completion and cancellation on the same port.
    port?.postMessage({ ok: true, tracking: true });
  });
}

const PREFIX = '/vde-dl/';
export const isDownloadRequest = (url) => url.pathname.startsWith(PREFIX);

// A ReadableStream of one file's plaintext, decrypted segment by segment from ranged fetches.
export function decryptedStream(plan, master, file, fetchImpl = fetch) {
  let fc;
  let s = 0;
  return new ReadableStream({
    async start() {
      fc = await fileCipher(master, plan.dropId, file.id, file.plainSize);
    },
    async pull(controller) {
      try {
        controller.enqueue(await fetchSegment(plan, fc, file, s, fetchImpl));
        if (++s >= fc.segments) controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

// Passes a stream through unchanged and tells the page how far the browser has read it. The browser
// reads a download only as fast as it writes it to disk, so "done" means the file has been saved.
function tracked(source, total, port) {
  const reader = source.getReader();
  let sent = 0;
  let last = 0;
  const post = (msg) => {
    try {
      port?.postMessage(msg);
    } catch {
      // the page is gone; the download itself goes on
    }
  };
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          post({ type: 'done', bytes: sent });
          return;
        }
        sent += value.byteLength;
        const now = Date.now();
        if (now - last > 250) {
          last = now;
          post({ type: 'progress', bytes: sent, total });
        }
        controller.enqueue(value);
      } catch (err) {
        post({ type: 'error', status: err?.status ?? null });
        controller.error(err);
      }
    },
    cancel(reason) {
      post({ type: 'cancelled' });
      return reader.cancel(reason);
    },
  });
}

export async function respondDownload(url) {
  const id = url.pathname.slice(PREFIX.length);
  const entry = plans.get(id);
  if (!entry) return new Response('Срок ссылки на скачивание истёк. Обновите страницу.', { status: 404 });
  plans.delete(id); // one-shot: a fresh id is minted per click
  const { plan, port } = entry;
  const master = fromBase64Url(plan.master, KEY_BYTES);
  if (!master) return new Response('Ошибка расшифровки. Проверьте правильность ссылки', { status: 400 });

  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

  if (plan.files.length === 1 && !plan.zipName) {
    const file = plan.files[0];
    return new Response(tracked(decryptedStream(plan, master, file), file.plainSize, port), {
      headers: {
        ...headers,
        'Content-Type': file.type || 'application/octet-stream',
        'Content-Disposition': contentDisposition(file.name),
        'Content-Length': String(file.plainSize),
      },
    });
  }

  // Several files: a store-only ZIP, sizes known so the browser can show a total.
  const entries = plan.files.map((file) => ({
    name: file.name,
    input: decryptedStream(plan, master, file),
    size: file.plainSize,
  }));
  const zip = downloadZip(entries);
  const zipLength = Number(zip.headers.get('Content-Length')) || entries.reduce((n, e) => n + e.size, 0);
  return new Response(tracked(zip.body, zipLength, port), {
    headers: {
      ...headers,
      'Content-Type': 'application/zip',
      'Content-Disposition': contentDisposition(plan.zipName || 'files.zip'),
      ...(zip.headers.get('Content-Length') ? { 'Content-Length': zip.headers.get('Content-Length') } : {}),
    },
  });
}
