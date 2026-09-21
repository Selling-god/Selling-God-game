"""Optional Chromium UI regression checks (requires Python Playwright).
The harness renders the supplied HTML in memory and uses the real local HTTP API.
It does NOT certify deployed navigation, SSE reconnection, browser persistence or Supabase.
"""
import argparse, json, os, socket, subprocess, tempfile, time, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument("--chromium",default=None)
parser.add_argument("--output",default="qa-v8-output")
args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(args.output).resolve();OUT.mkdir(parents=True,exist_ok=True)
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));PORT=sock.getsockname()[1]
os.environ['FUSEWILD_QA_BASE']=f'http://127.0.0.1:{PORT}'
from browser_harness import load_game

checks=[];views=[];errors=[]
def check(value,label):
    checks.append({'label':label,'passed':bool(value)})
    if not value:
        try:
            page.screenshot(path=str(OUT/'failure.png'),full_page=True)
            (OUT/'failure-state.json').write_text(json.dumps(page.evaluate('({state:__qa.state,current:document.body.innerText})'),ensure_ascii=False,default=str),encoding='utf8')
        except Exception: pass
    assert value,label
CREATE="""async()=>{
const s=__qa.state,u={profileId:s.profileId,nickname:'UI QA'};
const post=async(p,b={})=>(await(await fetch(p,{method:'POST',body:JSON.stringify({...u,...b})})).json()).room;
let r=await post('/api/rooms/create',{name:'V8 browser QA',mode:'dungeon',difficulty:'normal'});
r=await post(`/api/room/${r.id}/start`);
r=await post(`/api/room/${r.id}/contract`,{contractId:r.contractOffers[s.profileId][0].id});
r=await post(`/api/room/${r.id}/vote`,{nodeId:r.route[0].id});
s.room=r;s.roomId=r.id;s.lastFxSeq=r.seq;__qa.renderRoom();return r;
}"""
MEASURE="""()=>{
const rect=e=>{let r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
const isShown=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
const imgs=[...document.querySelectorAll('.fw-battle .mon-sprite-v52>img:not(.fusion-ghost-v40),.fw-battle .enemy-sprite-v52>img,.fw-gacha .monster-pull-art-v80>img,.fw-prep-art>img,.fw-reward .reward-art-v71>img')].filter(isShown);
return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,
images:imgs.map(e=>({loaded:e.complete&&e.naturalWidth>0,rect:rect(e),parent:rect(e.parentElement),fit:getComputedStyle(e).objectFit})),
arena:document.querySelector('.fw-arena')?rect(document.querySelector('.fw-arena')):null,
command:document.querySelector('.fw-command')?rect(document.querySelector('.fw-command')):null,
moves:[...document.querySelectorAll('.fw-move')].filter(isShown).map(rect)};
}"""
try:
 with tempfile.TemporaryDirectory(prefix='fw-v8-browser-') as td:
  env={**os.environ,'PORT':str(PORT),'PROFILE_FILE':str(Path(td)/'profiles.json'),'TEST_MODE':'1','SUPABASE_URL':'','SUPABASE_SECRET_KEY':'','SUPABASE_SERVICE_ROLE_KEY':''}
  log=open(OUT/'server.log','w')
  process=subprocess.Popen(['node','server.js'],cwd=ROOT,env=env,stdout=log,stderr=log)
  try:
   import urllib.request
   for _ in range(100):
    try:
     urllib.request.urlopen(os.environ['FUSEWILD_QA_BASE']+'/healthz',timeout=1);break
    except Exception:time.sleep(.06)
   with sync_playwright() as p:
    opts={'args':['--no-sandbox']}
    if args.chromium:opts['executable_path']=args.chromium
    browser=p.chromium.launch(**opts)
    page=browser.new_page(viewport={'width':1440,'height':960})
    page.on('pageerror',lambda e:errors.append(str(e)))
    load_game(page,profile='v8-ui-qa',extra_state={'riftdeck.fx':'off'})

    def scan(name,script):
     page.evaluate(script)
     for w,h in [(320,740),(390,844),(768,1024),(844,390),(1366,768),(1440,960),(1920,1080)]:
      page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(90)
      page.evaluate('window.scrollTo(0,0)')
      m=page.evaluate(MEASURE);views.append({'screen':name,'viewport':[w,h],'measure':m})
      check(m['scrollWidth']<=w+1,f'{name} {w}: no horizontal overflow')
      for i,img in enumerate(m['images']):
       check(img['loaded'],f'{name} {w}: sprite {i} loaded')
       # Object-fit contains art; its element box must fit the art container.
       check(img['rect']['w']<=img['parent']['w']+2 and img['rect']['h']<=img['parent']['h']+2,
             f'{name} {w}: sprite {i} contained')
      if m['arena'] and m['command']:
       check(m['command']['y']>=m['arena']['bottom']-1,f'{name} {w}: commands do not cover arena')
       for img in m['images']:
        check(img['rect']['bottom']<=m['arena']['bottom']+2,f'{name} {w}: sprite stays within arena')
      if name in ['home','battle','moves','double','reward','prep','gacha'] and w in [390,1440]:
       page.screenshot(path=str(OUT/f'{name}_{w}.png'),full_page=True)

    scan('home','__qa.renderHome()')
    page.locator('[data-action="fw-guide"]').first.click()
    check(page.locator('[role="dialog"]').count()==1,'guide opens accessible modal')
    check(page.locator('#app').get_attribute('inert') is not None,'background inert during modal')
    page.keyboard.press('Escape')
    check(page.locator('[role="dialog"]').count()==0,'Escape closes modal')
    check(page.locator('#app').get_attribute('inert') is None,'background active after modal')
    scan('prep','__qa.renderExpeditionPrep("manage",true)')
    page.locator('#fw-party-search').fill('\ubc88\uac1c')
    check(page.locator('[data-prep-search]:visible').count()==1,'party search by element')
    check(page.locator('#fw-party-search').input_value()=='\ubc88\uac1c','search preserves input')
    page.locator('#fw-party-search').fill('no-such-monster')
    check(page.locator('.fw-prep-noresults').is_visible(),'empty search message')
    page.locator('#fw-party-search').fill('')
    page.locator('.fw-prep-mon').first.click()
    check(page.evaluate('__qa.state.monsterDraft.length')==2,'party remove')
    page.locator('.fw-prep-mon').first.click()
    check(page.evaluate('__qa.state.monsterDraft.length')==3,'party add')
    page.locator('[data-action="prep-start"]').click()
    page.wait_for_timeout(400)
    check(page.evaluate('__qa.state.profile.monsterParty.length')==3,'party saved via server')
    page.set_viewport_size({'width':390,'height':844})
    toast=page.locator('.toast').last
    check(toast.is_visible(),'save confirmation toast visible')
    toast_box=toast.bounding_box()
    check(toast_box['height']<140,'short toast does not stretch over the battlefield')
    check(toast_box['x']>=0 and toast_box['x']+toast_box['width']<=390,'toast fits mobile viewport')
    check(page.locator('.toast-root').evaluate('(e)=>getComputedStyle(e).pointerEvents')=='none','toast does not intercept combat controls')
    page.wait_for_timeout(3400)
    room=page.evaluate(CREATE)
    check(room['status']=='battle','battle created through HTTP')
    original=page.evaluate('JSON.parse(JSON.stringify(__qa.state.room))')
    scan('battle','__qa.state.battleMenu="root";__qa.renderBattle(__qa.state.room)')
    scan('moves','__qa.state.battleMenu="moves";__qa.renderBattle(__qa.state.room)')
    page.evaluate("""()=>{const s=__qa.state,r=JSON.parse(JSON.stringify(s.room)),pc=r.battle.party[0];
    const second=pc.bench.shift();pc.units.push(second);r.battle.battleMode='double';
    r.battle.enemies.push({...r.battle.enemies[0],uid:r.battle.enemies[0].uid+'-double',name:'QA second opponent'});
    s.room=r;s.battleMenu='moves';__qa.renderBattle(r)}""")
    scan('double','__qa.renderBattle(__qa.state.room)')
    page.evaluate('(r)=>{__qa.state.room=r;__qa.state.battleMenu="moves";__qa.renderBattle(r)}',original)
    page.set_viewport_size({'width':390,'height':844})
    page.locator('[data-action="fw-settings"]').click()
    seq=page.evaluate('__qa.state.room.seq')
    page.keyboard.press('1');page.wait_for_timeout(100)
    check(page.evaluate('__qa.state.room.seq')==seq,'modal blocks numeric battle shortcut')
    page.locator('[data-setting="reduceMotion"]').click()
    check(page.evaluate('__qa.state.reduceMotion')==True,'reduced motion setting applied')
    check(page.evaluate('localStorage.getItem("fusewild.reduceMotion")')=='on','motion setting written to storage')
    page.locator('[data-setting="largeText"]').click()
    check(page.locator('body').get_attribute('data-fw-text')=='large','large text applied')
    page.locator('[data-action="fw-speed"][data-speed="slow"]').click()
    check(page.evaluate('__qa.state.battleSpeed')=='slow','battle speed setting applied')
    page.screenshot(path=str(OUT/'settings_390.png'),full_page=True)
    page.locator('.fw-wide').focus();page.keyboard.press('Tab')
    check(page.evaluate('document.activeElement.classList.contains("fw-modal-close")'),'modal Tab wraps focus')
    page.keyboard.press('Escape')
    check(page.locator('[role="dialog"]').count()==0,'settings close')
    page.evaluate('()=>{__qa.state.reduceMotion=false;__qa.state.largeText=false;document.body.classList.remove("fw-reduce-motion");document.body.dataset.fwText="normal";__qa.state.fx=true;__qa.state.battleSpeed="fast"}')
    # A real attack through the DOM with the original FX pipeline enabled.
    page.locator('[data-action="move-use"]:not(:disabled)').first.click()
    page.wait_for_function('(s)=>__qa.state.room.seq>s',arg=seq,timeout=15000)
    page.wait_for_timeout(4200)
    check(page.evaluate('__qa.state.room.feed.some(e=>e.type==="monster-move")'),'DOM move reached authoritative server')
    check(not errors,'no client exception during live FX')
    # Guard against out-of-order event stream snapshots (stream itself is stubbed here).
    before=page.evaluate('__qa.state.room.seq')
    page.evaluate('()=>{const s=__qa.state,old=JSON.parse(JSON.stringify(s.room));old.seq-=10;old.floor=999;__qa.acceptRoomUpdate(old)}')
    check(page.evaluate('__qa.state.room.seq')==before and page.evaluate('__qa.state.room.floor')!=999,'stale snapshots ignored')
    page.evaluate("""async()=>{const s=__qa.state;s.fx=false;const d=await(await fetch(`/api/room/${s.roomId}/debug-win`,{method:'POST',body:JSON.stringify({profileId:s.profileId})})).json();s.room=d.room;s.lastFxSeq=d.room.seq;__qa.renderRoom()}""")
    scan('reward','__qa.renderReward(__qa.state.room)')
    page.locator('[data-action="reward-pick"]').first.click()
    check(page.locator('.reward-equip-modal-v82').is_visible(),'held reward opens target picker')
    page.locator('[data-action="reward-equip-target"]:not(:disabled)').first.click()
    page.wait_for_function('()=>!!__qa.state.room.reward?.claims?.[__qa.state.profileId]',timeout=15000)
    page.wait_for_timeout(5700)
    check(page.evaluate('__qa.state.room.status')=='reward','reward does not auto-advance after 5.2 seconds')
    check(page.locator('[data-action="reward-continue"]').is_visible(),'explicit continue button')
    page.locator('[data-action="reward-continue"]').click();page.wait_for_timeout(500)
    check(page.evaluate('__qa.state.room.floor')>=2,'continue advances encounter')
    scan('gacha','__qa.renderGacha()')
    # Only a generated QA guest account is used; these are local game coins.
    coins=page.evaluate('__qa.state.profile.coins')
    page.locator('[data-action="monster-pickup-pull"][data-count="1"]').click()
    page.wait_for_timeout(1900)
    check(page.evaluate('__qa.state.profile.coins')==coins-5000,'single summon charged once')
    check(page.locator('.monster-pull-card-v80').count()>=1,'summon result displayed')
    if page.locator('[role="dialog"]').count():page.keyboard.press('Escape')
    check(not errors,'no uncaught browser errors')
    browser.close()
  finally:
   process.terminate()
   try:process.wait(timeout=5)
   except subprocess.TimeoutExpired:process.kill()
   log.close()
 result={'status':'PASS','views':views,'checks':checks,'pageErrors':errors,'harness':'in-memory Chromium DOM + local HTTP; SSE/storage test doubles'}
 (OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
 print(f'V8_BROWSER_OK views={len(views)} checks={len(checks)} pageErrors={len(errors)}')
except Exception as exc:
 (OUT/'results.json').write_text(json.dumps({'status':'FAIL','error':str(exc),'views':views,'checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf8')
 traceback.print_exc()
 raise SystemExit(1)
