# VDE2-5pr

E2E Drop Encryption, format VDE2-5pr. The sender's browser encrypts the contents of a drop's files and seals the drop's description (names, types, sizes, previews). The server stores ciphertext and the sealed description, and never receives a key.

Russian edition: [VDE-RU.md](VDE-RU.md). Implementation: [`vde2.js`](vde2.js). Tests: `client/test/vde2.test.js` (`npm test` in `client/`); the server-side check of the sealed manifest is in `server/test/manifest.test.js`.

VDE1 and VDE2 with an open manifest are not supported.

The authors publish this code and do not provide a public service; every instance is run by its operator at their own responsibility (see `NOTICE` at the repository root).

## Link key

Each drop has a 256-bit link key (`KEY_BYTES = 32`) from a CSPRNG. It travels only in the URL fragment:

```
https://host/<token>#<key>
```

`<key>` is base64url without `=`, 43 characters. Input that does not decode to exactly 32 bytes is rejected.

## Master key

The master key (32 bytes) is derived with HKDF-SHA-256 and an empty salt. `<dropId>` is the drop's UUID assigned by the server.

| Case | IKM | Info |
| --- | --- | --- |
| No password | link key | `VDE2/master/nopw\|<dropId>` |
| Password | link key ‖ password key | `VDE2/master/pw\|<dropId>` |

The password key is `PBKDF2-HMAC-SHA-256(P, salt, iterations, 32 bytes)`. `P` is the password after NFKC, in UTF-8, with spaces kept. A password has at least 8 code points. `salt` is 16 random bytes per drop; `iterations` defaults to 600,000. The recipient rejects values outside 100,000…10,000,000. The salt and iteration count are public.

## Derived keys

From the master key, HKDF-SHA-256, empty salt:

| Purpose | Info | Type |
| --- | --- | --- |
| File | `VDE2/file\|<dropId>\|<fileId>` | AES-256-GCM |
| File thumbnail | `VDE2/thumb\|<dropId>\|<fileId>` | AES-256-GCM |
| Manifest seal | `VDE2-5pr/manifest\|<dropId>` | AES-256-GCM |
| Gate token | `VDE2/gate\|<dropId>` | 32 bytes, password drops only |

## Segments

File contents are split into segments of `SEG = 4 MiB` of plaintext; the last one may be shorter. An empty file takes one segment. Each segment is sealed with AES-256-GCM under the file key:

- Nonce, 12 bytes: four `0x00` bytes, then the segment number as a big-endian `uint64`. It cannot repeat: every file of every drop has its own key.
- AAD: the UTF-8 string `VDE2/seg|<dropId>|<fileId>|<index>|<segmentCount>`.
- Ciphertext: the plaintext followed by the 16-byte tag.

A flipped bit, a reordered, duplicated, removed or added segment, a segment moved from another file or drop, and a shortened file all fail tag verification.

```
ciphertextLength(n) = n + 16 * max(1, ceil(n / SEG))
```

Segment `i` occupies ciphertext bytes `[i * (SEG + 16), min((i + 1) * (SEG + 16), ciphertextLength(n)))`. The recipient fetches them with HTTP Range.

## Manifest

JSON in canonical form, sealed before it leaves the browser: object keys sorted, no insignificant whitespace, UTF-8; only strings, integers, `true`/`false`, `null`, arrays and objects are allowed.

```json
{"dropId":"…","files":[{"id":"…","name":"…","segments":1,"size":0,"thumb":null,"type":"…"}],"kdf":null,"segmentSize":4194304,"v":"VDE2-5pr"}
```

- `kdf` is `null` or `{"alg":"PBKDF2-SHA-256","iterations":…,"salt":"…"}`.
- `segments` equals `max(1, ceil(size / segmentSize))`.
- `name` has slashes and control characters replaced with `_` and is at most 200 characters; `type` is `type/subtype` or `application/octet-stream`.
- `thumb` is `null` or base64 of `nonce (12 bytes) ‖ AES-256-GCM(JPEG data: URL)` under the thumbnail key, AAD `VDE2/thumb|<dropId>|<fileId>`, random nonce.

Seal: `sealed = nonce (12 random bytes) ‖ AES-256-GCM(seal key, nonce, manifest bytes, AAD = "VDE2-5pr/manifest|<dropId>")`. The browser sends it base64-encoded; the server checks only that it is plausible (length 30 bytes … 2 MiB) and stores it unchanged. The server registers only the number of files and their ciphertext sizes.

The recipient opens the seal (the GCM tag authenticates it) **before** using any manifest data, then parses it and checks the canonical form, version, `dropId`, segment size, segment counts and password parameters, and that the file count and `ciphertextLength(size)` of every file match what the server reports. On any mismatch it shows “Ошибка расшифровки. Проверьте правильность ссылки” (with a password: “…ссылки и пароля”) and shows no data.

## Gate token

Password drops only. The server receives the token (base64url) when checking and stores its SHA-256 (hex). Wrong tokens slow down further attempts per drop and IP and per IP. The token is derived from the master key, so its hash does not let anyone guess the password without the link key.

## What the server observes

The number of files, their ciphertext sizes (from which plaintext sizes can be estimated), the sealed manifest, lifetimes, the download limit and counter, and for a password drop its salt, iteration count and gate-token hash. The server does not observe the link key, the password, the master or derived keys, file names or types, previews, or the plaintext contents. Upload times are not recorded.

## Threat model

VDE2-5pr keeps file contents and metadata (names, types, previews) confidential from the operator, the object store and anyone who obtains stored records, and detects tampering with the contents and the manifest. The number of files and their ciphertext sizes remain visible. Confidentiality does not hold against a party that has the full link and, if set, the password, or against a substituted web application that reads the key in the browser. Offline password guessing is possible for a party that obtained the ciphertext and manifest around the server and knows the link; the password length and PBKDF2 cost are the defence.
