// SPDX-License-Identifier: Apache-2.0
// The service-worker download path, run in Node with a stub server: the page must learn when the
// browser has read the whole file, when it was cancelled, and when it failed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cipherSource, deriveMaster, fileCipher, generateLinkKey, toBase64Url } from '../src/crypto/vde2.js';
import { registerDownloadMessages, respondDownload } from '../src/sw-download.js';

const DROP = '11111111-2222-4333-8444-555555555555';
const FILE = 'aaaaaaaa-0000-4000-8000-000000000001';

function data(n) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31 + (i >> 9)) & 255;
  return out;
}

async function setup(plain, { status = 206 } = {}) {
  const master = await deriveMaster(generateLinkKey(), DROP);
  const fc = await fileCipher(master, DROP, FILE, plain.length);
  const src = cipherSource((s, e) => plain.subarray(s, e), fc);
  const cipher = await src.read(0, src.cipherLength);
  globalThis.fetch = async (_url, opts) => {
    if (status !== 206) return new Response('{}', { status });
    const [, s, e] = /bytes=(\d+)-(\d+)/.exec(opts.headers.Range);
    return new Response(cipher.slice(Number(s), Number(e) + 1), { status: 206 });
  };
  const self = new EventTarget();
  registerDownloadMessages(self);
  const channel = new MessageChannel();
  const messages = [];
  channel.port1.onmessage = (e) => messages.push(e.data);
  const id = String(Math.random()).slice(2);
  const plan = {
    token: 't'.repeat(43),
    accessKey: 'k',
    dropId: DROP,
    master: toBase64Url(master),
    files: [{ index: 0, id: FILE, name: 'отчёт.bin', type: 'application/octet-stream', plainSize: plain.length }],
  };
  self.dispatchEvent(Object.assign(new Event('message'), { data: { type: 'vde-prepare', id, plan }, ports: [channel.port2] }));
  const settle = () => new Promise((r) => setTimeout(r, 30));
  return { id, messages, settle, close: () => channel.port1.close() };
}

test('the page hears progress and then "done" once the whole file has been read', async () => {
  const plain = data(9 * 1024 * 1024 + 123);
  const s = await setup(plain);
  const res = await respondDownload(new URL(`https://x/vde-dl/${s.id}`));
  const got = new Uint8Array(await res.arrayBuffer());
  await s.settle();
  s.close();
  assert.deepEqual(got, plain);
  assert.deepEqual(s.messages[0], { ok: true, tracking: true });
  assert.equal(s.messages.at(-1).type, 'done');
  assert.equal(s.messages.at(-1).bytes, plain.length);
  assert.equal(s.messages.filter((m) => m.type === 'done').length, 1);
});

test('a cancelled download is reported as cancelled, not as done', async () => {
  const s = await setup(data(9 * 1024 * 1024));
  const res = await respondDownload(new URL(`https://x/vde-dl/${s.id}`));
  const reader = res.body.getReader();
  await reader.read();
  await reader.cancel();
  await s.settle();
  s.close();
  assert.equal(s.messages.at(-1).type, 'cancelled');
  assert.ok(!s.messages.some((m) => m.type === 'done'));
});

test('a server error reaches the page with its status', async () => {
  const s = await setup(data(1000), { status: 404 });
  const res = await respondDownload(new URL(`https://x/vde-dl/${s.id}`));
  await assert.rejects(res.arrayBuffer());
  await s.settle();
  s.close();
  assert.deepEqual(s.messages.at(-1), { type: 'error', status: 404 });
});
