// Decrypted downloads on the recipient's side. The fast path streams through the service worker so a
// 500 MB file never sits in memory; the fallback (no controlling service worker, e.g. a first visit
// or a browser that won't stream a SW response) decrypts into a Blob in the page.
import { fileCipher, fromBase64Url, KEY_BYTES } from './crypto/vde2.js';
import { fetchSegment } from './vdeFetch.js';
import { explainHttpError } from './api.js';

export const DECRYPT_ERROR = 'Ошибка расшифровки. Проверьте правильность ссылки';

const randomId = () => crypto.getRandomValues(new Uint32Array(4)).join('-');

function clickDownload(url, name) {
  const a = document.createElement('a');
  a.href = url;
  if (name) a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Hands the plan to the service worker and starts the download. Resolves with a promise that settles
 * when the browser has written the whole file ('done'), the user cancelled it ('cancelled'), or it failed.
 * A service worker from an older build does not report progress: then the outcome is unknown (null).
 */
function viaServiceWorker(plan, onProgress) {
  return new Promise((resolve, reject) => {
    const sw = navigator.serviceWorker.controller;
    const id = randomId();
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(new Error('timeout')), 5000);
    let settle;
    const finished = new Promise((res, rej) => {
      settle = { res, rej };
    });
    channel.port1.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.ok !== undefined) {
        clearTimeout(timer);
        if (!msg.ok) return reject(new Error('prepare failed'));
        clickDownload(`/vde-dl/${id}`);
        if (!msg.tracking) settle.res(null);
        resolve({ finished });
        return;
      }
      if (msg.type === 'progress' && msg.total) onProgress?.(Math.min(1, msg.bytes / msg.total));
      else if (msg.type === 'done') settle.res('done');
      else if (msg.type === 'cancelled') settle.res('cancelled');
      else if (msg.type === 'error') settle.rej(new Error(msg.status ? explainHttpError(msg.status) : DECRYPT_ERROR));
      if (msg.type && msg.type !== 'progress') channel.port1.close();
    };
    sw.postMessage({ type: 'vde-prepare', id, plan }, [channel.port2]);
  });
}

async function decryptToBlob(plan, master, file, onProgress) {
  const fc = await fileCipher(master, plan.dropId, file.id, file.plainSize);
  const parts = [];
  for (let s = 0; s < fc.segments; s++) {
    try {
      parts.push(await fetchSegment(plan, fc, file, s));
    } catch (err) {
      if (err.res) {
        const payload = await err.res.json().catch(() => ({}));
        throw new Error(explainHttpError(err.status, payload.error, payload.reason));
      }
      throw new Error(DECRYPT_ERROR);
    }
    onProgress?.((s + 1) / fc.segments);
  }
  return new Blob(parts, { type: file.type || 'application/octet-stream' });
}

async function fallbackDownload(plan, onProgress) {
  const master = fromBase64Url(plan.master, KEY_BYTES);
  if (!master) throw new Error(DECRYPT_ERROR);
  if (plan.files.length === 1 && !plan.zipName) {
    const file = plan.files[0];
    const blob = await decryptToBlob(plan, master, file, onProgress);
    const url = URL.createObjectURL(blob);
    clickDownload(url, file.name);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  const { downloadZip } = await import('client-zip');
  const entries = [];
  for (const file of plan.files) {
    entries.push({ name: file.name, input: await decryptToBlob(plan, master, file, onProgress) });
  }
  const blob = await downloadZip(entries).blob();
  const url = URL.createObjectURL(blob);
  clickDownload(url, plan.zipName || 'files.zip');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Downloads and decrypts a drop (one file, or all files as a ZIP).
 * @returns {Promise<{streamed:boolean, outcome:'done'|'cancelled'|null}>} outcome null: started, end unknown
 */
export async function downloadEncrypted(plan, { onProgress } = {}) {
  if (navigator.serviceWorker?.controller) {
    let started;
    try {
      started = await viaServiceWorker(plan, onProgress);
    } catch {
      started = null; // service worker could not take it: fall back to in-memory decryption
    }
    if (started) return { streamed: true, outcome: await started.finished };
  }
  await fallbackDownload(plan, onProgress);
  return { streamed: false, outcome: 'done' };
}
