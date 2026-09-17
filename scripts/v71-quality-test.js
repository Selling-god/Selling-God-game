'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),cp=require('child_process'),os=require('os');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const catalog=require(path.join(root,'data','catalog.json'));
function assert(x,m){if(!x)throw Error(m)}
for(const t of ['battle-v71','afterbattle-v71','reward-copy-v71','rewardArtV71','organicMoveFxV71','data-img-fallback-v71','hasFinisher?4600']) assert(app.includes(t),`app missing ${t}`);
for(const t of ['FUSEWILD V7.1','battle-v71 .mon-status-v52','reward-card-v71','organic-move-fx-v71','@media (max-width:520px)']) assert(css.includes(t),`css missing ${t}`);
assert(css.includes('font-size:29px!important'),'desktop dialog text not enlarged');
assert(css.includes('font-size:15px!important')&&css.includes('grid-template-columns:1fr!important'),'mobile move readability missing');
assert(server.includes("const VERSION = '7.1.0'"),'server version');
assert(server.includes('FUSEWILD-V710-READABILITY-FX-REBUILD-20260917'),'deploy id');
let missing=[];for(const group of ['items','relics'])for(const x of catalog[group]||[]){const art=x.art;if(art&&art.startsWith('/assets/')){const fp=path.join(root,art.slice(1));if(!fs.existsSync(fp))missing.push(`${group}:${x.id}:${art}`)}}
assert(missing.length===0,`missing art ${missing.slice(0,4).join(',')}`);
console.log('V71_STATIC_OK rewardEffects=yes battleReadability=yes mobileMoveText=yes organicFx=yes finisherHold=yes artFallback=yes');
if(process.argv.includes('--static'))process.exit(0);
const profileFile=path.join(os.tmpdir(),`fusewild-v71-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const port=41000+(process.pid%5000);let proc;
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j={};try{j=JSON.parse(s)}catch{};if(res.statusCode>=400)return reject(Error(j.error||`HTTP ${res.statusCode}`));resolve(j)});});r.on('error',reject);body?r.end(JSON.stringify(body)):r.end();});}
async function ready(){for(let i=0;i<100;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,50))}}throw Error('server not ready')}
(async()=>{try{proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),PROFILE_FILE:profileFile,TEST_MODE:'1',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_SECRET_KEY:''},stdio:['ignore','ignore','inherit']});const hz=await ready();assert(hz.version==='7.1.0','health version');assert(hz.deployId==='FUSEWILD-V710-READABILITY-FX-REBUILD-20260917','health deploy');assert(hz.items===128,'item count');console.log('V71_RUNTIME_OK health=yes catalogArt=yes');}catch(e){console.error('V71_RUNTIME_FAIL',e.message);process.exitCode=1}finally{proc?.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
