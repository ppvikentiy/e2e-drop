// Background Fetch upload for Chrome on Android. The page encrypts each file to OPFS (one segment
// in memory at a time), then hands the ciphertext to the browser. The upload continues if the
// app is closed; the service worker publishes the drop when the last file lands.
import { BG_DIR } from './bgFiles.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function plainProgress(cipherSizes, plainSizes, uploadedCipher) {
  let left = Math.max(0, uploadedCipher || 0);
  return cipherSizes.map((cipher, i) => {
    const size = Math.max(0, cipher || 0);
    const take = Math.min(size, left);
    left -= take;
    const plain = plainSizes[i] || 0;
    if (!size) return plain;
    return Math.min(plain, Math.round((take / size) * plain));
  });
}

export async function getBackgroundRegistration() {
  if (!/Android/i.test(navigator.userAgent)) return null;
  if (!('serviceWorker' in navigator) || !('BackgroundFetchManager' in globalThis)) return null;
  if (!navigator.storage?.getDirectory) return null;
  const ready = navigator.serviceWorker.ready;
  const reg = navigator.serviceWorker.controller ? await ready : await Promise.race([ready, sleep(1500).then(() => null)]);
  if (!reg?.active || !reg.backgroundFetch) return null;
  return reg;
}

async function hasRoom(bytes) {
  try {
    const est = await navigator.storage.estimate();
    if (est.quota == null) return true;
    return est.quota - (est.usage || 0) >= bytes;
  } catch {
    return true;
  }
}

// Returns the active registration, or null when background upload should not be used.
export async function canBackgroundUpload(cipherBytes) {
  const reg = await getBackgroundRegistration();
  if (!reg) return null;
  // The browser copies each request body, so the ciphertext briefly occupies about twice the space.
  if (!(await hasRoom(cipherBytes * 2 + 8 * 1024 * 1024))) return null;
  return reg;
}

// `cipher` is the file's VDE2 fileCipher() context.
export async function writeCipherFile({ dropId, fileId, file, cipher, onPlain, signal }) {
  const { cipherSource } = await import('./crypto/vde2.js');
  const readPlain = async (s, e) => new Uint8Array(await file.slice(s, e).arrayBuffer());
  const src = cipherSource(readPlain, cipher);
  const root = await navigator.storage.getDirectory();
  const parent = await root.getDirectoryHandle(BG_DIR, { create: true });
  const dir = await parent.getDirectoryHandle(dropId, { create: true });
  const handle = await dir.getFileHandle(fileId, { create: true });
  const writable = await handle.createWritable();
  const chunk = 8 * 1024 * 1024;
  try {
    for (let pos = 0; pos < src.cipherLength; pos += chunk) {
      if (signal?.aborted) throw Object.assign(new Error('Загрузка прервана'), { aborted: true });
      const end = Math.min(pos + chunk, src.cipherLength);
      await writable.write(await src.read(pos, end));
      const ratio = src.cipherLength ? end / src.cipherLength : 1;
      onPlain?.(Math.min(file.size, Math.round(ratio * file.size)));
    }
    await writable.close();
  } catch (err) {
    await writable.abort().catch(() => {});
    throw err;
  }
  const body = await handle.getFile();
  if (body.size !== src.cipherLength) throw new Error('Не удалось подготовить файл к отправке');
  return body;
}

export async function startBackgroundFetch(reg, { dropId, secret, parts }) {
  const existing = await reg.backgroundFetch.get(dropId);
  if (existing) await existing.abort();
  const requests = parts.map(
    ({ id, body }) =>
      new Request(new URL(`/api/drops/${dropId}/files/${id}`, location.origin), {
        method: 'PUT',
        mode: 'same-origin',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Upload-Secret': secret,
        },
        body,
      }),
  );
  return reg.backgroundFetch.fetch(dropId, requests, {
    title: 'Отправка файлов',
    icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    downloadTotal: 0,
  });
}

export function watchBackgroundFetch(job, { cipherSizes, plainSizes, onProgress }) {
  const apply = () => {
    const uploaded = job.uploaded || 0;
    const total = job.uploadTotal || cipherSizes.reduce((sum, n) => sum + n, 0);
    onProgress?.(plainProgress(cipherSizes, plainSizes, uploaded), { uploaded, total, result: job.result });
  };
  return new Promise((resolve) => {
    const finish = () => {
      if (job.result !== 'success' && job.result !== 'failure') return false;
      job.removeEventListener('progress', onProg);
      apply();
      resolve(job.result);
      return true;
    };
    const onProg = () => {
      apply();
      finish();
    };
    job.addEventListener('progress', onProg);
    apply();
    finish();
  });
}
