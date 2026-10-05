import test from 'node:test';
import assert from 'node:assert/strict';
import { COOKIE, createSiteAccess, hashSitePassword } from '../src/siteAccess.js';

const SECRET = 'test-secret';

test('an open site needs nothing', async () => {
  const site = createSiteAccess({ hash: '', secret: SECRET });
  assert.equal(site.locked, false);
  assert.equal(site.allowed(''), true);
  assert.equal(await site.verify('anything'), false);
});

test('the right password earns a session cookie; a wrong one does not', async () => {
  const hash = await hashSitePassword('Сезам, откройся');
  assert.match(hash, /^scrypt2\$/);
  const site = createSiteAccess({ hash, secret: SECRET });
  assert.equal(site.locked, true);
  assert.equal(await site.verify('Сезам, откройся'), true);
  assert.equal(await site.verify('сезам, откройся'), false);
  assert.equal(await site.verify(''), false);
  assert.equal(await site.verify(undefined), false);
  assert.equal(site.allowed(''), false);
  const value = site.issue();
  assert.equal(site.allowed(`theme=dark; ${COOKIE}=${value}`), true);
  assert.equal(site.allowed(`${COOKIE}=${value}x`), false);
  const [exp, mac] = value.split('.');
  assert.equal(site.allowed(`${COOKIE}=${Number(exp) + 999}.${mac}`), false, 'expiry cannot be extended');
});

test('sessions expire, and a new password logs everyone out', async () => {
  let t = Date.now();
  const hash = await hashSitePassword('first password');
  const site = createSiteAccess({ hash, secret: SECRET, now: () => t });
  const value = site.issue();
  t += 29 * 24 * 3600 * 1000;
  assert.equal(site.allowed(`${COOKIE}=${value}`), true);
  t += 2 * 24 * 3600 * 1000;
  assert.equal(site.allowed(`${COOKIE}=${value}`), false);

  const fresh = createSiteAccess({ hash, secret: SECRET });
  const v2 = fresh.issue();
  const changed = createSiteAccess({ hash: await hashSitePassword('second password'), secret: SECRET });
  assert.equal(changed.allowed(`${COOKIE}=${v2}`), false);
});

test('a malformed hash is refused at start', () => {
  assert.throws(() => createSiteAccess({ hash: 'plain-text', secret: SECRET }), /format/);
});
