// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

/**
 * Deterministic pseudo-random numbers, 32-bit integer arithmetic only.
 *
 * Sender and receiver must derive bit-identical symbol structure from (fileId, segment, index).
 * Floating point is deliberately absent from everything the receiver computes: engines differ in
 * how they approximate transcendental functions, integers do not. (The degree table, which is
 * built with floating point by the sender, travels inside the manifest as integers.)
 */

/** 32-bit finalizer (the public-domain MurmurHash3 fmix32 avalanche). */
export function fmix32(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Counter-based generator: state += golden-ratio increment, output = fmix32(state). */
export class Rng {
  constructor(seed) {
    this.state = seed >>> 0;
  }

  /** @returns {number} next uint32 */
  next() {
    this.state = (this.state + 0x9e3779b9) >>> 0;
    return fmix32(this.state);
  }
}

/**
 * Seed for the symbol (segment, index) of the stream identified by fileId32 (first 4 bytes of
 * the file id, big-endian). Each input passes through the avalanche before the next is mixed in.
 */
export function symbolSeed(fileId32, segment, index) {
  let h = fmix32((fileId32 ^ 0x5651445f) >>> 0);
  h = fmix32((h ^ Math.imul((segment + 1) >>> 0, 0x9e3779b1)) >>> 0);
  h = fmix32((h ^ Math.imul((index + 1) >>> 0, 0x85ebca77)) >>> 0);
  return h;
}
