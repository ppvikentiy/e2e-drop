// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

import { crc16 } from './crc16.js';
import { isValidDegreeTable } from './degree.js';

export const MAGIC = [0x56, 0x51]; // "VQ"
export const VERSION = 2;
export const TYPE_MANIFEST = 1;
export const TYPE_DATA = 2;
/** Colour calibration: the QR is drawn in one display primary on black, so the receiver can measure its camera. */
export const TYPE_CALIBRATION = 3;
export const CALIBRATION_BYTES = 13; // magic2 version1 type1 fileId6 primary1 [filler] crc2
export const FILE_ID_BYTES = 6;
export const DATA_HEADER = 16; // magic2 version1 type1 fileId6 segment2 index4
export const DATA_OVERHEAD = DATA_HEADER + 2; // + CRC-16
export const MANIFEST_HEADER = 12; // magic2 version1 type1 fileId6 part1 parts1
export const MANIFEST_OVERHEAD = MANIFEST_HEADER + 2;

export const MAX_K = 4096;
export const MIN_BLOCK_LEN = 16;
/** Sanity limit enforced by receivers; the format itself does not impose one. */
export const MAX_FILE_SIZE = 512 * 1024 * 1024;
export const MAX_NAME_BYTES = 255;
/** The data frame carries the segment number in 16 bits. */
export const MAX_SEGMENTS = 0xffff;
/** Upper bound for one segment in memory (raw chunk or decoded symbols), whatever the manifest claims. */
export const MAX_SEGMENT_BYTES = 64 * 1024 * 1024;
/**
 * Bytes a raw chunk is kept below one segment's capacity, so that a segment never needs more than K
 * blocks even when a 16-byte authentication tag is added (password-protected streams).
 */
export const SEGMENT_RESERVE = 16;

/** How a segment's stored bytes relate to the raw bytes of its chunk. */
export const MODE_RAW = 0;
export const MODE_GZIP = 1;

const SEGMENT_ENTRY = 4 + 1 + 32; // storedLen, mode, SHA-256
/** Manifest flags. */
export const FLAG_ENCRYPTED = 0x02;
export const NONCE_BYTES = 12;
export const SALT_BYTES = 16;
export const VERIFIER_BYTES = 16;
export const TAG_BYTES = 16;
export const KDF_PBKDF2_SHA256 = 1;
export const MIN_ITERATIONS = 100000;
export const MAX_ITERATIONS = 10000000;

/** @param {number} frameBytes total bytes carried by one QR frame @returns {number} */
export function blockLenFor(frameBytes) {
  return frameBytes - DATA_OVERHEAD;
}

export function fileId32(fileId) {
  return ((fileId[0] << 24) | (fileId[1] << 16) | (fileId[2] << 8) | fileId[3]) >>> 0;
}

const te = new TextEncoder();
const td = new TextDecoder('utf-8', { fatal: true });

/* ----------------------------------------------------------------------------------------- */
/* Frames                                                                                     */
/* ----------------------------------------------------------------------------------------- */

function sealFrame(buf) {
  const c = crc16(buf, 0, buf.length - 2);
  buf[buf.length - 2] = c >>> 8;
  buf[buf.length - 1] = c & 0xff;
  return buf;
}

/** @param {{fileId: Uint8Array, segment: number, index: number, payload: Uint8Array}} f */
export function encodeDataFrame({ fileId, segment, index, payload }) {
  const buf = new Uint8Array(DATA_OVERHEAD + payload.length);
  buf[0] = MAGIC[0];
  buf[1] = MAGIC[1];
  buf[2] = VERSION;
  buf[3] = TYPE_DATA;
  buf.set(fileId, 4);
  const dv = new DataView(buf.buffer);
  dv.setUint16(10, segment);
  dv.setUint32(12, index >>> 0);
  buf.set(payload, DATA_HEADER);
  return sealFrame(buf);
}

/** @param {{fileId: Uint8Array, part: number, parts: number, body: Uint8Array}} f */
export function encodeManifestFrame({ fileId, part, parts, body }) {
  const buf = new Uint8Array(MANIFEST_OVERHEAD + body.length);
  buf[0] = MAGIC[0];
  buf[1] = MAGIC[1];
  buf[2] = VERSION;
  buf[3] = TYPE_MANIFEST;
  buf.set(fileId, 4);
  buf[10] = part;
  buf[11] = parts;
  buf.set(body, MANIFEST_HEADER);
  return sealFrame(buf);
}

/**
 * @param {{fileId: Uint8Array, primary: number, length?: number}} f primary: 0 red, 1 green, 2 blue — the
 *   colour of the light modules. `length` pads the frame with filler bytes up to the size of a data frame:
 *   a nearly empty large QR code is mostly the standard's repeating pad pattern, which readers find
 *   much harder to lock onto than data-like content.
 */
export function encodeCalibrationFrame({ fileId, primary, length = CALIBRATION_BYTES }) {
  const buf = new Uint8Array(Math.max(CALIBRATION_BYTES, length));
  buf[0] = MAGIC[0];
  buf[1] = MAGIC[1];
  buf[2] = VERSION;
  buf[3] = TYPE_CALIBRATION;
  buf.set(fileId, 4);
  buf[10] = primary;
  let x = (fileId32(fileId) ^ (primary + 1)) >>> 0;
  for (let i = 11; i < buf.length - 2; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    buf[i] = x >>> 24;
  }
  return sealFrame(buf);
}

/**
 * Classifies and parses a decoded QR payload.
 *
 * verdict: 'ok' | 'foreign' (not ours: stay silent, the camera sees every QR code in view)
 *        | 'unsupported-version' (ours, but a version we cannot read: tell the user to update)
 *        | 'corrupt' (ours, failed its CRC or is malformed: indistinguishable from a bad read)
 */
export function parseFrame(bytes) {
  if (bytes.length < 4 || bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1]) return { verdict: 'foreign' };
  if (bytes[2] !== VERSION) return { verdict: 'unsupported-version', version: bytes[2] };
  const type = bytes[3];
  const minLen = type === TYPE_DATA ? DATA_OVERHEAD : type === TYPE_MANIFEST ? MANIFEST_OVERHEAD : type === TYPE_CALIBRATION ? CALIBRATION_BYTES : Infinity;
  if (bytes.length < minLen) return { verdict: 'corrupt' };
  const stored = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
  if (stored !== crc16(bytes, 0, bytes.length - 2)) return { verdict: 'corrupt' };
  const fileId = bytes.slice(4, 4 + FILE_ID_BYTES);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === TYPE_DATA) {
    return {
      verdict: 'ok',
      type,
      fileId,
      segment: dv.getUint16(10),
      index: dv.getUint32(12),
      payload: bytes.subarray(DATA_HEADER, bytes.length - 2),
    };
  }
  if (type === TYPE_CALIBRATION) {
    if (bytes[10] > 2) return { verdict: 'corrupt' };
    return { verdict: 'ok', type, fileId, primary: bytes[10] };
  }
  const part = bytes[10];
  const parts = bytes[11];
  if (parts === 0 || part >= parts) return { verdict: 'corrupt' };
  return { verdict: 'ok', type, fileId, part, parts, body: bytes.subarray(MANIFEST_HEADER, bytes.length - 2) };
}

/* ----------------------------------------------------------------------------------------- */
/* Manifest                                                                                   */
/* ----------------------------------------------------------------------------------------- */

/**
 * Manifest body (version 2), big-endian:
 *   u8   manifest version (2)
 *   u8   flags (bit 1: the stream is encrypted with a password; no other bit is defined)
 *   u16  blockLen
 *   u16  K            the largest number of blocks in any segment
 *   u32  rawChunk     bytes of the original file per segment (the last segment may be shorter)
 *   u32  segmentCount = ceil(fileSize / rawChunk)
 *   u32  fileSize high, u32 fileSize low
 *   u8   degreeTableLength, then that many u16 thresholds (built for K)
 *   plain stream:     u8 nameLength, name bytes (UTF-8), u8 mimeLength, mime bytes (UTF-8)
 *   encrypted stream: u8 kdf (1 = PBKDF2-HMAC-SHA-256), u32 iterations, 16 bytes salt, 16 bytes password
 *                     verifier, u16 metaLength, 12 bytes meta nonce, metaLength bytes AES-GCM sealed
 *                     (u8 nameLength, name, u8 mimeLength, mime)
 *   segmentCount entries of: u32 storedLen, u8 mode (0 raw, 1 gzip), [12 bytes nonce if encrypted],
 *                     32 bytes SHA-256 of the stored bytes
 *
 * A segment's stored bytes are what the fountain code carries: the raw chunk itself, or its gzip
 * compression when that is at least 5 % smaller. The segment occupies ceil(storedLen / blockLen) blocks.
 *
 * @param {{blockLen:number,K:number,rawChunk:number,fileSize:number,table:Uint16Array,name:string,mime:string,
 *          segments:{storedLen:number,mode:number,hash:Uint8Array}[],flags?:number}} m
 */
export function encodeManifestBody(m) {
  const enc = m.enc ?? null;
  const name = te.encode(enc ? '' : m.name).slice(0, MAX_NAME_BYTES);
  const mime = te.encode(enc ? '' : m.mime).slice(0, MAX_NAME_BYTES);
  const identity = enc ? 1 + 4 + SALT_BYTES + VERIFIER_BYTES + 2 + NONCE_BYTES + enc.metaCt.length : 1 + name.length + 1 + mime.length;
  const entry = SEGMENT_ENTRY + (enc ? NONCE_BYTES : 0);
  const size = 1 + 1 + 2 + 2 + 4 + 4 + 8 + 1 + m.table.length * 2 + identity + m.segments.length * entry;
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);
  let o = 0;
  buf[o++] = 2;
  buf[o++] = enc ? FLAG_ENCRYPTED : 0;
  dv.setUint16(o, m.blockLen); o += 2;
  dv.setUint16(o, m.K); o += 2;
  dv.setUint32(o, m.rawChunk); o += 4;
  dv.setUint32(o, m.segments.length); o += 4;
  dv.setUint32(o, Math.floor(m.fileSize / 0x100000000)); o += 4;
  dv.setUint32(o, m.fileSize >>> 0); o += 4;
  buf[o++] = m.table.length;
  for (const t of m.table) { dv.setUint16(o, t); o += 2; }
  if (enc) {
    buf[o++] = KDF_PBKDF2_SHA256;
    dv.setUint32(o, enc.iterations); o += 4;
    buf.set(enc.salt, o); o += SALT_BYTES;
    buf.set(enc.verifier, o); o += VERIFIER_BYTES;
    dv.setUint16(o, enc.metaCt.length); o += 2;
    buf.set(enc.metaNonce, o); o += NONCE_BYTES;
    buf.set(enc.metaCt, o); o += enc.metaCt.length;
  } else {
    buf[o++] = name.length;
    buf.set(name, o); o += name.length;
    buf[o++] = mime.length;
    buf.set(mime, o); o += mime.length;
  }
  for (const s of m.segments) {
    dv.setUint32(o, s.storedLen); o += 4;
    buf[o++] = s.mode;
    if (enc) { buf.set(s.nonce, o); o += NONCE_BYTES; }
    buf.set(s.hash, o); o += 32;
  }
  return buf;
}

const rawLength = (m, s) => Math.min(m.rawChunk, m.fileSize - s * m.rawChunk);

/**
 * Parses and validates a manifest body. Throws on anything inconsistent: manifests arrive from
 * a camera and must never be trusted to size an allocation.
 */
export function decodeManifestBody(buf, { maxFileSize = MAX_FILE_SIZE } = {}) {
  const fail = (why) => {
    throw new Error(`invalid manifest: ${why}`);
  };
  if (buf.length < 28) fail('too short');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const version = buf[o++];
  if (version !== 2) fail(`unsupported manifest version ${version}`);
  const flags = buf[o++];
  if ((flags & ~FLAG_ENCRYPTED) !== 0) fail('unsupported flags');
  const encrypted = (flags & FLAG_ENCRYPTED) !== 0;
  const blockLen = dv.getUint16(o); o += 2;
  const K = dv.getUint16(o); o += 2;
  const rawChunk = dv.getUint32(o); o += 4;
  const segmentCount = dv.getUint32(o); o += 4;
  const hi = dv.getUint32(o); o += 4;
  const lo = dv.getUint32(o); o += 4;
  if (hi > 0x1fffff) fail('file size out of range');
  const fileSize = hi * 0x100000000 + lo;
  if (blockLen < MIN_BLOCK_LEN) fail('block length too small');
  if (K < 1 || K > MAX_K) fail('K out of range');
  if (K * blockLen > MAX_SEGMENT_BYTES) fail('segment too large');
  if (fileSize < 1 || fileSize > maxFileSize) fail('file size out of range');
  if (rawChunk < 1 || rawChunk > MAX_SEGMENT_BYTES) fail('raw chunk out of range');
  if (segmentCount !== Math.ceil(fileSize / rawChunk) || segmentCount > MAX_SEGMENTS) fail('segment count inconsistent');
  const tableLen = buf[o++];
  if (o + tableLen * 2 + 2 > buf.length) fail('truncated');
  const table = new Uint16Array(tableLen);
  for (let i = 0; i < tableLen; i++) { table[i] = dv.getUint16(o); o += 2; }
  if (!isValidDegreeTable(table, K)) fail('bad degree table');
  let name = '';
  let mime = '';
  let enc = null;
  if (encrypted) {
    if (o + 1 + 4 + SALT_BYTES + VERIFIER_BYTES + 2 + NONCE_BYTES > buf.length) fail('truncated');
    if (buf[o++] !== KDF_PBKDF2_SHA256) fail('unknown key derivation');
    const iterations = dv.getUint32(o); o += 4;
    if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) fail('iteration count out of range');
    const salt = buf.slice(o, o + SALT_BYTES); o += SALT_BYTES;
    const verifier = buf.slice(o, o + VERIFIER_BYTES); o += VERIFIER_BYTES;
    const metaLen = dv.getUint16(o); o += 2;
    if (metaLen < TAG_BYTES || metaLen > 2 * MAX_NAME_BYTES + 2 + TAG_BYTES) fail('metadata length');
    const metaNonce = buf.slice(o, o + NONCE_BYTES); o += NONCE_BYTES;
    if (o + metaLen > buf.length) fail('truncated');
    const metaCt = buf.slice(o, o + metaLen); o += metaLen;
    enc = { iterations, salt, verifier, metaNonce, metaCt };
  } else {
    const nameLen = buf[o++];
    if (o + nameLen + 1 > buf.length) fail('truncated');
    try { name = td.decode(buf.subarray(o, o + nameLen)); } catch { fail('name is not UTF-8'); }
    o += nameLen;
    const mimeLen = buf[o++];
    if (o + mimeLen > buf.length) fail('truncated');
    try { mime = td.decode(buf.subarray(o, o + mimeLen)); } catch { fail('mime is not UTF-8'); }
    o += mimeLen;
  }
  const entry = SEGMENT_ENTRY + (encrypted ? NONCE_BYTES : 0);
  if (buf.length - o !== segmentCount * entry) fail('segment list length');
  const m = { blockLen, K, rawChunk, fileSize };
  const segments = [];
  for (let s = 0; s < segmentCount; s++) {
    const storedLen = dv.getUint32(o); o += 4;
    const mode = buf[o++];
    let nonce = null;
    if (encrypted) { nonce = buf.slice(o, o + NONCE_BYTES); o += NONCE_BYTES; }
    const hash = buf.slice(o, o + 32); o += 32;
    if (mode !== MODE_RAW && mode !== MODE_GZIP) fail(`segment ${s} mode`);
    if (storedLen < 1 || Math.ceil(storedLen / blockLen) > K) fail(`segment ${s} stored length`);
    if (mode === MODE_RAW && storedLen !== rawLength(m, s) + (encrypted ? TAG_BYTES : 0)) fail(`segment ${s} raw length`);
    if (encrypted && storedLen <= TAG_BYTES) fail(`segment ${s} stored length`);
    segments.push(encrypted ? { storedLen, mode, hash, nonce } : { storedLen, mode, hash });
  }
  return { blockLen, K, rawChunk, segmentCount, fileSize, table, name, mime, segments, flags, enc };
}

/** Splits a manifest body over as many frames as needed. */
export function manifestFrames(fileId, body, frameBytes) {
  const cap = frameBytes - MANIFEST_OVERHEAD;
  const parts = Math.max(1, Math.ceil(body.length / cap));
  if (parts > 255) throw new Error('manifest does not fit in 255 frames');
  const frames = [];
  for (let i = 0; i < parts; i++) {
    frames.push(encodeManifestFrame({ fileId, part: i, parts, body: body.subarray(i * cap, Math.min(body.length, (i + 1) * cap)) }));
  }
  return frames;
}

/**
 * Segment s covers raw bytes [start, start + length) of the file. Its stored bytes (raw or gzip) are
 * storedLen long and take K = ceil(storedLen / blockLen) blocks of the fountain code.
 * @param {{fileSize:number, blockLen:number, rawChunk:number, segments:{storedLen:number,mode:number,hash:Uint8Array}[]}} m
 */
export function segmentGeometry(m, s) {
  const { storedLen, mode, hash, nonce } = m.segments[s];
  return {
    nonce,
    start: s * m.rawChunk,
    length: rawLength(m, s),
    storedLen,
    mode,
    hash,
    K: Math.ceil(storedLen / m.blockLen),
  };
}

/**
 * Raw chunk size and segment count for a file: as large a chunk as fits K <= kMax blocks even when the
 * chunk does not compress (and with room for an authentication tag), so the file needs as few segments
 * as possible.
 */
export function planSegments(fileSize, blockLen, kMax) {
  const rawChunk = Math.max(1, Math.min(kMax * blockLen - SEGMENT_RESERVE, MAX_SEGMENT_BYTES));
  return { rawChunk, segmentCount: Math.ceil(fileSize / rawChunk) };
}

/** First 6 bytes of SHA-256(body): the stream identity carried in every frame. */
export async function computeFileId(body, sha256) {
  return (await sha256(body)).slice(0, FILE_ID_BYTES);
}
