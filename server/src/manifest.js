// VDE2-5pr on the server. The manifest (names, types, sizes, previews) is sealed in the sender's browser
// with AES-256-GCM under a key the server does not have, so the server can only check its shape and size
// and store the bytes unchanged. The recipient's browser opens it and rejects any change.

export const VERSION = 'VDE2-5pr';
export const SEGMENT_SIZE = 4 * 1024 * 1024;
const TAG_SIZE = 16;
const NONCE_SIZE = 12;
export const KDF_ALG = 'PBKDF2-SHA-256';
export const MIN_ITERATIONS = 100000;
export const MAX_ITERATIONS = 10000000;
/** Sealed manifest limit: names and encrypted previews (about 40 KB each) for up to 10 files. */
export const MAX_SEALED_BYTES = 2 * 1024 * 1024;
const SALT_RE = /^[A-Za-z0-9_-]{22}$/; // 16 bytes, URL-safe base64 without padding
const GATE_HASH_RE = /^[0-9a-f]{64}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export const segmentCount = (size) => Math.max(1, Math.ceil(size / SEGMENT_SIZE));
export const ciphertextLength = (size) => size + TAG_SIZE * segmentCount(size);

export function validKdfParams(kdf) {
  return (
    kdf != null &&
    typeof kdf === 'object' &&
    Number.isInteger(kdf.iterations) &&
    kdf.iterations >= MIN_ITERATIONS &&
    kdf.iterations <= MAX_ITERATIONS &&
    typeof kdf.salt === 'string' &&
    SALT_RE.test(kdf.salt)
  );
}

export const validGateHash = (hash) => typeof hash === 'string' && GATE_HASH_RE.test(hash);

/**
 * The sealed manifest as bytes (nonce || ciphertext || tag), or null if it cannot be one.
 * @param {unknown} b64 standard base64 from the client
 */
export function sealedManifest(b64) {
  if (typeof b64 !== 'string' || b64.length === 0 || b64.length > Math.ceil(MAX_SEALED_BYTES / 3) * 4 || !BASE64_RE.test(b64)) {
    return null;
  }
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length < NONCE_SIZE + TAG_SIZE + 2 || bytes.length > MAX_SEALED_BYTES) return null;
  return bytes;
}
