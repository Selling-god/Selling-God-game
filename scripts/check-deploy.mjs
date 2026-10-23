// Read-only health/config checks. Does not create accounts or change data.
const arg=process.argv[2];
if(!arg){console.error('Usage: npm run check:deploy -- https://YOUR-GAME.onrender.com');process.exit(1);}
let origin;try{origin=new URL(arg).origin;}catch{throw new Error('Provide a valid full URL.');}
async function get(route){const r=await fetch(origin+route,{signal:AbortSignal.timeout(90000)});if(!r.ok)throw new Error(`${route}: HTTP ${r.status}`);return r.json();}
try{
  const h=await get('/health'),c=await get('/api/config');
  console.log('Version:',h.version,'| persistence:',h.persistence,'| ready:',h.ready);
  if(!h.ready||!c.configured)throw new Error('Supabase is not configured. Check all three server environment variables.');
  if(c.devGuest)throw new Error('Development guest mode must not be enabled on a public service.');
  if(c.supabaseKey?.startsWith('sb_secret_'))throw new Error('A secret key is exposed. Stop the service and rotate the key.');
  try{if(JSON.parse(Buffer.from(c.supabaseKey.split('.')[1]||'','base64url')).role==='service_role')throw new Error('SERVICE_ROLE_EXPOSED');}catch(e){if(e.message==='SERVICE_ROLE_EXPOSED')throw e;}
  const ranks=await get('/api/leaderboard');if(!Array.isArray(ranks))throw new Error('Database read check failed.');
  console.log('PASS: web service, public config, and server-side database read.');
  console.log('Still verify manually: create two accounts, shared combat, save/reload, email delivery, and the database RLS setting.');
}catch(e){console.error('CHECK FAILED:',e.message);process.exitCode=1;}
