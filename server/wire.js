import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

/** Small event/ack layer over standard WebSocket; no polling or external client library. */
class Peer {
  constructor(ws,req,auth){
    this.ws=ws;this.id=randomUUID();this.data={};this.handlers=new Map();this.connected=true;
    this.handshake={auth,address:req.socket.remoteAddress,headers:req.headers};
    this.volatile={emit:(event,data)=>{if(ws.bufferedAmount<128000&&ws.readyState===WebSocket.OPEN){this.emit(event,data);return true;}return false;}};
    ws.on('message',(raw,binary)=>{
      if(binary)return ws.close(1003,'Text only');
      let m;try{m=JSON.parse(raw.toString());}catch{return ws.close(1007,'Bad JSON');}
      if(!m||typeof m.event!=='string'||m.event.length>32)return;
      const f=this.handlers.get(m.event);
      if(!f)return;
      const ack=(data)=>{if(typeof m.id==='number')this._send({ack:m.id,data});};
      try{Promise.resolve(f(m.data,ack)).catch(()=>ack({ok:false,error:'서버 처리 오류'}));}catch{ack({ok:false,error:'서버 처리 오류'});}
    });
    ws.on('close',()=>{
      if(!this.connected)return;this.connected=false;
      this.handlers.get('disconnect')?.();
    });
    ws.on('error',()=>{});
  }
  _send(m){if(this.ws.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify(m));}
  emit(event,data){this._send({event,data});}
  on(event,fn){this.handlers.set(event,fn);return this;}
  disconnect(){this.ws.close(4000,'Session closed');}
}
export class WireServer extends EventEmitter {
  constructor(server,options={}){
    super();this.middleware=null;this.peers=new Set();
    this.wss=new WebSocketServer({server,path:'/socket',maxPayload:16384,
      // Small bounded compression contexts reduce repeated snapshot bandwidth.
      perMessageDeflate:process.env.WS_COMPRESSION==='false'?false:{
        threshold:1024,serverNoContextTakeover:true,clientNoContextTakeover:true,
        concurrencyLimit:4,zlibDeflateOptions:{level:3,memLevel:7}
      },
      verifyClient:(info,cb)=>{if(options.allowRequest)options.allowRequest(info.req,(_err,ok)=>cb(ok,ok?undefined:403));else cb(true);}});
    this.wss.on('connection',(ws,req)=>{
      let authed=false;
      const timer=setTimeout(()=>ws.close(4001,'Authentication timeout'),10000);
      ws.once('message',async(raw,binary)=>{
        if(authed||binary)return;authed=true;
        try{
          const first=JSON.parse(raw.toString());
          if(first.event!=='auth')throw new Error('로그인이 필요합니다.');
          const p=new Peer(ws,req,first.data||{});
          await new Promise((resolve,reject)=>this.middleware?this.middleware(p,e=>e?reject(e):resolve()):resolve());
          clearTimeout(timer);
          if(ws.readyState!==WebSocket.OPEN)return;
          this.peers.add(p);ws.on('close',()=>this.peers.delete(p));
          p.emit('connected',{id:p.id});
          this.emit('connection',p);
        }catch(e){
          clearTimeout(timer);
          if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({event:'connect_error',data:{message:e.message}}));
          ws.close(4001,'Authentication failed');
        }
      });
      ws.isAlive=true;ws.on('pong',()=>{ws.isAlive=true;});ws.on('error',()=>{});
      ws.on('close',()=>clearTimeout(timer));
    });
    this.heartbeat=setInterval(()=>{
      for(const ws of this.wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}
    },30000);this.heartbeat.unref();
  }
  use(fn){this.middleware=fn;}
  close(){clearInterval(this.heartbeat);for(const ws of this.wss.clients)ws.close(1001,'Server restart');this.wss.close();}
}
