// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Receiver, createSender, createScreenStream, fromBytes, parseFrame, colourMatrix, measureCalibration, separateChannels,
  TYPE_CALIBRATION, TYPE_DATA, TYPE_MANIFEST, MAX_CONDITION,
} from '../src/index.js';

function lcg(seed) {
  let x = seed;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}
function rand(n, seed) {
  const r = lcg(seed);
  return Uint8Array.from({ length: n }, () => Math.floor(r() * 256));
}

test('colour screens: three data frames per screen, everything else alone, calibration first and periodic', async () => {
  const data = rand(200000, 1);
  const sender = await createSender({ source: fromBytes(data), frameBytes: 400, startOffset: 1, manifestEvery: 20 });
  const stream = createScreenStream(sender, { colour: true, calibrateEvery: 30 });
  const rx = new Receiver();
  const kinds = [];
  let screens = 0;
  while (!rx.complete && screens < 20000) {
    const s = await stream.nextScreen();
    screens++;
    kinds.push(s.kind === 'calibration' ? `c${s.primary}` : s.kind);
    for (const f of s.frames) {
      const p = parseFrame(f);
      assert.equal(p.verdict, 'ok');
      if (s.kind === 'colour') assert.equal(p.type, TYPE_DATA);
      if (s.kind === 'calibration') assert.equal(p.type, TYPE_CALIBRATION);
      const r = await rx.push(f);
      if (s.kind === 'calibration') assert.deepEqual(r.kind, 'calibration');
    }
  }
  assert.ok(rx.complete);
  assert.deepEqual(rx.result(), data);
  assert.deepEqual(kinds.slice(0, 3), ['c0', 'c1', 'c2']);
  assert.ok(kinds.slice(3).filter((k) => k === 'c0').length >= 1, 'calibration repeats');
  // Manifest frames are shown alone: the ones in the stream are exactly the mono screens.
  const mono = kinds.filter((k) => k === 'mono').length;
  const colour = kinds.filter((k) => k === 'colour').length;
  assert.ok(mono >= 1);
  // roughly three times fewer screens than frames
  const ideal = Math.ceil(data.length / sender.blockLen);
  assert.ok(colour < ideal / 2.5, `${colour} colour screens for ${ideal} blocks`);
});

test('mono stream is unchanged: one frame per screen', async () => {
  const sender = await createSender({ source: fromBytes(rand(5000, 2)), frameBytes: 400, startOffset: 2 });
  const stream = createScreenStream(sender);
  const s = await stream.nextScreen();
  assert.equal(s.kind, 'mono');
  assert.equal(parseFrame(s.frames[0]).type, TYPE_MANIFEST);
});

// A synthetic camera: v = A·s + k + noise, s in {0, 1} per display channel.
function camera(A, k, noise, seed) {
  const r = lcg(seed);
  return (bits, n) => {
    const rgba = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const s = [0, 1, 2].map((c) => bits[c][i]);
      for (let ch = 0; ch < 3; ch++) {
        rgba[i * 4 + ch] = k[ch] + A[ch][0] * s[0] + A[ch][1] * s[1] + A[ch][2] * s[2] + (r() - 0.5) * 2 * noise;
      }
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  };
}

function calibrate(shoot, W, H, seed) {
  const r = lcg(seed);
  const n = W * H;
  const quad = [{ x: 0, y: 0 }, { x: W - 1, y: 0 }, { x: W - 1, y: H - 1 }, { x: 0, y: H - 1 }];
  return colourMatrix([0, 1, 2].map((p) => {
    const lit = Uint8Array.from({ length: n }, () => (r() < 0.5 ? 1 : 0));
    const zero = new Uint8Array(n);
    const bits = [0, 1, 2].map((c) => (c === p ? lit : zero));
    return measureCalibration(shoot(bits, n), W, H, quad, p);
  }));
}

test('calibration separates channels of a camera with strong crosstalk', () => {
  const W = 120;
  const H = 120;
  const n = W * H;
  // Each column: the camera colour of one display primary. Red leaks into green, green into both.
  const A = [[170, 50, 10], [60, 160, 40], [15, 55, 150]];
  const shoot = camera(A, [20, 22, 25], 10, 7);
  const m = calibrate(shoot, W, H, 8);
  assert.ok(m.ok, `condition ${m.condition}`);
  const r = lcg(9);
  const bits = [0, 1, 2].map(() => Uint8Array.from({ length: n }, () => (r() < 0.5 ? 1 : 0)));
  const [g0, g1, g2] = separateChannels(shoot(bits, n), m);
  let errors = 0;
  for (let i = 0; i < n; i++) {
    for (const [c, g] of [[0, g0], [1, g1], [2, g2]]) if ((g[i * 4] > 127 ? 1 : 0) !== bits[c][i]) errors++;
  }
  assert.ok(errors / (3 * n) < 0.001, `bit errors ${errors}`);

  // Without calibration the raw camera channels are unusable for this camera.
  const raw = [0, 1, 2].map((c) => {
    let e = 0;
    const img = shoot(bits, n);
    for (let i = 0; i < n; i++) if ((img[i * 4 + c] > 105 ? 1 : 0) !== bits[c][i]) e++;
    return e / n;
  });
  assert.ok(Math.max(...raw) > 0.05, `raw error rates ${raw}`);
});

test('a camera that barely tells colours apart is reported', () => {
  const A = [[120, 110, 100], [110, 120, 110], [100, 110, 120]];
  const m = calibrate(camera(A, [20, 20, 20], 4, 3), 80, 80, 4);
  assert.equal(m.ok, false);
  assert.equal(m.reason, 'crosstalk');
  assert.ok(m.condition > MAX_CONDITION);
  const dark = calibrate(camera([[15, 0, 0], [0, 150, 0], [0, 0, 150]], [10, 10, 10], 2, 5), 80, 80, 6);
  assert.equal(dark.ok, false);
  assert.equal(dark.reason, 'contrast');
});
