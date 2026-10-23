export class Auth {
  constructor(config){
    this.url=config.supabaseUrl;this.key=config.supabaseKey;this.session=null;this.refreshing=null;
    try{this.session=JSON.parse(localStorage.getItem('starfall.session')||'null');}catch{}
    this.changed=()=>{};
  }
  async request(endpoint,body,method='POST',token){
    const headers={apikey:this.key,'Content-Type':'application/json'};
    if(token)headers.Authorization=`Bearer ${token}`;
    let res;
    try{res=await fetch(this.url+'/auth/v1'+endpoint,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}
    catch{throw new Error('인증 서버에 연결하지 못했습니다. 네트워크 또는 Supabase 프로젝트 상태를 확인해 주세요.');}
    const data=await res.json().catch(()=>({}));
    if(!res.ok){
      const msg=data.msg||data.message||data.error_description||data.error||'인증에 실패했습니다.';
      const ko=msg.includes('Invalid login')?'이메일 또는 비밀번호를 확인해 주세요.':msg.includes('Email not confirmed')?'인증 이메일의 링크를 먼저 눌러주세요.':msg.includes('Anonymous sign-ins are disabled')?'빠른 시작을 사용하려면 Supabase에서 Anonymous Sign-Ins를 켜주세요. 이메일 회원가입도 가능합니다.':msg.includes('rate limit')?'인증 요청이 많습니다. 잠시 후 다시 시도해 주세요.':msg;
      throw new Error(ko);
    }
    return data;
  }
  setSession(data){
    if(!data?.access_token)return;
    this.session={...data,expires_at:data.expires_at||Math.floor(Date.now()/1000)+(data.expires_in||3600)};
    try{localStorage.setItem('starfall.session',JSON.stringify(this.session));}catch{}
    this.changed(this.session);return this.session;
  }
  async captureRedirect(){
    const p=new URLSearchParams(location.hash.slice(1));
    if(p.get('error_description'))throw new Error(p.get('error_description'));
    if(!p.get('access_token'))return null;
    const token=p.get('access_token'),user=await this.request('/user',undefined,'GET',token);
    this.setSession({access_token:token,refresh_token:p.get('refresh_token'),expires_in:Number(p.get('expires_in')||3600),user});
    history.replaceState(null,'',location.pathname);
    return p.get('type')||'verified';
  }
  async getSession(){
    if(!this.session)return null;
    if(this.session.expires_at*1000-Date.now()>90000)return this.session;
    if(this.refreshing)return this.refreshing;
    const refresh=async()=>{
      let stored;try{stored=JSON.parse(localStorage.getItem('starfall.session')||'null');}catch{}
      if(stored?.user?.id===this.session?.user?.id&&stored.expires_at*1000-Date.now()>90000){this.session=stored;return stored;}
      const token=stored?.user?.id===this.session?.user?.id?stored.refresh_token:this.session.refresh_token;
      const data=await this.request('/token?grant_type=refresh_token',{refresh_token:token});
      return this.setSession(data);
    };
    this.refreshing=(navigator.locks?navigator.locks.request('starfall-auth-refresh',refresh):refresh()).finally(()=>{this.refreshing=null;});
    return this.refreshing;
  }
  async anonymous(){return this.setSession(await this.request('/signup',{data:{game:'starfall'}}));}
  async login(email,password){return this.setSession(await this.request('/token?grant_type=password',{email,password}));}
  async signup(email,password){
    const data=await this.request('/signup?redirect_to='+encodeURIComponent(location.origin),{email,password});
    if(data.access_token)this.setSession(data);return data;
  }
  async linkEmail(email){
    const s=await this.getSession();
    const user=await this.request('/user?redirect_to='+encodeURIComponent(location.origin),{email},'PUT',s.access_token);
    this.session.user=user;this.setSession(this.session);return user;
  }
  async setPassword(password){
    const s=await this.getSession(),user=await this.request('/user',{password},'PUT',s.access_token);
    this.session.user=user;this.setSession(this.session);return user;
  }
  async recover(email){return this.request('/recover?redirect_to='+encodeURIComponent(location.origin),{email});}
  async logout(){
    const token=this.session?.access_token;
    this.session=null;localStorage.removeItem('starfall.session');
    if(token)await this.request('/logout?scope=local',{},'POST',token).catch(()=>{});
  }
}
export class Network {
  constructor(authProvider){
    this.authProvider=authProvider;this.handlers=new Map();this.pending=new Map();this.seq=0;
    this.connected=false;this.stopped=false;this.attempts=0;this.bytes=0;this.ws=null;this.timer=null;
  }
  on(event,fn){if(!this.handlers.has(event))this.handlers.set(event,[]);this.handlers.get(event).push(fn);return this;}
  dispatch(event,data){for(const f of this.handlers.get(event)||[])try{f(data);}catch(e){console.error(event,e);}}
  async connect(){
    if(this.stopped)return;
    try{
      const auth=await this.authProvider();
      const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/socket`);
      this.ws=ws;
      ws.onopen=()=>ws.send(JSON.stringify({event:'auth',data:auth}));
      ws.onmessage=ev=>{
        this.bytes+=typeof ev.data==='string'?ev.data.length:0;
        let msg;try{msg=JSON.parse(ev.data);}catch{return;}
        if(msg.ack!==undefined){
          const p=this.pending.get(msg.ack);if(p){clearTimeout(p.timer);p.resolve(msg.data);this.pending.delete(msg.ack);}return;
        }
        if(msg.event==='connected'){this.connected=true;this.attempts=0;this.dispatch('connect',msg.data);}
        else if(msg.event==='connect_error'){this.dispatch('connect_error',msg.data);this.stopped=true;}
        else this.dispatch(msg.event,msg.data);
      };
      ws.onclose=ev=>{
        if(this.ws!==ws)return;
        this.connected=false;
        for(const p of this.pending.values()){clearTimeout(p.timer);p.resolve({ok:false,quiet:true,error:'연결이 끊어졌습니다.'});}
        this.pending.clear();this.dispatch('disconnect',{code:ev.code});
        if(!this.stopped){
          const delay=Math.min(8000,600*2**Math.min(this.attempts++,4))+Math.random()*200;
          clearTimeout(this.timer);this.timer=setTimeout(()=>this.connect(),delay);
        }
      };
      ws.onerror=()=>{};
    }catch(e){this.dispatch('connect_error',{message:e.message});}
  }
  emit(event,data,ack=true){
    if(!this.connected||this.ws?.readyState!==WebSocket.OPEN)return Promise.resolve({ok:false,quiet:true});
    if(!ack){if(this.ws.bufferedAmount<64000)this.ws.send(JSON.stringify({event,data}));return Promise.resolve({ok:true});}
    const id=++this.seq;
    return new Promise(resolve=>{
      const timer=setTimeout(()=>{this.pending.delete(id);resolve({ok:false,error:'응답이 지연되고 있습니다. 현재 상태를 확인한 뒤 다시 시도해 주세요.'});},8000);
      this.pending.set(id,{resolve,timer});this.ws.send(JSON.stringify({event,data,id}));
    });
  }
  action(data){return this.emit('action',{...data,nonce:crypto.randomUUID()});}
  disconnect(){this.stopped=true;clearTimeout(this.timer);this.ws?.close();}
}
