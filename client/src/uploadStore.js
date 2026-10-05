// Resumable-upload persistence. One record per drop with per-file state.
// The File blobs are not stored (browsers can't): on reopen we show the user what they were
// uploading and ask to pick those files again. A published drop stays for about 7 hours so the
// sender can copy the link again or delete it.
const DB_NAME = 'vd-uploads';
const STORE = 'drops';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'dropId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  if (!('indexedDB' in globalThis)) return undefined;
  try {
    const db = await open();
    try {
      const transaction = db.transaction(STORE, mode);
      const store = transaction.objectStore(STORE);
      const result = await new Promise((resolve, reject) => {
        const out = fn(store);
        transaction.oncomplete = () => resolve(out);
        transaction.onerror = () => reject(transaction.error);
      });
      return await Promise.resolve(result);
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

const req = (operation) =>
  new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });

export async function saveSession(session) {
  await tx('readwrite', (store) => store.put({ ...session, updatedAt: Date.now() }));
}

export async function updateFileProgress(dropId, fileId, uploadedBytes) {
  await tx('readwrite', async (store) => {
    const session = await req(store.get(dropId));
    if (!session) return;
    const file = session.files.find((f) => f.id === fileId);
    if (!file) return;
    file.uploadedBytes = uploadedBytes;
    session.updatedAt = Date.now();
    store.put(session);
  });
}

export async function deleteSession(dropId) {
  await tx('readwrite', (store) => store.delete(dropId));
}

export async function getSession(dropId) {
  return tx('readonly', (store) => req(store.get(dropId)));
}

// Published drop: keep the secret (and the link) so the sender can copy or delete it for a few hours.
// The derived master key was only needed to resume the upload, so it is removed here.
export async function markReady(dropId, patch) {
  await tx('readwrite', async (store) => {
    const session = await req(store.get(dropId));
    if (!session) return;
    const { master: _master, ...rest } = session;
    store.put({ ...rest, ...patch, status: 'ready', bg: false, updatedAt: Date.now() });
  });
}

export function waitForReady(dropId, ms = 10000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      const session = await getSession(dropId);
      if (session?.status === 'ready' && session.token) return resolve(session);
      if (Date.now() - start >= ms) return resolve(null);
      setTimeout(tick, 200);
    };
    tick();
  });
}

export async function listSessions() {
  const sessions = (await tx('readonly', (store) => req(store.getAll()))) ?? [];
  // Drop records older than the server's PENDING_TTL (6 hours). Keep a small grace to survive clock skew.
  const cutoff = Date.now() - 7 * 60 * 60 * 1000;
  const fresh = sessions.filter((s) => s.updatedAt > cutoff);
  if (fresh.length !== sessions.length) {
    await tx('readwrite', async (store) => {
      for (const s of sessions) if (s.updatedAt <= cutoff) store.delete(s.dropId);
    });
  }
  return fresh.sort((a, b) => b.updatedAt - a.updatedAt);
}
