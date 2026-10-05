import express, { Router } from 'express';
import { pipeline } from 'node:stream/promises';
import { query, withTransaction } from '../db.js';
import { HttpError, asyncHandler } from '../errors.js';
import { getObjectStream } from '../s3.js';
import { TOKEN_RE, safeEqual, sha256Hex, signAccess, verifyAccess } from '../security.js';
import { createGate } from '../gate.js';
import { KDF_ALG } from '../manifest.js';

export const downloadRouter = Router();

const NOT_FOUND = 'Раздача не найдена, истекла или лимит скачиваний исчерпан. [[Попросите новую ссылку]].';
const WRONG_SECRET = 'Ошибка расшифровки. Проверьте правильность ссылки и пароля';
const SESSION_TTL = '24 hours';
const LIMIT_REACHED = Symbol('limit');

// Wrong passwords (gate tokens) slow down further attempts per drop and IP; see gate.js.
const gate = createGate();
setInterval(() => gate.sweep(), 10 * 60 * 1000).unref();

// VDE2-5pr drops only: rows without a sealed manifest (VDE1, or VDE2 with an open manifest) are treated as gone.
async function findDrop(token, { requireDownloadsLeft }) {
  if (!TOKEN_RE.test(token)) return null;
  const { rows } = await query(
    `SELECT * FROM drops
     WHERE token_hash = $1 AND status = 'ready' AND expires_at > now() AND manifest IS NOT NULL AND manifest_mac IS NULL
       ${requireDownloadsLeft ? 'AND download_count < max_downloads' : ''}`,
    [sha256Hex(token)],
  );
  return rows[0] ?? null;
}

async function listFiles(dropId) {
  const { rows } = await query('SELECT id, cipher_size, s3_key FROM files WHERE drop_id = $1 ORDER BY position', [dropId]);
  return rows.map((r) => ({ id: r.id, size: Number(r.cipher_size), s3Key: r.s3_key }));
}

// What the recipient needs to open the drop: the sealed manifest exactly as the sender stored it, the
// ciphertext size of each file (checked against the manifest in the browser), and an access key.
async function openInfo(token, drop) {
  const files = await listFiles(drop.id);
  return {
    requiresPassword: false,
    dropId: drop.id,
    manifest: drop.manifest.toString('base64'),
    files: files.map((f) => ({ size: f.size })),
    expiresAt: drop.expires_at,
    downloadsLeft: drop.max_downloads - drop.download_count,
    accessKey: signAccess(token),
  };
}

downloadRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const drop = await findDrop(token, { requireDownloadsLeft: true });
    if (!drop) throw new HttpError(404, NOT_FOUND);
    // A password drop shows nothing but what the browser needs to derive the gate token.
    if (drop.gate_hash) {
      return res.json({
        requiresPassword: true,
        dropId: drop.id,
        kdf: { alg: KDF_ALG, salt: drop.kdf_salt, iterations: drop.kdf_iterations },
      });
    }
    res.json(await openInfo(token, drop));
  }),
);

downloadRouter.post(
  '/:token/unlock',
  express.json({ limit: '4kb' }),
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const drop = await findDrop(token, { requireDownloadsLeft: true });
    if (!drop) throw new HttpError(404, NOT_FOUND);
    if (!drop.gate_hash) return res.json(await openInfo(token, drop));

    const ip = req.ip;
    const wait = gate.retryAfter(drop.id, ip);
    if (wait > 0) {
      const seconds = Math.ceil(wait / 1000);
      res.set('Retry-After', String(seconds));
      return res.status(429).json({ error: `Слишком много попыток. [[Подождите ${seconds} с]] и попробуйте снова.`, retryAfter: seconds });
    }
    const gateToken = req.body?.gateToken;
    if (typeof gateToken !== 'string' || gateToken.length > 128 || !safeEqual(sha256Hex(gateToken), drop.gate_hash)) {
      gate.fail(drop.id, ip);
      throw new HttpError(401, WRONG_SECRET);
    }
    gate.succeed(drop.id, ip);
    res.json(await openInfo(token, drop));
  }),
);

// A session is one access key (issued per page view). Its first request consumes a download;
// later requests (resumes, other files, the browser re-requesting a range) are free for SESSION_TTL.
// Not bound to the client IP: mobile networks switch IPv4/IPv6 and addresses between requests.
async function openSession(key, drop) {
  const sessionHash = sha256Hex(key);
  try {
    return await withTransaction(async (db) => {
      const inserted = await db.query(
        'INSERT INTO download_sessions (drop_id, session_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [drop.id, sessionHash],
      );
      if (inserted.rowCount === 1) {
        const { rowCount } = await db.query(
          `UPDATE drops SET download_count = download_count + 1, last_download_at = now()
           WHERE id = $1 AND expires_at > now() AND download_count < max_downloads`,
          [drop.id],
        );
        if (rowCount === 0) throw LIMIT_REACHED;
        return { sessionHash, isNew: true };
      }
      const { rows } = await db.query(
        `SELECT 1 FROM download_sessions
         WHERE drop_id = $1 AND session_hash = $2 AND created_at > now() - interval '${SESSION_TTL}'`,
        [drop.id, sessionHash],
      );
      if (!rows[0]) throw LIMIT_REACHED;
      await db.query('UPDATE drops SET last_download_at = now() WHERE id = $1', [drop.id]);
      return { sessionHash, isNew: false };
    });
  } catch (err) {
    if (err === LIMIT_REACHED) return null;
    throw err;
  }
}

async function revertSession(drop, session) {
  if (!session.isNew) return;
  await withTransaction(async (db) => {
    await db.query('DELETE FROM download_sessions WHERE drop_id = $1 AND session_hash = $2', [
      drop.id,
      session.sessionHash,
    ]);
    await db.query('UPDATE drops SET download_count = download_count - 1 WHERE id = $1 AND download_count > 0', [
      drop.id,
    ]);
  });
}

// Returns null (serve whole file), 'unsatisfiable', or { start, end }. Multi-range requests are served whole.
function parseRange(header, size) {
  if (!header || size === 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return 'unsatisfiable';
  return { start, end };
}

const isDisconnect = (err) => err?.code === 'ERR_STREAM_PREMATURE_CLOSE' || err?.message === 'Client disconnected';

// Ciphertext only: the recipient's browser (service worker) fetches it segment by segment with Range,
// checks and decrypts it, and saves the file under its real name.
async function serveCiphertext(req, res, drop, file, key) {
  const etag = `"${file.id}"`;
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': 'attachment',
    'Accept-Ranges': 'bytes',
    ETag: etag,
    'Cache-Control': 'private, no-store',
  });

  if (req.method === 'HEAD') {
    res.set('Content-Length', String(file.size));
    return res.end();
  }

  const ifRange = req.get('if-range');
  const range = ifRange && ifRange !== etag ? null : parseRange(req.get('range'), file.size);
  if (range === 'unsatisfiable') {
    return res.status(416).set('Content-Range', `bytes */${file.size}`).end();
  }

  const session = await openSession(key, drop);
  if (!session) throw new HttpError(410, 'Лимит скачиваний исчерпан. [[Попросите новую ссылку]].');

  try {
    const body = await getObjectStream(file.s3Key, range);
    if (range) {
      res.status(206).set({
        'Content-Range': `bytes ${range.start}-${range.end}/${file.size}`,
        'Content-Length': String(range.end - range.start + 1),
      });
    } else {
      res.set('Content-Length', String(file.size));
    }
    await pipeline(body, res);
  } catch (err) {
    if (!res.headersSent) {
      await revertSession(drop, session);
      throw err;
    }
    if (!isDisconnect(err)) console.error('[download] stream failed:', err);
    res.destroy();
  }
}

// The access key travels in a header, not in the URL, so it does not end up in proxy logs.
downloadRouter.get(
  '/:token/files/:index',
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const key = req.get('x-access-key');
    const drop = await findDrop(token, { requireDownloadsLeft: false });
    if (!drop) throw new HttpError(404, NOT_FOUND);
    if (!verifyAccess(token, key)) throw new HttpError(401, 'Доступ к скачиванию истёк. [[Обновите страницу]].');
    const index = Number(req.params.index);
    const files = await listFiles(drop.id);
    const file = Number.isInteger(index) ? files[index] : undefined;
    if (!file) throw new HttpError(404, 'Файл не найден');
    await serveCiphertext(req, res, drop, file, key);
  }),
);
