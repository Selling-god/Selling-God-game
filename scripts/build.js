const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'public');
const out = path.join(root, 'out');

console.log('[KX PATCH] ZERO-NEXT deploy build starting');
console.log('[KX PATCH] project root:', root);

// Remove stale Next.js build/source folders from older deployments.
// Render checks out a fresh copy on every deploy, so this affects only the build workspace.
for (const stale of ['.next', 'app', 'pages']) {
  const target = path.join(root, stale);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log('[KX PATCH] removed stale:', stale);
  }
}

if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('[KX PATCH] ERROR: public/index.html is missing.');
  console.error('[KX PATCH] This patch expects the KX EXCHANGE game files from the previous upload to already exist.');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of fs.readdirSync(src)) {
  fs.cpSync(path.join(src, name), path.join(out, name), { recursive: true });
}

const cfg = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  build: 'KX-DEPLOY-PATCH-ONLY-2026.09.03-F'
};

fs.writeFileSync(path.join(out, 'config.js'), `window.__KX_CONFIG__=${JSON.stringify(cfg)};\n`);
fs.writeFileSync(path.join(out, '_redirects'), '/* /index.html 200\n');

console.log('[KX PATCH] build complete:', out);
console.log('[KX PATCH] index exists:', fs.existsSync(path.join(out, 'index.html')));
console.log('[KX PATCH] expected Render log: KX-DEPLOY-PATCH-ONLY-2026.09.03-F');
