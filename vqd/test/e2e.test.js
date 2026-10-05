// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSender, fromBytes, Receiver, MemorySymbolStore, MemorySegmentSink, encodeDataFrame, parseFrame, gzip, gunzip,
} from '../src/index.js';

function rand(n, seed) {
  const out = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; out[i] = x >>> 24; }
  return out;
}
function lcg(seed) {
  let x = seed;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}

async function run({ size, frameBytes, loss, seed, kMax, skip = 0, receiver, sender: reuse, limit = 100000, name = 'f.bin' }) {
  const data = rand(size, seed);
  const sender = reuse ?? await createSender({ source: fromBytes(data), name, frameBytes, kMax, startOffset: seed });
  const rx = receiver ?? new Receiver();
  const r = lcg(seed + 1);
  for (let i = 0; i < skip; i++) await sender.nextFrame();
  let sent = 0;
  while (!rx.complete && sent < limit) {
    const f = await sender.nextFrame();
    sent++;
    if (r() < loss) continue;
    await rx.push(f);
  }
  return { data, rx, sender, sent };
}

test('lossless small file', async () => {
  const { data, rx } = await run({ size: 1000, frameBytes: 200, loss: 0, seed: 1 });
  assert.ok(rx.complete);
  assert.deepEqual(rx.result(), data);
});

test('multi-segment file with 5% and 20% loss', async () => {
  for (const loss of [0.05, 0.2]) {
    const { data, rx, sender, sent } = await run({ size: 400000, frameBytes: 300, loss, seed: 2, kMax: 256 });
    assert.ok(sender.segmentCount > 3);
    assert.ok(rx.complete, `loss ${loss}`);
    assert.deepEqual(rx.result(), data);
    const ideal = Math.ceil(400000 / (300 - 18)) / (1 - loss);
    assert.ok(sent < ideal * 1.35 + 50, `sent ${sent} vs ideal ${ideal}`);
  }
});

test('late join: receiver starts mid-stream', async () => {
  const { data, rx } = await run({ size: 100000, frameBytes: 250, loss: 0.05, seed: 3, kMax: 128, skip: 777 });
  assert.deepEqual(rx.result(), data);
});

test('foreign QR codes and garbage are ignored', async () => {
  const data = rand(5000, 4);
  const sender = await createSender({ source: fromBytes(data), frameBytes: 200, startOffset: 4 });
  const rx = new Receiver();
  await rx.push(new TextEncoder().encode('https://example.org/'));
  const junk = rand(200, 99);
  await rx.push(junk);
  while (!rx.complete) await rx.push(await sender.nextFrame());
  assert.deepEqual(rx.result(), data);
  assert.equal(rx.stats.foreign, 2); // the URL and the random bytes
});

test('resume with a persistent store and a restarted sender', async () => {
  const store = new MemorySymbolStore();
  const sink = new MemorySegmentSink();
  const data = rand(60000, 5);
  const first = await createSender({ source: fromBytes(data), frameBytes: 250, kMax: 100, startOffset: 111 });
  let rx = new Receiver({ store, sink });
  for (let i = 0; i < 150; i++) await rx.push(await first.nextFrame());
  assert.ok(!rx.complete);

  // receiver app restarts; sender restarts with a different random offset
  rx = new Receiver({ store, sink });
  const second = await createSender({ source: fromBytes(data), frameBytes: 250, kMax: 100, startOffset: 222 });
  assert.deepEqual(second.fileId, first.fileId); // identity does not depend on the offset
  let n = 0;
  while (!rx.complete && n++ < 5000) await rx.push(await second.nextFrame());
  assert.ok(rx.complete);
  assert.deepEqual(rx.result(), data);
});

test('poisoned symbol with valid CRC is detected and the segment recovers', async () => {
  const data = rand(100000, 6);
  const sender = await createSender({ source: fromBytes(data), frameBytes: 600, kMax: 100, startOffset: 6 });
  const rx = new Receiver();
  let poisonedCount = 0;
  let n = 0;
  while (!rx.complete && n++ < 20000) {
    let f = await sender.nextFrame();
    const p = parseFrame(f);
    if (poisonedCount < 30 && p.verdict === 'ok' && p.type === 2) {
      const payload = p.payload.slice();
      payload[0] ^= 0xff;
      f = encodeDataFrame({ fileId: p.fileId, segment: p.segment, index: p.index, payload });
      poisonedCount++;
    }
    await rx.push(f);
  }
  assert.equal(poisonedCount, 30);
  assert.ok(rx.complete);
  assert.ok(rx.stats.hashFailures >= 1);
  assert.deepEqual(rx.result(), data);
});

// Text-like bytes: words from a small vocabulary, so gzip shrinks them several times over.
function text(n, seed) {
  const words = ['e2e', 'drop', 'файл', 'передача', 'qr', 'segment', 'block', 'камера', 'экран', '\n'];
  const r = lcg(seed);
  const parts = [];
  let len = 0;
  while (len < n) {
    const w = new TextEncoder().encode(words[Math.floor(r() * words.length)] + ' ');
    parts.push(w);
    len += w.length;
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p.subarray(0, Math.min(p.length, n - o)), o);
    o += p.length;
    if (o >= n) break;
  }
  return out;
}

async function transfer(data, opts = {}, { loss = 0, seed = 1, limit = 200000, rx = new Receiver() } = {}) {
  const sender = await createSender({ source: fromBytes(data), frameBytes: 300, kMax: 256, startOffset: seed, ...opts });
  const r = lcg(seed + 1);
  let sent = 0;
  while (!rx.complete && sent < limit) {
    const f = await sender.nextFrame();
    sent++;
    if (r() < loss) continue;
    await rx.push(f);
  }
  return { sender, rx, sent };
}

test('compressible file is gzipped per segment and needs far fewer frames', async () => {
  const data = text(300000, 11);
  const packed = await transfer(data, {}, { loss: 0.05, seed: 11 });
  assert.ok(packed.rx.complete);
  assert.deepEqual(packed.rx.result(), data);
  assert.equal(packed.sender.compressedSegments, packed.sender.segmentCount);
  const raw = await transfer(data, { compress: false }, { loss: 0.05, seed: 11 });
  assert.deepEqual(raw.rx.result(), data);
  assert.equal(raw.sender.compressedSegments, 0);
  assert.ok(packed.sender.totalBlocks * 2 < raw.sender.totalBlocks, `${packed.sender.totalBlocks} vs ${raw.sender.totalBlocks} blocks`);
  assert.ok(packed.sent * 2 < raw.sent, `${packed.sent} vs ${raw.sent} frames`);
});

test('mixed file: compressible and incompressible segments in one stream', async () => {
  const chunk = 256 * 282 - 16; // rawChunk for frameBytes 300, kMax 256
  const data = new Uint8Array(chunk * 4 + 1234);
  data.set(text(chunk, 21), 0);
  data.set(rand(chunk, 22), chunk);
  data.set(text(chunk, 23), chunk * 2);
  data.set(rand(chunk + 1234, 24), chunk * 3);
  const { sender, rx } = await transfer(data, {}, { loss: 0.1, seed: 21 });
  assert.deepEqual(sender.manifest.segments.map((s) => s.mode), [1, 0, 1, 0, 0]);
  assert.deepEqual(rx.result(), data);
});

test('resume works with compression: a restarted sender rebuilds the same stream', async () => {
  const store = new MemorySymbolStore();
  const sink = new MemorySegmentSink();
  const data = text(200000, 31);
  const first = await createSender({ source: fromBytes(data), frameBytes: 250, kMax: 100, startOffset: 1 });
  let rx = new Receiver({ store, sink });
  for (let i = 0; i < 40; i++) await rx.push(await first.nextFrame());
  assert.ok(!rx.complete);
  rx = new Receiver({ store, sink });
  const second = await createSender({ source: fromBytes(data), frameBytes: 250, kMax: 100, startOffset: 2 });
  assert.deepEqual(second.fileId, first.fileId);
  let n = 0;
  while (!rx.complete && n++ < 20000) await rx.push(await second.nextFrame());
  assert.deepEqual(rx.result(), data);
});

test('a file changed after the stream was prepared is refused, not sent corrupted', async () => {
  const data = text(200000, 41);
  const sender = await createSender({ source: fromBytes(data), frameBytes: 300, kMax: 64, windowSegments: 1, startOffset: 41 });
  data.fill(0x41, 100000, 120000); // the file on disk is edited while it is being shown
  await assert.rejects(async () => {
    for (let i = 0; i < 20000; i++) await sender.nextFrame();
  }, /changed/);
});

test('size limits: 512 MiB for the format, smaller limits enforced by the receiver', async () => {
  await assert.rejects(
    createSender({ source: { size: 512 * 1024 * 1024 + 1, read: async () => new Uint8Array(0) } }),
    /too large/,
  );
  const data = rand(5000, 51);
  const sender = await createSender({ source: fromBytes(data), frameBytes: 200, startOffset: 51 });
  const rx = new Receiver({ maxFileSize: 4000 }); // e.g. a browser without OPFS keeps a lower limit
  const result = await rx.push(await sender.nextFrame());
  assert.equal(result.kind, 'bad-manifest');
  assert.match(result.error, /size/);
});

test('decompression is capped at the declared size', async () => {
  const bomb = await gzip(new Uint8Array(1 << 20)); // a megabyte of zeros packs into about a kilobyte
  await assert.rejects(gunzip(bomb, 1000), /larger than declared/);
  assert.equal((await gunzip(bomb, 1 << 20)).length, 1 << 20);
});

test('manifest split over several frames', async () => {
  const data = rand(400000, 7);
  const sender = await createSender({ source: fromBytes(data), name: 'x'.repeat(200), frameBytes: 120, kMax: 64, startOffset: 7 });
  const rx = new Receiver();
  let n = 0;
  while (!rx.complete && n++ < 100000) await rx.push(await sender.nextFrame());
  assert.deepEqual(rx.result(), data);
});

test('a receiver can refuse a file the device has no room for', async () => {
  const data = rand(5000, 61);
  const sender = await createSender({ source: fromBytes(data), frameBytes: 200, startOffset: 61 });
  let asked = 0;
  const rx = new Receiver({ checkSpace: async (size) => { asked = size; return false; } });
  let result;
  for (let i = 0; i < 20 && !result?.noSpace; i++) result = await rx.push(await sender.nextFrame());
  assert.equal(asked, 5000);
  assert.equal(result.kind, 'bad-manifest');
  assert.ok(result.noSpace);
  assert.equal(rx.manifest, null);
});
