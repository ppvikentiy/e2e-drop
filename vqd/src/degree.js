// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

/**
 * Degree distribution.
 *
 * The sender builds a truncated robust-soliton distribution (Luby, "LT codes", 2002) with
 * floating point and ships it in the manifest as a table of 16-bit cumulative thresholds.
 * The receiver never recomputes it: it only reads the table. That removes the one place where
 * two JavaScript engines could disagree (Math.log is only approximately specified).
 */

export const DEFAULT_SOLITON_C = 0.05;
export const DEFAULT_SOLITON_DELTA = 0.01;
export const DEFAULT_MAX_DEGREE = 128;
/** Up to this many blocks per segment the table is Binomial(K, 1/2): a uniformly random non-empty subset. */
export const DENSE_MAX_K = 64;

/**
 * @param {number} K blocks per full segment
 * @returns {Uint16Array} cdf[i] = largest 16-bit draw that still maps to degree i + 1; last entry 0xFFFF
 */
export function buildDegreeTable(K, { c = DEFAULT_SOLITON_C, delta = DEFAULT_SOLITON_DELTA, maxDegree = DEFAULT_MAX_DEGREE } = {}) {
  if (K <= DENSE_MAX_K) return buildDenseTable(K);
  const D = Math.max(1, Math.min(K, maxDegree));
  if (D === 1) return Uint16Array.of(0xffff);
  const R = Math.max(1, c * Math.log(K / delta) * Math.sqrt(K));
  const pivot = Math.max(1, Math.min(K, Math.round(K / R)));
  const weight = new Float64Array(D + 1);
  let total = 0;
  for (let d = 1; d <= D; d++) {
    const rho = d === 1 ? 1 / K : 1 / (d * (d - 1));
    let tau = 0;
    if (d < pivot) tau = R / (d * K);
    else if (d === pivot) tau = (R * Math.log(R / delta)) / K;
    weight[d] = rho + tau;
    total += weight[d];
  }
  const cdf = new Uint16Array(D);
  let acc = 0;
  for (let i = 0; i < D - 1; i++) {
    acc += weight[i + 1] / total;
    cdf[i] = Math.min(0xfffe, Math.floor(acc * 0xffff));
    if (i > 0 && cdf[i] < cdf[i - 1]) cdf[i] = cdf[i - 1];
  }
  cdf[D - 1] = 0xffff;
  return cdf;
}

/**
 * For tiny segments a sparse soliton wastes symbols; dense random equations reach full rank with
 * about two spare symbols. Degree d is drawn with probability C(K, d) / (2^K - 1).
 */
function buildDenseTable(K) {
  const row = new Float64Array(K + 1);
  row[0] = 1;
  for (let n = 1; n <= K; n++) for (let k = n; k >= 1; k--) row[k] += row[k - 1];
  let total = 0;
  for (let d = 1; d <= K; d++) total += row[d];
  const cdf = new Uint16Array(K);
  let acc = 0;
  for (let i = 0; i < K - 1; i++) {
    acc += row[i + 1] / total;
    cdf[i] = Math.min(0xfffe, Math.floor(acc * 0xffff));
    if (i > 0 && cdf[i] < cdf[i - 1]) cdf[i] = cdf[i - 1];
  }
  cdf[K - 1] = 0xffff;
  return cdf;
}

const denseCache = new Map();

/**
 * The table a segment of k blocks actually uses. With gzip, segments differ in size: a table built
 * for the largest one (K) would, capped to a small k, make nearly every symbol the sum of all k
 * blocks, and such equations never reach full rank. So a smaller segment with k <= DENSE_MAX_K uses
 * Binomial(k, 1/2) instead. Both sides compute it; only +, *, / and floor are involved, which IEEE 754
 * fixes exactly, so engines cannot disagree. Larger segments keep the manifest's soliton table:
 * its mass sits on small degrees, which the cap barely touches.
 * @param {Uint16Array} table manifest table (built for K) @param {number} K @param {number} k blocks in this segment
 */
export function segmentDegreeTable(table, K, k) {
  if (k >= K || k > DENSE_MAX_K) return table;
  let t = denseCache.get(k);
  if (!t) denseCache.set(k, (t = buildDenseTable(k)));
  return t;
}

/** Table well-formedness (applies to anything read from the wire). */
export function isValidDegreeTable(table, K) {
  if (table.length < 1 || table.length > Math.max(1, K)) return false;
  if (table[table.length - 1] !== 0xffff) return false;
  for (let i = 1; i < table.length; i++) if (table[i] < table[i - 1]) return false;
  return true;
}

/**
 * Smallest degree whose threshold is >= r16. Integer-only.
 * @param {Uint16Array} table @param {number} r16 uint16 draw @param {number} K segment size (degree is capped to it)
 */
export function sampleDegree(table, r16, K) {
  let lo = 0;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (r16 <= table[mid]) hi = mid;
    else lo = mid + 1;
  }
  const d = lo + 1;
  return d < K ? d : K;
}
