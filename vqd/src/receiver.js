// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

import { gunzip } from './compress.js';
import { deriveKeys, openMeta, openSegment, verifierMatches } from './crypto.js';
import { segmentDegreeTable } from './degree.js';
import { SegmentDecoder } from './fountain.js';
import {
  MODE_GZIP,
  TYPE_CALIBRATION,
  TYPE_DATA,
  TYPE_MANIFEST,
  computeFileId,
  decodeManifestBody,
  fileId32,
  parseFrame,
  segmentGeometry,
} from './format.js';
import { defaultSha256 } from './sender.js';

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const equalBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Where raw symbols wait until their segment can be decoded. Browsers back this with OPFS or
 * IndexedDB so that a 150 MB transfer does not live in memory; this one is the in-memory reference.
 * Keys are (fileId hex, segment), so different files never mix and a resumed transfer finds its data.
 *
 * Interface: append(fid, segment, index, payload), symbols(fid, segment) async iterable of
 * { index, payload }, drop(fid, segment); optional indices(fid, segment) and open(fid, manifest)
 * (called once a manifest is accepted, before any other call for that file).
 */
export class MemorySymbolStore {
  constructor() {
    this.map = new Map();
  }
  async append(fid, segment, index, payload) {
    const key = `${fid}:${segment}`;
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push({ index, payload: payload.slice() });
  }
  async *symbols(fid, segment) {
    for (const s of this.map.get(`${fid}:${segment}`) ?? []) yield s;
  }
  /** Indices only (optional in the interface): lets a resuming receiver rebuild its bookkeeping cheaply. */
  async indices(fid, segment) {
    return (this.map.get(`${fid}:${segment}`) ?? []).map((s) => s.index);
  }
  async drop(fid, segment) {
    this.map.delete(`${fid}:${segment}`);
  }
}

/**
 * Where verified segments go. Browsers back this with OPFS / a File System handle.
 * Interface: write(fid, segment, bytes), has(fid, segment) (may be async); optional open(fid, manifest).
 */
export class MemorySegmentSink {
  constructor() {
    this.map = new Map();
  }
  async write(fid, segment, bytes) {
    this.map.set(`${fid}:${segment}`, bytes.slice());
  }
  has(fid, segment) {
    return this.map.has(`${fid}:${segment}`);
  }
  assemble(fid, manifest) {
    const out = new Uint8Array(manifest.fileSize);
    for (let s = 0; s < manifest.segmentCount; s++) {
      const part = this.map.get(`${fid}:${s}`);
      if (!part) throw new Error(`segment ${s} missing`);
      out.set(part, segmentGeometry(manifest, s).start);
    }
    return out;
  }
}

/**
 * Feed it decoded QR payloads in any order, with any losses, from any point in the stream.
 * push() calls are serialised internally.
 */
export class Receiver {
  constructor({ store = new MemorySymbolStore(), sink = new MemorySegmentSink(), sha256 = defaultSha256, maxFileSize, decompress = gunzip, checkSpace = null } = {}) {
    this.store = store;
    this.sink = sink;
    this.sha256 = sha256;
    this.maxFileSize = maxFileSize;
    this.decompress = decompress;
    // Optional async (fileSize) => boolean: lets the host refuse a file the device has no room for.
    this.checkSpace = checkSpace;
    this.queue = Promise.resolve();
    this.reset();
    this.stats = { frames: 0, foreign: 0, corrupt: 0, symbols: 0, duplicates: 0, hashFailures: 0, decryptFailures: 0, decodeAttempts: 0 };
    this.password = null; // kept in memory only, never written anywhere
  }

  reset() {
    this.fid = null;
    this.manifest = null;
    this.pendingManifest = null;
    this.done = null;
    this.counts = null;
    this.nextAttempt = null;
    this.seen = null;
    this.dry = null;
    this.complete = false;
    this.keys = null;
  }

  /** True once the stream can be read: it is not encrypted, or the right password has been given. */
  get unlocked() {
    return Boolean(this.manifest) && (!this.manifest.enc || Boolean(this.keys));
  }

  get encrypted() {
    return Boolean(this.manifest?.enc);
  }

  /**
   * Gives the receiver the password (before or after the manifest has arrived). Symbols received while the
   * stream was locked are kept, so nothing needs to be scanned again.
   * @returns {Promise<{kind: string}>} 'password-set' | 'not-encrypted' | 'wrong-password' | 'unlocked'
   */
  setPassword(password) {
    const result = this.queue.then(async () => {
      this.password = password;
      if (!this.manifest) return { kind: 'password-set' };
      if (!this.manifest.enc) return { kind: 'not-encrypted' };
      return this.unlock();
    });
    this.queue = result.catch(() => {});
    return result;
  }

  /** Forgets the password and the keys derived from it. */
  clearPassword() {
    this.password = null;
    this.keys = null;
  }

  async unlock() {
    const { enc } = this.manifest;
    if (this.password == null) return { kind: 'password-needed' };
    const keys = await deriveKeys(this.password, enc.salt, enc.iterations);
    if (!verifierMatches(keys, enc.verifier)) {
      this.keys = null;
      return { kind: 'wrong-password' };
    }
    this.keys = keys;
    try {
      const meta = await openMeta(keys, enc.metaNonce, enc.metaCt);
      this.manifest.name = meta.name;
      this.manifest.mime = meta.mime;
    } catch {
      this.keys = null;
      this.stats.decryptFailures++;
      return { kind: 'decrypt-failed' };
    }
    // Segments whose symbols all arrived while the stream was locked can be opened now.
    for (let s = 0; s < this.manifest.segmentCount; s++) {
      if (!this.done[s] && this.dry[s]?.complete) await this.decodeSegment(s);
    }
    return { kind: 'unlocked', name: this.manifest.name, mime: this.manifest.mime, complete: this.complete };
  }

  /** @returns {Promise<object>} what the frame turned out to be (for UI feedback and tests) */
  push(frameBytes) {
    const result = this.queue.then(() => this.handle(frameBytes));
    this.queue = result.catch(() => {});
    return result;
  }

  get progress() {
    if (!this.manifest) return 0;
    const m = this.manifest;
    let acc = 0;
    for (let s = 0; s < m.segmentCount; s++) {
      const g = segmentGeometry(m, s);
      acc += this.done[s] ? g.length : Math.min(0.99, this.counts[s] / g.K) * g.length;
    }
    return Math.min(1, acc / m.fileSize);
  }

  get segmentsDone() {
    return this.done ? this.done.reduce((a, b) => a + b, 0) : 0;
  }

  /** The finished file; only for the in-memory sink. */
  result() {
    if (!this.complete) throw new Error('transfer not complete');
    return this.sink.assemble(this.fid, this.manifest);
  }

  async handle(frameBytes) {
    this.stats.frames++;
    const f = parseFrame(frameBytes);
    if (f.verdict === 'foreign') {
      this.stats.foreign++;
      return { kind: 'foreign' };
    }
    if (f.verdict === 'unsupported-version') return { kind: 'unsupported-version', version: f.version };
    if (f.verdict === 'corrupt') {
      this.stats.corrupt++;
      return { kind: 'corrupt' };
    }
    // Calibration frames carry nothing for the file: the scanner measures the image they were read from.
    if (f.type === TYPE_CALIBRATION) return { kind: 'calibration', primary: f.primary, fileId: hex(f.fileId) };
    return f.type === TYPE_MANIFEST ? this.handleManifest(f) : this.handleData(f);
  }

  async handleManifest(f) {
    const fid = hex(f.fileId);
    if (this.manifest && fid === this.fid) return { kind: 'manifest-known' };
    if (!this.pendingManifest || this.pendingManifest.fid !== fid || this.pendingManifest.parts.length !== f.parts) {
      this.pendingManifest = { fid, parts: new Array(f.parts).fill(null) };
    }
    this.pendingManifest.parts[f.part] = f.body.slice();
    if (this.pendingManifest.parts.some((p) => p === null)) return { kind: 'manifest-part', have: this.pendingManifest.parts.filter(Boolean).length, of: f.parts };

    const parts = this.pendingManifest.parts;
    const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      body.set(p, o);
      o += p.length;
    }
    this.pendingManifest = null;
    if (!equalBytes(await computeFileId(body, this.sha256), f.fileId)) return { kind: 'corrupt' };
    let manifest;
    try {
      manifest = decodeManifestBody(body, this.maxFileSize ? { maxFileSize: this.maxFileSize } : undefined);
    } catch (error) {
      return { kind: 'bad-manifest', error: error.message };
    }
    if (this.checkSpace && !(await this.checkSpace(manifest.fileSize))) return { kind: 'bad-manifest', error: 'not enough storage for the file', noSpace: true };
    this.fid = fid;
    this.manifest = manifest;
    this.id32 = fileId32(f.fileId);
    // Optional hooks: persistent stores learn the geometry before anything is read or written.
    await this.store.open?.(fid, manifest);
    if (this.sink !== this.store) await this.sink.open?.(fid, manifest);
    const n = manifest.segmentCount;
    this.done = new Array(n).fill(0);
    this.counts = new Array(n).fill(0);
    this.seen = Array.from({ length: n }, () => new Set());
    this.dry = new Array(n).fill(null);
    this.nextAttempt = Array.from({ length: n }, (_, s) => this.attemptStart(segmentGeometry(manifest, s).K));
    this.complete = false;
    for (let s = 0; s < n; s++) {
      if (await this.sink.has(fid, s)) {
        this.done[s] = 1; // resumed transfer: segment already on disk
        continue;
      }
      if (this.store.indices) {
        // resumed transfer: symbols already in the store count towards decodability
        for (const index of await this.store.indices(fid, s)) {
          this.seen[s].add(index);
          this.counts[s]++;
          this.dryFor(s).addSymbol(index, null);
        }
        this.nextAttempt[s] = Math.max(this.nextAttempt[s], this.counts[s] + 1);
      }
    }
    this.checkComplete();
    const out = { kind: 'manifest', fileId: fid, manifest, encrypted: Boolean(manifest.enc) };
    if (manifest.enc && this.password != null) out.unlock = await this.unlock();
    if (!manifest.enc && this.password != null) out.passwordIgnored = true;
    return out;
  }

  attemptStep(K) {
    return K < 100 ? 1 : Math.max(2, Math.ceil(K * 0.002));
  }

  attemptStart(K) {
    return K < 100 ? K : K + this.attemptStep(K);
  }

  checkComplete() {
    if (this.done.every(Boolean)) this.complete = true;
  }

  dryFor(s) {
    if (!this.dry[s]) {
      const g = segmentGeometry(this.manifest, s);
      this.dry[s] = new SegmentDecoder({ K: g.K, blockLen: this.manifest.blockLen, table: segmentDegreeTable(this.manifest.table, this.manifest.K, g.K), fileId32: this.id32, segment: s, structureOnly: true });
    }
    return this.dry[s];
  }

  async handleData(f) {
    const m = this.manifest;
    if (!m || hex(f.fileId) !== this.fid) return { kind: 'data-without-manifest' };
    const s = f.segment;
    if (s >= m.segmentCount || f.payload.length !== m.blockLen) {
      this.stats.corrupt++;
      return { kind: 'corrupt' };
    }
    if (this.done[s]) return { kind: 'segment-already-done', segment: s };
    if (this.seen[s].has(f.index)) {
      this.stats.duplicates++;
      return { kind: 'duplicate' };
    }
    this.seen[s].add(f.index);
    this.stats.symbols++;
    await this.store.append(this.fid, s, f.index, f.payload);
    this.counts[s]++;
    const K = segmentGeometry(m, s).K;
    const dry = this.dryFor(s);
    dry.addSymbol(f.index, null);
    if (!dry.complete && this.counts[s] >= this.nextAttempt[s]) {
      dry.solveResidual(); // bit-level only: no payload is touched
      this.nextAttempt[s] = this.counts[s] + this.attemptStep(K);
    }
    if (dry.complete && this.unlocked && (await this.decodeSegment(s))) {
      return { kind: 'segment-complete', segment: s, complete: this.complete };
    }
    return { kind: 'symbol', segment: s };
  }

  /** Runs once per segment, when the structure oracle says the received symbols are sufficient. */
  async decodeSegment(s) {
    const m = this.manifest;
    const g = segmentGeometry(m, s);
    this.stats.decodeAttempts++;
    const dec = new SegmentDecoder({ K: g.K, blockLen: m.blockLen, table: segmentDegreeTable(m.table, m.K, g.K), fileId32: this.id32, segment: s });
    for await (const sym of this.store.symbols(this.fid, s)) {
      dec.addSymbol(sym.index, sym.payload);
      if (dec.complete) break;
    }
    if (!dec.complete) dec.solveResidual();
    if (!dec.complete) return false;
    const stored = dec.data.subarray(0, g.storedLen);
    if (!equalBytes(await this.sha256(stored), g.hash)) {
      // A symbol with a valid CRC but wrong content got through. The segment is poisoned: start it over.
      this.stats.hashFailures++;
      await this.store.drop(this.fid, s);
      this.seen[s].clear();
      this.counts[s] = 0;
      this.dry[s] = null;
      this.nextAttempt[s] = this.attemptStart(g.K);
      return false;
    }
    let packed = stored;
    if (m.enc) {
      try {
        packed = await openSegment(this.keys, s, m.segmentCount, m.fileSize, g.nonce, stored);
      } catch {
        // Authentication failed although the hash matched: the sender's stream is not what the password opens.
        this.stats.decryptFailures++;
        await this.store.drop(this.fid, s);
        this.seen[s].clear();
        this.counts[s] = 0;
        this.dry[s] = null;
        this.nextAttempt[s] = this.attemptStart(g.K);
        return false;
      }
    }
    // The stored bytes are exactly what the sender hashed. If they do not unpack to the declared chunk,
    // the stream itself is broken, and receiving more frames cannot help.
    const bytes = g.mode === MODE_GZIP ? await this.decompress(packed, g.length) : packed;
    if (bytes.length !== g.length) throw new Error(`segment ${s} does not unpack to its declared size`);
    await this.sink.write(this.fid, s, bytes);
    await this.store.drop(this.fid, s);
    this.seen[s].clear();
    this.dry[s] = null;
    this.done[s] = 1;
    this.checkComplete();
    return true;
  }
}

export { TYPE_DATA, TYPE_MANIFEST };
