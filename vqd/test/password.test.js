// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Receiver, MemorySymbolStore, MemorySegmentSink, createSender, fromBytes, encodeManifestBody, decodeManifestBody, parseFrame,
  passwordLength, MIN_ITERATIONS,
} from '../src/index.js';

const ITER = MIN_ITERATIONS; // keeps the tests quick; the default is 600 000
const PW = 'correct horse battery';

function rand(n, seed) {
  const out = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; out[i] = x >>> 24; }
  return out;
}
function text(n) {
  const words = ['секрет ', 'e2e ', 'drop ', 'файл\n'];
  let x = 5;
  let s = '';
  while (s.length < n) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; s += words[x % words.length]; }
  return new TextEncoder().encode(s).slice(0, n);
}

async function stream(data, opts = {}) {
  return createSender({ source: fromBytes(data), name: 'тайна.txt', mime: 'text/plain', frameBytes: 300, kMax: 64, startOffset: 3, iterations: ITER, ...opts });
}
async function feed(rx, sender, limit = 20000) {
  let n = 0;
  while (!rx.complete && n++ < limit) await rx.push(await sender.nextFrame());
}

test('an encrypted stream hides data and file name, and opens with the password', async () => {
  const data = rand(40000, 1);
  const sender = await stream(data, { password: PW });
  assert.ok(sender.encrypted);
  assert.equal(sender.manifest.enc.iterations, ITER);
  const rx = new Receiver();
  await rx.setPassword(PW); // before the camera is switched on
  await feed(rx, sender);
  assert.ok(rx.complete);
  assert.deepEqual(rx.result(), data);
  assert.equal(rx.manifest.name, 'тайна.txt');
  assert.equal(rx.manifest.mime, 'text/plain');

  // nothing readable on the wire: not the name, not the file bytes
  const wire = [];
  const probe = await stream(data, { password: PW });
  for (let i = 0; i < 400; i++) wire.push(await probe.nextFrame());
  const all = Buffer.concat(wire.map((f) => Buffer.from(f)));
  assert.ok(!all.includes(Buffer.from('тайна')));
  assert.ok(!all.includes(Buffer.from(data.subarray(1000, 1032))));
});

test('compressed data is encrypted too and still compresses first', async () => {
  const data = text(120000);
  const sender = await stream(data, { password: PW });
  assert.ok(sender.compressedSegments > 0);
  assert.ok(sender.totalBlocks * sender.blockLen < data.length / 2);
  const rx = new Receiver();
  await rx.setPassword(PW);
  await feed(rx, sender);
  assert.deepEqual(rx.result(), data);
});

test('wrong password is rejected at once; frames received while locked are kept', async () => {
  const data = rand(30000, 2);
  const sender = await stream(data, { password: PW });
  const rx = new Receiver();
  // scan without any password first
  let n = 0;
  while (!rx.complete && n++ < 20000 && !(rx.manifest && rx.segmentsDone === 0 && rx.stats.symbols > sender.totalBlocks * 1.3)) {
    await rx.push(await sender.nextFrame());
  }
  assert.ok(rx.encrypted && !rx.unlocked);
  assert.equal(rx.complete, false, 'nothing is written while locked');
  const before = rx.stats.symbols;

  assert.equal((await rx.setPassword('wrong password!')).kind, 'wrong-password');
  assert.equal(rx.unlocked, false);
  assert.equal(rx.manifest.name, '', 'the name stays hidden');

  const ok = await rx.setPassword(PW);
  assert.equal(ok.kind, 'unlocked');
  assert.equal(ok.name, 'тайна.txt');
  // everything already scanned decodes without scanning again
  assert.ok(rx.stats.symbols === before);
  await feed(rx, sender);
  assert.deepEqual(rx.result(), data);
});

test('same file and password give the same stream; another password gives another', async () => {
  const data = rand(20000, 3);
  const a = await stream(data, { password: PW });
  const b = await stream(data, { password: PW, startOffset: 99 });
  const c = await stream(data, { password: PW + '!' });
  const plain = await stream(data);
  assert.deepEqual(a.fileId, b.fileId);
  assert.notDeepEqual(a.fileId, c.fileId);
  assert.notDeepEqual(a.fileId, plain.fileId);
  assert.deepEqual(a.manifest.enc.salt, b.manifest.enc.salt);
  assert.notDeepEqual(a.manifest.enc.salt, c.manifest.enc.salt);
});

test('resume: a restarted receiver and sender continue; the password is asked for again', async () => {
  const store = new MemorySymbolStore();
  const sink = new MemorySegmentSink();
  const data = rand(60000, 4);
  const first = await stream(data, { password: PW, startOffset: 1 });
  let rx = new Receiver({ store, sink });
  await rx.setPassword(PW);
  for (let i = 0; i < 120; i++) await rx.push(await first.nextFrame());
  assert.ok(!rx.complete);
  rx = new Receiver({ store, sink }); // the page was reloaded: no password in memory
  const second = await stream(data, { password: PW, startOffset: 2 });
  assert.deepEqual(second.fileId, first.fileId);
  for (let i = 0; i < 5; i++) await rx.push(await second.nextFrame());
  assert.ok(rx.encrypted && !rx.unlocked);
  assert.equal((await rx.setPassword(PW)).kind, 'unlocked');
  await feed(rx, second);
  assert.deepEqual(rx.result(), data);
});

test('a password on a plain stream is reported, and the file is received', async () => {
  const data = rand(5000, 5);
  const sender = await stream(data);
  const rx = new Receiver();
  await rx.setPassword(PW);
  let flagged = false;
  let n = 0;
  while (!rx.complete && n++ < 5000) {
    const r = await rx.push(await sender.nextFrame());
    if (r.kind === 'manifest' && r.passwordIgnored) flagged = true;
  }
  assert.ok(flagged);
  assert.deepEqual(rx.result(), data);
  assert.equal((await rx.setPassword('anything')).kind, 'not-encrypted');
});

test('a tampered encrypted segment never yields data', async () => {
  const data = rand(20000, 6);
  const sender = await stream(data, { password: PW });
  const rx = new Receiver();
  await rx.setPassword(PW);
  // flip the first byte of every data payload and re-seal the frame CRC: the segment hash then fails
  const { encodeDataFrame } = await import('../src/index.js');
  let n = 0;
  while (!rx.complete && n++ < 400) {
    let f = await sender.nextFrame();
    const p = parseFrame(f);
    if (p.verdict === 'ok' && p.type === 2) {
      const payload = p.payload.slice();
      payload[3] ^= 0x55;
      f = encodeDataFrame({ fileId: p.fileId, segment: p.segment, index: p.index, payload });
    }
    await rx.push(f);
  }
  assert.equal(rx.complete, false);
  assert.ok(rx.stats.hashFailures >= 1);
});

test('manifest validation for encrypted streams', async () => {
  const sender = await stream(rand(3000, 7), { password: PW });
  const body = encodeManifestBody(sender.manifest);
  const m = decodeManifestBody(body);
  assert.equal(m.name, '');
  assert.equal(m.enc.iterations, ITER);
  assert.equal(m.segments[0].nonce.length, 12);
  // iterations outside 100 000 … 10 000 000 are refused
  const low = encodeManifestBody({ ...sender.manifest, enc: { ...sender.manifest.enc, iterations: 99999 } });
  assert.throws(() => decodeManifestBody(low), /iteration/);
  const high = encodeManifestBody({ ...sender.manifest, enc: { ...sender.manifest.enc, iterations: 10000001 } });
  assert.throws(() => decodeManifestBody(high), /iteration/);
  // unknown flag bits are refused
  const flagged = body.slice();
  flagged[1] |= 0x04;
  assert.throws(() => decodeManifestBody(flagged), /flags/);
});

test('password rules', async () => {
  assert.equal(passwordLength('пароль12'), 8);
  assert.equal(passwordLength('😀😀😀😀😀😀😀😀'), 8, 'counted in code points');
  await assert.rejects(stream(rand(100, 8), { password: 'short' }), /too short/);
});
