// SPDX-License-Identifier: Apache-2.0
// E2E Drop Encryption, format VDE2-5pr: client-side end-to-end encryption of file contents and metadata.
//
// One random 256-bit link key per drop lives only in the share link's fragment (after '#').
// The drop's master key is derived from it (and, if the sender set one, from a password):
//   no password:  master = HKDF(linkKey,                    "VDE2/master/nopw|<dropId>")
//   password:     master = HKDF(linkKey || PBKDF2(password), "VDE2/master/pw|<dropId>")
// From the master key, with HKDF-SHA-256:
//   file key      "VDE2/file|<dropId>|<fileId>"    AES-256-GCM, one per file
//   thumb key     "VDE2/thumb|<dropId>|<fileId>"   AES-256-GCM, the file's preview image
//   manifest key  "VDE2-5pr/manifest|<dropId>"     AES-256-GCM, seals the whole manifest
//   gate token    "VDE2/gate|<dropId>"             proof of the password for the server's attempt limit
//
// File contents are split into 4 MiB segments, each sealed with AES-256-GCM:
//   nonce = 4 zero bytes || uint64 big-endian segment index   (unique: every file has its own key)
//   aad   = "VDE2/seg|<dropId>|<fileId>|<index>|<segmentCount>"
// A changed, reordered, duplicated, dropped or appended segment, or a segment moved in from another
// file or drop, fails authentication.
//
// The manifest (names, types, sizes, segment layout, password parameters, encrypted previews) is
// sealed with AES-256-GCM: the server stores it without being able to read it, and any change it makes
// fails to open in the recipient's browser.

const SEG_SIZE = 4 * 1024 * 1024; // 4 MiB of plaintext per segment
const TAG_SIZE = 16; // AES-GCM authentication tag
const CT_SEG = SEG_SIZE + TAG_SIZE;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const VERSION = 'VDE2-5pr';
export const SEGMENT_SIZE = SEG_SIZE;
export const CIPHER_SEGMENT_SIZE = CT_SEG;
export const KEY_BYTES = 32;
export const MAX_FILE_SIZE = 500 * 1024 * 1024;
export const MAX_FILES = 10;
export const KDF_ALG = 'PBKDF2-SHA-256';
export const PBKDF2_ITERATIONS = 600000;
export const MIN_ITERATIONS = 100000;
export const MAX_ITERATIONS = 10000000;
export const SALT_BYTES = 16;
export const MIN_PASSWORD_LENGTH = 8;

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();

// ---- encodings ----

/** URL-safe base64 without padding. */
export function toBase64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes URL-safe base64; returns null on junk or when the length is not `expectedBytes`. */
export function fromBase64Url(text, expectedBytes) {
  if (typeof text !== 'string') return null;
  const s = text.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+$/.test(s)) return null;
  let bin;
  try {
    bin = atob(s);
  } catch {
    return null;
  }
  if (expectedBytes != null && bin.length !== expectedBytes) return null;
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Standard base64 (with padding), binary-safe for large inputs. */
export function bytesToBase64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

// ---- link key ----

export const generateLinkKey = () => globalThis.crypto.getRandomValues(new Uint8Array(KEY_BYTES));
export const keyToString = (key) => toBase64Url(key);
/** The link fragment's key, or null if it is missing, truncated or malformed. */
export const keyFromString = (text) => fromBase64Url(text, KEY_BYTES);

// ---- password ----

export const normalizePassword = (password) => String(password).normalize('NFKC');

/** True when a password meets the minimum length (in Unicode code points, after NFKC). */
export const passwordLongEnough = (password) => [...normalizePassword(password)].length >= MIN_PASSWORD_LENGTH;

/** Fresh password parameters for a new drop. */
export function newKdfParams() {
  return {
    alg: KDF_ALG,
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES))),
  };
}

/** Checks password parameters received from the server or a manifest. */
export function validKdf(kdf) {
  return (
    kdf != null &&
    typeof kdf === 'object' &&
    kdf.alg === KDF_ALG &&
    Number.isInteger(kdf.iterations) &&
    kdf.iterations >= MIN_ITERATIONS &&
    kdf.iterations <= MAX_ITERATIONS &&
    fromBase64Url(kdf.salt, SALT_BYTES) != null
  );
}

// ---- key derivation ----

async function hkdfBits(ikm, info, bytes = KEY_BYTES) {
  const base = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: te.encode(info) },
    base,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/**
 * The drop's master key (raw 32 bytes).
 * @param {Uint8Array} linkKey key from the link fragment
 * @param {string} dropId
 * @param {{password:string, salt:string, iterations:number}|null} pw
 */
export async function deriveMaster(linkKey, dropId, pw = null) {
  if (!(linkKey instanceof Uint8Array) || linkKey.length !== KEY_BYTES) throw new Error('bad link key');
  if (!pw) return hkdfBits(linkKey, `VDE2/master/nopw|${dropId}`);
  const salt = fromBase64Url(pw.salt, SALT_BYTES);
  if (!salt) throw new Error('bad salt');
  const pwBase = await subtle.importKey('raw', te.encode(normalizePassword(pw.password)), 'PBKDF2', false, ['deriveBits']);
  const passwordKey = new Uint8Array(
    await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: pw.iterations }, pwBase, KEY_BYTES * 8),
  );
  const ikm = new Uint8Array(KEY_BYTES * 2);
  ikm.set(linkKey, 0);
  ikm.set(passwordKey, KEY_BYTES);
  return hkdfBits(ikm, `VDE2/master/pw|${dropId}`);
}

async function aesKey(master, info) {
  return subtle.importKey('raw', await hkdfBits(master, info), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// ---- segments ----

/** Number of segments a plaintext of this length occupies (at least one, so empty data still authenticates). */
export const segmentCount = (plainLength) => Math.max(1, Math.ceil(plainLength / SEG_SIZE));

/** Ciphertext length for a plaintext of `plainLength` bytes. */
export const ciphertextLength = (plainLength) => plainLength + TAG_SIZE * segmentCount(plainLength);

/** Plaintext length recovered from a ciphertext length (inverse of ciphertextLength). */
export function plaintextLength(cipherLength) {
  const full = Math.floor(cipherLength / CT_SEG);
  const rest = cipherLength - full * CT_SEG;
  if (rest === 0) return full * SEG_SIZE;
  return full * SEG_SIZE + (rest - TAG_SIZE);
}

/**
 * Everything needed to seal or open one file's segments.
 * @returns {Promise<{key:CryptoKey, dropId:string, fileId:string, plainLength:number, segments:number}>}
 */
export async function fileCipher(master, dropId, fileId, plainLength) {
  return {
    key: await aesKey(master, `VDE2/file|${dropId}|${fileId}`),
    dropId,
    fileId,
    plainLength,
    segments: segmentCount(plainLength),
  };
}

function nonce(index) {
  const iv = new Uint8Array(12);
  const view = new DataView(iv.buffer);
  view.setUint32(4, Math.floor(index / 2 ** 32));
  view.setUint32(8, index >>> 0);
  return iv;
}

const segmentAad = (fc, index) => te.encode(`VDE2/seg|${fc.dropId}|${fc.fileId}|${index}|${fc.segments}`);

function checkIndex(fc, index) {
  if (!Number.isInteger(index) || index < 0 || index >= fc.segments) throw new Error('segment index out of range');
}

/** Encrypts one plaintext segment. Returns ciphertext (plaintext length + 16). */
export async function encryptSegment(fc, index, plain) {
  checkIndex(fc, index);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv: nonce(index), additionalData: segmentAad(fc, index) }, fc.key, plain);
  return new Uint8Array(ct);
}

/** Decrypts one ciphertext segment. Throws if it was changed, moved or cut. */
export async function decryptSegment(fc, index, cipher) {
  checkIndex(fc, index);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: nonce(index), additionalData: segmentAad(fc, index) }, fc.key, cipher);
  return new Uint8Array(pt);
}

/** Byte range [start, end) of segment `index` within the file's ciphertext. */
export function cipherRange(fc, index) {
  const start = index * CT_SEG;
  return { start, end: Math.min(start + CT_SEG, ciphertextLength(fc.plainLength)) };
}

/**
 * Lazily turns plaintext into ciphertext for resumable upload. The uploader works in ciphertext
 * coordinates (what the server stores); this reads only the plaintext segments a requested range
 * needs, encrypts them, and returns exactly that slice.
 * @param {(start:number,end:number)=>Promise<Uint8Array>|Uint8Array} readPlain reads plaintext bytes [start,end)
 */
export function cipherSource(readPlain, fc) {
  const cipherLength = ciphertextLength(fc.plainLength);
  const cache = new Map();
  async function segment(i) {
    if (cache.has(i)) return cache.get(i);
    const start = i * SEG_SIZE;
    const end = Math.min(start + SEG_SIZE, fc.plainLength);
    const ct = await encryptSegment(fc, i, await readPlain(start, end));
    if (cache.size > 2) cache.clear();
    cache.set(i, ct);
    return ct;
  }
  return {
    cipherLength,
    /** Ciphertext bytes [cStart, cEnd). */
    async read(cStart, cEnd) {
      const out = new Uint8Array(cEnd - cStart);
      let pos = cStart;
      while (pos < cEnd) {
        const i = Math.floor(pos / CT_SEG);
        const ct = await segment(i);
        const within = pos - i * CT_SEG;
        const take = Math.min(ct.length - within, cEnd - pos);
        out.set(ct.subarray(within, within + take), pos - cStart);
        pos += take;
      }
      return out;
    },
  };
}

/** Decrypts a whole file's ciphertext held in memory. */
export async function decryptAll(fc, cipher) {
  if (cipher.length !== ciphertextLength(fc.plainLength)) throw new Error('ciphertext length mismatch');
  const out = new Uint8Array(fc.plainLength);
  for (let i = 0; i < fc.segments; i++) {
    const { start, end } = cipherRange(fc, i);
    out.set(await decryptSegment(fc, i, cipher.subarray(start, end)), i * SEG_SIZE);
  }
  return out;
}

// ---- previews ----

const thumbAad = (dropId, fileId) => te.encode(`VDE2/thumb|${dropId}|${fileId}`);

/** Encrypts a preview (data: URL string). Returns base64 of random nonce || ciphertext. */
export async function encryptThumb(master, dropId, fileId, dataUrl) {
  const key = await aesKey(master, `VDE2/thumb|${dropId}|${fileId}`);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: thumbAad(dropId, fileId) }, key, te.encode(dataUrl)),
  );
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return bytesToBase64(out);
}

/** Decrypts a preview; returns the data: URL or null if it does not open. */
export async function decryptThumb(master, dropId, fileId, b64) {
  try {
    const bytes = base64ToBytes(b64);
    const key = await aesKey(master, `VDE2/thumb|${dropId}|${fileId}`);
    const pt = await subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: thumbAad(dropId, fileId) },
      key,
      bytes.subarray(12),
    );
    const url = new TextDecoder().decode(pt);
    return url.startsWith('data:image/jpeg;base64,') ? url : null;
  } catch {
    return null;
  }
}

// ---- manifest ----

/**
 * Canonical JSON: object keys sorted, no insignificant whitespace, UTF-8. Only strings, safe
 * integers, booleans, null, arrays and plain objects are allowed.
 */
export function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('canonical JSON allows integers only');
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  throw new Error('value not allowed in canonical JSON');
}

/** A file name safe to keep and to save under: no path separators or control characters, at most 200 characters. */
export function cleanFileName(name) {
  const clean = String(name ?? '')
    .replace(/[\\/\x00-\x1f\x7f]/g, '_')
    .trim()
    .slice(0, 200);
  return clean === '' || clean === '.' || clean === '..' ? 'file' : clean;
}

/** The browser's MIME type when it looks like one, otherwise application/octet-stream. */
export function cleanFileType(type) {
  const clean = typeof type === 'string' ? type.trim().toLowerCase() : '';
  return clean.length <= 255 && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(clean) ? clean : 'application/octet-stream';
}

/** Builds the manifest object for a drop. */
export function buildManifest({ dropId, kdf, files }) {
  return {
    v: VERSION,
    dropId,
    segmentSize: SEG_SIZE,
    kdf: kdf ? { alg: kdf.alg, iterations: kdf.iterations, salt: kdf.salt } : null,
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      size: f.size,
      segments: segmentCount(f.size),
      thumb: f.thumb ?? null,
    })),
  };
}

export const manifestBytes = (manifest) => te.encode(canonicalJson(manifest));

// VDE2-5pr: the whole manifest (names, types, sizes, previews) is sealed with AES-256-GCM. The server
// stores an opaque blob; GCM authenticates it, so any change made on the server fails to open.
const manifestAad = (dropId) => te.encode(`VDE2-5pr/manifest|${dropId}`);
const sealKey = (master, dropId) => aesKey(master, `VDE2-5pr/manifest|${dropId}`);

/** Seals canonical manifest bytes. Returns nonce (12 bytes) || ciphertext || tag. */
export async function sealManifest(master, dropId, bytes) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: manifestAad(dropId) }, await sealKey(master, dropId), bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

/** Opens a sealed manifest. Returns the canonical bytes, or null if the key does not fit or anything was changed. */
export async function openManifest(master, dropId, sealed) {
  if (!(sealed instanceof Uint8Array) || sealed.length < 12 + 16) return null;
  try {
    const pt = await subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.subarray(0, 12), additionalData: manifestAad(dropId) },
      await sealKey(master, dropId),
      sealed.subarray(12),
    );
    return new Uint8Array(pt);
  } catch {
    return null;
  }
}

/**
 * Parses manifest bytes that have already been opened (authenticated), and checks that the structure is one
 * this client can trust for sizing and decryption. Throws on anything unexpected.
 */
export function parseManifest(bytes, dropId) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const m = JSON.parse(text);
  const fail = (why) => {
    throw new Error(`bad manifest: ${why}`);
  };
  if (canonicalJson(m) !== text) fail('not canonical');
  if (m.v !== VERSION) fail('version');
  if (m.dropId !== dropId) fail('drop id');
  if (m.segmentSize !== SEG_SIZE) fail('segment size');
  if (m.kdf !== null && !validKdf(m.kdf)) fail('kdf');
  if (!Array.isArray(m.files) || m.files.length < 1 || m.files.length > MAX_FILES) fail('files');
  const ids = new Set();
  for (const f of m.files) {
    if (typeof f.id !== 'string' || !UUID_RE.test(f.id) || ids.has(f.id)) fail('file id');
    ids.add(f.id);
    if (typeof f.name !== 'string' || f.name.length === 0) fail('name');
    if (typeof f.type !== 'string') fail('type');
    if (!Number.isSafeInteger(f.size) || f.size < 0 || f.size > MAX_FILE_SIZE) fail('size');
    if (f.segments !== segmentCount(f.size)) fail('segments');
    if (f.thumb !== null && typeof f.thumb !== 'string') fail('thumb');
  }
  return m;
}

// ---- gate token (password drops only) ----

/** Proof of the password for the server's attempt limit. Derived from the master key, not the password. */
export async function gateToken(master, dropId) {
  return toBase64Url(await hkdfBits(master, `VDE2/gate|${dropId}`));
}

/** SHA-256 (hex) of the gate token string, as the server stores and compares it. */
export async function gateHash(token) {
  return hex(new Uint8Array(await subtle.digest('SHA-256', te.encode(token))));
}
