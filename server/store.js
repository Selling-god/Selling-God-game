import fs from 'node:fs/promises';
import path from 'node:path';

export class CharacterStore {
  constructor({url,key,local=false,dir='.local-data'}={}){
    this.url=(url||'').replace(/\/$/,'');this.key=key||'';
    this.online=Boolean(this.url&&this.key);this.local=local&&!this.online;
    this.dir=dir;this.queues=new Map();this.errors=0;
  }
  async request(route,{method='GET',body,token,headers={}}={}){
    const h={apikey:this.key,'Content-Type':'application/json',...headers};
    if(token)h.Authorization=`Bearer ${token}`;
    else if(this.key.startsWith('eyJ'))h.Authorization=`Bearer ${this.key}`;
    const res=await fetch(this.url+route,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    const raw=await res.text();let data;
    try{data=raw?JSON.parse(raw):null;}catch{throw new Error('저장 서버가 잘못된 응답을 보냈습니다.');}
    if(!res.ok)throw new Error(data?.message||data?.msg||data?.error_description||`저장소 오류 (${res.status})`);
    return data;
  }
  async authenticate(token){
    if(!this.online)throw new Error('온라인 저장소 설정을 확인해 주세요.');
    try{
      const user=await this.request('/auth/v1/user',{token});
      if(!user?.id)throw new Error('invalid user');return user;
    }catch{throw new Error('로그인이 만료되었거나 인증 서버에 연결하지 못했습니다. 다시 접속해 주세요.');}
  }
  async load(id){
    if(this.online){
      const rows=await this.request(`/rest/v1/starfall_characters?select=state,revision&user_id=eq.${encodeURIComponent(id)}&limit=1`);
      return rows?.[0]?{...rows[0].state,revision:rows[0].revision}:null;
    }
    if(!this.local)throw new Error('관리자가 Supabase 저장소를 먼저 설정해야 합니다.');
    try{return JSON.parse(await fs.readFile(path.join(this.dir,id+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  async nameAvailable(name,id){
    if(this.online){
      // Exact pattern: nickname validation disallows '%' and SQL wildcard injection.
      const pattern=name.replace(/_/g,'\\_');
      const rows=await this.request(`/rest/v1/starfall_characters?select=user_id&name=ilike.${encodeURIComponent(pattern)}&limit=1`);
      return !rows?.length||rows[0].user_id===id;
    }
    await fs.mkdir(this.dir,{recursive:true});
    const all=await fs.readdir(this.dir);
    for(const file of all.filter(x=>x.endsWith('.json'))){
      try{const p=JSON.parse(await fs.readFile(path.join(this.dir,file),'utf8'));if(p.name?.toLowerCase()===name.toLowerCase()&&p.id!==id)return false;}catch{}
    }
    return true;
  }
  save(state){
    const copy=JSON.parse(JSON.stringify(state)),id=copy.id;
    const previous=this.queues.get(id)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
      if(this.online){
        try{
          await this.request('/rest/v1/starfall_characters?on_conflict=user_id',{
            method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
            body:{user_id:id,name:copy.name,class_id:copy.classId,level:copy.level,state:copy,revision:copy.revision||0,updated_at:new Date().toISOString()}
          });
        }catch(e){this.errors++;throw e;}
      }else if(this.local){
        await fs.mkdir(this.dir,{recursive:true});
        const f=path.join(this.dir,id+'.json'),tmp=f+'.tmp';
        await fs.writeFile(tmp,JSON.stringify(copy));await fs.rename(tmp,f);
      }else throw new Error('저장소 미설정');
    });
    this.queues.set(id,next);
    next.finally(()=>{if(this.queues.get(id)===next)this.queues.delete(id);}).catch(()=>{});
    return next;
  }
  async leaderboard(){
    if(this.online){
      const rows=await this.request('/rest/v1/starfall_characters?select=name,class_id,level,state->kills,state->bossKills&order=level.desc&limit=30');
      return rows.map(x=>({name:x.name,classId:x.class_id,level:x.level,kills:x.kills||0,bossKills:x.bossKills||0}));
    }
    if(!this.local)return [];
    await fs.mkdir(this.dir,{recursive:true});
    const all=await fs.readdir(this.dir),out=[];
    for(const file of all.filter(x=>x.endsWith('.json'))){
      try{const p=JSON.parse(await fs.readFile(path.join(this.dir,file),'utf8'));out.push({name:p.name,classId:p.classId,level:p.level,kills:p.kills||0,bossKills:p.bossKills||0});}catch{}
    }
    return out.sort((a,b)=>b.level-a.level||b.bossKills-a.bossKills).slice(0,30);
  }
  async beginWorldEvent(id,initial){
    if(this.online){
      await this.request('/rest/v1/starfall_world_events?on_conflict=id',{
        method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:{id,state:initial}
      });
      const rows=await this.request('/rest/v1/starfall_world_events?select=state&id=eq.'+encodeURIComponent(id)+'&limit=1');
      if(!rows?.length)throw new Error('World-event ledger unavailable');
      return rows[0].state;
    }
    if(!this.local)throw new Error('World-event storage not configured');
    await fs.mkdir(path.join(this.dir,'events'),{recursive:true});
    const f=path.join(this.dir,'events',id.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json');
    try{return JSON.parse(await fs.readFile(f,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.writeFile(f,JSON.stringify(initial));return initial;
  }
  saveWorldEvent(id,state){
    const key='event:'+id,copy=structuredClone(state),previous=this.queues.get(key)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
      if(this.online)await this.request('/rest/v1/starfall_world_events?on_conflict=id',{
        method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:{id,state:copy,updated_at:new Date().toISOString()}
      });
      else if(this.local){
        const dir=path.join(this.dir,'events');await fs.mkdir(dir,{recursive:true});
        const f=path.join(dir,id.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json');await fs.writeFile(f+'.tmp',JSON.stringify(copy));await fs.rename(f+'.tmp',f);
      }
    });
    this.queues.set(key,next);next.finally(()=>{if(this.queues.get(key)===next)this.queues.delete(key);}).catch(()=>{});
    return next;
  }
  async flush(){await Promise.allSettled([...this.queues.values()]);}
}
