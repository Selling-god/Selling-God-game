
"""Offline Canvas/UI QA. No URL navigation, HTTP requests, or browser policy changes.
Uses real local game renderer/modules and deterministic server snapshots.
Not a live browser/network end-to-end test.
"""
import asyncio,base64,json,re,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/offline'
def image(name):
 p=ROOT/'public/assets'/name
 return 'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode()
async def main():
 errors=[];results=[]
 assets={p.name:image(p.name) for p in (ROOT/'public/assets').glob('*.png')}
 html=(ROOT/'public/index.html').read_text(encoding='utf-8')
 html=re.sub(r'<script\b.*?</script>','',html,flags=re.S)
 html=re.sub(r'<link\b[^>]*>','',html)
 html=html.replace('</head>','<style>'+(ROOT/'public/style.css').read_text(encoding='utf-8')+'</style></head>')
 html=re.sub(r'src="/assets/([^"]+)"',lambda m:'src="'+assets.get(m.group(1),'')+'"',html)
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('BROWSER_EXECUTABLE') or None,headless=True,args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content(html)
  await page.evaluate((OUT/'bundle.js').read_text(encoding='utf-8'))
  await page.evaluate("x=>{window.fix=x;}",json.loads((OUT/'fixtures.json').read_text(encoding='utf-8')))
  await page.evaluate("x=>{window.art=x;}",assets)
  await page.evaluate("""async()=>{
   const {Renderer}=QAModules['client/render.js'];
   window.r=new Renderer(document.getElementById('world'));
   r.meta=JSON.parse(atob('META_BASE64'));
   r.atlas=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=art['atlas.png'];});
   document.getElementById('landing').classList.add('hidden');
   document.getElementById('creator').classList.add('hidden');
   document.getElementById('game-ui').classList.remove('hidden');
   window.replaceArt=()=>{document.querySelectorAll('img[src^="/assets/"]').forEach(i=>{i.src=art[i.getAttribute('src').split('/').at(-1)];});};
   window.showPanel=(panel)=>{
    document.getElementById('modal').classList.remove('hidden');
    document.getElementById('modal-title').textContent=panel.title;
    document.getElementById('modal-eyebrow').textContent=panel.eyebrow;
    document.getElementById('modal-content').innerHTML=panel.html;replaceArt();
   };
   window.scene=(name)=>{
    const s=structuredClone(fix[name]);s.t=Date.now();r.setState(s);
    r.camera={x:s.self.x,y:s.self.y};r.draw(1/60,performance.now());
    document.getElementById('player-name').textContent=s.self.name;
    document.getElementById('player-class').textContent='폭풍 소환사';
    document.getElementById('portrait').src=r.avatarURL(s.profile);
    document.getElementById('player-level').textContent=s.self.level;
    const zones=QAModules['shared/content.js'].ZONES;
    document.getElementById('zone-name').textContent=zones[s.zone].name;
   };
   scene('town');
  }""".replace('META_BASE64',base64.b64encode((ROOT/'public/assets/atlas.json').read_bytes()).decode()))
  await page.screenshot(path=str(OUT/'01_equipped_town.png'))
  # Every map and every spell must render without a Canvas runtime exception.
  result=await page.evaluate("""()=>{
   const {CLASSES,ITEMS,ZONES}=QAModules['shared/content.js'];
   const {drawSkillEffect}=QAModules['client/effects.js'];
   const profile=fix.profile;const before=performance.now();let spells=0,gear=0;
   for(const zone of Object.keys(ZONES)){
    const s=structuredClone(fix.town);s.zone=zone;s.t=Date.now();s.self.x=ZONES[zone].spawn[0]*32+16;s.self.y=ZONES[zone].spawn[1]*32+16;
    s.mobs=[];s.nodes=[];s.players=[];s.casts=[];r.setState(s);r.draw(1/60,performance.now());
   }
   for(const job of Object.keys(CLASSES))for(const sk of CLASSES[job].skills){
    const ev={type:sk.id==='basic'?'attack':'skill',born:0,x:600,y:400,tx:750,ty:380,angle:0,range:200,radius:90,job,skill:sk.id,classId:CLASSES[job].family||job};
    for(const t of [30,180,420,650])drawSkillEffect(r,ev,t);spells++;
   }
   for(const id of fix.gear){
    const slot=ITEMS[id].slot;
    const p={...profile,equipment:{...profile.equipment,[slot]:id},enhancements:{[id]:10}};
    for(const dir of ['s','n','e','w'])for(let f=0;f<4;f++)r.gear.draw(r,p,600,400,dir,f,1,400);gear++;
   }
   return {maps:12,spellDescriptors:spells,gearItems:gear,directionalGearDraws:gear*16,elapsedMs:Math.round(performance.now()-before)};
  }""")
  results.append(result)
  await page.evaluate("()=>{scene('meadow');document.getElementById('modal').classList.add('hidden');}")
  await page.screenshot(path=str(OUT/'02_world_boss.png'))
  await page.evaluate("()=>{scene('frost');}")
  await page.screenshot(path=str(OUT/'03_frost.png'))
  await page.evaluate("()=>{scene('observatory');}")
  await page.screenshot(path=str(OUT/'04_observatory.png'))
  await page.evaluate("""()=>{
   scene('town');showPanel(QAModules['client/rpg-ui.js'].rpgPanel('stats',{profile:fix.profile,draft:{int:4,vit:4}}));
  }""")
  await page.screenshot(path=str(OUT/'05_attributes_desktop.png'))
  assert await page.locator('[data-act="applyStats"]').is_enabled()
  await page.evaluate("()=>showPanel(QAModules['client/expansion-ui.js'].expansionPanel('jobs',{profile:fix.profile,tab:'rare',book:fix.book,events:fix.events,now:fix.now}))")
  await page.screenshot(path=str(OUT/'06_jobs_desktop.png'))
  await page.evaluate("""()=>showPanel({title:'대장장이 브란 · 강화',eyebrow:'ENHANCEMENT · MAX +10',html:QAModules['client/rpg-ui.js'].enhancementRows(fix.profile,id=>'<img src="/assets/icon_'+id+'.png">')})""")
  await page.screenshot(path=str(OUT/'07_enhancement_desktop.png'))
  await page.evaluate("()=>showPanel(QAModules['client/expansion-ui.js'].expansionPanel('events',{profile:fix.profile,events:fix.events,now:fix.now}))")
  await page.screenshot(path=str(OUT/'08_world_schedule.png'))
  await page.set_viewport_size({'width':390,'height':844})
  await page.evaluate("()=>showPanel(QAModules['client/rpg-ui.js'].rpgPanel('stats',{profile:fix.profile,draft:{int:4,vit:4}}))")
  await page.screenshot(path=str(OUT/'09_attributes_mobile.png'))
  overflow=await page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
  assert not overflow
  await page.evaluate("()=>{document.getElementById('modal').classList.add('hidden');scene('town');document.getElementById('chat').classList.add('collapsed');}")
  await page.screenshot(path=str(OUT/'10_mobile_world.png'))
  results.append({'uiPanels':4,'mobileWidth':390,'noPageOverflow':not overflow,'pageErrors':errors})
  # Isolated sprite gallery, local snapshots only.
  await page.set_viewport_size({'width':1200,'height':650})
  await page.set_content('<style>body{margin:0;background:#10232c;color:#e7d3a6;font:18px sans-serif} canvas{display:block;image-rendering:pixelated}</style><canvas id="gallery" width="1200" height="650"></canvas>')
  await page.evaluate("""()=>{
   const cv=document.getElementById('gallery'),c=cv.getContext('2d');c.imageSmoothingEnabled=false;
   c.fillStyle='#112832';c.fillRect(0,0,1200,650);c.fillStyle='#e1cfac';c.font='24px sans-serif';c.fillText('STARFALL ONLINE 2.0 · EQUIPMENT & SPELLS',35,42);
   const er=r.gear,renderer={...r,ctx:c,atlas:r.atlas,meta:r.meta};
   const sets=[['Novice','iron_sword','tunic',0],['Moon','moon_sword','leather',0],['Tempest','boss_tempest_staff','boss_tempest_armor',4],['Tide','boss_leviathan_bow','boss_leviathan_armor',7],['Glacier','boss_glacier_sword','boss_glacier_armor',10],['Eclipse','boss_eclipse_staff','boss_eclipse_armor',10]];
   sets.forEach(([label,w,a,lv],i)=>{const p={equipment:{weapon:w,armor:a,charm:'charm'},enhancements:{[w]:lv,[a]:lv},classId:'novice'};c.save();c.translate(105+i*195,240);c.scale(2,2);er.draw(renderer,p,0,0,'s',0,1,500);c.restore();c.fillStyle='#e6d1a7';c.font='16px sans-serif';c.fillText(label+' +'+lv,50+i*195,278);});
   const {drawSkillEffect}=QAModules['client/effects.js'];
   const jobs=['pyromancer','cryomancer','stormcaller','chronomancer','phoenix_heir','starweaver'];
   const fxr={...renderer,showEffects:true,glow:()=>{},sprite:()=>{}};
   jobs.forEach((job,i)=>{const x=100+i*195;c.save();c.translate(x,475);c.scale(.72,.72);drawSkillEffect(fxr,{type:'skill',born:0,x:0,y:0,tx:60,ty:0,angle:0,radius:90,range:160,job,skill:'ultimate'},350);c.restore();c.fillStyle='#c3d4cd';c.font='14px sans-serif';c.fillText(job,35+i*195,610);});
  }""")
  await page.screenshot(path=str(OUT/'11_equipment_spells.png'))
  await browser.close()
 (OUT/'report.json').write_text(json.dumps({'mode':'Offline renderer and component QA; no live browser network', 'results':results,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'results':results,'errors':errors},ensure_ascii=False))
 if errors: raise RuntimeError(errors)
asyncio.run(main())
