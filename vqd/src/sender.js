// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

import { packSegment } from './compress.js';
import {
  DEFAULT_ITERATIONS, MIN_PASSWORD_LENGTH, deriveKeys, deriveSalt, fileDigest, passwordLength, sealMeta, sealSegment,
} from './crypto.js';
import { buildDegreeTable, segmentDegreeTable } from './degree.js';
import { encodeSymbol } from './fountain.js';
import {
  MAX_FILE_SIZE,
  MAX_K,
  MAX_SEGMENTS,
  MIN_BLOCK_LEN,
  blockLenFor,
  computeFileId,
  encodeDataFrame,
  encodeManifestBody,
  fileId32,
  manifestFrames,
  planSegments,
  segmentGeometry,
} from './format.js';
import { fmix32 } from './rng.js';

const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export const DEFAULT_FRAME_BYTES = 2953; // QR version 40, error correction L, binary mode
export const DEFAULT_K_MAX = 2048;
export const DEFAULT_WINDOW_BYTES = 32 * 1024 * 1024;
export const DEFAULT_FIRST_QUOTA = 1.06;
export const DEFAULT_REPAIR_QUOTA = 0.06;
export const DEFAULT_MANIFEST_EVERY = 90;

/**
 * Symbols per segment (as a multiple of its K) for pass number p of a window. Pass 0 carries a small
 * safety margin over K; every later pass is a repair round that doubles, so a receiver that missed
 * only a little is topped up quickly while one that missed a lot (or joined late) is never stuck.
 */
export function defaultQuota(pass, { first = DEFAULT_FIRST_QUOTA, repair = DEFAULT_REPAIR_QUOTA } = {}) {
  return pass === 0 ? first : Math.min(1, repair * 2 ** (pass - 1));
}

export const defaultSha256 = async (bytes) => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));

/** Wraps an in-memory Uint8Array as a byte source. */
export function fromBytes(bytes) {
  return { size: bytes.length, read: async (start, end) => bytes.subarray(start, end) };
}

/** Wraps a Blob / File as a byte source (reads one segment at a time). */
export function fromBlob(blob) {
  return { size: blob.size, read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()) };
}

/**
 * Creates a sender. The stream never ends: call nextFrame() for as long as the screen should show it.
 *
 * Scheduling policy (informative, not part of the wire format): segments are grouped into windows that
 * fit in `windowBytes` of sender memory (or `windowSegments` if given; Infinity interleaves everything).
 * Inside a window the sender interleaves its segments symbol by symbol, giving each `quota(pass) * K`
 * fresh symbols, then moves to the next window and wraps around forever, bumping the pass number after
 * each lap. Symbol indices are never repeated within a session; they start from a random offset so that
 * a restarted sender does not resend symbols a resuming receiver already holds.
 *
 * @param {object} o
 * @param {{size:number, read:(start:number,end:number)=>Promise<Uint8Array>}} o.source
 */
export async function createSender({
  source,
  name = 'file',
  mime = 'application/octet-stream',
  frameBytes = DEFAULT_FRAME_BYTES,
  kMax = DEFAULT_K_MAX,
  windowBytes = DEFAULT_WINDOW_BYTES,
  windowSegments,
  quota = defaultQuota,
  manifestEvery = DEFAULT_MANIFEST_EVERY,
  sha256 = defaultSha256,
  startOffset = (globalThis.crypto.getRandomValues(new Uint32Array(1))[0] >>> 0),
  maxFileSize = MAX_FILE_SIZE,
  // gzip by default; false sends every segment raw; a function (bytes) => Promise<Uint8Array> replaces gzip.
  compress,
  onPrepare,
  // Optional password: encrypts the data and the file name. At least 8 characters.
  password = null,
  iterations = DEFAULT_ITERATIONS,
} = {}) {
  if (!(source.size >= 1)) throw new Error('empty file');
  if (source.size > maxFileSize) throw new Error('file too large');
  const blockLen = blockLenFor(frameBytes);
  if (blockLen < MIN_BLOCK_LEN || blockLen > 0xffff) throw new Error('frame size out of range');
  if (!(kMax >= 1 && kMax <= MAX_K)) throw new Error('kMax out of range');

  if (password != null && passwordLength(password) < MIN_PASSWORD_LENGTH) throw new Error('password too short');
  const { rawChunk, segmentCount } = planSegments(source.size, blockLen, kMax);
  if (segmentCount > MAX_SEGMENTS) throw new Error('file too large for this frame size');
  const perWindow = windowSegments ?? Math.max(1, Math.floor(windowBytes / rawChunk));
  const rawRange = (s) => [s * rawChunk, Math.min((s + 1) * rawChunk, source.size)];

  // With a password the salt depends on the whole file, so the file is read once to hash its chunks.
  let keys = null;
  let enc = null;
  if (password != null) {
    const digests = [];
    for (let s = 0; s < segmentCount; s++) digests.push(await sha256(await source.read(...rawRange(s))));
    keys = await deriveKeys(password, await deriveSalt(password, await fileDigest(digests)), iterations);
    enc = { iterations, salt: keys.salt, verifier: keys.verifier, ...(await sealMeta(keys, name, mime)) };
  }
  // The bytes a segment is sent as: compressed where that pays off, then sealed when there is a password.
  const pack = async (s) => {
    const { bytes, mode } = await packSegment(await source.read(...rawRange(s)), compress);
    if (!keys) return { bytes, mode };
    const sealed = await sealSegment(keys, s, segmentCount, source.size, bytes);
    return { bytes: sealed.data, mode, nonce: sealed.nonce };
  };

  // One pass over the file: compress, seal, and hash what will be sent.
  const segments = [];
  for (let s = 0; s < segmentCount; s++) {
    const { bytes, mode, nonce } = await pack(s);
    segments.push({ storedLen: bytes.length, mode, hash: await sha256(bytes), ...(nonce ? { nonce } : {}) });
    onPrepare?.((s + 1) / segmentCount);
  }
  const K = Math.max(...segments.map((x) => Math.ceil(x.storedLen / blockLen)));
  const table = buildDegreeTable(K);
  const manifest = { blockLen, K, rawChunk, segmentCount, fileSize: source.size, table, name, mime, segments, enc };
  const body = encodeManifestBody(manifest);
  const fileId = await computeFileId(body, sha256);
  const manifestFramesList = manifestFrames(fileId, body, frameBytes);
  const id32 = fileId32(fileId);

  const windows = [];
  for (let s = 0; s < segmentCount; s += perWindow) {
    windows.push(Array.from({ length: Math.min(perWindow, segmentCount - s) }, (_, i) => s + i));
  }

  const nextIndex = new Uint32Array(segmentCount);
  for (let s = 0; s < segmentCount; s++) nextIndex[s] = fmix32((startOffset ^ Math.imul(s + 1, 0x9e3779b1)) >>> 0);

  const geo = (s) => segmentGeometry(manifest, s);
  const cache = new Map();
  const loading = new Map();
  // Stored bytes are rebuilt from the file when a window is loaded and checked against the manifest:
  // a file changed on disk (or a non-deterministic compressor) must not silently corrupt the stream.
  const load = (s) => {
    if (cache.has(s)) return Promise.resolve(cache.get(s));
    if (!loading.has(s)) {
      const g = geo(s);
      loading.set(
        s,
        pack(s).then(async ({ bytes }) => {
          if (bytes.length !== g.storedLen || !sameBytes(await sha256(bytes), g.hash)) {
            throw new Error('the file changed after the stream was prepared');
          }
          cache.set(s, bytes);
          loading.delete(s);
          return bytes;
        }),
      );
    }
    return loading.get(s);
  };

  let windowIdx = 0;
  let pass = 0;
  let order = [];
  let orderPos = 0;
  const buildOrder = () => {
    const members = windows[windowIdx];
    const remaining = members.map((s) => Math.ceil(geo(s).K * quota(pass)) + 2);
    const out = [];
    let left = remaining.reduce((a, b) => a + b, 0);
    while (left > 0) {
      for (let i = 0; i < members.length; i++) {
        if (remaining[i] > 0) {
          out.push(members[i]);
          remaining[i]--;
          left--;
        }
      }
    }
    order = out;
    orderPos = 0;
  };
  buildOrder();

  let manifestPart = 0;
  let sinceManifest = 0;
  let burst = manifestFramesList.length; // lead with the whole manifest, then one part every manifestEvery frames
  const scratch = new Int32Array(table.length);
  const out = new Uint8Array(blockLen);
  let framesSent = 0;

  async function ensureWindowLoaded() {
    const members = windows[windowIdx];
    await Promise.all(members.map(load));
    const next = windows[(windowIdx + 1) % windows.length];
    if (next !== members) for (const s of next) load(s).catch(() => {}); // prefetch; a failure surfaces when the segment is used
    for (const s of [...cache.keys()]) if (!members.includes(s) && !next.includes(s)) cache.delete(s);
  }
  await ensureWindowLoaded();

  return {
    manifest,
    fileId,
    segmentCount,
    K,
    blockLen,
    frameBytes,
    /** Blocks the receiver needs in total (fewer than fileSize / blockLen when segments compress). */
    totalBlocks: segments.reduce((n, x) => n + Math.ceil(x.storedLen / blockLen), 0),
    compressedSegments: segments.filter((x) => x.mode === 1).length,
    encrypted: Boolean(enc),
    get framesSent() {
      return framesSent;
    },
    /** @returns {Promise<Uint8Array>} the next QR payload */
    async nextFrame() {
      framesSent++;
      if (burst > 0 || sinceManifest >= manifestEvery) {
        if (burst > 0) burst--;
        sinceManifest = 0;
        const frame = manifestFramesList[manifestPart];
        manifestPart = (manifestPart + 1) % manifestFramesList.length;
        return frame;
      }
      sinceManifest++;
      if (orderPos >= order.length) {
        windowIdx = (windowIdx + 1) % windows.length;
        if (windowIdx === 0) pass++;
        buildOrder();
        await ensureWindowLoaded();
      }
      const s = order[orderPos++];
      const index = nextIndex[s]++;
      const segmentBytes = cache.get(s) ?? (await load(s));
      const g = geo(s);
      encodeSymbol(segmentBytes, { K: g.K, blockLen, table: segmentDegreeTable(table, K, g.K), fileId32: id32, segment: s, index }, out, scratch);
      return encodeDataFrame({ fileId, segment: s, index, payload: out });
    },
  };
}
