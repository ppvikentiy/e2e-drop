// SPDX-License-Identifier: Apache-2.0
// One VDE2 segment fetched with Range and opened. Shared by the service worker and the in-page fallback.
import { cipherRange, decryptSegment } from './crypto/vde2.js';

/** Throws on an HTTP error (with `status` and `res`), a short body, or a failed authentication check. */
export async function fetchSegment(plan, fc, file, index, fetchImpl = fetch) {
  const { start, end } = cipherRange(fc, index);
  const res = await fetchImpl(`/api/d/${plan.token}/files/${file.index}`, {
    headers: { Range: `bytes=${start}-${end - 1}`, 'X-Access-Key': plan.accessKey },
  });
  if (res.status !== 206 && res.status !== 200) throw Object.assign(new Error(`fetch ${res.status}`), { status: res.status, res });
  const ct = new Uint8Array(await res.arrayBuffer());
  if (ct.length !== end - start) throw new Error('short segment');
  return decryptSegment(fc, index, ct);
}
