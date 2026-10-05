// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

import { NONCE_BYTES, SALT_BYTES, VERIFIER_BYTES } from './format.js';

/**
 * Password protection (all primitives are Web Crypto: PBKDF2-HMAC-SHA-256, HKDF-SHA-256, HMAC-SHA-256,
 * AES-256-GCM; nothing is implemented here).
 *
 *   fileDigest = SHA-256(SHA-256(chunk 0) || SHA-256(chunk 1) || ...)       (the raw file chunks, in order)
 *   salt       = first 16 bytes of HMAC-SHA-256(key = P, "VQD2/salt" || fileDigest)
 *   K0         = PBKDF2-HMAC-SHA-256(P, salt, iterations, 32 bytes)
 *   Kverify, Kseg, Kmeta, Knonce = HKDF-SHA-256(K0, info = "VQD2/verify" | "VQD2/seg" | "VQD2/meta" | "VQD2/nonce")
 *   verifier   = first 16 bytes of HMAC-SHA-256(Kverify, "VQD2/verifier" || salt || uint32(iterations))
 *   nonce      = first 12 bytes of HMAC-SHA-256(Knonce, label || uint32(index) || SHA-256(plaintext))
 *   AAD(seg)   = "VQD2/seg" || salt || uint32(index) || uint32(segmentCount) || uint64(fileSize)
 *   AAD(meta)  = "VQD2/meta" || salt
 *
 * The salt and nonces are functions of the content, so the same file with the same password produces
 * the same stream and an interrupted receiver can resume after the sender restarts. P is the password
 * NFKC-normalised and UTF-8 encoded.
 */

export const DEFAULT_ITERATIONS = 600000;
export const MIN_PASSWORD_LENGTH = 8;

const te = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const u32 = (n) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const u64 = (n) => concat(u32(Math.floor(n / 0x100000000)), u32(n >>> 0));

/** Code points, as the user counts characters. */
export const passwordLength = (password) => [...String(password).normalize('NFKC')].length;

export const passwordBytes = (password) => te.encode(String(password).normalize('NFKC'));

async function hmac(keyBytes, data) {
  const key = await subtle().importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', key, data));
}

const sha256 = async (bytes) => new Uint8Array(await subtle().digest('SHA-256', bytes));

/** SHA-256 over the per-chunk digests: a streaming-friendly stand-in for hashing the whole file. */
export const fileDigest = (chunkDigests) => sha256(concat(...chunkDigests));

export async function deriveSalt(password, digest) {
  return (await hmac(passwordBytes(password), concat(te.encode('VQD2/salt'), digest))).slice(0, SALT_BYTES);
}

async function hkdf(k0, label) {
  const key = await subtle().importKey('raw', k0, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: te.encode(label) }, key, 256));
}

/** @returns {Promise<{salt, iterations, verifier, seg: CryptoKey, meta: CryptoKey, nonceKey: Uint8Array}>} */
export async function deriveKeys(password, salt, iterations) {
  const base = await subtle().importKey('raw', passwordBytes(password), 'PBKDF2', false, ['deriveBits']);
  const k0 = new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256));
  const [kVerify, kSeg, kMeta, kNonce] = await Promise.all(['VQD2/verify', 'VQD2/seg', 'VQD2/meta', 'VQD2/nonce'].map((l) => hkdf(k0, l)));
  const verifier = (await hmac(kVerify, concat(te.encode('VQD2/verifier'), salt, u32(iterations)))).slice(0, VERIFIER_BYTES);
  const aes = (raw) => subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { salt, iterations, verifier, seg: await aes(kSeg), meta: await aes(kMeta), nonceKey: kNonce };
}

const sameBytes = (a, b) => {
  let d = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i++) d |= a[i] ^ b[i];
  return d === 0;
};
export const verifierMatches = (keys, verifier) => sameBytes(keys.verifier, verifier);

const nonceFor = async (keys, label, index, plaintext) =>
  (await hmac(keys.nonceKey, concat(te.encode(label), u32(index), await sha256(plaintext)))).slice(0, NONCE_BYTES);

const segAad = (keys, index, count, fileSize) => concat(te.encode('VQD2/seg'), keys.salt, u32(index), u32(count), u64(fileSize));
const metaAad = (keys) => concat(te.encode('VQD2/meta'), keys.salt);

/** @returns {Promise<{nonce: Uint8Array, data: Uint8Array}>} data = ciphertext || 16-byte tag */
export async function sealSegment(keys, index, count, fileSize, plaintext) {
  const nonce = await nonceFor(keys, 'VQD2/seg', index, plaintext);
  const data = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce, additionalData: segAad(keys, index, count, fileSize) }, keys.seg, plaintext));
  return { nonce, data };
}

export async function openSegment(keys, index, count, fileSize, nonce, data) {
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: nonce, additionalData: segAad(keys, index, count, fileSize) }, keys.seg, data));
}

/** name and mime are sealed together in one block. */
export async function sealMeta(keys, name, mime) {
  const n = te.encode(name).slice(0, 255);
  const m = te.encode(mime).slice(0, 255);
  const plain = concat(Uint8Array.of(n.length), n, Uint8Array.of(m.length), m);
  const metaNonce = await nonceFor(keys, 'VQD2/meta', 0, plain);
  const metaCt = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: metaNonce, additionalData: metaAad(keys) }, keys.meta, plain));
  return { metaNonce, metaCt };
}

export async function openMeta(keys, metaNonce, metaCt) {
  const plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: metaNonce, additionalData: metaAad(keys) }, keys.meta, metaCt));
  const td = new TextDecoder('utf-8', { fatal: true });
  const nl = plain[0];
  const ml = plain[1 + nl];
  if (plain.length !== 2 + nl + ml) throw new Error('metadata is malformed');
  return { name: td.decode(plain.subarray(1, 1 + nl)), mime: td.decode(plain.subarray(2 + nl, 2 + nl + ml)) };
}
