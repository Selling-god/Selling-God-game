import { cp, mkdir, rm, access } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('client', 'dist/client', { recursive: true });
await cp('shared', 'dist/shared', { recursive: true });
await access('dist/assets/atlas.png');
console.log('Build ready: native ES modules, no bundler or external CDN.');
