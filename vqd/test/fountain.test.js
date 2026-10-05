// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

import test from 'node:test';
import assert from 'node:assert/strict';
import { SegmentDecoder, encodeSymbol, buildDegreeTable } from '../src/index.js';

function rand(n, seed) {
  const out = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; out[i] = x >>> 24; }
  return out;
}

for (const [K, len] of [[1, 20], [5, 16], [64, 32], [65, 32], [300, 24], [1000, 16]]) {
  test(`decodes K=${K}, partial last block, shuffled with duplicates`, () => {
    const blockLen = len;
    const data = rand(K * blockLen - 7, K);
    const table = buildDegreeTable(K);
    const p = { K, blockLen, table, fileId32: 0xabcdef01, segment: 2 };
    const dec = new SegmentDecoder(p);
    const scratch = new Int32Array(table.length);
    let idx = 12345;
    let n = 0;
    while (!dec.complete && n < K * 3 + 50) {
      const i = idx++ * 7 + (n % 3 === 0 ? 0 : 1);
      const pay = encodeSymbol(data, { ...p, index: i }, undefined, scratch);
      dec.addSymbol(i, pay);
      dec.addSymbol(i, pay); // duplicate must not hurt
      n++;
      if (!dec.complete && dec.equations >= dec.unsolved) dec.solveResidual();
    }
    assert.ok(dec.complete, `not complete after ${n} symbols`);
    assert.deepEqual(dec.data.subarray(0, data.length), data);
  });
}

test('structure-only decoder agrees with the real one on decodability', () => {
  const K = 200, blockLen = 16;
  const table = buildDegreeTable(K);
  const p = { K, blockLen, table, fileId32: 5, segment: 0 };
  const data = rand(K * blockLen, 9);
  const real = new SegmentDecoder(p);
  const dry = new SegmentDecoder({ ...p, structureOnly: true });
  for (let i = 0; i < 400; i++) {
    real.addSymbol(i, encodeSymbol(data, { ...p, index: i }));
    dry.addSymbol(i, null);
    real.solveResidual();
    dry.solveResidual();
    assert.equal(real.complete, dry.complete, `diverged at ${i}`);
    if (real.complete) break;
  }
  assert.ok(real.complete);
});
