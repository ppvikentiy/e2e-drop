import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { HttpError, asyncHandler } from '../errors.js';
import { COOKIE, SESSION_DAYS, createSiteAccess } from '../siteAccess.js';

export const siteAccess = createSiteAccess({ hash: config.sitePasswordHash, secret: config.appSecret });

export const siteRouter = Router();

// Only wrong passwords count.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Слишком много неверных паролей. [[Подождите]] 15 минут.' },
});

const cookie = (req, value, maxAge) =>
  `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${req.secure ? '; Secure' : ''}`;

siteRouter.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ locked: siteAccess.locked, allowed: siteAccess.allowed(req.get('cookie')) });
});

siteRouter.post(
  '/login',
  loginLimiter,
  express.json({ limit: '2kb' }),
  asyncHandler(async (req, res) => {
    if (!siteAccess.locked) return res.json({ ok: true });
    if (!(await siteAccess.verify(req.body?.password))) throw new HttpError(401, 'Неверный пароль');
    res.set('Set-Cookie', cookie(req, siteAccess.issue(), SESSION_DAYS * 24 * 3600));
    res.json({ ok: true });
  }),
);

siteRouter.post('/logout', (req, res) => {
  res.set('Set-Cookie', cookie(req, '', 0));
  res.json({ ok: true });
});

/** Everything under /api except the gate itself needs a session when the site is locked. */
export function requireSite(req, res, next) {
  if (siteAccess.allowed(req.get('cookie'))) return next();
  res.status(401).json({ error: 'Нужен пароль сайта', reason: 'site-locked' });
}
