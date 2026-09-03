const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = [
  path.join(root, 'app', 'api'),
  path.join(root, 'pages', 'api'),
  path.join(root, '.next'),
  path.join(root, 'out'),
];

for (const target of targets) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[KX build] removed stale path: ${path.relative(root, target)}`);
  }
}

console.log('[KX build] static-export prebuild cleanup complete');
