const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const required = ['index.html', 'app.js', 'styles.css'];

console.log('[KX AUTO CACHE FIX] build starting');

for (const file of required) {
  const full = path.join(publicDir, file);
  if (!fs.existsSync(full)) {
    console.error(`[KX AUTO CACHE FIX] ERROR: public/${file} is missing.`);
    process.exit(1);
  }
}

const cfg = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
};

const configSource = `window.__KX_CONFIG__=${JSON.stringify(cfg)};\n`;
fs.writeFileSync(path.join(publicDir, 'config.js'), configSource);

// Build a content fingerprint. Any change to app, CSS, HTML or environment config
// produces a new URL query so browsers cannot reuse the previous asset blindly.
const fingerprint = crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(publicDir, 'index.html')))
  .update(fs.readFileSync(path.join(publicDir, 'app.js')))
  .update(fs.readFileSync(path.join(publicDir, 'styles.css')))
  .update(configSource)
  .digest('hex')
  .slice(0, 12);

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    fs.cpSync(path.join(src, name), path.join(dest, name), { recursive: true });
  }
}

function cacheBustIndex(dest) {
  const indexPath = path.join(dest, 'index.html');
  if (!fs.existsSync(indexPath)) return;
  let html = fs.readFileSync(indexPath, 'utf8');

  // Remove an older query first, then append this build fingerprint.
  html = html
    .replace(/\/styles\.css(?:\?v=[^"']*)?/g, `/styles.css?v=${fingerprint}`)
    .replace(/\/config\.js(?:\?v=[^"']*)?/g, `/config.js?v=${fingerprint}`)
    .replace(/\/app\.js(?:\?v=[^"']*)?/g, `/app.js?v=${fingerprint}`);

  fs.writeFileSync(indexPath, html);
}

for (const dirName of ['out', 'dist', 'build', 'site']) {
  const dest = path.join(root, dirName);
  copyDir(publicDir, dest);
  cacheBustIndex(dest);
  fs.writeFileSync(path.join(dest, '_redirects'), '/* /index.html 200\n');
}

// Legacy fallback if Publish Directory is repository root.
for (const file of ['index.html', 'app.js', 'styles.css', 'config.js']) {
  fs.copyFileSync(path.join(publicDir, file), path.join(root, file));
}
cacheBustIndex(root);

console.log(`[KX AUTO CACHE FIX] asset version: ${fingerprint}`);
console.log('[KX AUTO CACHE FIX] out/index.html:', fs.existsSync(path.join(root, 'out', 'index.html')));
console.log('[KX AUTO CACHE FIX] READY - normal deploys can use fresh asset URLs');
