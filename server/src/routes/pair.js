import { Router } from 'express';
import { randomInt } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { HttpError, asyncHandler } from '../errors.js';
import { randomToken, safeEqual, sha256Hex } from '../security.js';

// Pairing: a computer without a camera shows a short code, a phone sends files to it. The phone's
// drop is attached to the code; when the upload is finalised the computer picks up the link.
//
// Codes are 9 characters of Crockford base32 (45 bits), shown as K7M-4QX-9TD. They live minutes and wrong guesses are rate limited.
// Only a hash of the code is stored. The plaintext drop token is held (it is not recoverable from the
// drops table, which keeps only its hash) just until the computer collects it, at most CLAIM_TTL.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 9;
export const WAIT_TTL = '10 minutes'; // code shown, no phone yet
export const UPLOAD_TTL = '6 hours'; // phone attached; matches the pending-drop lifetime
export const CLAIM_TTL = '15 minutes'; // upload finished, waiting for the computer to pick up the link

export const pairRouter = Router();

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Слишком много кодов за час. [[Попробуйте позже]].' },
});

// Only failed lookups count: guessing a code is what is being limited.
const checkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Слишком много неверных кодов. [[Подождите]] немного.' },
});

const statusLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Запросы идут слишком часто. [[Подождите]] немного.' },
});

export function newCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Uppercases, drops separators and maps the look-alikes Crockford treats as the same symbol. */
export function normalizeCode(value) {
  if (typeof value !== 'string' || value.length > 40) return null;
  const code = value
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!ALPHABET.includes(ch)) return null;
  return code;
}

const hashCode = (code) => sha256Hex(`pair:${code}`);

/** The code carried by a request path or body, or a 404 that does not reveal why. */
function codeFrom(value) {
  const code = normalizeCode(value);
  if (!code) throw new HttpError(404, 'Код не найден или устарел');
  return code;
}

// Computer: ask for a code.
pairRouter.post(
  '/',
  createLimiter,
  asyncHandler(async (_req, res) => {
    const secret = randomToken();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      const { rowCount } = await query(
        `INSERT INTO pairings (code_hash, secret_hash, state, expires_at)
         VALUES ($1, $2, 'waiting', now() + interval '${WAIT_TTL}')
         ON CONFLICT DO NOTHING`,
        [hashCode(code), sha256Hex(secret)],
      );
      if (rowCount === 1) return res.status(201).json({ code, secret, expiresIn: 600 });
    }
    throw new HttpError(503, 'Не удалось выдать свободный код. [[Повторите]].');
  }),
);

// Phone: is this code open for a new upload? (Before the user picks files.)
pairRouter.get(
  '/:code/check',
  checkLimiter,
  asyncHandler(async (req, res) => {
    const code = codeFrom(req.params.code);
    const { rows } = await query(
      `SELECT 1 FROM pairings WHERE code_hash = $1 AND state = 'waiting' AND expires_at > now()`,
      [hashCode(code)],
    );
    if (!rows[0]) throw new HttpError(404, 'Код не найден или устарел');
    res.json({ ok: true });
  }),
);

// Computer: what is happening. Returns the link token once, when the phone has finished uploading.
pairRouter.get(
  '/:code/status',
  statusLimiter,
  asyncHandler(async (req, res) => {
    const code = codeFrom(req.params.code);
    const secret = req.get('x-pair-secret');
    if (!secret) throw new HttpError(404, 'Код не найден или устарел');
    const { rows } = await query(
      `SELECT p.secret_hash, p.state, p.token, p.expires_at,
              (SELECT count(*)::int FROM files f WHERE f.drop_id = p.drop_id) AS file_count,
              (SELECT COALESCE(sum(COALESCE(f.cipher_size, f.size)), 0)::bigint FROM files f WHERE f.drop_id = p.drop_id) AS total_size,
              (SELECT COALESCE(sum(f.uploaded_bytes), 0)::bigint FROM files f WHERE f.drop_id = p.drop_id) AS uploaded_bytes
       FROM pairings p WHERE p.code_hash = $1 AND p.expires_at > now()`,
      [hashCode(code)],
    );
    const row = rows[0];
    if (!row || !safeEqual(row.secret_hash, sha256Hex(secret))) throw new HttpError(404, 'Код не найден или устарел');

    const secondsLeft = Math.max(0, Math.floor((new Date(row.expires_at) - Date.now()) / 1000));
    if (row.state === 'waiting') return res.json({ state: 'waiting', secondsLeft });
    if (row.state === 'attached') {
      return res.json({
        state: 'uploading',
        fileCount: row.file_count,
        totalSize: Number(row.total_size),
        uploadedBytes: Number(row.uploaded_bytes),
      });
    }
    res.json({ state: 'ready', token: row.token });
  }),
);

// Computer: done with it (link received, or the code is no longer wanted). Removes the held token.
pairRouter.delete(
  '/:code',
  statusLimiter,
  asyncHandler(async (req, res) => {
    const code = codeFrom(req.params.code);
    const secret = req.get('x-pair-secret');
    if (!secret) throw new HttpError(404, 'Код не найден или устарел');
    await query('DELETE FROM pairings WHERE code_hash = $1 AND secret_hash = $2', [hashCode(code), sha256Hex(secret)]);
    res.json({ ok: true });
  }),
);

/**
 * Inside the create-drop transaction: claims the code for this drop. A code serves exactly one drop.
 * @param {import('pg').PoolClient} db
 */
export async function attachPairing(db, rawCode, dropId) {
  const code = normalizeCode(rawCode);
  const { rowCount } = code
    ? await db.query(
        `UPDATE pairings SET state = 'attached', drop_id = $2, expires_at = now() + interval '${UPLOAD_TTL}'
         WHERE code_hash = $1 AND state = 'waiting' AND expires_at > now()`,
        [hashCode(code), dropId],
      )
    : { rowCount: 0 };
  if (rowCount !== 1) throw new HttpError(400, 'Код не найден или устарел. [[Попросите новый]] на компьютере.');
}

/** Inside finalize: hands the finished drop's link to the waiting computer, if the drop was attached. */
export async function publishPairing(dropId, token) {
  await query(
    `UPDATE pairings SET state = 'ready', token = $2, expires_at = now() + interval '${CLAIM_TTL}'
     WHERE drop_id = $1 AND state = 'attached'`,
    [dropId, token],
  );
}
