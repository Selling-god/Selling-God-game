const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';
const root = path.join(__dirname, 'out');

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.woff2': 'font/woff2',
  })[ext] || 'application/octet-stream';
}

function safePath(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]).replace(/\\/g, '/');
  const normalized = path.posix.normalize('/' + clean).replace(/^\/+/, '');
  if (normalized.includes('..')) return null;
  return normalized;
}

const server = http.createServer((req, res) => {
  const rel = safePath(req.url);
  if (rel === null) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad Request');
  }

  let target = path.join(root, rel || 'index.html');
  try {
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) {
      const htmlCandidate = path.join(root, rel + '.html');
      if (fs.existsSync(htmlCandidate)) target = htmlCandidate;
      else target = path.join(root, 'index.html');
    }

    if (!fs.existsSync(target)) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('KX EXCHANGE build output missing. Run npm run build first.');
    }

    res.writeHead(200, {
      'Content-Type': contentType(target),
      'Cache-Control': target.endsWith('.html') ? 'no-store, max-age=0' : 'public, max-age=31536000, immutable',
    });
    fs.createReadStream(target).pipe(res);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(port, host, () => {
  console.log(`[KX Exchange] static export server ready at http://${host}:${port}`);
  console.log(`[KX Exchange] serving ${root}`);
});
