// Reads a password from stdin and prints the SITE_PASSWORD_HASH value for it. Used by deploy/install.sh,
// so the password itself never lands in the server's configuration.
import { hashSitePassword } from '../src/siteAccess.js';

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;
const password = input.replace(/^﻿/, '').replace(/\r?\n$/, '');
if (!password) {
  console.error('empty password');
  process.exit(1);
}
console.log(await hashSitePassword(password));
