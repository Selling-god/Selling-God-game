const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const required = ['index.html', 'app.js', 'styles.css'];

console.log('[KX IMMUTABLE ASSET BUILD] starting');
for (const file of required) {
  if (!fs.existsSync(path.join(publicDir, file))) {
    console.error(`[KX IMMUTABLE ASSET BUILD] missing public/${file}`);
    process.exit(1);
  }
}

const envPayload = JSON.stringify({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
});

const fingerprint = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(publicDir, 'index.html')))
  .update(fs.readFileSync(path.join(publicDir, 'app.js')))
  .update(fs.readFileSync(path.join(publicDir, 'styles.css')))
  .update(envPayload)
  .digest('hex').slice(0, 14);

const configSource = `window.__KX_CONFIG__=${JSON.stringify({
  ...JSON.parse(envPayload),
  buildId: fingerprint
})};\n`;
fs.writeFileSync(path.join(publicDir, 'config.js'), configSource);

function copyDir(src, dest) {
  fs.rmSync(dest, {recursive:true, force:true});
  fs.mkdirSync(dest, {recursive:true});
  for (const name of fs.readdirSync(src)) {
    fs.cpSync(path.join(src,name), path.join(dest,name), {recursive:true});
  }
}

function prepareOutput(dest) {
  copyDir(publicDir, dest);
  const appName=`app.${fingerprint}.js`;
  const cssName=`styles.${fingerprint}.css`;
  const cfgName=`config.${fingerprint}.js`;
  fs.copyFileSync(path.join(publicDir,'app.js'), path.join(dest,appName));
  fs.copyFileSync(path.join(publicDir,'styles.css'), path.join(dest,cssName));
  fs.writeFileSync(path.join(dest,cfgName), configSource);
  fs.writeFileSync(path.join(dest,'version.json'), JSON.stringify({buildId:fingerprint, generatedAt:new Date().toISOString()}));

  const indexPath=path.join(dest,'index.html');
  let html=fs.readFileSync(indexPath,'utf8');
  html=html
    .replace(/(?:\/)?styles(?:\.[a-f0-9]{8,})?\.css(?:\?v=[^"']*)?/g, `/${cssName}`)
    .replace(/(?:\/)?config(?:\.[a-f0-9]{8,})?\.js(?:\?v=[^"']*)?/g, `/${cfgName}`)
    .replace(/(?:\/)?app(?:\.[a-f0-9]{8,})?\.js(?:\?v=[^"']*)?/g, `/${appName}`);
  if (!/http-equiv=["']Cache-Control/i.test(html)) {
    html=html.replace(/<head([^>]*)>/i, `<head$1>\n<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n<meta http-equiv="Pragma" content="no-cache">\n<meta http-equiv="Expires" content="0">`);
  }
  fs.writeFileSync(indexPath, html);
  fs.writeFileSync(path.join(dest,'_redirects'),'/* /index.html 200\n');
}

for (const dir of ['out','dist','build','site']) prepareOutput(path.join(root,dir));
console.log(`[KX IMMUTABLE ASSET BUILD] buildId=${fingerprint}`);
console.log('[KX IMMUTABLE ASSET BUILD] out/index.html ready');
