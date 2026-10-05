// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLinkKey, keyToString, keyFromString, deriveMaster, fileCipher,
  encryptSegment, decryptSegment, segmentCount, ciphertextLength, plaintextLength,
  cipherSource, decryptAll, cipherRange, encryptThumb, decryptThumb,
  canonicalJson, buildManifest, manifestBytes, sealManifest, openManifest, parseManifest, cleanFileName, cleanFileType, VERSION,
  gateToken, gateHash, newKdfParams, validKdf, passwordLongEnough, normalizePassword,
  SEGMENT_SIZE, CIPHER_SEGMENT_SIZE, KEY_BYTES, MIN_ITERATIONS,
} from '../src/crypto/vde2.js';

const DROP = '11111111-2222-4333-8444-555555555555';
const DROP2 = '11111111-2222-4333-8444-666666666666';
const FILE_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const FILE_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const KDF = { alg: 'PBKDF2-SHA-256', iterations: MIN_ITERATIONS, salt: 'AAAAAAAAAAAAAAAAAAAAAA' };

function rand(n, seed) {
  const out = new Uint8Array(n);
  let x = seed >>> 0;
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
}

async function encryptWhole(fc, plain) {
  const src = cipherSource((s, e) => plain.subarray(s, e), fc);
  return src.read(0, src.cipherLength);
}

test('link key string round-trips and rejects junk', () => {
  for (let i = 0; i < 20; i++) {
    const k = generateLinkKey();
    assert.equal(k.length, KEY_BYTES);
    const s = keyToString(k);
    assert.match(s, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(keyFromString(s), k);
  }
  assert.equal(keyFromString(''), null);
  assert.equal(keyFromString(null), null);
  assert.equal(keyFromString('short'), null);
  assert.equal(keyFromString('!'.repeat(43)), null);
  assert.equal(keyFromString(keyToString(new Uint8Array(31))), null);
  assert.equal(keyFromString(keyToString(generateLinkKey()).slice(0, 40)), null); // truncated by a messenger
});

test('segment arithmetic', () => {
  assert.equal(SEGMENT_SIZE, 4 * 1024 * 1024);
  assert.equal(CIPHER_SEGMENT_SIZE, SEGMENT_SIZE + 16);
  for (const n of [0, 1, SEGMENT_SIZE - 1, SEGMENT_SIZE, SEGMENT_SIZE + 1, 3 * SEGMENT_SIZE, 500 * 1024 * 1024]) {
    assert.equal(plaintextLength(ciphertextLength(n)), n);
    assert.equal(segmentCount(n), Math.max(1, Math.ceil(n / SEGMENT_SIZE)));
  }
});

test('master key depends on link key, drop id and password', async () => {
  const k = generateLinkKey();
  const nopw = await deriveMaster(k, DROP);
  assert.equal(nopw.length, 32);
  assert.deepEqual(await deriveMaster(k, DROP), nopw);
  assert.notDeepEqual(await deriveMaster(k, DROP2), nopw);
  assert.notDeepEqual(await deriveMaster(generateLinkKey(), DROP), nopw);
  const pw = await deriveMaster(k, DROP, { password: 'correct horse', ...KDF });
  assert.notDeepEqual(pw, nopw);
  assert.deepEqual(await deriveMaster(k, DROP, { password: 'correct horse', ...KDF }), pw);
  assert.notDeepEqual(await deriveMaster(k, DROP, { password: 'correct horsf', ...KDF }), pw);
  // NFKC: the full-width form of a password is the same password
  assert.deepEqual(await deriveMaster(k, DROP, { password: 'ｃｏｒｒｅｃｔ horse', ...KDF }), pw);
});

test('encrypts and decrypts files of many sizes, including segment boundaries', async () => {
  const master = await deriveMaster(generateLinkKey(), DROP);
  for (const n of [0, 1, 17, SEGMENT_SIZE - 1, SEGMENT_SIZE, SEGMENT_SIZE + 1, 2 * SEGMENT_SIZE + 5]) {
    const plain = rand(n, n + 1);
    const fc = await fileCipher(master, DROP, FILE_A, n);
    const ct = await encryptWhole(fc, plain);
    assert.equal(ct.length, ciphertextLength(n));
    assert.deepEqual(await decryptAll(fc, ct), plain);
  }
});

test('ranged cipherSource reads match one-shot encryption', async () => {
  const master = await deriveMaster(generateLinkKey(), DROP);
  const n = 2 * SEGMENT_SIZE + 12345;
  const plain = rand(n, 7);
  const fc = await fileCipher(master, DROP, FILE_A, n);
  const whole = await encryptWhole(fc, plain);
  const src = cipherSource((s, e) => plain.subarray(s, e), fc);
  const parts = [];
  const chunk = 5 * 1024 * 1024 + 3; // deliberately not aligned to segments
  for (let pos = 0; pos < src.cipherLength; pos += chunk) parts.push(await src.read(pos, Math.min(pos + chunk, src.cipherLength)));
  const joined = new Uint8Array(src.cipherLength);
  let o = 0;
  for (const p of parts) {
    joined.set(p, o);
    o += p.length;
  }
  assert.deepEqual(joined, whole);
});

test('tampering, reordering, truncation and cross-file or cross-drop moves are detected', async () => {
  const link = generateLinkKey();
  const master = await deriveMaster(link, DROP);
  const n = 2 * SEGMENT_SIZE + 10;
  const plain = rand(n, 3);
  const fc = await fileCipher(master, DROP, FILE_A, n);
  const ct = await encryptWhole(fc, plain);
  const seg = (i) => ct.subarray(cipherRange(fc, i).start, cipherRange(fc, i).end);

  const flipped = seg(1).slice();
  flipped[100] ^= 1;
  await assert.rejects(decryptSegment(fc, 1, flipped));
  await assert.rejects(decryptSegment(fc, 0, seg(1))); // reordered
  await assert.rejects(decryptSegment(fc, 1, seg(0)));

  // Truncation: claiming the file is one segment shorter changes every segment's AAD.
  const shorter = await fileCipher(master, DROP, FILE_A, 2 * SEGMENT_SIZE);
  await assert.rejects(decryptSegment(shorter, 0, seg(0)));

  const otherFile = await fileCipher(master, DROP, FILE_B, n);
  await assert.rejects(decryptSegment(otherFile, 0, seg(0)));

  const otherDrop = await fileCipher(await deriveMaster(link, DROP2), DROP2, FILE_A, n);
  await assert.rejects(decryptSegment(otherDrop, 0, seg(0)));

  await assert.rejects(encryptSegment(fc, fc.segments, new Uint8Array(1)), /out of range/);
});

test('wrong link key or wrong password cannot open a segment', async () => {
  const link = generateLinkKey();
  const master = await deriveMaster(link, DROP, { password: 'password-1', ...KDF });
  const fc = await fileCipher(master, DROP, FILE_A, 100);
  const ct = await encryptSegment(fc, 0, rand(100, 1));
  const wrongPw = await fileCipher(await deriveMaster(link, DROP, { password: 'password-2', ...KDF }), DROP, FILE_A, 100);
  await assert.rejects(decryptSegment(wrongPw, 0, ct));
  const noPw = await fileCipher(await deriveMaster(link, DROP), DROP, FILE_A, 100);
  await assert.rejects(decryptSegment(noPw, 0, ct));
});

test('canonical JSON is deterministic and rejects floats', () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, 'x'], c: { z: 0, y: 'é' } }), '{"a":[true,null,"x"],"b":1,"c":{"y":"é","z":0}}');
  assert.throws(() => canonicalJson({ x: 1.5 }));
  assert.throws(() => canonicalJson({ x: undefined }));
});

function sampleManifest(kdf = null) {
  return buildManifest({
    dropId: DROP,
    kdf,
    files: [
      { id: FILE_A, name: 'фото.jpg', type: 'image/jpeg', size: SEGMENT_SIZE + 1, thumb: null },
      { id: FILE_B, name: 'doc.pdf', type: 'application/pdf', size: 0 },
    ],
  });
}

test('the sealed manifest hides names and opens only with the right key, drop and bytes', async () => {
  assert.equal(VERSION, 'VDE2-5pr');
  const master = await deriveMaster(generateLinkKey(), DROP);
  const bytes = manifestBytes(sampleManifest());
  const sealed = await sealManifest(master, DROP, bytes);
  assert.ok(!Buffer.from(sealed).includes(Buffer.from('doc.pdf')));
  assert.deepEqual(await openManifest(master, DROP, sealed), bytes);
  const m = parseManifest(await openManifest(master, DROP, sealed), DROP);
  assert.equal(m.files[0].segments, 2);
  assert.equal(m.files[1].segments, 1);

  const again = await sealManifest(master, DROP, bytes);
  assert.notDeepEqual(again, sealed, 'a fresh nonce every time');
  const flipped = sealed.slice();
  flipped[sealed.length - 1] ^= 1;
  assert.equal(await openManifest(master, DROP, flipped), null);
  assert.equal(await openManifest(master, DROP2, sealed), null); // moved to another drop
  assert.equal(await openManifest(await deriveMaster(generateLinkKey(), DROP), DROP, sealed), null);
  assert.equal(await openManifest(master, DROP, new Uint8Array(5)), null);
});

test('names and types are cleaned before they are sealed', () => {
  assert.equal(cleanFileName('a/b\\c\u0001.txt'), 'a_b_c_.txt');
  assert.equal(cleanFileName('..'), 'file');
  assert.equal(cleanFileName(''), 'file');
  assert.equal(cleanFileName('x'.repeat(300)).length, 200);
  assert.equal(cleanFileType('Text/Plain'), 'text/plain');
  assert.equal(cleanFileType('nonsense'), 'application/octet-stream');
  assert.equal(cleanFileType(undefined), 'application/octet-stream');
});

test('parseManifest rejects non-canonical or malformed manifests', () => {
  const good = manifestBytes(sampleManifest());
  assert.throws(() => parseManifest(good, DROP2), /drop id/);
  const pretty = new TextEncoder().encode(JSON.stringify(sampleManifest(), null, 2));
  assert.throws(() => parseManifest(pretty, DROP), /not canonical/);
  const badSegments = sampleManifest();
  badSegments.files[0].segments = 1;
  assert.throws(() => parseManifest(manifestBytes(badSegments), DROP), /segments/);
  const badKdf = sampleManifest({ ...KDF, iterations: 10 });
  assert.throws(() => parseManifest(manifestBytes(badKdf), DROP), /kdf/);
  assert.doesNotThrow(() => parseManifest(manifestBytes(sampleManifest(KDF)), DROP));
});

test('previews round-trip and are bound to their file', async () => {
  const master = await deriveMaster(generateLinkKey(), DROP);
  const url = 'data:image/jpeg;base64,/9j/4AAQ';
  const enc = await encryptThumb(master, DROP, FILE_A, url);
  assert.equal(await decryptThumb(master, DROP, FILE_A, enc), url);
  assert.equal(await decryptThumb(master, DROP, FILE_B, enc), null);
  assert.equal(await decryptThumb(master, DROP, FILE_A, 'AAAA'), null);
});

test('gate token depends on link key and password; its hash is stable hex', async () => {
  const link = generateLinkKey();
  const a = await gateToken(await deriveMaster(link, DROP, { password: 'password-1', ...KDF }), DROP);
  const b = await gateToken(await deriveMaster(link, DROP, { password: 'password-2', ...KDF }), DROP);
  const c = await gateToken(await deriveMaster(generateLinkKey(), DROP, { password: 'password-1', ...KDF }), DROP);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.match(await gateHash(a), /^[0-9a-f]{64}$/);
  assert.equal(await gateHash(a), await gateHash(a));
});

test('password rules and KDF parameter checks', () => {
  assert.equal(passwordLongEnough('1234567'), false);
  assert.equal(passwordLongEnough('12345678'), true);
  assert.equal(passwordLongEnough('пароль12'), true);
  assert.equal(normalizePassword('ｐａｓｓ'), 'pass');
  const kdf = newKdfParams();
  assert.equal(validKdf(kdf), true);
  assert.equal(validKdf({ ...kdf, iterations: MIN_ITERATIONS - 1 }), false);
  assert.equal(validKdf({ ...kdf, salt: 'short' }), false);
  assert.equal(validKdf({ ...kdf, alg: 'scrypt' }), false);
  assert.equal(validKdf(null), false);
});
