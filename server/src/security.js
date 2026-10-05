import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';

const scrypt = promisify(scryptCb);

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const randomToken = () => randomBytes(32).toString('base64url');

export const sha256Hex = (value) => createHash('sha256').update(String(value)).digest('hex');

export function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const derived = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(derived, expected);
}

const hmac = (data) => createHmac('sha256', config.appSecret).update(data).digest('base64url');

const ACCESS_TTL_SECONDS = 24 * 60 * 60;

// The nonce makes every issued key unique: download sessions are keyed on it.
export function signAccess(token) {
  const exp = Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS;
  const nonce = randomBytes(9).toString('base64url');
  return `${exp}.${nonce}.${hmac(`${token}.${exp}.${nonce}`)}`;
}

export function verifyAccess(token, key) {
  if (typeof key !== 'string') return false;
  const [exp, nonce, sig] = key.split('.');
  if (!/^\d+$/.test(exp ?? '') || !nonce || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, hmac(`${token}.${exp}.${nonce}`));
}
