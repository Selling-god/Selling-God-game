'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os'),crypto=require('crypto');
const root=path.join(__dirname,'..'),profileFile=path.join(os.tmpdir(),`riftdeck-auth-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const users=new Map(),tokens=new Map();
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}});});}
function send(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(data==null?'':JSON.stringify(data));}
const mock=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://mock');
  if(u.pathname==='/rest/v1/rift_profiles'&&req.method==='GET')return send(res,200,[]);
  if(u.pathname==='/rest/v1/rift_profiles'&&req.method==='POST'){await body(req);return send(res,204,null);}
  if(u.pathname==='/rest/v1/rift_rooms'&&req.method==='GET')return send(res,200,[]);
  if(u.pathname==='/rest/v1/rift_rooms'&&req.method==='POST'){await body(req);return send(res,204,null);}
  if(u.pathname==='/rest/v1/rift_rooms'&&req.method==='DELETE')return send(res,204,null);
  if(u.pathname==='/auth/v1/admin/users'&&req.method==='POST'){
    const b=await body(req);if(users.has(b.email))return send(res,422,{message:'User already registered'});const user={id:`u_${crypto.randomBytes(6).toString('hex')}`,email:b.email,user_metadata:b.user_metadata||{}};users.set(b.email,{user,password:b.password});return send(res,200,user);
  }
  if(u.pathname==='/auth/v1/token'&&req.method==='POST'){
    const b=await body(req);if(u.searchParams.get('grant_type')==='password'){const row=users.get(b.email);if(!row||row.password!==b.password)return send(res,400,{error_description:'Invalid login credentials'});const access=`a_${crypto.randomBytes(8).toString('hex')}`,refresh=`r_${crypto.randomBytes(8).toString('hex')}`;tokens.set(access,row.user);tokens.set(refresh,row.user);return send(res,200,{access_token:access,refresh_token:refresh,expires_in:3600,user:row.user});}
    if(u.searchParams.get('grant_type')==='refresh_token'){const user=tokens.get(b.refresh_token);if(!user)return send(res,400,{message:'bad refresh'});const access=`a_${crypto.randomBytes(8).toString('hex')}`,refresh=`r_${crypto.randomBytes(8).toString('hex')}`;tokens.set(access,user);tokens.set(refresh,user);return send(res,200,{access_token:access,refresh_token:refresh,expires_in:3600,user});}
  }
  if(u.pathname==='/auth/v1/user'&&req.method==='GET'){const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const user=tokens.get(token);if(!user)return send(res,401,{message:'bad token'});return send(res,200,user);}
  send(res,404,{message:'mock route not found'});
}catch(e){send(res,500,{message:e.message});}});
function request(method,p,b,cookie=''){return new Promise((resolve,reject)=>{const headers={};if(b)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;const r=http.request({host:'127.0.0.1',port:3303,path:p,method,headers},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=s?JSON.parse(s):{}}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve({data:j,setCookie:res.headers['set-cookie']||[]});});});r.on('error',reject);r.end(b?JSON.stringify(b):undefined);});}
function cookieHeader(setCookies){return setCookies.map(x=>x.split(';')[0]).join('; ');}
async function ready(){for(let i=0;i<50;i++){try{return await request('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,80))}}throw Error('rift server not ready');}
(async()=>{let proc;try{
  await new Promise(resolve=>mock.listen(4317,'127.0.0.1',resolve));
  proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3303',PROFILE_FILE:profileFile,SUPABASE_URL:'http://127.0.0.1:4317',SUPABASE_SERVICE_ROLE_KEY:'service-key',SUPABASE_ANON_KEY:'anon-key'},stdio:['ignore','ignore','inherit']});
  const hz=(await ready()).data;if(hz.auth!=='supabase')throw Error('auth not active');
  const signup=await request('POST','/api/auth/signup',{accountId:'rift_tester',password:'secret77',nickname:'테스터',guestProfileId:'old-guest'});const cookie=cookieHeader(signup.setCookie);if(!cookie.includes('rift_access=')||!signup.data.profile.cloud)throw Error('signup cookie/cloud profile missing');
  const st=(await request('GET','/api/auth/status',null,cookie)).data;if(!st.authenticated||st.user.accountId!=='rift_tester')throw Error('session status failed');
  const cr=(await request('POST','/api/rooms/create',{profileId:'spoofed-id',nickname:'스푸프',mode:'dungeon',difficulty:'normal'},cookie)).data;if(cr.room.hostId!==signup.data.user.id)throw Error('authenticated identity was not authoritative');
  const out=await request('POST','/api/auth/logout',{},cookie);if(out.data.authenticated!==false)throw Error('logout failed');
  console.log(`AUTH_OK account=${st.user.accountId} cloud=${signup.data.profile.cloud} authoritativeId=${signup.data.user.id}`);
}catch(e){console.error('AUTH_FAIL',e);process.exitCode=1}finally{if(proc)proc.kill('SIGTERM');mock.close();try{fs.unlinkSync(profileFile)}catch{}}})();
