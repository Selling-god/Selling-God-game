const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const required = ['index.html', 'app.js', 'styles.css'];

console.log('[KX MULTIROOT STATIC] build starting');
for (const name of required) {
  const p = path.join(publicDir, name);
  if (!fs.existsSync(p)) {
    console.error(`[KX MULTIROOT STATIC] missing public/${name}`);
    process.exit(1);
  }
}

const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
};

const hash = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(publicDir, 'app.js')))
  .update(fs.readFileSync(path.join(publicDir, 'styles.css')))
  .update(JSON.stringify(env))
  .update(String(process.env.RENDER_GIT_COMMIT || Date.now()))
  .digest('hex')
  .slice(0, 12);

const configSource = `window.__KX_CONFIG__=${JSON.stringify({ ...env, buildId: hash })};\n`;
const sourceIndex = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const renderedIndex = sourceIndex
  .replace(/__KX_ASSET_VERSION__/g, hash)
  .replace(/([?&]v=)[a-f0-9]{8,}/gi, `$1${hash}`);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeDeployFiles(dest, copyAssets) {
  ensureDir(dest);
  if (copyAssets) {
    for (const name of fs.readdirSync(publicDir)) {
      if (name === 'index.html' || name === 'config.js') continue;
      const src = path.join(publicDir, name);
      const dst = path.join(dest, name);
      fs.cpSync(src, dst, { recursive: true, force: true });
    }
  }
  fs.writeFileSync(path.join(dest, 'index.html'), renderedIndex);
  fs.writeFileSync(path.join(dest, 'config.js'), configSource);
  fs.writeFileSync(path.join(dest, '404.html'), renderedIndex);
  fs.writeFileSync(path.join(dest, '_redirects'), '/* /index.html 200\n');
  fs.writeFileSync(path.join(dest, 'kx-health.txt'), `KX_EXCHANGE_OK ${hash}\n`);
  fs.writeFileSync(path.join(dest, 'kx-build-proof.txt'), `KX_MULTIROOT_STATIC ${hash}\n`);
}

// 1) If Render Publish Directory is public, keep public directly deployable.
writeDeployFiles(publicDir, false);

// 2) Cover the common existing Render Publish Directory values.
for (const name of ['out', 'dist', 'build', 'site']) {
  const dest = path.join(root, name);
  fs.rmSync(dest, { recursive: true, force: true });
  writeDeployFiles(dest, true);
}

// 3) If Publish Directory is repository root ("."), make root deployable too.
for (const name of ['app.js', 'styles.css']) {
  fs.copyFileSync(path.join(publicDir, name), path.join(root, name));
}
fs.writeFileSync(path.join(root, 'index.html'), renderedIndex);
fs.writeFileSync(path.join(root, 'config.js'), configSource);
fs.writeFileSync(path.join(root, '404.html'), renderedIndex);
fs.writeFileSync(path.join(root, '_redirects'), '/* /index.html 200\n');
fs.writeFileSync(path.join(root, 'kx-health.txt'), `KX_EXCHANGE_OK ${hash}\n`);
fs.writeFileSync(path.join(root, 'kx-build-proof.txt'), `KX_MULTIROOT_STATIC ${hash}\n`);

const targets = ['.', 'public', 'out', 'dist', 'build', 'site'];
for (const t of targets) {
  const dir = t === '.' ? root : path.join(root, t);
  const ok = fs.existsSync(path.join(dir, 'index.html')) && fs.existsSync(path.join(dir, 'app.js')) && fs.existsSync(path.join(dir, 'styles.css'));
  console.log(`[KX MULTIROOT STATIC] ${t}: ${ok ? 'READY' : 'MISSING'}`);
  if (!ok) process.exit(1);
}
console.log(`[KX MULTIROOT STATIC] buildId=${hash}`);
console.log('[KX MULTIROOT STATIC] READY');
