const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'public');
const out = path.join(root, 'out');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const name of fs.readdirSync(src)) fs.cpSync(path.join(src, name), path.join(out, name), { recursive: true });
const cfg = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  build: 'KX-ZERO-NEXT-2026.09.03-E'
};
fs.writeFileSync(path.join(out, 'config.js'), `window.__KX_CONFIG__=${JSON.stringify(cfg)};\n`);
fs.writeFileSync(path.join(out, '_redirects'), '/* /index.html 200\n');
console.log('[KX] build complete:', out);
console.log('[KX] index exists:', fs.existsSync(path.join(out, 'index.html')));
