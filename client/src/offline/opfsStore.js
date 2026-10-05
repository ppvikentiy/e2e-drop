import { segmentGeometry } from 'vqd';

// OPFS-backed storage for the VQD receiver. Runs in a dedicated worker only (synchronous access handles).
// Layout: vqd/<fileId>/s<segment>.sym  — appended records [u32 index][payload]
//         vqd/<fileId>/data.bin        — verified segments, written at their final offsets
//         vqd/<fileId>/d<segment>      — empty marker: segment verified and written

const enc = (n) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
};

export async function opfsSupported() {
  try {
    if (!navigator.storage?.getDirectory) return false;
    const root = await navigator.storage.getDirectory();
    const probe = await root.getFileHandle('.vqd-probe', { create: true });
    if (typeof probe.createSyncAccessHandle !== 'function') return false;
    const h = await probe.createSyncAccessHandle();
    h.close();
    await root.removeEntry('.vqd-probe');
    return true;
  } catch {
    return false;
  }
}

async function baseDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('vqd', { create: true });
}

/** Removes every stored transfer except `keep` (one transfer at a time keeps the phone's storage in check). */
export async function pruneTransfers(keep) {
  const base = await baseDir();
  for await (const [name] of base.entries()) {
    if (name !== keep) await base.removeEntry(name, { recursive: true }).catch(() => {});
  }
}

export async function listTransfers() {
  const base = await baseDir();
  const out = [];
  for await (const [name, handle] of base.entries()) if (handle.kind === 'directory') out.push(name);
  return out;
}

export class OpfsStorage {
  constructor() {
    this.blockLen = 0;
    this.handles = new Map(); // `${fid}:${segment}` -> sync access handle
    this.dirs = new Map();
    this.dataHandle = null;
    this.dataFid = null;
  }

  async dir(fid) {
    if (!this.dirs.has(fid)) this.dirs.set(fid, await (await baseDir()).getDirectoryHandle(fid, { create: true }));
    return this.dirs.get(fid);
  }

  async handle(fid, segment) {
    const key = `${fid}:${segment}`;
    if (!this.handles.has(key)) {
      const file = await (await this.dir(fid)).getFileHandle(`s${segment}.sym`, { create: true });
      this.handles.set(key, await file.createSyncAccessHandle());
    }
    return this.handles.get(key);
  }

  // ---- SymbolStore ----
  async append(fid, segment, index, payload) {
    const h = await this.handle(fid, segment);
    const at = h.getSize();
    h.write(enc(index), { at });
    h.write(payload, { at: at + 4 });
  }

  async *symbols(fid, segment) {
    const h = await this.handle(fid, segment);
    const rec = 4 + this.blockLen;
    const count = Math.floor(h.getSize() / rec);
    const buf = new Uint8Array(rec * 64);
    for (let i = 0; i < count; i += 64) {
      const n = Math.min(64, count - i);
      h.read(buf.subarray(0, n * rec), { at: i * rec });
      for (let j = 0; j < n; j++) {
        const o = j * rec;
        const index = ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0;
        yield { index, payload: buf.slice(o + 4, o + rec) };
      }
    }
  }

  async indices(fid, segment) {
    const dir = await this.dir(fid);
    try {
      await dir.getFileHandle(`s${segment}.sym`);
    } catch {
      return [];
    }
    const out = [];
    for await (const s of this.symbols(fid, segment)) out.push(s.index);
    return out;
  }

  async drop(fid, segment) {
    const key = `${fid}:${segment}`;
    this.handles.get(key)?.close();
    this.handles.delete(key);
    await (await this.dir(fid)).removeEntry(`s${segment}.sym`).catch(() => {});
  }

  // ---- segment sink ----
  /** Called by the receiver once the manifest is known. */
  async open(fid, manifest) {
    this.blockLen = manifest.blockLen;
    this.manifest = manifest;
  }

  async write(fid, segment, bytes) {
    if (this.dataFid !== fid) {
      this.dataHandle?.close();
      const file = await (await this.dir(fid)).getFileHandle('data.bin', { create: true });
      this.dataHandle = await file.createSyncAccessHandle();
      this.dataFid = fid;
    }
    this.dataHandle.write(bytes, { at: segmentGeometry(this.manifest, segment).start });
    this.dataHandle.flush();
    await (await this.dir(fid)).getFileHandle(`d${segment}`, { create: true });
  }

  async has(fid, segment) {
    try {
      await (await this.dir(fid)).getFileHandle(`d${segment}`);
      return true;
    } catch {
      return false;
    }
  }

  /** The finished file, read back from OPFS without loading it into memory. */
  async file(fid, fileSize) {
    if (this.dataHandle) {
      this.dataHandle.truncate(fileSize);
      this.dataHandle.flush();
      this.dataHandle.close();
      this.dataHandle = null;
      this.dataFid = null;
    }
    return (await (await this.dir(fid)).getFileHandle('data.bin')).getFile();
  }

  close() {
    for (const h of this.handles.values()) h.close();
    this.handles.clear();
    this.dataHandle?.close();
    this.dataHandle = null;
    this.dataFid = null;
  }
}
