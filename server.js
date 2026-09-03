const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const root = fs.existsSync(path.join(__dirname, 'out', 'index.html')) ? path.join(__dirname, 'out') : path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
function send(res, code, type, body){res.writeHead(code, {'Content-Type':type,'Cache-Control': type.startsWith('text/html')?'no-store, max-age=0':'no-cache'});res.end(body);}
function serveFile(res,file){fs.readFile(file,(err,data)=>{if(err)return send(res,500,'text/plain; charset=utf-8','KX EXCHANGE file read error');res.writeHead(200,{'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':file.endsWith('.html')?'no-store, max-age=0':'no-cache'});res.end(data);});}
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(url.parse(req.url).pathname||'/');
  if(pathname==='/healthz') return send(res,200,'text/plain; charset=utf-8','KX_EXCHANGE_OK');
  if(pathname==='/config.js'){
    const cfg={supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL||'',supabaseAnonKey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_ANON_KEY||'',build:'KX-ZERO-NEXT-2026.09.03-E'};
    return send(res,200,'text/javascript; charset=utf-8',`window.__KX_CONFIG__=${JSON.stringify(cfg)};`);
  }
  const rel=pathname.replace(/^\/+/, '');
  const candidate=path.join(root,rel);
  if(rel && candidate.startsWith(root) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return serveFile(res,candidate);
  // IMPORTANT: every browser route falls back to the game shell. This server never returns plain "Not Found".
  return serveFile(res,path.join(root,'index.html'));
});
server.listen(port,host,()=>{console.log(`[KX] ZERO-NEXT server listening on ${host}:${port}`);console.log(`[KX] serving ${root}`);});
