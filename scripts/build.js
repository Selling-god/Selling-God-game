const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const outDir = path.join(root, 'out');
const required = ['index.html', 'app.js', 'styles.css'];

console.log('[KX STATIC RECOVERY] build starting');
for (const name of required) {
  const file = path.join(publicDir, name);
  if (!fs.existsSync(file)) {
    console.error(`[KX STATIC RECOVERY] missing public/${name}`);
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
  .update(String(process.env.RENDER_GIT_COMMIT || ''))
  .digest('hex')
  .slice(0, 12);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const name of fs.readdirSync(publicDir)) {
  fs.cpSync(path.join(publicDir, name), path.join(outDir, name), { recursive: true });
}

const config = `window.__KX_CONFIG__=${JSON.stringify({ ...env, buildId: hash })};\n`;
fs.writeFileSync(path.join(outDir, 'config.js'), config);

const indexPath = path.join(outDir, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replaceAll('__KX_ASSET_VERSION__', hash);
fs.writeFileSync(indexPath, html);

// Render Static Site SPA/root fallback.
fs.writeFileSync(path.join(outDir, '_redirects'), '/* /index.html 200\n');
fs.copyFileSync(indexPath, path.join(outDir, '404.html'));
fs.writeFileSync(path.join(outDir, 'version.json'), JSON.stringify({ buildId: hash, app: 'KX EXCHANGE' }));
fs.writeFileSync(path.join(outDir, 'kx-health.txt'), `KX_EXCHANGE_OK ${hash}\n`);

const ok = fs.existsSync(indexPath) && fs.statSync(indexPath).size > 100;
console.log(`[KX STATIC RECOVERY] buildId=${hash}`);
console.log(`[KX STATIC RECOVERY] out/index.html=${ok}`);
console.log(`[KX STATIC RECOVERY] out/404.html=${fs.existsSync(path.join(outDir, '404.html'))}`);
if (!ok) process.exit(1);
