// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

import { Rng, symbolSeed } from './rng.js';
import { sampleDegree } from './degree.js';

/**
 * Symbol structure: which blocks of a segment a given (fileId, segment, index) symbol XORs together.
 * Both sides compute this; nothing but the three numbers crosses the wire.
 *
 * @param {number} K blocks in this segment
 * @param {Uint16Array} table degree table from the manifest
 * @param {number} fileId32 first four bytes of the file id, big-endian
 * @param {number} segment
 * @param {number} index uint32 symbol index within the segment
 * @param {Int32Array} out receives the neighbour block numbers (length >= table.length)
 * @returns {number} degree (count of entries written to out)
 */
export function symbolNeighbors(K, table, fileId32, segment, index, out) {
  const rng = new Rng(symbolSeed(fileId32, segment, index));
  const degree = sampleDegree(table, rng.next() >>> 16, K);
  let n = 0;
  while (n < degree) {
    const block = rng.next() % K;
    let seen = false;
    for (let i = 0; i < n; i++) {
      if (out[i] === block) {
        seen = true;
        break;
      }
    }
    if (!seen) out[n++] = block;
  }
  return degree;
}

function xorInto(dst, src, len) {
  for (let i = 0; i < len; i++) dst[i] ^= src[i];
}

/**
 * Builds the payload of one symbol.
 * @param {Uint8Array} segmentBytes real bytes of the segment (may be shorter than K * blockLen)
 * @param {object} p { K, blockLen, table, fileId32, segment, index }
 * @param {Uint8Array} [out] reused output buffer, blockLen bytes
 */
export function encodeSymbol(segmentBytes, p, out = new Uint8Array(p.blockLen), scratch = new Int32Array(p.table.length)) {
  out.fill(0);
  const degree = symbolNeighbors(p.K, p.table, p.fileId32, p.segment, p.index, scratch);
  for (let i = 0; i < degree; i++) {
    const start = scratch[i] * p.blockLen;
    if (start >= segmentBytes.length) continue;
    const end = Math.min(start + p.blockLen, segmentBytes.length);
    const len = end - start;
    for (let j = 0; j < len; j++) out[j] ^= segmentBytes[start + j];
  }
  return out;
}

/**
 * Decoder for one segment.
 *
 * Symbols are added one at a time. Belief-propagation ("peeling") runs continuously; when it stalls
 * and enough equations are stored, {@link SegmentDecoder#solveResidual} finishes the job with
 * Gaussian elimination over GF(2) on the small unresolved remainder. Decoding is a pure function of
 * the set of symbols received: order and duplicates do not matter.
 */
export class SegmentDecoder {
  /**
   * @param {object} p { K, blockLen, table, fileId32, segment }
   */
  constructor(p) {
    this.K = p.K;
    this.blockLen = p.blockLen;
    this.table = p.table;
    this.fileId32 = p.fileId32;
    this.segment = p.segment;
    // Structure-only mode tracks which blocks are determined, without touching any payload bytes.
    // Whether a set of symbols decodes depends only on their indices, so this is a cheap oracle.
    this.structureOnly = p.structureOnly === true;
    this.data = this.structureOnly ? null : new Uint8Array(p.K * p.blockLen);
    this.solved = new Uint8Array(p.K);
    this.unsolved = p.K;
    this.eqNeighbors = []; // Int32Array | null per equation
    this.eqPayload = [];
    this.byBlock = Array.from({ length: p.K }, () => []);
    this.liveEquations = 0;
    this.queue = [];
    this.scratch = new Int32Array(p.table.length);
    this.symbolsAdded = 0;
  }

  get complete() {
    return this.unsolved === 0;
  }

  /**
   * @param {number} index symbol index
   * @param {Uint8Array} payload blockLen bytes (copied)
   */
  addSymbol(index, payload) {
    this.symbolsAdded++;
    if (this.unsolved === 0) return;
    const { blockLen } = this;
    const degree = symbolNeighbors(this.K, this.table, this.fileId32, this.segment, index, this.scratch);
    const so = this.structureOnly;
    const pay = so ? null : payload.slice(0, blockLen);
    const rest = [];
    for (let i = 0; i < degree; i++) {
      const b = this.scratch[i];
      if (this.solved[b]) {
        if (!so) {
          const off = b * blockLen;
          for (let j = 0; j < blockLen; j++) pay[j] ^= this.data[off + j];
        }
      } else rest.push(b);
    }
    if (rest.length === 0) return;
    if (rest.length === 1) {
      this.queue.push({ block: rest[0], payload: pay });
    } else {
      const id = this.eqNeighbors.length;
      this.eqNeighbors.push(Int32Array.from(rest));
      this.eqPayload.push(pay);
      this.liveEquations++;
      for (const b of rest) this.byBlock[b].push(id);
    }
    this.drain();
  }

  drain() {
    const { blockLen } = this;
    while (this.queue.length > 0) {
      const { block, payload } = this.queue.pop();
      if (this.solved[block]) continue;
      if (!this.structureOnly) this.data.set(payload, block * blockLen);
      this.solved[block] = 1;
      this.unsolved--;
      const eqs = this.byBlock[block];
      this.byBlock[block] = [];
      for (const id of eqs) {
        const nbrs = this.eqNeighbors[id];
        if (nbrs === null) continue;
        const pay = this.eqPayload[id];
        if (!this.structureOnly) for (let j = 0; j < blockLen; j++) pay[j] ^= payload[j];
        const remaining = nbrs.filter((x) => x !== block);
        if (remaining.length === 1) {
          this.eqNeighbors[id] = null;
          this.eqPayload[id] = null;
          this.liveEquations--;
          this.queue.push({ block: remaining[0], payload: pay });
        } else if (remaining.length === 0) {
          this.eqNeighbors[id] = null;
          this.eqPayload[id] = null;
          this.liveEquations--;
        } else {
          this.eqNeighbors[id] = remaining;
        }
      }
    }
  }

  /** Number of stored (still undecided) equations. */
  get equations() {
    return this.liveEquations;
  }

  /**
   * Gaussian elimination over GF(2) on whatever peeling left behind. Anything it determines is fed
   * back into peeling, which may cascade. Safe to call repeatedly; cheap when equations < unknowns.
   * @returns {boolean} true when the segment is complete afterwards
   */
  solveResidual() {
    for (;;) {
      if (this.unsolved === 0) return true;
      if (this.liveEquations < this.unsolved) return false;
      // Cheap check first: elimination on the bit matrix alone. Payloads are only touched
      // once the system is known to be solvable.
      if (!this.structureOnly && !this.eliminate(true)) return false;
      const progress = this.eliminate(false);
      if (this.unsolved === 0) return true;
      if (!progress) return false;
    }
  }

  /**
   * One elimination round.
   * @param {boolean} rankOnly only report whether the remaining system has full rank (touches no payload)
   * @returns {boolean} rankOnly: full rank; otherwise whether any block was newly determined
   */
  eliminate(rankOnly) {
    const { blockLen } = this;
    const withPayload = !this.structureOnly && !rankOnly;
    const unknown = [];
    const column = new Int32Array(this.K).fill(-1);
    for (let b = 0; b < this.K; b++) {
      if (!this.solved[b]) {
        column[b] = unknown.length;
        unknown.push(b);
      }
    }
    const u = unknown.length;
    const words = (u + 31) >>> 5;
    const rows = [];
    for (let id = 0; id < this.eqNeighbors.length; id++) {
      const nbrs = this.eqNeighbors[id];
      if (nbrs === null) continue;
      const bits = new Uint32Array(words);
      for (const b of nbrs) bits[column[b] >>> 5] |= 1 << (column[b] & 31);
      rows.push({ bits, pay: withPayload ? this.eqPayload[id].slice() : null });
    }
    let rank = 0;
    const pivotColumn = [];
    for (let c = 0; c < u && rank < rows.length; c++) {
      const w = c >>> 5;
      const mask = 1 << (c & 31);
      let found = -1;
      for (let r = rank; r < rows.length; r++) {
        if (rows[r].bits[w] & mask) {
          found = r;
          break;
        }
      }
      if (found < 0) continue;
      if (found !== rank) [rows[rank], rows[found]] = [rows[found], rows[rank]];
      const pivot = rows[rank];
      for (let r = 0; r < rows.length; r++) {
        if (r === rank || !(rows[r].bits[w] & mask)) continue;
        const row = rows[r];
        for (let k = w; k < words; k++) row.bits[k] ^= pivot.bits[k];
        if (withPayload) for (let j = 0; j < blockLen; j++) row.pay[j] ^= pivot.pay[j];
      }
      pivotColumn[rank] = c;
      rank++;
    }
    if (rankOnly) return rank === u;
    let found = false;
    for (let r = 0; r < rank; r++) {
      const row = rows[r];
      let ones = 0;
      for (let k = 0; k < words && ones < 2; k++) {
        let x = row.bits[k];
        while (x !== 0 && ones < 2) {
          x &= x - 1;
          ones++;
        }
      }
      if (ones === 1) {
        this.queue.push({ block: unknown[pivotColumn[r]], payload: row.pay });
        found = true;
      }
    }
    if (found) this.drain();
    return found;
  }
}
