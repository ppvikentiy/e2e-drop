# VQD format, version 2

VQD transfers one file from one display to one camera. The channel has no network path and no acknowledgement. The sender emits a repeating sequence of QR symbols. The receiver may begin at an arbitrary frame, may omit an arbitrary frame, and completes when a sufficient set of distinct symbols has been observed.

Text in this document is normative unless marked *informative*. The key words MUST, SHOULD, and MAY are to be interpreted as described in RFC 2119.

Status: draft, version 2. Reference implementation: `src/` in this directory. License: Apache-2.0.

Version 2 is not compatible with version 1. A version 1 frame is classified as **unsupported-version** (section 2.3).

Russian edition: [SPEC-RU.md](SPEC-RU.md).

## 1. Design

- The channel is one-way. Frames carry LT fountain symbols. No individual frame is required. Loss, duplication, reordering, and a delayed start increase only the transfer duration.
- The file is partitioned into **raw chunks** of a fixed length `rawChunk`. Each chunk becomes one **segment**: it is compressed (optional, section 7), encrypted (optional, section 8), and divided into **blocks** of `blockLen` bytes. A segment has at most 4096 blocks. Each segment is encoded, decoded, and verified independently. A segment is accepted only when the SHA-256 of its stored bytes equals the value in the manifest.
- The maximum file size is 512 MiB (`2^29` bytes). A receiver MAY apply a lower limit (the reference limit without persistent storage is 128 MiB).
- Rendering of the QR symbol is outside the scope of this specification, except for the colour mode of section 6. A frame is an opaque byte string. The value 2953 is the capacity of QR version 40, error correction L, byte mode. A frame size is valid when the resulting block length lies in the closed interval from 16 to 65535 bytes.

Multi-byte integers are big-endian.

## 2. Frame header and trailer

Every frame begins with the same four bytes and ends with a CRC-16 computed over all preceding bytes.

| Offset | Size | Field |
| ---: | ---: | --- |
| 0 | 2 | Magic `0x56 0x51` (`VQ`) |
| 2 | 1 | Format version, value `2` |
| 3 | 1 | Type: `1` manifest, `2` data, `3` calibration |

CRC-16/CCITT-FALSE: polynomial `0x1021`, initial value `0xFFFF`, no reflection, xor-out `0`. Check value: `crc16("123456789") = 0x29B1`.

### 2.1 Data frame

| Offset | Size | Field |
| ---: | ---: | --- |
| 4 | 6 | File identifier |
| 10 | 2 | Segment number |
| 12 | 4 | Symbol index (`uint32`) |
| 16 | `blockLen` | Symbol payload |
| 16 + `blockLen` | 2 | CRC-16 |

`blockLen = frameBytes - 18`. Every data frame of one stream MUST use the `blockLen` recorded in the manifest.

### 2.2 Manifest frame

| Offset | Size | Field |
| ---: | ---: | --- |
| 4 | 6 | File identifier |
| 10 | 1 | Part number, origin 0 |
| 11 | 1 | Part count, range 1..255, with `part < parts` |
| 12 | `n` | Slice of the manifest body |
| 12 + `n` | 2 | CRC-16 |

The body is partitioned into slices of length `frameBytes - 14`. The final slice may be shorter.

### 2.3 Receiver classification

1. The input does not begin with `56 51`, or its length is less than 4 bytes: verdict **foreign**. The input is ignored. A camera observes every symbol in the field of view.
2. The version byte differs from the receiver version: verdict **unsupported-version**. The receiver reports that an application update is required (a version 1 sender: that the sender must update).
3. The length is below the minimum for the type, or the CRC does not match: verdict **corrupt**. The input is discarded, equivalently to a failed read.
4. Otherwise the verdict is **ok**.

A receiver tracks exactly one file identifier at a time. After a manifest has been accepted, data frames that carry a different file identifier are ignored.

### 2.4 Calibration frame

Used only by the colour mode (section 6). It carries no file data and a receiver ignores it for the purposes of the file.

| Offset | Size | Field |
| ---: | ---: | --- |
| 4 | 6 | File identifier |
| 10 | 1 | Primary: `0` red, `1` green, `2` blue |
| 11 | `n` | Filler, any bytes (the reference sender pads the frame to `frameBytes`) |
| 11 + `n` | 2 | CRC-16 |

The minimum length is 13 bytes. A primary above `2` makes the frame **corrupt**.

## 3. Manifest body

| Size | Field |
| ---: | --- |
| 1 | Manifest version (`2`) |
| 1 | Flags. Bit 1 (`0x02`): the stream is encrypted. All other bits MUST be `0`; a receiver MUST reject the manifest otherwise |
| 2 | `blockLen` |
| 2 | `K`: block count of the largest segment, range 1..4096 |
| 4 | `rawChunk`: bytes of the original file per segment (the last segment may be shorter) |
| 4 | `segmentCount` |
| 4 + 4 | `fileSize`, high word followed by low word |
| 1 | Degree-table length `L` |
| 2 · `L` | Degree table, each entry a `uint16` |
| | **Identity**, plain stream (flag clear): 1 + `n` file name, UTF-8, `n` ≤ 255; 1 + `n` media type, UTF-8, `n` ≤ 255 |
| | **Identity**, encrypted stream (flag set): 1 KDF identifier (`1` = PBKDF2-HMAC-SHA-256); 4 `iterations`; 16 `salt`; 16 password verifier; 2 `metaLen`; 12 meta nonce; `metaLen` sealed metadata (section 8) |
| 37 or 49 · `segmentCount` | Per segment: 4 `storedLen`; 1 `mode` (`0` stored as-is, `1` gzip); 12 nonce (encrypted streams only); 32 SHA-256 of the stored bytes |

The **file identifier** is the first 6 bytes of `SHA-256(body)`. A receiver MUST reassemble the body, recompute the identifier, and discard the manifest when the values differ. This construction binds the name (or the sealed metadata), the size, the segment table, and the degree table to the identifier carried by every frame.

Before a manifest is used to size a buffer, a receiver MUST reject it if any of the following conditions fails:

- `blockLen` ≥ 16; `1 ≤ K ≤ 4096`; `K · blockLen` ≤ 64 MiB.
- `1 ≤ fileSize` and `fileSize` does not exceed the receiver limit; `1 ≤ rawChunk` ≤ 64 MiB; `segmentCount = ceil(fileSize / rawChunk)` and `segmentCount ≤ 65535`.
- The flags contain no undefined bit; the degree table is valid (section 4.3); all strings are valid UTF-8.
- For each segment: `mode` is `0` or `1`; `ceil(storedLen / blockLen) ≤ K`; for `mode` `0`, `storedLen` equals the raw length of the chunk (plus 16 in an encrypted stream); in an encrypted stream `storedLen > 16`.
- In an encrypted stream: the KDF identifier is known and `100000 ≤ iterations ≤ 10000000`; `16 ≤ metaLen ≤ 528`.
- The body terminates exactly after the segment table.

A receiver MUST NOT interpret the file name as a filesystem path before sanitization. The sender repeats the manifest during the stream (section 6). A receiver requires every part of one manifest before a data frame may be consumed.

### 3.1 Segmentation

Segment `s` covers the original bytes `[s · rawChunk, min((s + 1) · rawChunk, fileSize))`. Its **stored bytes** are the output of sections 7 and 8 and are `storedLen` bytes long. The segment has `k = ceil(storedLen / blockLen)` blocks; the final block is zero-padded for coding only. The segment hash covers the stored bytes, not the padding.

A sender chooses `rawChunk = min(kMax · blockLen - 16, 64 MiB)` with `kMax ≤ 4096`. Then a chunk that does not compress, with a 16-byte authentication tag added, still occupies at most `kMax` blocks. *Informative: any `rawChunk` that satisfies the validation rules is acceptable.*

## 4. Symbols

### 4.1 Generator

Arithmetic is integer-only. Products wrap as `uint32` (`Math.imul`).

```
fmix32(h):  h ^= h >>> 16; h *= 0x85ebca6b; h ^= h >>> 13; h *= 0xc2b2ae35; h ^= h >>> 16
Rng(seed):  state = seed;  next(): state += 0x9e3779b9; return fmix32(state)
symbolSeed(id32, segment, index):
    h = fmix32(id32 ^ 0x5651445f)
    h = fmix32(h ^ ((segment + 1) * 0x9e3779b1))
    h = fmix32(h ^ ((index + 1) * 0x85ebca77))
```

`id32` is the first 4 bytes of the file identifier, interpreted as a big-endian `uint32`. Test vectors are given in section 10.

### 4.2 Symbol construction

Given a segment that contains `k` blocks (the size of that segment, not `K`), the table `T` of section 4.3 for that segment, and a symbol `(segment, index)`:

```
rng    = Rng(symbolSeed(id32, segment, index))
r16    = rng.next() >>> 16
degree = min(k, 1 + smallest i such that r16 <= T[i])
set    = []
while |set| < degree:
    b = rng.next() mod k
    if b not in set: append b
```

The payload is the bitwise XOR of the blocks in `set`. Blocks beyond the real data are treated as zero. The decoder reconstructs `set` from `(segment, index)` alone. The frame therefore carries no neighbour list.

### 4.3 Degree table

The manifest table `T` contains `L` entries, with `1 ≤ L ≤ K`. The sequence is non-decreasing, and `T[L - 1] = 0xFFFF`. `T[i]` is the largest 16-bit sample that still maps to degree `i + 1`. The manifest table is built for `K`.

**Segments smaller than `K`.** Compression makes segments differ in size. A table built for `K`, with the degree capped to a small `k`, would make nearly every symbol the sum of all `k` blocks, and such equations never reach full rank. Therefore, for a segment with `k < K` and `k ≤ 64`, both sides MUST use the dense table `Binomial(k, 1/2)` conditioned on degree ≥ 1 (`P(d) = C(k, d) / (2^k - 1)`, cumulative thresholds `min(0xFFFE, floor(cumulative · 65535))` made non-decreasing, the last entry `0xFFFF`) instead of the manifest table. All other segments use the manifest table. The dense table uses only IEEE 754 addition, division, and `floor`, so independent implementations agree.

*Informative. Reference sender, manifest table:*

- For `K ≤ 64`: the dense table above with `k = K`.
- Otherwise: the robust soliton distribution (Luby, 2002) with `c = 0.05` and `δ = 0.01`, truncated at degree 128 and stored as 16-bit cumulative thresholds.

## 5. Decoding

*Informative, except the hash verification, which is normative.*

A segment is decodable from any set of symbols whose equations have full rank over GF(2). The result is a function of the set of indices. It is independent of arrival order and of duplicates. The reference decoder applies belief propagation as symbols arrive and completes the unresolved remainder by Gaussian elimination over GF(2). A structure-only pass, without payloads, determines whether a full decode is to be attempted.

After decoding, the receiver MUST compute SHA-256 over the stored bytes and compare the digest with the manifest. On mismatch the receiver MUST discard all state held for that segment and restart collection of the segment. A symbol may carry a valid CRC and incorrect contents. Measured overhead for the reference table is approximately 1.01–1.04 times `K` on average for `K ≥ 200`. The 99th percentile is below 1.1 times `K` (`bench/overhead.js`).

After the hash check the receiver decrypts (section 8) and decompresses (section 7). The result MUST have exactly the raw length of the chunk; otherwise the stream is broken and more frames cannot help.

## 6. Colour mode and transmission schedule

### 6.1 Colour mode

*Rendering. Optional for senders; receivers SHOULD support it.*

One screen carries three independent data frames, one in each display channel: a module is dark in a channel when it is dark in that channel's frame. Everything that is not a data frame (manifest parts, calibration frames) is shown alone, in black on white, so it reads in any mode. A receiver recognises the colour mode by the calibration frames.

The stream opens with three **calibration screens**, each a calibration frame (section 2.4) drawn in one pure display primary on black (red, green, blue in turn). They repeat early (the reference sender: at screen 15) and then periodically (every 60 screens). From them the receiver measures, for each primary, the camera colour of light and dark modules, builds the 3×3 matrix `A` (how camera channel `r` responds to display primary `c`) and the black level `k`, and recovers the display channels as `s = A⁻¹ (v − k)`. Each recovered channel is read as an ordinary QR code. If the matrix is nearly singular (the reference threshold on the condition number of `A` normalised to a unit diagonal is 6, provisional) or a primary is too dim, the receiver tells the user that the camera does not tell colours apart and to ask the sender for normal codes.

Frames are identical in both modes, so a sender may switch modes during a transfer without invalidating what the receiver has.

### 6.2 Schedule

*Informative. This section is not part of the wire format. Receivers MUST NOT depend on it.*

- The stream has no terminal frame. The reference sender emits the complete manifest first, then one manifest part after every 90 data frames.
- Data frames are emitted in laps. Lap 0 supplies each segment with `1.06·k + 2` fresh symbols. Subsequent laps supply `min(1, 0.06·2^(lap-1))·k + 2`, interleaving segments one symbol at a time. Symbol indices are not reused within a session. A random initial offset prevents a restarted sender from repeating indices already held by a resuming receiver.
- Sender memory retains only the segments inside the current window. The default window is 32 MiB of raw data. A segment is rebuilt from the file when its window is loaded and compared with the manifest; a difference means the file changed, and the sender stops rather than send corrupted data.
- A repeated transmission of the same bytes (and the same password) yields the same manifest and the same file identifier. An interrupted receiver may therefore resume against a later session.

## 7. Compression

Each raw chunk is compressed independently with gzip. A sender uses the compressed bytes (`mode` 1) only when they are at least 5 % shorter than the chunk; otherwise it stores the chunk as is (`mode` 0). The decision depends only on the chunk, so a repeated transmission yields the same stream. Compression precedes encryption.

A receiver decompresses with an output limit equal to the raw length of the chunk and MUST abort when the output would exceed it (decompression bombs).

## 8. Encryption

Optional. A sender sets flag bit 1 when the user gives a password. The password MUST be at least 8 Unicode code points long. The password bytes `P` are the NFKC normalisation of the password, encoded as UTF-8. Whitespace is not trimmed. All primitives are the Web Crypto API; none is implemented here.

1. `fileDigest = SHA-256(SHA-256(chunk 0) ‖ SHA-256(chunk 1) ‖ …)` over the raw chunks in order. *(The whole-file hash cannot be streamed with Web Crypto.)*
2. `salt` = the first 16 bytes of `HMAC-SHA-256(key = P, "VQD2/salt" ‖ fileDigest)`. It is deterministic, so a restarted sender reproduces the stream. The file hash is not in the manifest.
3. `K0 = PBKDF2-HMAC-SHA-256(P, salt, iterations, 32 bytes)`; the default `iterations` is 600 000.
4. `Kverify, Kseg, Kmeta, Knonce = HKDF-SHA-256(K0, salt = empty, info = "VQD2/verify" | "VQD2/seg" | "VQD2/meta" | "VQD2/nonce", 32 bytes)`.
5. `verifier` = the first 16 bytes of `HMAC-SHA-256(Kverify, "VQD2/verifier" ‖ salt ‖ uint32(iterations))`. The receiver compares it before decrypting anything.
6. **Segment** `s`, packed bytes `D` (section 7): `nonce = first 12 bytes of HMAC-SHA-256(Knonce, "VQD2/seg" ‖ uint32(s) ‖ SHA-256(D))`; stored bytes = `AES-256-GCM(Kseg, nonce, D, AAD)` = ciphertext ‖ 16-byte tag, `AAD = "VQD2/seg" ‖ salt ‖ uint32(s) ‖ uint32(segmentCount) ‖ uint64(fileSize)`. The nonce is written in the segment table. Different data never share a nonce under one key.
7. **Metadata**: `plain = u8 nameLen ‖ name ‖ u8 mimeLen ‖ mime`; `metaNonce` = the first 12 bytes of `HMAC-SHA-256(Knonce, "VQD2/meta" ‖ uint32(0) ‖ SHA-256(plain))`; sealed with `Kmeta`, `AAD = "VQD2/meta" ‖ salt`.
8. The SHA-256 in the segment table covers the stored bytes (ciphertext with tag).

Receiver order per segment: decode symbols → compare SHA-256 → decrypt (an authentication failure discards the segment and is reported as a decryption error) → decompress. Frames received before the password is known are kept; after the verifier matches, finished segments are opened without scanning again.

Open in an encrypted stream: file size, `segmentCount`, `rawChunk`, `storedLen` of every segment, the KDF parameters, and the salt.

## 9. Security considerations

The specification provides integrity against corruption by means of per-segment SHA-256, GCM tags in encrypted streams, and a manifest bound to the file identifier. It does not authenticate the display. A party that can present a QR stream can present an arbitrary file.

Without a password the stream is readable by anything that observes the display. With a password, the strength is that of PBKDF2-HMAC-SHA-256 at the chosen iteration count against an offline attack on a recorded stream; PBKDF2 is weaker than a memory-hard KDF against GPUs, which the minimum length and the iteration count only mitigate. Compressed lengths are visible and may indicate the content. A receiver MUST reject `iterations` outside 100 000 … 10 000 000.

Receivers MUST treat the file name and the media type as untrusted, MUST bound every allocation by the validated manifest, MUST bound decompression, and MUST NOT execute a received file. A receiver SHOULD check that the device has room for 1.1 times the file size before accepting a manifest.

## 10. Test vectors

```
crc16("123456789")                         = 0x29B1
fmix32(0) = 0
fmix32(1)                                  = 1364076727
Rng(1)           -> 2527132011, 314344336, 2535364964, 2041432039
Rng(0xFFFFFFFF)  -> 920564995, 4230986166
symbolSeed(0x01020304, 0, 0)               = 1162425510
symbolSeed(0x01020304, 3, 100)             = 581488596
symbolSeed(0xDEADBEEF, 65535, 0xFFFFFFFF)  = 3022913814
```

Reference degree tables for `K = 1, 2, 8, 65, 100, 1037, 2048` are defined in `test/vectors.test.js`.

Symbol sets for `K = 2048` and `id32 = 0x01020304`:

- `(0, 0)` → `{1135, 1440}`
- `(0, 1)` → `{1540, 1242}`
- `(0, 2)` → `{1338, 1380}`
- `(7, 4000000000)` → `{1600, 1010, 589, 1308}`

For `K = 100` with the corresponding table and `id32 = 0xDEADBEEF`, the symbol `(3, 17)` maps to `{42, 8, 87, 65, 97, 46}`.

Complete stream of minimal size. The payload is the UTF-8 encoding of `Hello, E2E QR Drop!` (19 bytes, which do not compress, so `mode` 0). The name is `hello.txt`. The media type is `text/plain`. `frameBytes = 64`. The file identifier is `2e8ca7f77255`. `K = 1`. The stream contains one segment, `blockLen = 46`, `rawChunk = 94192`. The manifest comprises two parts. The first part is:

```
565102012e8ca7f7725500020200002e000100016ff000000001000000000000001301ffff0968656c6c6f2e7478740a746578742f706c61696e00000013d977
```

The second part is:

```
565102012e8ca7f77255010200d85c9e14bfd8cd8336d60e1896ae0a89021f044066de44e5e7bb86a1337fdf16fa42
```

The data frame for symbol index `0xF6B7BBEC` (initial offset 7) is:

```
565102022e8ca7f772550000f6b7bbec48656c6c6f2c204532452051522044726f702100000000000000000000000000000000000000000000000000000032ee
```

Encrypted streams, calibration frames, and the colour mode are specified by sections 2.4, 6.1, and 8 and covered by `test/password.test.js` and `test/colour.test.js`; fixed byte vectors for them have not been published yet.
