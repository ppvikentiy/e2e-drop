// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors

/** CRC-16/CCITT-FALSE: polynomial 0x1021, initial value 0xFFFF, no reflection, no final xor. */
const TABLE = (() => {
  const t = new Uint16Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n << 8;
    for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    t[n] = c;
  }
  return t;
})();

/** @param {Uint8Array} bytes @param {number} [start] @param {number} [end] */
export function crc16(bytes, start = 0, end = bytes.length) {
  let crc = 0xffff;
  for (let i = start; i < end; i++) crc = ((crc << 8) & 0xffff) ^ TABLE[((crc >>> 8) ^ bytes[i]) & 0xff];
  return crc;
}
