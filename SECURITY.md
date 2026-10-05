# Data processing policy

of the E2E Drop service

Formal edition of 5 October 2026.

## 1. Terms of the Service

1.1. E2E Drop is self-hosted software. Each instance of the Service is deployed and maintained by its owner (the Operator). An instance is intended for use by a private circle of persons determined by the Operator (for example, a family, friends, or colleagues) and is not a public service open to an unlimited number of persons. The Operator may close the instance with a password (clause 7.7). The authors of the software publish the source code and do not provide a public service; instances are deployed by third parties at their own responsibility, and the authors are not responsible for such instances.

1.2. The Service is provided "as is", without any express or implied warranties, including fitness for a particular purpose, uninterrupted operation, absence of errors, and safety of data.

1.3. The Operator does not guarantee the availability of the Service, the transfer speed, or the safety of a drop before it expires, and may suspend or end the Service, or delete a drop, without prior notice: on expiry, when the download limit is used up, when these terms are broken, or for technical reasons.

1.4. A person keeps the link (including its part after `#`) and the password. A lost key or password cannot be recovered by the Operator or by anyone else: ciphertext cannot be read without the key.

1.5. A person is responsible for the contents of the transferred files and for having the right to transfer them. Use of the Service to violate the rights of third parties is not permitted.

1.6. The Operator is not liable for direct or indirect losses, loss of data, or lost profit connected with the use of the Service or the impossibility of using it, or for the actions of recipients of a link and of other persons who obtained the link or had access to the screen during QR transfer.

1.7. QR transfer without a network runs on the devices of the persons; its speed and reliability depend on the camera, the screen, and the shooting conditions, and are not guaranteed.

1.8. The Policy may change. The current edition is published on this page; the date of the edition is given at its beginning.

## 2. Placement and storage of data

2.1. The Operator decides on its own where to place the server equipment and the software of the Service (the application, the web server, the database) and where to store the data, including the choice of site, the hosting provider, and the provider of object storage, and may change them without prior notice.

2.2. The database, the object storage, and the application servers may be located with different providers and in different places. Specific providers and places are not named in the Policy. The processing rules, limits, and retention periods described in the Policy apply regardless of where the data are placed.

2.3. By sending files, a person accepts that the encrypted contents and the operational records will be placed in the infrastructure chosen by the Operator.

2.4. Encryption of contents, file names, and types is performed in the person's browser regardless of where the data are placed; the link key and the password are not transmitted to the servers (section 4).

## 3. General provisions

3.1. This Data Processing Policy (the Policy) defines the categories of data that arise when an instance of E2E Drop (the Service) operates, the places where they are processed and stored, the retention periods, and the deletion procedure.

3.2. The Service does not create user accounts.

3.3. The Policy describes the actual behavior of the software of the Service in the configuration created by the standard deployment script, not declared intentions.

3.4. In the Policy, the Service means the E2E Drop software complex, including the server part, the web interface, and the object storage.

## 4. Data that does not reach the server in the clear

4.1. The link key is 32 random bytes. It is placed in the link after the character `#`. The browser does not include that part of the URL in HTTP requests. From the link key (and, when a password is set, from the link key and a key derived from the password) the browser derives, by HKDF-SHA-256, the master key of the drop, bound to its identifier. From the master key the same way are derived: an AES-256-GCM key for each file, an AES-256-GCM key for the thumbnail of each file, an AES-256-GCM key for the drop description, and, with a password, a check value (clause 4.4). The encryption format is VDE2-5pr.

4.2. The plaintext contents of a file do not reach the server. The interface of the Service always creates an encrypted drop. A file is divided into segments of 4 MiB; each segment is encrypted with AES-256-GCM under the key of that file with a 16-byte authentication tag. The tag binds the segment to the drop identifier, the file identifier, the segment number, and the number of segments. Only the ciphertext of the contents is sent to the server.

4.3. The names, MIME types, and sizes of files, together with photo and video thumbnails, are collected into the drop description, which is encrypted in the sender's browser (AES-256-GCM) and sent to the server as one encrypted block. The server cannot read the description; any change to it is detected by the recipient's browser on decryption. Before encryption, slashes and control characters in a name are replaced with an underscore, its length is limited to 200 characters, and a MIME type not of the form `type/subtype` is replaced with `application/octet-stream`.

4.4. The password is not transmitted to the server and is not stored on the server in any form. The password is optional; when set, its length is at least 8 characters. The password is normalized to NFKC; the browser derives a key from it by PBKDF2-HMAC-SHA-256 (600,000 iterations, a 16-byte random salt per drop), which takes part in deriving the master key of the drop (clause 4.1). The salt and the iteration count are public and stored on the server. To limit guessing, the browser derives a check value from the master key and sends only that value to the server; the server stores its SHA-256 and compares against it. The password cannot be guessed from that hash without the link key. Until the check value matches, the server returns only the "password required" flag, the drop identifier, the salt, and the iteration count, and does not send the drop description, the ciphertext, or the access key. No password is set when sending to a computer by code.

4.5. Name, email address, telephone number, payment data, geolocation, and contacts are not processed, because the protocol has no fields for them. The server does not set cookies, except when the Operator has enabled a site access password (clause 7.7). The page makes no requests to other sites: the content policy allows connections only to the address of the Service.

4.6. The server does not accept drops whose contents are not encrypted. Drops in earlier formats (VDE1, and VDE2 with an open description) are not served; the open names, types, sizes, and upload times previously stored for them are erased when the server is updated, and the drops themselves are deleted as provided in section 10.

## 5. PostgreSQL

5.1. The PostgreSQL database stores operational records of drops, not a person's profile. Deleting a drop row deletes, by cascade, its files, download sessions, and the attached pairing code.

5.2. The `drops` table contains: a UUID identifier; state `pending` or `ready`; SHA-256 of the link token (empty until the drop is published); SHA-256 of the upload secret; the lifetime in days; the download limit; the download counter; the times of creation, expiry, and last download; the encrypted drop description (at most 2 MiB, clause 4.3); with a password, the PBKDF2 salt and iteration count and SHA-256 of the check value (clause 4.4). The token is 32 random bytes in base64url, 43 characters. Only its SHA-256 is stored in the database. The upload secret is built the same way and is given to the browser once; afterwards the browser sends it in the `X-Upload-Secret` header.

5.3. The `files` table contains: the file identifier; the position; the ciphertext size; the object key in storage; a flag that the whole file has been received; the number of bytes received so far; the identifier of an unfinished multipart upload. Names, MIME types, plaintext sizes, thumbnails, and upload times are not stored in that table. The plaintext size can be approximately inferred from the ciphertext size (the ciphertext is 16 bytes longer per 4 MiB).

5.4. Limits of one drop: 1 to 10 files; each file up to 500 MiB of plaintext; 1 to 1000 downloads. To check these limits, the browser tells the server the number of files and their sizes when the drop is created; the server keeps only the ciphertext sizes. Photo and video thumbnails are made in the sender's browser; a thumbnail side is at most 192 pixels. Viewing a thumbnail does not use up the download limit.

5.5. The `download_sessions` table contains: the drop identifier; SHA-256 of the access key; the session creation time. The client address is not written to that table. The access key is an HMAC-SHA256 signature made with the application secret, valid for 24 hours, containing a random nonce. The key is sent in the `X-Access-Key` header of a ciphertext request, not in the address. The first request with a new key counts as one download; repeated requests, resumes, and fetching the other files of the same drop with the same key within 24 hours do not use up the limit. The key is not bound to the IP address. If serving is interrupted before the response headers are sent, the new session is cancelled and the counter is decreased. A session row exists as long as the drop exists.

5.6. The `pairings` table contains: SHA-256 of the string `pair:` and the normalized code; SHA-256 of the receive-page secret; state `waiting`, `attached`, or `ready`; a reference to the drop; the plaintext token; the creation and expiry times. The code is 9 characters of Crockford base32. While the phone uploads files, the computer receives the number of files, the total ciphertext size, and the number of bytes received. The plaintext token of a ready link is kept in that table until the computer collects it, and for at most 15 minutes. After the token is handed out, the row is deleted immediately; the same happens when the receive page is left.

## 6. Object storage

6.1. A file passes through the server and is written to the bucket under the key `drops/<drop identifier>/<file identifier>` with type `application/octet-stream`. No copy is stored on the disk of the application server.

6.2. A file may be sent whole as one stream of any permitted size: the server does not assemble the body in memory but writes it to the bucket directly. The same file may arrive in fragments if the upload was interrupted and resumed: except for the last, a fragment is at least 5 MiB and at most 32 MiB. Such a fragment is briefly assembled in process memory and sent as a separate part of a multipart upload. The identifier of that upload is kept in `files` until the drop is published, then cleared. A repeated transfer of a file already received is confirmed without a new write.

6.3. The bucket holds only ciphertext. The server has no key and does not decrypt contents.

6.4. The server does not serve a drop as one archive: the browser fetches the ciphertext by file number, decrypts it, and, for several files, builds a ZIP.

6.5. In Chrome on Android, a file upload may continue after the page is closed, by means of Background Fetch. The requests are the same: `PUT` of the file with the `X-Upload-Secret` header, then `POST` publication. If the tab is already closed, the page's service worker calls publication. This method adds no new categories of data.

## 7. IP address, logs, and HTTP headers

7.1. The IP address is written neither to the database nor to logs. It is used only as the key of rate and wrong-password counters in process memory. The address is taken from the request; the `X-Forwarded-For` header is honoured only if the connection came from the loopback interface. The counters cease to exist when the process restarts; the wrong-attempt counter is also forgotten after an hour without new errors.

7.2. The following limits apply: 30 new drops per hour; 30 pairing codes per hour; 20 wrong codes per 15 minutes (a correct code is not counted); 300 code status polls per minute. The same polling limit applies to a code deletion request. Wrong password check values (clause 4.4) slow down further attempts for the pair "drop and IP address": the first 5 without delay, then the delay doubles from 2 seconds, up to 15 minutes; in addition, after 30 wrong attempts from one IP address across all drops, the delay applies to that address. A drop is never locked completely.

7.3. The application log contains processing errors, on a deletion failure the UUID of the drop, and the number of deleted drops. IP addresses, file bodies, passwords, tokens, and keys are not written to the log. A client-side connection abort is not logged.

7.4. The link token is part of the page path and of the download API path. The access key is sent in a header and is not part of the path. The database stores only their SHA-256. The web server (nginx) in front of the application is configured by the deployment script without an access log; only critical errors of the web server itself are written to its error log. Information about requests to the server may be recorded by the hosting provider's equipment and by the communication channel, outside the control of the Service.

7.5. Responses are sent with the header `Referrer-Policy: no-referrer`, so that the browser does not attach the drop URL to requests to other sites. The following are also set: a ban on embedding in another page; `nosniff`; a camera policy for the address of the Service only; a ban on geolocation, microphone, and interest-cohort. With HTTPS, `Strict-Transport-Security` for one year is added. Responses containing a download are marked `Cache-Control: private, no-store`.

7.6. In summary, the server receives and stores: the encrypted drop description and the ciphertext of contents and thumbnails (clause 4.3, section 6); the number of files and the sizes of their ciphertext (clause 5.3); the lifetime, the limit and counter of downloads, and the times of creation, expiry, and last download (clause 5.2); hashes of the token, the upload secret, and the password check value (clause 5.2). The IP address exists only in process memory (clause 7.1). The server does not receive the link key, the password, file names and types, or the plaintext contents of files and thumbnails. The Service uses no web analytics, advertising networks, third-party scripts, or fonts: the page makes no requests to other sites.

7.7. At deployment the Operator may enable a site access password. All functions of the Service, except the policy and FAQ pages, are then unavailable without it: the server refuses every API request except sign-in. The password is not stored on the server: only its scrypt hash is written to the server configuration. The password is sent to the server once, at sign-in. For a correct password the server sets the cookie `vd_site`: an expiry and an HMAC-SHA-256 signature, 30 days, with the `HttpOnly` and `SameSite=Strict` flags; the cookie contains no information about the person. Wrong attempts are limited to 10 per 15 minutes from one IP address. Changing the password invalidates every cookie issued before.

## 8. Data processed only in the browser

8.1. `localStorage`, key `vd-theme`: the selected appearance, `dark`, `light`, `lite` ("Simple"), or `simple` ("Accessible").

8.2. `localStorage`, key `vd-consent`: the value `accepted` or `declined`. It is not sent to the server. The installed application does not request that record. While the browser holds `declined`, the send, receive, download, and QR-transfer pages do not open.

8.3. `IndexedDB`, database `vd-uploads`, store `drops`: the identifier of an unfinished drop; the upload secret in the clear; the lifetime; the download limit; the flags "password is set" and "send to computer" (the password itself is not recorded); the link key; the drop's master key (clause 4.1), so that an interrupted upload can continue without entering the password again; and, for each file, the identifier, the real name, the original size, the ciphertext size, `lastModified`, and the number of bytes already sent. File contents are not stored. On a send-to-computer transfer the link key is not placed in that database: it remains on the receive page. The master key is removed from the record at publication. After publication the record is not erased at once. For up to 7 hours it retains the identifier, the upload secret, the link token, the link key, the lifetime, the limit, and the file names, so that the link can be shown again. The password is still not recorded. The record is also deleted when the person declines to continue an unfinished upload. On the next opening of the upload page, records older than 7 hours are erased. On the server an unfinished drop exists for 6 hours.

8.4. `sessionStorage`, key `vd-pairing`: the code, the receive-page secret, and the link key generated by the computer for the phone. The record exists while the receive page is open. Leaving the page and retrieving the finished link erase it. At the same time a request to delete the code row is sent to the server.

8.5. OPFS, directory `vqd/<file identifier>`: segments and the assembled file `data.bin` of one unfinished QR transfer. Received frames are kept in the form in which the sender showed them (ciphertext, when a password is used); finished segments and the assembled file are in plaintext. The data do not leave the device. A new transfer deletes the previous unfinished one.

8.6. `Cache Storage` of the application service worker: caches `vd-assets-<build>` and `vd-shell-<build>` hold the shell and static files. The shell includes the last HTML document that was opened successfully, under the key `/__shell`, without the drop URL. API responses and drop files are not cached. The cache `vd-share` temporarily stores the bytes of files passed through the system Share menu, together with the name, the type, and the modification date. A new share replaces the previous one. The upload page receives the files and deletes those records immediately. If the page was not opened, the files remain in the site cache until that cache is cleared.

8.7. The camera is requested only on the QR receive page. Frames are processed on the device and are not sent to the server. Copying the link, and the system Share action, at the person's choice transmit the page URL and, for an encrypted drop, the key after `#`, to the clipboard or to the selected application. The server does not take part in those actions.

8.8. OPFS, directory `vd-bg/<drop identifier>`: ciphertext prepared for background upload in Chrome on Android. The directory is deleted after the drop is published. If the upload did not start, the directory is deleted when the page switches to an ordinary upload in the open tab.

8.9. `localStorage`, key `vd-font`: the value `dyslexia` when the Andika typeface is enabled, or no record. It is not sent to the server. It does not depend on the selected appearance.

8.10. The device orientation sensor is used only in the installed application on a touch screen, and only for the sheen effect on interface elements. Its readings are processed in the browser, are not stored anywhere, and are not sent to the server. If the system asks for permission to use the sensor and it is refused, the value `1` remains in `sessionStorage` under the key `vd-tilt-denied` until the tab is closed. The effect is not applied in the Simple and Accessible themes, or when reduced motion is set in the system.

8.11. `localStorage`, key `vd-site`: the last known answer of the server about the site access password (clause 7.7), `open`, `ok`, or `locked`. The password itself is not stored. The value lets the installed application decide, without a network, whether to open QR transfer.

## 9. QR transfer without a network

9.1. The server does not take part in QR transfer.

9.2. One file of at most 512 MiB is transferred. Before receiving, the browser checks the free storage of the device (at least 1.1 times the file size).

9.3. Without a password, frames contain file fragments without encryption, and the manifest contains the name (at most 255 bytes of UTF-8), the MIME type, the size, and the SHA-256 of each segment; any camera that observes the display obtains the same data. If the sender sets a password (at least 8 characters), the data and the name with the type are encrypted in the browser (AES-256-GCM, key derived from the password by PBKDF2-HMAC-SHA-256); the size, the number and lengths of segments, and the key-derivation parameters stay open. The password is not stored anywhere. Data may be transmitted compressed (gzip) and in colour frames (three codes in one frame).

9.4. The received file remains on the recipient's device until it is saved or deleted.

## 10. Deletion periods

10.1. An unfinished drop receives an expiry of 6 hours at the moment of creation. It has no token. After publication the lifetime is replaced by the 1, 3, 7, or 30 days selected by the sender, and the state becomes `ready`.

10.2. A ready drop exists for 1, 3, 7, or 30 days. The period is determined by the sender.

10.3. A drop whose lifetime has expired, or whose download limit is exhausted, is not deleted immediately if a download request has already occurred: a 24-hour period from that request is observed, so that an interrupted download can be continued. If there have been no downloads, those 24 hours do not delay deletion.

10.4. A background job runs at process start and then every 10 minutes. In one pass it deletes at most 500 drops: objects in the bucket, unfinished multipart uploads, and database rows. Expired pairing codes are deleted in the same pass without that limit, together with the plaintext token if it is still in the row.

10.5. A pairing code with no attached phone exists for 10 minutes. After attachment it exists while the upload proceeds, and for at most 6 hours. The plaintext token after readiness exists for at most 15 minutes, or until the computer retrieves it. One code is bound to one drop.

10.6. The download access key is valid for 24 hours. The database stores the session hash, not the key itself. That row is deleted together with the drop.

## 11. Recipients of data

11.1. A separate user profile is not formed. Transmission of such a profile to third parties therefore does not occur.

11.2. A drop record is processed by the application process, by PostgreSQL, and by the bucket of the instance on which the Service is deployed. The operational tables provide for no other recipients; information from them is not transferred to third parties.

11.3. The bucket provider sees objects in the form in which they were written: ciphertext and a key of the form `drops/<uuid>/<uuid>`.

11.4. The contents of files, their names, types, plaintext sizes, and thumbnails are encrypted with a key the Service does not have. The Operator cannot read them and therefore cannot disclose them.
