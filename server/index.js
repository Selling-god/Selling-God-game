import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WireServer } from './wire.js';
import { Game, newCharacter, serialize } from './game.js';
import { CharacterStore } from './store.js';
import { CLASSES, VERSION } from '../shared/content.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try{process.loadEnvFile(path.join(root,'.env'));}catch(e){if(e.code!=='ENOENT')console.warn('Check your .env file');}
const production=process.env.NODE_ENV==='production';
const url=process.env.SUPABASE_URL||'';
const anon=process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||'';
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||'';
// A server key must never be returned to the browser, even by misconfiguration.
function isSecretKey(key){
  if(key.startsWith('sb_secret_'))return true;
  try{return JSON.parse(Buffer.from(key.split('.')[1]||'','base64url').toString()).role==='service_role';}catch{return false;}
}
if(isSecretKey(anon))throw new Error('SUPABASE_ANON_KEY must be a public anon/publishable key, never a service-role/secret key.');
if(anon&&secret&&anon===secret)throw new Error('Public and server Supabase keys must be different.');
const configured=Boolean(url&&anon&&secret);
const devGuest=!production&&process.env.ALLOW_DEV_GUEST==='true'&&!configured;
const maxPlayers=Math.max(2,Math.min(100,parseInt(process.env.MAX_PLAYERS||'24',10)||24));
const snapshotHz=Math.max(2,Math.min(12,parseInt(process.env.SNAPSHOT_HZ||'10',10)||10));
const store=new CharacterStore({url:configured?url:'',key:secret,local:devGuest,dir:devGuest&&process.env.DEV_DATA_DIR?path.resolve(process.env.DEV_DATA_DIR):path.join(root,'.local-data')});
const isLocal=(ip='')=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip);
const buckets=new Map();
function limit(key,max,window=1000){
  const now=Date.now();let b=buckets.get(key);
  if(!b||now-b.at>window){b={at:now,n:0};buckets.set(key,b);}
  return ++b.n<=max;
}
setInterval(()=>{const now=Date.now();for(const[k,b]of buckets)if(now-b.at>120000)buckets.delete(k);},60000).unref();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  const wsHost=String(req.headers.host||'').replace(/[^a-zA-Z0-9.:\[\]-]/g,'');
  res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${production?'wss':'ws'}://${wsHost} https://*.supabase.co wss://*.supabase.co; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'`);
  if(production)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
    if(pathname==='/health')return json(res,200,{ok:true,version:VERSION,ready:configured||devGuest,persistence:configured?'supabase':devGuest?'local-development':'unconfigured'});
    if(pathname.startsWith('/api/')){
      const ip=production?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim():req.socket.remoteAddress;
      if(!limit('http:'+ip,90,60000))return json(res,429,{error:'요청이 너무 많습니다.'});
      if(pathname==='/api/config')return json(res,200,{version:VERSION,supabaseUrl:configured?url:'',supabaseKey:configured?anon:'',configured,devGuest:devGuest&&isLocal(req.socket.remoteAddress),maxPlayers});
      if(pathname==='/api/leaderboard')return json(res,200,await store.leaderboard());
      return json(res,404,{error:'Not found'});
    }
    const distRoot=path.join(root,'dist'),file=path.resolve(distRoot,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(distRoot+path.sep))return json(res,403,{error:'Forbidden'});
    const stat=await fsp.stat(file);
    if(!stat.isFile())return json(res,404,{error:'Not found'});
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':file.endsWith('.png')?'public, max-age=3600':'no-cache'});
    if(req.method==='HEAD')return res.end();
    fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  }catch(e){if(!res.headersSent)json(res,e.code==='ENOENT'?404:503,{error:e.code==='ENOENT'?'Not found':'서버 요청을 처리하지 못했습니다.'});else res.end();}
});
const io=new WireServer(server,{
  allowRequest:(req,cb)=>{
    const origin=req.headers.origin,host=req.headers.host;
    const allowed=process.env.PUBLIC_ORIGIN||`${production?'https':'http'}://${host}`;
    cb(null,!origin||origin===allowed||(!production&&/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)));
  }
});
const sockets=new Map(),joining=new Set(),saveTimers=new Map();
const game=new Game({
  eventStore:configured||devGuest?store:null,
  send:(id,event,data)=>sockets.get(id)?.emit(event,data),
  broadcast:(zone,event,data)=>{
    for(const [id,socket]of sockets){
      const p=game.players.get(id);if(p?.active&&(!zone||p.zone===zone))socket.emit(event,data);
    }
  }
});
async function persist(p){
  if(!p)return;
  const snapshot=serialize(p);
  try{
    await store.save(snapshot);
    if(p.revision===snapshot.revision)p.dirty=false;
    sockets.get(p.id)?.emit('saved',{at:Date.now(),revision:snapshot.revision,local:devGuest});
  }catch(err){
    p.dirty=true;console.error('Save failed:',err.message);
    sockets.get(p.id)?.emit('saveError',{message:'저장 연결이 불안정합니다. 자동으로 다시 시도합니다. 연결 상태가 회복될 때까지 창을 닫지 마세요.'});
  }
}
function scheduleSave(p){
  if(saveTimers.has(p.id))return;
  const timer=setTimeout(()=>{saveTimers.delete(p.id);persist(p);},1800);timer.unref();
  saveTimers.set(p.id,timer);
}
io.use(async(socket,next)=>{
  try{
    const clientAddress=production?String(socket.handshake.headers['x-forwarded-for']||socket.handshake.address).split(',')[0].trim():socket.handshake.address;
    if(!limit('connect:'+clientAddress,40,60000))throw new Error('접속 시도가 너무 많습니다.');
    let user;
    if(devGuest&&isLocal(socket.handshake.address)&&typeof socket.handshake.auth.devId==='string'){
      const id=socket.handshake.auth.devId;
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new Error('잘못된 개발 계정입니다.');
      user={id,is_anonymous:true};
    }else{
      if(!configured)throw new Error('관리자가 Supabase 환경변수와 데이터베이스를 먼저 연결해야 합니다.');
      const token=socket.handshake.auth.token;
      if(typeof token!=='string'||token.length>6000)throw new Error('먼저 로그인해 주세요.');
      user=await store.authenticate(token);
    }
    if(!sockets.has(user.id)&&sockets.size>=maxPlayers)throw new Error('서버가 가득 찼습니다. 잠시 뒤 다시 접속해 주세요.');
    socket.data.user=user;socket.data.authAt=Date.now();next();
  }catch(e){next(new Error(e.message||'로그인 실패'));}
});
io.on('connection',async(socket)=>{
  const id=socket.data.user.id,previous=sockets.get(id);
  if(previous&&previous.id!==socket.id){previous.emit('replaced',{message:'다른 창에서 같은 계정으로 접속했습니다.'});previous.disconnect(true);}
  sockets.set(id,socket);
  let state;
  try{
    const existing=game.players.get(id);
    if(existing){
      existing.active=true;existing.input={x:0,y:0};existing.path=[];existing.inputSeq=0;existing.motionId=(existing.motionId||0)+1;
      socket.emit('welcome',{existing:true,profile:game.privatePlayer(existing),local:devGuest});
      socket.emit('state',game.snapshot(existing,true));
    }else{
      state=await store.load(id);
      if(!socket.connected)return;
      if(state){const p=game.addPlayer(state);socket.emit('welcome',{existing:true,profile:game.privatePlayer(p),local:devGuest});socket.emit('state',game.snapshot(p,true));}
      else socket.emit('welcome',{existing:false,local:devGuest});
    }
  }catch(e){socket.emit('fatal',{message:e.message});}
  socket.on('join',async(data,ack=()=>{})=>{
    if(joining.has(id)||game.players.has(id))return ack({ok:false,error:'이미 접속 중인 캐릭터입니다.'});
    const name=String(data?.name||'').trim().normalize('NFC');
    if(!/^[\p{L}\p{N} _-]{2,14}$/u.test(name)||/^\s+$/.test(name))return ack({ok:false,error:'닉네임은 한글·영문·숫자 2~14자로 입력해 주세요.'});

    joining.add(id);
    try{
      if(!await store.nameAvailable(name,id))throw new Error('이미 사용 중인 닉네임입니다.');
      const saved=await store.load(id);
      if(saved)throw new Error('이미 생성된 캐릭터가 있습니다. 새로고침해 주세요.');
      const state=newCharacter(id,name,'novice');
      await store.save(state);
      if(!socket.connected)return;
      const p=game.addPlayer(state);
      socket.emit('welcome',{existing:true,profile:game.privatePlayer(p),local:devGuest});
      socket.emit('state',game.snapshot(p,true));
      ack({ok:true});
      game.toast(p,'별여울에 오신 것을 환영합니다. 리아에게 다가가 F로 첫 의뢰를 받아보세요.','success');
    }catch(e){ack({ok:false,error:e.message});}finally{joining.delete(id);}
  });
  socket.on('input',data=>{
    const p=game.players.get(id);
    if(p?.active&&limit('input:'+id,40))game.setInput(p,data);
  });
  socket.on('action',(data,ack=()=>{})=>{
    const p=game.players.get(id);
    if(!p?.active)return ack({ok:false,quiet:true});
    if(!limit('action:'+id,24))return ack({ok:false,quiet:true});
    if(typeof data?.nonce!=='string'||data.nonce.length>64)return ack({ok:false,error:'요청 ID가 없습니다.'});
    if(p.actions.has(data.nonce))return ack(p.actions.get(data.nonce));
    try{
      const result=game.action(p,data)||{ok:false,quiet:true};
      p.actions.set(data.nonce,result);
      while(p.actions.size>256)p.actions.delete(p.actions.keys().next().value);
      ack(result);
      if(result.ok&&['buy','sell','craft','enhance','quest','equip','title','changeJob','dailyClaim','achievement','interact','allocateStats','resetStats','recoverSoul'].includes(data.type))scheduleSave(p);
    }catch(e){console.error('Action error:',e);ack({ok:false,error:'요청을 처리하지 못했습니다.'});}
  });
  socket.on('chat',(data,ack=()=>{})=>{
    const p=game.players.get(id);
    if(!p?.active||!limit('chat:'+id,1,1100))return ack({ok:false,error:'메시지는 잠시 간격을 두고 보내주세요.'});
    const text=String(data?.text||'').replace(/[\u0000-\u001F\u007F]/g,'').trim().slice(0,160);
    if(!text)return ack({ok:false});
    const channel=['world','zone','party'].includes(data?.channel)?data.channel:'zone';
    if(channel==='party'&&!p.partyId)return ack({ok:false,error:'파티에 먼저 참여해 주세요.'});
    const message={id:crypto.randomUUID(),name:p.name,playerId:p.id,text,channel,at:Date.now()};
    for(const [otherId,s]of sockets){
      const other=game.players.get(otherId);
      if(!other?.active)continue;
      if(channel==='zone'&&other.zone!==p.zone)continue;
      if(channel==='party'&&other.partyId!==p.partyId)continue;
      s.emit('chat',message);
    }
    ack({ok:true});
  });
  socket.on('refreshAuth',async(token,ack=()=>{})=>{
    if(devGuest)return ack({ok:true});
    try{
      const user=await store.authenticate(token);if(user.id!==id)throw new Error('계정 불일치');
      socket.data.authAt=Date.now();ack({ok:true});
    }catch{ack({ok:false});socket.disconnect(true);}
  });
  socket.on('pingCheck',(_data,ack=()=>{})=>ack({t:Date.now()}));
  socket.on('save',(_data,ack=()=>{})=>{
    const p=game.players.get(id);if(!p||!limit('save:'+id,1,5000))return ack({ok:false});
    persist(p).then(()=>ack({ok:!p.dirty}));
  });
  socket.on('disconnect',()=>{
    // Ignore an old socket's disconnect after the same account has reconnected.
    if(sockets.get(id)?.id!==socket.id)return;
    sockets.delete(id);
    const p=game.players.get(id);
    if(p){p.active=false;p.input={x:0,y:0};p.path=[];p.disconnectedAt=Date.now();persist(p);}
  });
});
let last=Date.now();
const ticker=setInterval(()=>{const now=Date.now();game.tick((now-last)/1000,now);last=now;},50);
const snapshotter=setInterval(()=>{
  for(const[id,socket]of sockets){
    const p=game.players.get(id);if(!p?.active)continue;
    const full=socket.data.sentRevision!==p.revision;
    const delivered=socket.volatile.emit('state',game.snapshot(p,full));
    if(full&&delivered)socket.data.sentRevision=p.revision;
  }
},Math.round(1000/snapshotHz));
const saver=setInterval(()=>{
  for(const p of game.players.values())if(p.dirty)persist(p);
  for(const[id,p]of game.players)if(!p.active&&Date.now()-(p.disconnectedAt||0)>300000&&!p.dirty){game.leaveParty(p);game.players.delete(id);}
  for(const[id,s]of sockets)if(!devGuest&&Date.now()-s.data.authAt>3700000){s.emit('authExpired');s.disconnect(true);}
},30000);
const port=parseInt(process.env.PORT||'3000',10);
server.listen(port,'0.0.0.0',()=>{
  console.log(`Starfall Online ${VERSION} listening on ${port}; persistence=${configured?'Supabase':devGuest?'LOCAL DEVELOPMENT ONLY':'NOT CONFIGURED'}`);
  if(!configured&&!devGuest)console.error('Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. Production does not allow development guests.');
});
let closing=false;
async function shutdown(){
  if(closing)return;closing=true;
  clearInterval(ticker);clearInterval(snapshotter);clearInterval(saver);
  for(const timer of saveTimers.values())clearTimeout(timer);
  game.broadcast(null,'system',{message:'서버가 재시작됩니다. 기록을 저장하고 있으니 재접속 안내를 확인해 주세요.'});
  await Promise.allSettled([...game.players.values()].map(p=>persist(p)));
  await store.flush();io.close();server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),4000).unref();
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
