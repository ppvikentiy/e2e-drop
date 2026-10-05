import test from 'node:test';
import assert from 'node:assert/strict';
import { ciphertextLength, sealedManifest, validGateHash, validKdfParams, MAX_SEALED_BYTES } from '../src/manifest.js';
// The browser seals the manifest; the server must accept exactly those bytes without being able to read them.
import {
  buildManifest,
  manifestBytes,
  sealManifest,
  openManifest,
  bytesToBase64,
  deriveMaster,
  generateLinkKey,
  ciphertextLength as clientCipherLength,
} from '../../client/src/crypto/vde2.js';

const DROP = '11111111-2222-4333-8444-555555555555';
const FILE_A = 'aaaaaaaa-0000-4000-8000-000000000001';

async function sealedFromClient() {
  const master = await deriveMaster(generateLinkKey(), DROP);
  const manifest = buildManifest({
    dropId: DROP,
    kdf: null,
    files: [{ id: FILE_A, name: 'отчёт.pdf', type: 'application/pdf', size: 5 * 1024 * 1024, thumb: null }],
  });
  const plain = manifestBytes(manifest);
  const sealed = await sealManifest(master, DROP, plain);
  return { master, plain, sealed };
}

test('accepts the sealed manifest the browser builds, and stores it unread', async () => {
  const { master, plain, sealed } = await sealedFromClient();
  const bytes = sealedManifest(bytesToBase64(sealed));
  assert.ok(bytes);
  assert.deepEqual(new Uint8Array(bytes), sealed);
  // what the server stores contains no trace of the name
  assert.ok(!Buffer.from(bytes).includes(Buffer.from('отчёт')));
  assert.deepEqual(await openManifest(master, DROP, new Uint8Array(bytes)), plain);
});

test('a change on the server or another key does not open', async () => {
  const { master, sealed } = await sealedFromClient();
  const flipped = sealed.slice();
  flipped[20] ^= 1;
  assert.equal(await openManifest(master, DROP, flipped), null);
  assert.equal(await openManifest(master, '11111111-2222-4333-8444-666666666666', sealed), null);
  assert.equal(await openManifest(await deriveMaster(generateLinkKey(), DROP), DROP, sealed), null);
});

test('rejects what cannot be a sealed manifest', () => {
  assert.equal(sealedManifest(undefined), null);
  assert.equal(sealedManifest(''), null);
  assert.equal(sealedManifest('not base64!'), null);
  assert.equal(sealedManifest(Buffer.alloc(10).toString('base64')), null);
  assert.equal(sealedManifest(Buffer.alloc(MAX_SEALED_BYTES + 3).toString('base64')), null);
  assert.ok(sealedManifest(Buffer.alloc(64).toString('base64')));
});

test('server and client agree on ciphertext length', () => {
  for (const n of [0, 1, 4194303, 4194304, 4194305, 524288000]) assert.equal(ciphertextLength(n), clientCipherLength(n));
});

test('parameter validators', () => {
  assert.equal(validKdfParams({ salt: 'AAAAAAAAAAAAAAAAAAAAAA', iterations: 600000 }), true);
  assert.equal(validKdfParams({ salt: 'AAAA', iterations: 600000 }), false);
  assert.equal(validKdfParams({ salt: 'AAAAAAAAAAAAAAAAAAAAAA', iterations: 1000 }), false);
  assert.equal(validGateHash('a'.repeat(64)), true);
  assert.equal(validGateHash('A'.repeat(64)), false);
});
