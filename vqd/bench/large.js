// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors
//
// End to end on a big file, no camera: sender -> lossy channel -> receiver, with timings.
//   node --max-old-space-size=4096 bench/large.js [megabytes=150] [loss=0.05] [frameBytes=2953]

import { createSender, fromBytes, Receiver } from '../src/index.js';
import { createHash } from 'node:crypto';

const mb = Number(process.argv[2] ?? 150);
const loss = Number(process.argv[3] ?? 0.05);
const frameBytes = Number(process.argv[4] ?? 2953);

const data = new Uint8Array(mb * 1024 * 1024);
let x = 12345;
for (let i = 0; i < data.length; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; data[i] = x >>> 24; }

let t = performance.now();
const sender = await createSender({ source: fromBytes(data), name: 'big.bin', frameBytes });
const prepare = performance.now() - t;
console.log(`file ${mb} MiB, frame ${frameBytes} B (block ${sender.blockLen}), K=${sender.K}, segments=${sender.segmentCount}, loss ${loss * 100}%`);
console.log(`sender prepare (hash segments): ${prepare.toFixed(0)} ms`);

const rx = new Receiver();
let seed = 99;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
let sent = 0;
let encodeMs = 0;
let receiveMs = 0;
while (!rx.complete) {
  t = performance.now();
  const f = await sender.nextFrame();
  encodeMs += performance.now() - t;
  sent++;
  if (rnd() < loss) continue;
  t = performance.now();
  await rx.push(f);
  receiveMs += performance.now() - t;
}
const ok = createHash('sha256').update(rx.result()).digest('hex') === createHash('sha256').update(data).digest('hex');
const blocks = Math.ceil(data.length / sender.blockLen);
const ideal = blocks / (1 - loss);
console.log(`frames sent ${sent}  ideal ${Math.round(ideal)}  overhead ${(sent / ideal).toFixed(3)}x  verified ${ok}`);
console.log(`sender CPU ${encodeMs.toFixed(0)} ms (${(encodeMs / sent * 1000).toFixed(0)} us/frame)`);
console.log(`receiver CPU ${receiveMs.toFixed(0)} ms (${(receiveMs / sent * 1000).toFixed(0)} us/frame), decode attempts ${rx.stats.decodeAttempts}, hash failures ${rx.stats.hashFailures}`);
const rate = 125 * 1024; // useful bytes/s target (150 MB in 20 min)
console.log(`at ${(rate / sender.blockLen).toFixed(1)} frames/s: transfer time ${(sent / (rate / sender.blockLen) / 60).toFixed(1)} min`);
