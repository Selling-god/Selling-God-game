'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// Only runtime-critical files may block a Render build.
// Supabase SQL is a one-time setup aid and is intentionally OPTIONAL here:
// the running server never reads the .sql file.
const required = [
  'server.js',
  'public/index.html',
  'public/app.js',
  'public/styles.css',
  'data/catalog.json'
];

for (const rel of required) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) throw new Error(`BUILD_FAIL missing ${rel}`);
}

const optionalSetupFiles = [
  'supabase/RUN_THIS_IN_SUPABASE_RIFT_V22.sql',
  'SUPABASE_SQL_RIFT_V22.txt'
];
const hasSupabaseSetupFile = optionalSetupFiles.some((rel) => fs.existsSync(path.join(root, rel)));
if (!hasSupabaseSetupFile) {
  console.warn('BUILD_WARN Supabase SQL setup file is not committed. Build will continue because the SQL file is not required at runtime.');
}

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog.json'), 'utf8'));
if (catalog.cards.length !== 315) throw new Error(`BUILD_FAIL expected 315 cards, got ${catalog.cards.length}`);
if (catalog.items.length < 96) throw new Error(`BUILD_FAIL expected >=96 items, got ${catalog.items.length}`);
if (Object.keys(catalog.difficulties || {}).length !== 3) throw new Error('BUILD_FAIL expected 3 difficulties');

let missing = [];
for (const c of catalog.cards) {
  const p = path.join(root, c.art.replace(/^\//, ''));
  if (!fs.existsSync(p)) missing.push(c.art);
}
for (const item of catalog.items) {
  if (!item.art) continue;
  const p = path.join(root, item.art.replace(/^\//, ''));
  if (!fs.existsSync(p)) missing.push(item.art);
}
for (const b of catalog.biomes) {
  const p = path.join(root, b.background.replace(/^\//, ''));
  if (!fs.existsSync(p)) missing.push(b.background);
  if (!Array.isArray(b.scenes) || b.scenes.length < 5) throw new Error(`BUILD_FAIL expected 5 scenes for ${b.id}`);
  for (const scene of b.scenes) {
    const sp = path.join(root, scene.background.replace(/^\//, ''));
    if (!fs.existsSync(sp)) missing.push(scene.background);
  }
}
for (const e of [...catalog.enemies, ...catalog.bosses]) {
  const p = path.join(root, e.sprite.replace(/^\//, ''));
  if (!fs.existsSync(p)) missing.push(e.sprite);
}
if (missing.length) throw new Error(`BUILD_FAIL missing ${missing.length} assets: ${missing.slice(0, 5).join(', ')}`);

const info = {
  version: '3.2.0',
  deployId: 'RIFT-V3.2.0-EXPEDITION-HUNT-20260911',
  builtAt: new Date().toISOString(),
  cards: catalog.cards.length,
  items: catalog.items.length,
  enemies: catalog.enemies.length + catalog.bosses.length,
  maxDungeonFloor: 50,
  difficulties: Object.keys(catalog.difficulties),
  cloudSchema: 2,
  auth: 'supabase-auth',
  roomSnapshots: true,
  supabaseSetupFileIncluded: hasSupabaseSetupFile
};
fs.writeFileSync(path.join(root, 'public', 'build-info.json'), JSON.stringify(info, null, 2));

// Compatibility guard for accidental Render Static Site deployments.
const out = path.join(root, 'out');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify(info, null, 2));

console.log(`BUILD_OK v${info.version} deploy=${info.deployId} cards=${info.cards} items=${info.items} enemies=${info.enemies} floors=${info.maxDungeonFloor}`);
console.log(`SUPABASE_SETUP_FILE ${hasSupabaseSetupFile ? 'present' : 'optional-missing'}`);
console.log('STATIC_GUARD_OK out/index.html created (diagnostic only; game requires Node Web Service)');
