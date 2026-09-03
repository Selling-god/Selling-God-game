const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const required = ['index.html', 'app.js', 'styles.css'];

console.log('[KX STATIC FIX] build starting');
console.log('[KX STATIC FIX] root:', root);

for (const file of required) {
  const full = path.join(publicDir, file);
  if (!fs.existsSync(full)) {
    console.error(`[KX STATIC FIX] ERROR: public/${file} is missing.`);
    console.error('[KX STATIC FIX] Keep the existing KX EXCHANGE public game files and apply this patch on top.');
    process.exit(1);
  }
}

const cfg = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  build: 'KX-STATIC-RENDER-FIX-2026.09.03-G'
};

// Make public itself deployable too, in case an old Render Publish Directory still points there.
fs.writeFileSync(path.join(publicDir, 'config.js'), `window.__KX_CONFIG__=${JSON.stringify(cfg)};\n`);

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    fs.cpSync(path.join(src, name), path.join(dest, name), { recursive: true });
  }
}

// Correct target plus common legacy publish folders.
for (const dirName of ['out', 'dist', 'build', 'site']) {
  const dest = path.join(root, dirName);
  copyDir(publicDir, dest);
  fs.writeFileSync(path.join(dest, '_redirects'), '/* /index.html 200\n');
}

// Fallback for Publish Directory "." / repository root.
for (const file of ['index.html', 'app.js', 'styles.css', 'config.js']) {
  fs.copyFileSync(path.join(publicDir, file), path.join(root, file));
}

console.log('[KX STATIC FIX] READY');
console.log('[KX STATIC FIX] out/index.html:', fs.existsSync(path.join(root, 'out', 'index.html')));
console.log('[KX STATIC FIX] public/index.html:', fs.existsSync(path.join(root, 'public', 'index.html')));
console.log('[KX STATIC FIX] root/index.html:', fs.existsSync(path.join(root, 'index.html')));
console.log('[KX STATIC FIX] build marker:', cfg.build);
