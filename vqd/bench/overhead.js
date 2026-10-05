// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors
//
// How many symbols does a segment of K blocks need before it decodes? Uses the structure-only
// decoder, so no payload bytes are involved. Prints mean / p99 / max as a multiple of K.
//   node bench/overhead.js [trials]

import { SegmentDecoder, buildDegreeTable } from '../src/index.js';

function symbolsNeeded(K, table, seed) {
  const dec = new SegmentDecoder({ K, blockLen: 16, table, fileId32: seed, segment: 0, structureOnly: true });
  let n = 0;
  const step = K < 100 ? 1 : Math.max(1, Math.ceil(K * 0.001));
  for (;;) {
    for (let i = 0; i < step; i++) dec.addSymbol(n++, null);
    if (dec.complete || dec.solveResidual()) return n;
    if (n > K * 4 + 64) return Infinity;
  }
}

const trials = Number(process.argv[2] ?? 200);
console.log(`trials per K: ${trials} (fewer for large K)\n`);
console.log('K      table    mean/K   p50/K    p99/K    max/K    extra symbols (mean)');
for (const K of [1, 2, 4, 8, 16, 32, 64, 65, 100, 200, 500, 1000, 1037, 2048]) {
  const t = buildDegreeTable(K);
  const n = K >= 1000 ? Math.max(20, Math.floor(trials / 6)) : K >= 200 ? Math.floor(trials / 2) : trials;
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(symbolsNeeded(K, t, 0x1000 + i * 7919));
  xs.sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const q = (p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  console.log(
    `${String(K).padEnd(6)} ${(K <= 64 ? 'dense' : 'soliton').padEnd(8)} ${(mean / K).toFixed(4)}   ${(q(0.5) / K).toFixed(4)}   ${(q(0.99) / K).toFixed(4)}   ${(xs[xs.length - 1] / K).toFixed(4)}   ${(mean - K).toFixed(1)}`,
  );
}
