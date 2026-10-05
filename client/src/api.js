import { getLocale } from './locale.js';
import { reportSiteLocked } from './siteGate.js';

// [[action]] is the fix. ErrorText underlines it in the simple theme.
const HTTP_ERROR = {
  ru: {
    byReason: {
      db_auth: 'Проблема на стороне сервиса. [[Подождите]] (db_auth)',
      db_down: 'Проблема на стороне сервиса. [[Подождите]] (db_down)',
      db_busy: 'Проблема на стороне сервиса. [[Подождите]] (db_busy)',
      timeout: 'Проблема на стороне сервиса. [[Подождите]] (timeout)',
      storage: 'Проблема на стороне сервиса. [[Подождите]] (storage)',
      internal: 'Проблема на стороне сервиса. [[Подождите]] (internal)',
      'site-locked': 'Нужен пароль сайта. [[Войдите снова]].',
    },
    offline: 'Нет интернета. [[Проверьте соединение]].',
    unreachable: 'Сервис не ответил. [[Подождите]] (сеть)',
    400: 'Сервер не принял запрос: данные повреждены или страница устарела. [[Обновите страницу]].',
    401: 'Нет доступа: пароль или ключ не подошёл. [[Проверьте и введите снова]].',
    403: 'Сервер запретил это действие.',
    404: 'Ничего не найдено: ссылка или код устарели. [[Попросите новую]].',
    409: 'Данные на сервере уже изменились. [[Обновите страницу]].',
    413: 'Файл слишком большой. [[Выберите файл до 500 МБ]].',
    429: 'Слишком много запросов подряд. [[Подождите минуту]].',
    500: 'Проблема на стороне сервиса. [[Подождите]] (500)',
    502: 'Проблема на стороне сервиса. [[Подождите]] (502)',
    503: 'Проблема на стороне сервиса. [[Подождите]] (503)',
    504: 'Проблема на стороне сервиса. [[Подождите]] (504)',
    generic: 'Не получилось выполнить запрос. [[Попробуйте ещё раз]].',
  },
  en: {
    byReason: {
      db_auth: 'Something went wrong on our side. [[Wait]] (db_auth)',
      db_down: 'Something went wrong on our side. [[Wait]] (db_down)',
      db_busy: 'Something went wrong on our side. [[Wait]] (db_busy)',
      timeout: 'Something went wrong on our side. [[Wait]] (timeout)',
      storage: 'Something went wrong on our side. [[Wait]] (storage)',
      internal: 'Something went wrong on our side. [[Wait]] (internal)',
      'site-locked': 'The site password is needed. [[Sign in again]].',
    },
    offline: 'No internet. [[Check your connection]].',
    unreachable: 'The service did not answer. [[Wait]] (network)',
    400: 'The server rejected the request: the data is damaged or the page is stale. [[Refresh the page]].',
    401: 'Access denied: the password or key did not match. [[Check it and enter it again]].',
    403: 'The server refused this action.',
    404: 'Nothing was found: the link or code has expired. [[Ask for a new one]].',
    409: 'The data on the server has already changed. [[Refresh the page]].',
    413: 'The file is too large. [[Choose a file under 500 MB]].',
    429: 'Too many requests in a row. [[Wait a minute]].',
    500: 'Something went wrong on our side. [[Wait]] (500)',
    502: 'Something went wrong on our side. [[Wait]] (502)',
    503: 'Something went wrong on our side. [[Wait]] (503)',
    504: 'Something went wrong on our side. [[Wait]] (504)',
    generic: 'The request did not go through. [[Try again]].',
  },
};

function dict() {
  return HTTP_ERROR[getLocale()] || HTTP_ERROR.ru;
}

function isStatusStub(text) {
  return (
    /^(Ошибка сервера|Ошибка загрузки|Server error|Internal Server Error|Внутренняя ошибка сервера)\b/i.test(text) ||
    /^Сервер не смог выполнить запрос\b/.test(text) ||
    /^The server could not complete the request\b/.test(text) ||
    /^\d{3}$/.test(text)
  );
}

export function explainHttpError(status, serverMessage, reason) {
  const messages = dict();
  if (reason && messages.byReason[reason]) return messages.byReason[reason];
  const text = typeof serverMessage === 'string' ? serverMessage.trim() : '';
  if (text && !isStatusStub(text)) return text;
  if (status >= 500) return messages[status] || messages[500];
  return messages[status] || messages.generic;
}

function networkError() {
  const messages = dict();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return Object.assign(new Error(offline ? messages.offline : messages.unreachable), { network: true, offline });
}

function readXhrError(xhr) {
  let payload = {};
  try {
    payload = JSON.parse(xhr.responseText);
  } catch {
    // non-JSON response body
  }
  if (xhr.status === 401 && payload.reason === 'site-locked') reportSiteLocked();
  return Object.assign(new Error(explainHttpError(xhr.status, payload.error, payload.reason)), {
    status: xhr.status,
    uploadedBytes: payload.uploadedBytes,
  });
}

async function request(method, url, { body, headers } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw networkError();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && data.reason === 'site-locked') reportSiteLocked();
    const err = new Error(explainHttpError(res.status, data.error, data.reason));
    err.status = res.status;
    if (data.retryAfter) err.retryAfter = data.retryAfter;
    throw err;
  }
  return data;
}

export const createDrop = (payload) => request('POST', '/api/drops', { body: payload });

// VDE2-5pr sealed manifest (base64), and for a password drop the gate token's hash.
export const putManifest = (dropId, secret, payload) =>
  request('PUT', `/api/drops/${dropId}/manifest`, { body: payload, headers: { 'X-Upload-Secret': secret } });

export const finalizeDrop = (dropId, secret) =>
  request('POST', `/api/drops/${dropId}/finalize`, { headers: { 'X-Upload-Secret': secret } });

// The first caller publishes the drop. A parallel caller (the page and the service worker)
// gets 409 and reads the token the winner stored in IndexedDB.
export async function claimFinalize(dropId, secret) {
  try {
    return await finalizeDrop(dropId, secret);
  } catch (err) {
    if (err.status !== 409) throw err;
    const { waitForReady } = await import('./uploadStore.js');
    const saved = await waitForReady(dropId);
    if (saved?.token) {
      return { token: saved.token, expiresAt: saved.expiresAt, maxDownloads: saved.maxDownloads };
    }
    throw new Error('Ссылка создана, но браузер её не сохранил. [[Откройте страницу загрузки ещё раз]].');
  }
}

export const getUploadStatus = (dropId, fileId, secret) =>
  request('GET', `/api/drops/${dropId}/files/${fileId}/status`, { headers: { 'X-Upload-Secret': secret } });

// Thin wrapper around XHR so progress and abort both work. The server validates offsets.
function putChunk({ dropId, fileId, secret, blob, start, end, totalSize, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/drops/${dropId}/files/${fileId}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Upload-Secret', secret);
    xhr.setRequestHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
    xhr.upload.onprogress = (e) => onProgress?.(start + e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          return resolve(JSON.parse(xhr.responseText));
        } catch {
          return resolve({ uploadedBytes: end + 1 });
        }
      }
      const err = readXhrError(xhr);
      reject(err);
    };
    xhr.onerror = () => reject(networkError());
    xhr.onabort = () => reject(Object.assign(new Error('Загрузка прервана'), { aborted: true }));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_RETRIES = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Uploads a file as VDE2 ciphertext, resumably. The server stores and counts ciphertext bytes;
// progress is reported back in plaintext bytes so the UI's totals stay in the sizes the user sees.
// `cipher` is the file's fileCipher() context.
export async function uploadEncryptedFile({ dropId, fileId, secret, file, cipher, onProgress, signal }) {
  const { cipherSource } = await import('./crypto/vde2.js');
  const readPlain = async (s, e) => new Uint8Array(await file.slice(s, e).arrayBuffer());
  const src = cipherSource(readPlain, cipher);
  const total = src.cipherLength;
  const toPlain = (cipherBytes) => Math.min(file.size, Math.round((cipherBytes / total) * file.size));

  let uploadedBytes = 0;
  try {
    const status = await getUploadStatus(dropId, fileId, secret);
    uploadedBytes = status.uploadedBytes || 0;
    if (status.uploaded) return onProgress?.(file.size);
  } catch {
    // brand-new file: start from zero
  }
  onProgress?.(toPlain(uploadedBytes));

  while (uploadedBytes < total) {
    const start = uploadedBytes;
    const end = Math.min(start + CHUNK_SIZE, total) - 1;
    const blob = await src.read(start, end + 1);
    let attempt = 0;
    for (;;) {
      try {
        const result = await putChunk({
          dropId, fileId, secret, blob, start, end, totalSize: total, signal,
          onProgress: (loaded) => onProgress?.(toPlain(loaded)),
        });
        uploadedBytes = result.uploadedBytes;
        break;
      } catch (err) {
        if (err.aborted) throw err;
        if (err.status === 409 && typeof err.uploadedBytes === 'number') {
          uploadedBytes = err.uploadedBytes;
          onProgress?.(toPlain(uploadedBytes));
          break;
        }
        if (!(err.network || (err.status && err.status >= 500)) || attempt >= MAX_RETRIES) throw err;
        await sleep(Math.min(30000, 1000 * 2 ** attempt++));
      }
    }
  }
  onProgress?.(file.size);
}

export const getDrop = (token) => request('GET', `/api/d/${token}`);

// Password drops: the gate token is derived in the browser; the password itself is never sent.
export const unlockDrop = (token, gateToken) => request('POST', `/api/d/${token}/unlock`, { body: { gateToken } });

// Ciphertext of file `index`. The access key goes in a header so it stays out of URLs and logs.
export const cipherFileUrl = (token, index) => `/api/d/${token}/files/${index}`;

// ---- Pairing: a computer (no camera, no way to receive a link) waits for a phone's upload ----
export const createPairing = () => request('POST', '/api/pair');

export const getPairingStatus = (code, secret) =>
  request('GET', `/api/pair/${code}/status`, { headers: { 'X-Pair-Secret': secret } });

export const deletePairing = (code, secret) =>
  request('DELETE', `/api/pair/${code}`, { headers: { 'X-Pair-Secret': secret } });

export const checkPairCode = (code) => request('GET', `/api/pair/${code}/check`);
