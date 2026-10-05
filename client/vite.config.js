import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { build as esbuild } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

// Build number: BUILD_NUMBER env, else deploy-time build-info.json, else git commit count, else UTC timestamp.
function buildInfo() {
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'), 'utf8'));
  } catch {
    // no deploy-time info
  }
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}.${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
  return {
    number: process.env.BUILD_NUMBER || file.number || git('rev-list --count HEAD') || stamp,
    commit: process.env.GIT_SHA || file.commit || git('rev-parse --short HEAD'),
  };
}

// The service worker is bundled with esbuild (it imports the crypto core and client-zip to decrypt
// and zip downloads) and emitted with the build id and the full asset list, so it can precache
// everything on install: the offline QR transfer must work on a device that never opened it online.
function serviceWorker(buildId) {
  return {
    name: 'emit-service-worker',
    apply: 'build',
    async generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((name) => name.startsWith('assets/') && !name.endsWith('.woff')) // every target browser takes woff2
        .map((name) => `/${name}`);
      const result = await esbuild({
        entryPoints: [path.join(root, 'src/sw.js')],
        bundle: true,
        format: 'iife',
        target: 'es2020',
        write: false,
        legalComments: 'none',
        define: { __BUILD_ID__: JSON.stringify(buildId), __PRECACHE__: JSON.stringify(assets) },
      });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: result.outputFiles[0].text });
    },
  };
}

export default defineConfig(({ mode }) => {
  const info = buildInfo();
  const type = process.env.BUILD_TYPE || (mode === 'production' ? 'release' : 'dev');
  const buildId = `${pkg.version}-${info.number}-${Date.now().toString(36)}`;
  return {
    plugins: [react(), serviceWorker(buildId)],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_TYPE__: JSON.stringify(type),
      __BUILD_NUMBER__: JSON.stringify(String(info.number)),
      __BUILD_COMMIT__: JSON.stringify(info.commit),
    },
    // Emit every asset as a file: the server CSP does not allow data: fonts.
    build: { assetsInlineLimit: 0 },
    resolve: { alias: { vqd: path.join(root, '../vqd/src/index.js') } },
    worker: { format: 'es' },
    server: {
      fs: { allow: [path.join(root, '..')] },
      proxy: { '/api': 'http://127.0.0.1:3000' },
    },
  };
});
