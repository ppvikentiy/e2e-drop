import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { migrate } from './db.js';
import { startCleanup } from './cleanup.js';
import { publicFailure } from './errors.js';
import { dropsRouter } from './routes/drops.js';
import { pairRouter } from './routes/pair.js';
import { downloadRouter } from './routes/download.js';
import { requireSite, siteRouter } from './routes/site.js';

const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');

// Link-preview crawlers of messengers. They get the page without the noindex header, so a pasted link
// still shows a card; every other client, search engines included, is told not to index or follow.
const LINK_PREVIEW_BOT =
  /TelegramBot|facebookexternalhit|Facebot|Twitterbot|WhatsApp|VKShare|vkShare|Discordbot|Slackbot|LinkedInBot|SkypeUriPreview|Viber|OdklBot/i;
const NO_INDEX = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // Share links carry the token in the path; never leak it via Referer.
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
};

app.use((req, res, next) => {
  res.set(SECURITY_HEADERS);
  if (!LINK_PREVIEW_BOT.test(req.get('user-agent') || '')) res.set('X-Robots-Tag', NO_INDEX);
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

let startupError = null;

app.use('/api', (req, res, next) => {
  if (!startupError) return next();
  const pub = publicFailure(startupError);
  const body = { error: pub.error, ok: false };
  if (pub.reason) body.reason = pub.reason;
  res.status(503).json(body);
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/site', siteRouter);
app.use('/api', requireSite);
app.use('/api/drops', dropsRouter);
app.use('/api/d', downloadRouter);
app.use('/api/pair', pairRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Не найдено' }));

// PWA Share Target: normally handled by the service worker; this is the fallback when it isn't active yet.
app.get('/share-target', (_req, res) => res.redirect(303, '/upload'));
app.post('/share-target', (req, res) => {
  req.resume();
  res.redirect(303, '/upload');
});

if (fs.existsSync(config.staticDir)) {
  const indexHtml = path.join(config.staticDir, 'index.html');
  app.get('/', (_req, res) => res.redirect(302, '/home'));
  app.use('/assets', express.static(path.join(config.staticDir, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(
    express.static(config.staticDir, {
      index: false,
      setHeaders(res, file) {
        // The service worker and manifest must be revalidated so updates reach users promptly.
        if (file.endsWith('sw.js') || file.endsWith('.webmanifest')) res.set('Cache-Control', 'no-cache');
      },
    }),
  );
  // The page names its preview image by absolute URL; each instance fills in its own address.
  const pageTemplate = fs.readFileSync(indexHtml, 'utf8');
  const HOST_RE = /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$/;
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    const host = req.get('host') || '';
    const origin = HOST_RE.test(host) ? `${req.protocol}://${host}` : '';
    res.type('html').send(pageTemplate.replaceAll('__ORIGIN__', origin));
  });
}

const CLIENT_ABORT_CODES = new Set(['ECONNRESET', 'ECONNABORTED', 'ERR_STREAM_PREMATURE_CLOSE']);

app.use((err, _req, res, _next) => {
  const pub = publicFailure(err);
  if (pub.status >= 500 && !CLIENT_ABORT_CODES.has(err.code)) console.error(err);
  if (res.headersSent) return res.destroy();
  const body = { error: pub.error };
  if (pub.reason) body.reason = pub.reason;
  res.status(pub.status).json(body);
});

try {
  await migrate();
  startCleanup();
} catch (err) {
  console.error(err);
  startupError = err;
}

app.listen(config.port, config.host, () => {
  console.log(`E2E Drop listening on http://${config.host}:${config.port}`);
});
