// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The E2E QR Drop authors
//
// gzip for segments, on the platform's CompressionStream / DecompressionStream (browsers, workers,
// Node 18+). No dependency.

/** A compressed segment is used only when it saves at least this share of the raw size. */
export const MIN_SAVING = 0.05;

async function collect(stream) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @param {Uint8Array} bytes @returns {Promise<Uint8Array>} */
export async function gzip(bytes) {
  return collect(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')));
}

/**
 * Decompresses and refuses to produce more than `maxLength` bytes, so a crafted segment cannot be
 * used to exhaust memory ("zip bomb").
 * @param {Uint8Array} bytes @param {number} maxLength @returns {Promise<Uint8Array>}
 */
export async function gunzip(bytes, maxLength) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const out = new Uint8Array(maxLength);
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (length + value.length > maxLength) {
      await reader.cancel().catch(() => {});
      throw new Error('decompressed segment is larger than declared');
    }
    out.set(value, length);
    length += value.length;
  }
  return out.subarray(0, length);
}

/**
 * Chooses how a raw chunk is carried. Deterministic: it depends only on the bytes, so the same file
 * gives the same stream (and the same file id) every time, which keeps resuming possible.
 * @returns {Promise<{bytes:Uint8Array, mode:number}>} mode 0 = raw, 1 = gzip
 */
export async function packSegment(raw, compress = gzip) {
  if (!compress) return { bytes: raw, mode: 0 };
  const packed = await compress(raw);
  if (packed.length <= raw.length * (1 - MIN_SAVING)) return { bytes: packed, mode: 1 };
  return { bytes: raw, mode: 0 };
}
