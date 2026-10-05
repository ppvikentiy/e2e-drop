// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

/**
 * Colour mode, receiver side (informative, not part of the wire format).
 *
 * A camera does not see a display's red, green and blue as its own three channels: each display
 * primary leaks into the other camera channels. Calibration frames show a QR in one pure primary on
 * black; from them the receiver measures, per primary, the camera colour of its light and dark
 * modules. With v = A·s + k (v camera colour, s display channel intensities in [0, 1], k black level)
 * the display channels are recovered as s = A⁻¹(v − k), and each becomes a grey image for the QR reader.
 */

/** Provisional limit, to be set by measurements on reference devices. */
export const MAX_CONDITION = 6;
/** Below this difference between light and dark modules (0..255) a primary is too dim to use. */
export const MIN_CONTRAST = 24;

function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const r = 1 / det;
  return [
    A * r, -(b * i - c * h) * r, (b * f - c * e) * r,
    B * r, (a * i - c * g) * r, -(a * f - c * d) * r,
    C * r, -(a * h - b * g) * r, (a * e - b * d) * r,
  ];
}

const normInf = (m) => Math.max(...[0, 3, 6].map((o) => Math.abs(m[o]) + Math.abs(m[o + 1]) + Math.abs(m[o + 2])));

/**
 * @param {{light: number[], dark: number[]}[]} primaries measured camera colours for display red, green, blue
 * @returns {{inverse: number[], black: number[], condition: number, ok: boolean, reason?: string}}
 */
export function colourMatrix(primaries) {
  const black = [0, 1, 2].map((ch) => primaries.reduce((acc, p) => acc + p.dark[ch], 0) / 3);
  // Row r, column c: how camera channel r responds to display primary c.
  const A = new Array(9);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) A[r * 3 + c] = primaries[c].light[r] - black[r];
  const dim = [0, 1, 2].find((c) => A[c * 3 + c] < MIN_CONTRAST);
  const inverse = invert3(A);
  if (dim !== undefined || !inverse) return { inverse: inverse ?? IDENTITY, black, condition: Infinity, ok: false, reason: 'contrast' };
  // Separability does not depend on per-channel gain: judge the matrix with a unit diagonal.
  const N = A.map((v, idx) => v / A[(idx % 3) * 3 + (idx % 3)]);
  const Ni = invert3(N);
  const condition = Ni ? normInf(N) * normInf(Ni) : Infinity;
  const ok = condition <= MAX_CONDITION;
  return { inverse, black, condition, ok, reason: ok ? undefined : 'crosstalk' };
}

const IDENTITY = [1 / 255, 0, 0, 0, 1 / 255, 0, 0, 0, 1 / 255];
/** Before any calibration: take the camera channels as they are. */
export const RAW_MATRIX = { inverse: IDENTITY, black: [0, 0, 0], condition: 1, ok: true };

/**
 * Splits an RGBA image into three grey RGBA images, one per display channel.
 * @param {Uint8ClampedArray|Uint8Array} rgba @param {{inverse:number[], black:number[]}} matrix
 * @param {Uint8ClampedArray[]} [out] three buffers of rgba.length, reused between frames
 */
export function separateChannels(rgba, matrix, out = [0, 1, 2].map(() => new Uint8ClampedArray(rgba.length))) {
  const m = matrix.inverse;
  const [k0, k1, k2] = matrix.black;
  const [o0, o1, o2] = out;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i] - k0;
    const g = rgba[i + 1] - k1;
    const b = rgba[i + 2] - k2;
    // Uint8ClampedArray rounds and clamps on store.
    const s0 = (m[0] * r + m[1] * g + m[2] * b) * 255;
    const s1 = (m[3] * r + m[4] * g + m[5] * b) * 255;
    const s2 = (m[6] * r + m[7] * g + m[8] * b) * 255;
    o0[i] = o0[i + 1] = o0[i + 2] = s0;
    o1[i] = o1[i + 1] = o1[i + 2] = s1;
    o2[i] = o2[i + 1] = o2[i + 2] = s2;
    o0[i + 3] = o1[i + 3] = o2[i + 3] = 255;
  }
  return out;
}

/**
 * Grey image of the brightest channel of each pixel. A calibration code (one primary on black) is
 * dim in plain luminance — pure blue is about a tenth of white — but crisp here; black-and-white codes
 * look the same either way.
 */
export function maxChannel(rgba, out = new Uint8ClampedArray(rgba.length)) {
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    out[i] = out[i + 1] = out[i + 2] = r > g ? (r > b ? r : b) : g > b ? g : b;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Measures one calibration frame: the mean camera colour of its light and dark modules.
 * @param {Uint8ClampedArray|Uint8Array} rgba @param {number} width @param {number} height
 * @param {{x:number,y:number}[]} quad the QR's corners as reported by the reader (any order around the shape)
 * @param {number} primary 0..2: the display channel the light modules are lit in
 */
export function measureCalibration(rgba, width, height, quad, primary) {
  const cx = quad.reduce((a, p) => a + p.x, 0) / quad.length;
  const cy = quad.reduce((a, p) => a + p.y, 0) / quad.length;
  // Stay well inside the symbol: its edges blur into the background.
  const poly = quad.map((p) => ({ x: cx + (p.x - cx) * 0.9, y: cy + (p.y - cy) * 0.9 }));
  const x0 = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.x))));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(...poly.map((p) => p.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...poly.map((p) => p.y))));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(...poly.map((p) => p.y))));
  const inside = (x, y) => {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      if (cross !== 0) {
        if (sign === 0) sign = Math.sign(cross);
        else if (Math.sign(cross) !== sign) return false;
      }
    }
    return true;
  };
  const step = Math.max(1, Math.floor(Math.max(x1 - x0, y1 - y0) / 400)); // a few hundred thousand samples at most
  const hist = new Uint32Array(256);
  const picks = [];
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      if (!inside(x, y)) continue;
      const i = (y * width + x) * 4;
      hist[rgba[i + primary]]++;
      picks.push(i);
    }
  }
  // A camera blurs module edges into mixtures of light and dark. Only the clearest pixels of each kind
  // (module centres) are averaged: the brightest and the darkest PURE_SHARE of the samples. A QR code
  // is about half light, half dark, so both shares fall well inside their class.
  const lo = percentile(hist, picks.length * PURE_SHARE);
  const hi = percentile(hist, picks.length * (1 - PURE_SHARE));
  if (hi <= lo) return null;
  const light = [0, 0, 0];
  const dark = [0, 0, 0];
  let nl = 0;
  let nd = 0;
  for (const i of picks) {
    const v = rgba[i + primary];
    const target = v >= hi ? light : v <= lo ? dark : null;
    if (!target) continue;
    for (let c = 0; c < 3; c++) target[c] += rgba[i + c];
    if (target === light) nl++;
    else nd++;
  }
  if (!nl || !nd) return null;
  return { light: light.map((v) => v / nl), dark: dark.map((v) => v / nd) };
}

const PURE_SHARE = 0.15;

/** Smallest value v with at least `rank` samples <= v. */
function percentile(hist, rank) {
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= rank) return v;
  }
  return 255;
}
