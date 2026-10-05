# VQD

E2E QR Drop. One-way file transfer over an animated sequence of QR symbols. A display emits the sequence. A camera ingests it. The channel has no network path and no return path. The format bound is 512 MiB. The measured operating bound has not been re-measured for version 2 (version 1: approximately 150 MiB).

This directory contains the reference codec. The implementation is JavaScript without dependencies and runs on Node.js 20 and later and in browsers. The codec does not render or scan QR symbols. It emits and accepts one byte string per frame. The byte layout is defined in [SPEC.md](SPEC.md).

Russian edition: [README-RU.md](README-RU.md), [SPEC-RU.md](SPEC-RU.md). License: Apache-2.0, [LICENSE](LICENSE).

```js
import { createSender, fromBytes, Receiver } from 'vqd';

const sender = await createSender({
  source: fromBytes(bytes),
  name: 'photo.jpg',
  mime: 'image/jpeg',
});

// Each frame is a QR symbol (byte mode, error correction L). The sequence repeats.
const frame = await sender.nextFrame(); // Uint8Array, length at most 2953

const receiver = new Receiver();
const info = await receiver.push(scannedBytes); // arbitrary order, loss, and start offset
if (receiver.complete) save(receiver.manifest.name, receiver.result());
```

For a large object, `Receiver` accepts a `SymbolStore` and a segment sink (OPFS or IndexedDB in a browser), so the transfer is not retained in RAM. On the sending side a `Blob` is wrapped with `fromBlob`.

## Properties

- Frame loss, repetition, and reordering are tolerated. The receiver may join at an arbitrary frame.
- Overhead is approximately 1.01–1.05 times the ideal frame count (`npm run bench:overhead`).
- Each segment is verified with SHA-256. A segment that fails verification is discarded and collected again.
- Both endpoints support resumption. Identical input bytes produce an identical manifest and an identical 6-byte file identifier.
- Version 2 compresses each segment with gzip when that saves at least 5 %, encrypts data and file name under an optional password (PBKDF2-HMAC-SHA-256, AES-256-GCM), and defines a colour mode of three codes per screen. It is not compatible with version 1.

## Development

```
npm test
npm run bench:overhead
node --max-old-space-size=4096 bench/large.js 150 0.05
```

The third command executes a 150 MiB transfer with a frame-loss ratio of 0.05. A reference run at a frame size of 2953 bytes used 27 segments, approximately 1.053 times the ideal frame count, and matched the source byte for byte.

Public exports are defined in `src/index.js`: the frame codec, the fountain encoder and decoder, the degree table, CRC-16, the PRNG, `createSender`, and `Receiver`.

## License and responsibility

Apache License 2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). The authors publish the source code and do not provide a public service. Public instances are deployed by third parties at their own responsibility; the authors are not responsible for instances deployed by third parties.
