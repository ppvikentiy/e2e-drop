# E2E Drop

Self-hosted software for file transfer with end-to-end encryption and without user accounts.

The client encrypts the contents of each drop prior to upload (format VDE2-5pr). The server stores the ciphertext in an S3-compatible bucket. File names, media types, sizes, and previews are encrypted too, inside a sealed manifest the server cannot read. PostgreSQL stores hashes, sealed manifests, ciphertext sizes, and operational records. Client IP addresses are not logged, and search engines are kept out. A share URL has the form `https://host/<token>#<key>`, where `<token>` is 43 characters. The key is carried in the URL fragment and is not included in HTTP requests.

Russian edition: [README-RU.md](README-RU.md).

## Roles and responsibility

**The authors publish the source code and do not provide a public service. Public instances are deployed by third parties at their own responsibility.**

- This repository contains software only. The authors do not operate, host, or moderate any instance, and they have no access to the data of any instance.
- Whoever deploys an instance (the operator) is solely responsible for it: for the infrastructure, for who may use it, for the content transferred through it, and for complying with the law that applies to them.
- An instance is intended for a private circle of people chosen by its operator (a family, friends, colleagues). The deployment script can close an instance with a site password.
- The authors are not liable for instances deployed by third parties. The software is provided "as is", without warranties of any kind; see [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Limits

- Maximum file count per drop: 10.
- Maximum size per file: 500 MB.
- Retention, measured from publication: 1, 3, 7, or 30 days.
- Download limit: 1, 5, 10, or an integer in the range 1..1000.
- Password: optional, at least 8 characters. It is an input to key derivation and is never sent to the server. Until a gate token derived in the browser is accepted, the API response contains only `requiresPassword`, the drop id, and the PBKDF2 parameters. The manifest and the access key are omitted.
- Multiple files are retrieved individually or assembled into a ZIP in the recipient browser. A single file supports HTTP Range.
- Thumbnails of images and video are JPEG objects of at most 40 KB, produced in the sender browser, encrypted, and included in the manifest. Thumbnail display does not increment the download counter.
- The sender can delete a drop immediately. The upload secret remains in the browser for about 6 hours, on the page after publication and on the next visit.
- In Chrome on Android, upload continues after the application is closed (Background Fetch). The link is shown on the next visit.

Drops past `expires_at`, and drops with `download_count >= max_downloads`, are deleted from object storage and from the database by a job with a period of 10 minutes. Deletion is deferred until 24 hours after `last_download_at`, which permits completion of an interrupted Range request.

## Routes

| Path | Function |
| --- | --- |
| `/home` | Landing page. `GET /` responds with a redirect to `/home`. In standalone display mode the client replaces `/home` with `/upload` when the navigator reports an online state. |
| `/upload` | File selection and publication. Parameters: retention, download limit, optional password. |
| `/<token>` | Retrieval page. The token matches `^[A-Za-z0-9_-]{43}$`. |
| `/receive` | Pairing endpoint for a host without a camera. The page displays a short code and a QR symbol. |
| `/p/<code>` | Pairing URL encoded in that symbol. The client rewrites the path to `/upload?pair=<code>` and retains the fragment. |
| `/offline` | Optical transfer without a network. Transmission: `/offline/send`. Reception: `/offline/receive`. |
| `/policy` | Data-processing policy. The text enumerates data categories stored by the implementation. |
| `/faq` | Answers about the service: sending, the link, retention, phone-to-computer transfer, and QR transfer. |

Outside standalone display mode, the routes `/upload`, `/receive`, `/offline` (and its children), and `/<token>` are not rendered until consent state `accepted` is recorded. The value is stored in `localStorage` under the key `vd-consent`. Standalone mode does not present the consent control.

Theme identifiers: `dark`, `light`, `simple`. The value `simple` selects increased type size, disabled animation, stepwise labels, and a visible outline on the primary action. The selection is stored under `vd-theme`. In the absence of a stored value, `prefers-color-scheme: light` selects `light`; otherwise the client selects `dark`.

The typeface preference is stored separately under `vd-font`. The value `dyslexia` selects Andika and does not change the theme. Without that record the client uses Roboto and JetBrains Mono.

The user interface language is Russian. The default presentation is a dark monospace layout. The client bundle includes JetBrains Mono and Inter.

## Encryption

Drops created by the published client are encrypted in the sender browser. The format is VDE2-5pr. Specification: [client/src/crypto/VDE.md](client/src/crypto/VDE.md). Russian edition: [client/src/crypto/VDE-RU.md](client/src/crypto/VDE-RU.md). Implementation: `client/src/crypto/vde2.js`. Test commands: `cd client && npm test`, `cd server && npm test`. Earlier formats (VDE1, and VDE2 with an open manifest) are no longer supported; such drops are not served, their open metadata is erased on update, and they age out.

- Link key: 256 bits, CSPRNG, one value per drop. Encoding: base64url without padding (43 characters). Placement: URL fragment after `#`.
- Master key: HKDF-SHA-256 of the link key, bound to the drop id. With a password, the link key is concatenated with `PBKDF2-HMAC-SHA-256` of the password (600,000 iterations, 16-byte salt per drop) before HKDF.
- From the master key, HKDF derives one AES-256-GCM key per file, one per file thumbnail, an AES-256-GCM key that seals the manifest, and, with a password, a gate token.
- File contents are sealed in 4 MiB segments with AES-256-GCM. The nonce is the segment index; the AAD binds the drop id, file id, segment index, and segment count.
- Names, media types, plaintext sizes, and thumbnails form a canonical JSON manifest that the sender's browser seals with AES-256-GCM (random 12-byte nonce, AAD bound to the drop id). The server stores the sealed bytes without being able to read them; any change fails to open in the recipient's browser, which also checks the file count and ciphertext sizes the server reports.
- The recipient service worker retrieves ciphertext with HTTP Range, decrypts 4 MiB segments, and may emit a ZIP via `client-zip`. If the worker does not control the page, decryption is performed in the page memory.

The password is never sent to the server. For attempt limiting the browser sends a gate token derived from the master key; the server stores its SHA-256 and delays repeated wrong tokens per drop and IP. `POST /api/drops` rejects password parameters when `pairCode` is present: the link key is already present in the pairing URL fragment.

Absence of the fragment (or the password, when set) prevents decryption, and the page shows a single message for a missing, truncated, or wrong key. Possession of the complete URL and the password is sufficient to decrypt. A substituted client application can read the key in the browser. Installation of the PWA and a reproducible build reduce exposure to substitution of the served application. Disclosure of the database or the bucket discloses the number of files and their ciphertext sizes, but not names, types, or plaintext.

## Pairing

`/receive` is the pairing page for a host that does not use a camera. The page issues `POST /api/pair` and displays a code of the form `K7M-4QX-9TD` and a QR symbol whose payload is `/p/<code>#<key>`. The host generates the link key and places it only in the fragment.

The sending client opens that URL, encrypts under the fragment key, and uploads a drop with `pairCode` on `POST /api/drops`. The receiving host polls `GET /api/pair/:code/status` with the header `X-Pair-Secret`. On state `ready` the host navigates to `/<token>#<key>`.

- Code alphabet: Crockford base32, length 9, entropy 45 bits. Case and separator characters are ignored by normalization. The stored value is `SHA-256` of the prefix `pair:` concatenated with the normalized code.
- Lifetime before attachment: 10 minutes. Lifetime after attachment: equal to the pending-drop lifetime, 6 hours. The plaintext token is retained for retrieval for at most 15 minutes, after which the pairing row is deleted.
- Failed code lookups: 20 per 15 minutes per IP address. Code creation: 30 per hour per IP address.

## Optical transfer

One file of at most 512 MiB is transferred as a sequence of QR symbols from a display to a camera. The channel has no network path and no return path. The codec is the package `vqd`. Description: [vqd/README.md](vqd/README.md). Format: [vqd/SPEC.md](vqd/SPEC.md). Russian editions: [vqd/README-RU.md](vqd/README-RU.md), [vqd/SPEC-RU.md](vqd/SPEC-RU.md). The comfortable bound of version 2 has not been re-measured (version 1: approximately 150 MiB).

The sender selects QR version 40, 30, or 20 and a frame rate in the range 5..30 frames per second. The receiver decodes with zxing-wasm inside a worker and writes accepted bytes to OPFS. Reception survives a page reload. A single incomplete transfer is retained on the device. Each segment is verified with SHA-256. Frame loss, duplication, reordering, and late join are tolerated by the fountain code.

On installation the service worker precaches the application shell, including the WebAssembly decoder. After one online load, the optical routes function without a network. Camera permission is restricted by `Permissions-Policy: camera=(self)`. The sender may set a password (at least 8 characters): the data and the file name are then encrypted in the browser (AES-256-GCM, key from PBKDF2-HMAC-SHA-256) and the password is never stored. Without a password, a camera that observes the display obtains the file. Segments are compressed with gzip when that pays off, and the sender may show three codes per screen in the red, green, and blue channels. The receiver checks free storage (1.1 times the file size) before accepting a file.

## Installed application

The site is a progressive web application. When the browser exposes an install prompt, the footer renders the corresponding control. On iOS the footer documents the Safari sequence Share, then Add to Home Screen.

After installation, the Android share target delivers files to `/upload`. The service worker handles `POST /share-target`. If the worker is not yet controlling the client, the server responds to that URL with a redirect to `/upload`.

When the navigator reports an offline state, the shell is served from cache and a banner links to optical transfer. API responses and file bodies are excluded from the cache. Document responses use `Cache-Control: no-cache`. Files under `/assets/` use immutable caching for one year. `sw.js` and the web manifest use `Cache-Control: no-cache`.

The manifest members `handle_links` and `launch_handler` request that Android and desktop Chromium open Drop URLs in the installed application. Safari on iOS does not implement this behaviour for web applications.

## Build identification

The footer displays the version from `client/package.json`, the build type (`release` or `dev`), the build number, and, when present, a short commit identifier. The number is taken from `BUILD_NUMBER`, else from `client/build-info.json` (written by `deploy.ps1` when git is available), else from `git rev-list --count HEAD`, else from a UTC timestamp `YYYYMMDD.HHMM`. The type is `release` for a production Vite build and `dev` otherwise, unless `BUILD_TYPE` is set. The commit identifier is taken from `GIT_SHA`, else from the same JSON file, else from `git rev-parse --short HEAD`.

## Repository layout

```
browser → nginx :80/:443 → Node.js (Express, 127.0.0.1:3000) → S3 bucket
                                      │
                                      └── PostgreSQL (drops, manifests, limits)
```

| Directory | Contents |
| --- | --- |
| `client/` | React 18 and Vite interface, service worker, VDE |
| `server/` | Express API, streaming to S3, PostgreSQL, cleanup |
| `vqd/` | Fountain codec for QR frames, Apache-2.0, no interface |
| `deploy/` | `deploy.bat` and `deploy.ps1` for Windows; `install.sh` for the server |

Object bytes are streamed through the API into the bucket. The server filesystem does not retain a copy. The server never receives passwords. For a password drop the database stores the PBKDF2 salt and iteration count and the SHA-256 of the gate token.

## Deployment from Windows

Required inputs: a VPS running Ubuntu or Debian with SSH, an S3-compatible bucket, and, optionally, a domain whose A record resolves to the server address. The operator host requires Windows 10 or Windows 11 and an OpenSSH client.

`deploy\deploy.bat` collects the SSH endpoint, an optional domain and email address for Let's Encrypt, and the S3 endpoint, region, bucket name, and credentials. An empty domain and email leave the service reachable by IP address.

The script verifies SSH. Password authentication results in installation of the key `%USERPROFILE%\.ssh\e2e_drop_deploy_ed25519`. The script then uploads the tree and executes `deploy/install.sh`. The installer provisions nginx, PostgreSQL, and Node.js. Node.js 22 is installed when the present major version is below 20. The database role is created only if absent. The client is built. Bucket write and delete are verified. The systemd unit `e2e-drop` is installed. The nginx site `e2e-drop` is written. When a domain and an email address are set, the certificate is requested with `certbot certonly --nginx --keep-until-expiring`. A certificate still inside its validity window is not replaced.

A subsequent execution applies changes and retains the existing database password and `APP_SECRET`. The nginx configuration managed by the installer is limited to the site `e2e-drop`. A configured domain does not set `default_server`. Service by IP address sets `default_server` only when no other site already holds that flag. The installation log path is `/var/log/e2e-drop-install.log`. Collected parameters other than the S3 secret key are stored in `deploy/deploy.settings.json`.

```bash
systemctl status e2e-drop
journalctl -u e2e-drop -f
cat /opt/e2e-drop/.env
```

The bucket lifecycle policy should abort incomplete multipart uploads after one day. Otherwise parts from an upload interrupted by process termination remain in the bucket.

## Local development

Requirements: Node.js 20.6 or newer, PostgreSQL, and an S3-compatible endpoint. MinIO satisfies the storage requirement.

```bash
cd server
cp .env.example .env
npm install
npm run check-s3
npm run dev
```

The API binds to `http://127.0.0.1:3000`. Schema migration runs at process start.

```bash
cd client
npm install
npm run dev
```

The interface is served at `http://localhost:5173`. Requests under `/api` are proxied to the API process.

`server/.env.example` defines `DATABASE_URL`, `APP_SECRET`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, and `S3_FORCE_PATH_STYLE`. `PORT` and `HOST` are optional.

## HTTP API

| Method and path | Function |
| --- | --- |
| `GET /api/health` | Response body `{ ok: true }`. |
| `POST /api/drops` | Creates a pending drop. JSON body: `files` as an array of `{ size }` (plaintext size, used only for the limits), `expiry` in `{1d, 3d, 7d, 30d}`, `maxDownloads`, optional `password` as `{ salt, iterations }` (PBKDF2 parameters, never the password), optional `pairCode`. Returns `dropId`, the upload secret, and per file `{ id, size, cipherSize }`. Only the ciphertext size is stored. |
| `PUT /api/drops/:id/manifest` | Body `{ sealed }`: the sealed manifest (base64, at most 2 MiB); for a password drop also `gateHash`. Stored unread. Requires `X-Upload-Secret`. |
| `GET /api/drops/:id/files/:fileId/status` | Returns the stored byte count. Requires the header `X-Upload-Secret`. |
| `PUT /api/drops/:id/files/:fileId` | Writes object bytes. A partial write uses `Content-Range: bytes START-END/SIZE`. A body that covers the whole object is streamed without that header. Requires `X-Upload-Secret`. |
| `POST /api/drops/:id/finalize` | Publishes a pending drop and returns the public token. Requires a stored manifest. A second call after publication responds with status 409. |
| `GET /api/d/:token` | Returns `dropId`, the sealed manifest, the ciphertext size of each file, and an access key; or, for a password drop, `{ requiresPassword: true, dropId, kdf }`. |
| `POST /api/d/:token/unlock` | Body `{ gateToken }`. Checks the gate token (status 401 when wrong, 429 while delayed) and returns what `GET` returns for a drop without a password. |
| `GET /api/d/:token/files/:index` | Returns one ciphertext object. Requires the header `X-Access-Key`. Supports HTTP Range. |
| `POST /api/pair` | Allocates a pairing code and a secret. |
| `GET /api/pair/:code/check` | Reports whether the code is in state `waiting`. |
| `GET /api/pair/:code/status` | Returns `waiting`, `uploading`, or `ready` with the token. Requires the header `X-Pair-Secret`. |
| `DELETE /api/pair/:code` | Deletes the pairing row. Requires `X-Pair-Secret`. |
| `GET /api/site` | `{ locked, allowed }`: whether the operator set a site password and whether this browser has a session. |
| `POST /api/site/login` | Body `{ password }`. Sets the `vd_site` session cookie (30 days). 10 wrong passwords per 15 minutes per IP. When the site is locked, every other `/api` path except `/api/health` answers 401 with reason `site-locked`. |

The API accepts only VDE2-5pr drops: there is no path for unencrypted contents or open metadata.

**Download accounting.** Page open, or a successful unlock, returns an access key: HMAC-SHA256 under `APP_SECRET`, lifetime 24 hours, containing a random nonce. The client sends it in the `X-Access-Key` header, so it stays out of URLs and access logs. The first request that presents a previously unseen key increments `download_count` by one. Subsequent requests that present the same key within 24 hours, including Range continuation and additional files, do not increment the counter. The key is not bound to an IP address.

**Upload continuation.** Objects larger than 5 MiB are uploaded in parts of 8 MiB through S3 multipart upload. The server rejects a non-final part smaller than 5 MiB and a partial part larger than 32 MiB. A `PUT` whose range is the entire object is streamed at any size up to the drop limit and is not buffered as one part. If a multipart upload is already open for that object, it is aborted before the stream is accepted. A `PUT` for a file already marked uploaded is acknowledged as success and the body is discarded. A partial `PUT` whose start offset is not the stored `uploaded_bytes` responds with status 409 and the current offset. The client stores `dropId`, the upload secret, the link key, the derived master key (removed at publication), and per-file offsets in IndexedDB (`vd-uploads`); the password is not stored. After a transport failure the client resumes at the stored offset. Reopening the document while the record is still present presents a continuation prompt when the same files are selected. A pending drop that is not finalized expires on the server after 6 hours. The client deletes IndexedDB records whose `updatedAt` is older than 7 hours.

**Publication race.** The page and the service worker may both call `POST /api/drops/:id/finalize`. The first call that observes `status = 'pending'` publishes the drop. The later call receives status 409. The caller that receives 409 reads the token from the IndexedDB record written by the winner (`waitForReady`, timeout 10 seconds).

**Background upload.** The path is used only in Chrome on Android, and only when `BackgroundFetchManager`, a controlling service worker, and the origin-private file system are present, and when `navigator.storage.estimate` reports at least `2 × ciphertext length + 8 MiB` of free quota. The page encrypts each file into OPFS, one segment resident in memory at a time, under a directory removed after publication. It then submits one whole-object `PUT` per file through Background Fetch. The registration identifier is `dropId`. The browser may continue the transfer after the document is closed. On `backgroundfetchsuccess` the service worker calls finalize, deletes the ciphertext directory, and posts `vd-bg-ready` to open windows. On `backgroundfetchfail` the notification title is set to a failure string. `backgroundfetchclick` opens `/upload`. If the background registration cannot be started, the page uploads while the document is open. Other user agents upload only while the document is open.

**Response headers.** `Content-Security-Policy` permits `'wasm-unsafe-eval'` in `script-src` for the QR decoder. Additional headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, and `Permissions-Policy` with `camera=(self)`. HTTPS responses include `Strict-Transport-Security`. Ciphertext responses use `application/octet-stream` and `Content-Disposition: attachment`; the recipient's browser restores the name and type after decryption. The page has no inline scripts.

**Rate limits, per IP address.** Drop creation: 30 per hour. Pairing-code creation: 30 per hour. Wrong gate tokens: per drop and IP, 5 without delay, then a delay doubling from 2 seconds up to 15 minutes; across all drops, 30 per hour per IP before the same delay applies. Counters are in memory and reset after an hour without failures. Failed pairing lookups: 20 per 15 minutes. Pairing status requests: 300 per minute.

**Indexing and logs.** No path is meant for search engines. Every response carries `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex`, except for messenger link-preview bots, which still get the page so that a pasted link shows a card; `robots.txt` allows only those bots. There is no sitemap. The page fills in its own address for the preview image (`__ORIGIN__` in `index.html`), so every instance points at itself. The deployment script configures nginx without an access log and with critical-only error logging; the application writes no client addresses.

## License

Apache License 2.0, see [LICENSE](LICENSE). The [NOTICE](NOTICE) file states the disclaimer for instances deployed by third parties: the authors are not responsible for them.
