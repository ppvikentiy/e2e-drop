// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors
//
// Golden vectors. Any independent implementation of VQD v1 must reproduce these exactly.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Rng, fmix32, symbolSeed, crc16, buildDegreeTable, symbolNeighbors, createSender, fromBytes, parseFrame,
} from '../src/index.js';

const hex = (b) => Buffer.from(b).toString('hex');

test('crc16 check value', () => {
  assert.equal(crc16(new TextEncoder().encode('123456789')), 0x29b1);
});

test('fmix32 / Rng', () => {
  assert.equal(fmix32(0), 0);
  assert.equal(fmix32(1), 1364076727);
  const r = new Rng(1);
  assert.deepEqual([r.next(), r.next(), r.next(), r.next()], [2527132011, 314344336, 2535364964, 2041432039]);
  const r2 = new Rng(0xffffffff);
  assert.deepEqual([r2.next(), r2.next()], [920564995, 4230986166]);
});

test('symbolSeed', () => {
  assert.equal(symbolSeed(0x01020304, 0, 0), 1162425510);
  assert.equal(symbolSeed(0x01020304, 3, 100), 581488596);
  assert.equal(symbolSeed(0xdeadbeef, 65535, 0xffffffff), 3022913814);
});

test('degree tables', () => {
  assert.deepEqual([...buildDegreeTable(1)], [65535]);
  assert.deepEqual([...buildDegreeTable(2)], [43690, 65535]);
  assert.deepEqual([...buildDegreeTable(8)], [2056, 9252, 23644, 41634, 56026, 63221, 65277, 65535]);
  const t65 = buildDegreeTable(65);
  assert.deepEqual([...t65.slice(0, 8)], [3037, 25967, 34004, 38221, 40869, 42713, 44087, 45160]);
  assert.deepEqual([...t65.slice(-3)], [65513, 65524, 65535]);
  const t100 = buildDegreeTable(100);
  assert.deepEqual([...t100.slice(0, 8)], [2532, 26167, 34392, 38678, 41353, 43206, 44579, 45647]);
  assert.deepEqual([...t100.slice(-3)], [65525, 65530, 65535]);
  const t1037 = buildDegreeTable(1037);
  assert.equal(t1037.length, 128);
  assert.deepEqual([...t1037.slice(0, 8)], [1023, 28577, 37923, 42678, 45579, 47545, 48973, 50061]);
  const t2048 = buildDegreeTable(2048);
  assert.deepEqual([...t2048.slice(0, 8)], [787, 29278, 38901, 43777, 46740, 48740, 50188, 51287]);
  assert.deepEqual([...t2048.slice(-3)], [65528, 65531, 65535]);
});

test('symbol neighbours', () => {
  const t = buildDegreeTable(2048);
  const out = new Int32Array(t.length);
  const nb = (K, tbl, id, seg, idx) => [...out.subarray(0, symbolNeighbors(K, tbl, id, seg, idx, out))];
  assert.deepEqual(nb(2048, t, 0x01020304, 0, 0), [1135, 1440]);
  assert.deepEqual(nb(2048, t, 0x01020304, 0, 1), [1540, 1242]);
  assert.deepEqual(nb(2048, t, 0x01020304, 0, 2), [1338, 1380]);
  assert.deepEqual(nb(2048, t, 0x01020304, 7, 4000000000), [1600, 1010, 589, 1308]);
  assert.deepEqual(nb(100, buildDegreeTable(100), 0xdeadbeef, 3, 17), [42, 8, 87, 65, 97, 46]);
});

test('tiny file frames', async () => {
  const sender = await createSender({
    source: fromBytes(new TextEncoder().encode('Hello, E2E QR Drop!')),
    name: 'hello.txt', mime: 'text/plain', frameBytes: 64, startOffset: 7, manifestEvery: 1,
  });
  assert.equal(hex(sender.fileId), '2e8ca7f77255');
  assert.equal(sender.K, 1);
  assert.equal(sender.segmentCount, 1);
  assert.equal(sender.blockLen, 46);
  assert.equal(sender.compressedSegments, 0); // 19 bytes do not compress: sent raw
  const m = await sender.nextFrame();
  const m2 = await sender.nextFrame(); // manifest part 2 of 2 (the whole manifest leads the stream)
  const d = await sender.nextFrame();
  assert.equal(parseFrame(m2).verdict, 'ok');
  assert.equal(parseFrame(m2).part, 1);
  // manifest v2: version 2, flags 0, blockLen 46, K 1, rawChunk 94192, 1 segment, size 19, table [ffff],
  // name, mime, then the segment entry: storedLen 19, mode 0 (raw), SHA-256 (continued in part 2)
  assert.equal(hex(m), '565102012e8ca7f7725500020200002e000100016ff000000001000000000000001301ffff0968656c6c6f2e7478740a746578742f706c61696e00000013d977');
  assert.equal(hex(m2), '565102012e8ca7f77255010200d85c9e14bfd8cd8336d60e1896ae0a89021f044066de44e5e7bb86a1337fdf16fa42');
  assert.equal(hex(d), '565102022e8ca7f772550000f6b7bbec48656c6c6f2c204532452051522044726f702100000000000000000000000000000000000000000000000000000032ee');
  assert.equal(parseFrame(m).verdict, 'ok');
  assert.equal(parseFrame(d).verdict, 'ok');
});
