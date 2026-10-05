import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Optional password for the whole site, set at deploy time (SITE_PASSWORD_HASH). Without it the site
// is open, as before. With it, every API call except the gate itself needs the session cookie that a
// correct password earns. Static files stay public: they carry no data, and link previews keep working.

const scrypt = promisify(scryptCb);
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const COOKIE = 'vd_site';
export const SESSION_DAYS = 30;

/** "scrypt2$<salt b64>$<hash b64>" for the password, NFKC-normalised. Used by the deploy script. */
export async function hashSitePassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(String(password).normalize('NFKC'), salt, 32, SCRYPT);
  return `scrypt2$${salt.toString('base64')}$${key.toString('base64')}`;
}

function parseHash(spec) {
  const [alg, salt, hash] = String(spec || '').split('$');
  if (alg !== 'scrypt2' || !salt || !hash) return null;
  return { salt: Buffer.from(salt, 'base64'), hash: Buffer.from(hash, 'base64') };
}

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/**
 * @param {{hash?: string, secret: string, now?: () => number}} o
 * hash: SITE_PASSWORD_HASH (empty: the site is open). secret: APP_SECRET.
 */
export function createSiteAccess({ hash, secret, now = () => Date.now() }) {
  const parsed = parseHash(hash);
  if (hash && !parsed) throw new Error('SITE_PASSWORD_HASH has an unknown format');
  // Sessions are signed with a key bound to the password hash: changing the password logs everyone out.
  const key = createHmac('sha256', String(secret)).update(`site-session|${hash || ''}`).digest();
  const sign = (exp) => createHmac('sha256', key).update(`site|${exp}`).digest('base64url');

  return {
    locked: Boolean(parsed),

    async verify(password) {
      if (!parsed || typeof password !== 'string' || password.length > 1024) return false;
      const derived = await scrypt(password.normalize('NFKC'), parsed.salt, parsed.hash.length, SCRYPT);
      return timingSafeEqual(derived, parsed.hash);
    },

    /** Cookie value for a new session. */
    issue() {
      const exp = Math.floor(now() / 1000) + SESSION_DAYS * 24 * 3600;
      return `${exp}.${sign(exp)}`;
    },

    /** True when the site is open or the request carries a valid, unexpired session. */
    allowed(cookieHeader) {
      if (!parsed) return true;
      const value = readCookie(cookieHeader, COOKIE);
      const m = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value || '');
      if (!m) return false;
      const exp = Number(m[1]);
      if (exp * 1000 <= now()) return false;
      const expected = Buffer.from(sign(exp));
      const given = Buffer.from(m[2]);
      return expected.length === given.length && timingSafeEqual(expected, given);
    },
  };
}
