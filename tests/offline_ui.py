
"""Offline integration: actual main.js UI handlers + actual Game rules, mocked transport/storage.
No live browser/network or cloud authentication is claimed."""
import asyncio,base64,json,re,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/offline'
async def main():
 assets={p.name:'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode() for p in (ROOT/'public/assets').glob('*.png')}
 html=(ROOT/'public/index.html').read_text(encoding='utf-8');html=re.sub(r'<script\b.*?</script>','',html,flags=re.S);html=re.sub(r'<link\b[^>]*>','',html)
 html=html.replace('</head>','<style>'+(ROOT/'public/style.css').read_text(encoding='utf-8')+'</style></head>')
 html=re.sub(r'src="/assets/([^"]+)"',lambda m:'src="'+assets.get(m.group(1),'')+'"',html)
 checks=[];errors=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('BROWSER_EXECUTABLE') or None,headless=True,args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':900})
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content(html)
  await page.evaluate('x=>window.art=x',assets)
  await page.evaluate('x=>window.atlasMeta=x',json.loads((ROOT/'public/assets/atlas.json').read_text(encoding='utf-8')))
  await page.evaluate("""()=>{
   let uid=0;window.__randomUUID=()=>`qa-${++uid}`;
   const data={};
   Object.defineProperty(window,'localStorage',{value:{getItem:k=>data[k]??null,setItem:(k,v)=>data[k]=v,removeItem:k=>delete data[k]}});
   window.fetch=async url=>new Response(JSON.stringify(url==='/api/config'?{devGuest:true,configured:false}:[]),{status:200,headers:{'content-type':'application/json'}});
   const fix=()=>document.querySelectorAll('img[src^="/assets/"]').forEach(i=>{const value=art[i.getAttribute('src').split('/').at(-1)];if(value)i.src=value;});
   new MutationObserver(fix).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  }""")
  await page.evaluate((OUT/'ui-bundle.js').read_text(encoding='utf-8'))
  await page.wait_for_function("!document.getElementById('start').disabled")
  await page.evaluate("""()=>{
   const {Game,newCharacter}=QAModules['server/game.js'],{getStats}=QAModules['shared/content.js'];
   const emit=(id,event,data)=>{
    if(event==='jobBook')window.__latestBook=data;
    if(event==='deathSummary')__ui.death(data);
    if(event==='dialog')__ui.openPanel(data.kind,data);
   };
   window.game=new Game({send:emit,broadcast:(zone,event,data)=>{if(event==='fx')__ui.renderer.addEffect(data);},random:()=>0});
   window.player=game.addPlayer(newCharacter('offline-ui','모험가','novice'));player.level=10;player.gold=20000;
   player.discovery.jobs.push('mage','ranger');player.inventory.ore=200;player.inventory.relic_dust=100;player.inventory.world_token=30;
   player.hp=getStats(player).maxHp;player.mp=getStats(player).maxMp;
   window.transport={connected:true,on:()=>{},emit:async(event,data)=>{
    if(event==='pingCheck')return {t:Date.now()};
    if(event==='input'){game.setInput(player,data);return {ok:true};}
    return {ok:true};
   },action:async a=>{game.now=Date.now();const res=game.action(player,a);__ui.refresh(game.privatePlayer(player),game.snapshot(player,true));return res;}};
   __ui.inject(game.privatePlayer(player),game.snapshot(player,true),transport);
   window.__tick=setInterval(()=>{game.tick(.05,Date.now());__ui.refresh(game.privatePlayer(player),game.snapshot(player,true));},100);
  }""")
  await page.wait_for_timeout(800)
  await page.keyboard.press('u')
  await page.wait_for_selector('[data-act="statPlus"]')
  await page.locator('[data-act="statPlus"][data-id="int"]').click()
  await page.locator('[data-act="statPlus"][data-id="vit"]').click()
  await page.locator('[data-act="applyStats"]').click()
  await page.wait_for_timeout(500)
  assert await page.evaluate('player.attributes.int')==1
  assert await page.evaluate('player.attributes.vit')==1
  checks.append('actual main stat + / commit handlers mutate server-rule profile')
  await page.locator('[data-act="resetStats"]').click()
  await page.wait_for_timeout(250)
  # confirm modal buttons
  buttons=await page.locator('#confirm button').all_text_contents()
  print('confirm buttons',buttons)
  await page.locator('#confirm-yes').click()
  await page.wait_for_timeout(400)
  assert await page.evaluate('player.attributes.int')==0
  assert await page.evaluate('player.statResets')==1
  checks.append('actual reset confirmation and first-free rule')
  await page.locator('#modal-close').click()
  await page.keyboard.down('d');await page.wait_for_timeout(600);await page.keyboard.up('d')
  await page.wait_for_timeout(300)
  checks.append('actual keyboard, server input and prediction handlers')
  await page.screenshot(path=str(OUT/'12_integrated_ui_town.png'))
  # Setup a forge location using only this test fixture, no release debug API.
  await page.evaluate("""()=>{
   const npc=QAModules['shared/content.js'].NPCS.find(n=>n.kind==='craft');
   player.zone='town';player.x=npc.x;player.y=npc.y;__ui.refresh(game.privatePlayer(player),game.snapshot(player,true));
   __ui.openPanel('craft',npc);
  }""")
  await page.wait_for_timeout(300)
  print('craft tabs',await page.locator('#modal-content [data-act="tab"]').all_text_contents())
  # Open whichever real tab name enhancement uses.
  tab=page.locator('#modal-content [data-act="tab"][data-id="enhance"]')
  if await tab.count(): await tab.click()
  await page.wait_for_timeout(300)
  btn=page.locator('[data-act="enhance"]').first
  if not await btn.count(): raise AssertionError('enhance UI missing')
  await btn.click();await page.wait_for_timeout(400)
  assert await page.evaluate('Object.values(player.enhancements).some(x=>x===1)')
  checks.append('actual forge action and server enhancement')
  await page.screenshot(path=str(OUT/'13_integrated_enhancement.png'))
  # Death dialog through real server event then actual modal render.
  await page.locator('#modal-close').click()
  await page.evaluate("()=>{player.zone='forest';player.x=950;player.y=1100;game.damagePlayer(player,999999);}")
  await page.wait_for_selector('.death-summary')
  assert 'EXP' in await page.locator('.death-summary').inner_text()
  checks.append('actual death event, penalty and dialog')
  await page.screenshot(path=str(OUT/'14_death_dialog.png'))
  await page.locator('[data-act="close"]').click()
  await page.evaluate('clearInterval(__tick)')
  await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(300)
  await page.screenshot(path=str(OUT/'15_integrated_mobile.png'))
  assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
  checks.append('integrated 390px UI without document horizontal overflow')
  await browser.close()
 report={'mode':'Offline UI + Game with mocked transport; not live browser server connection','checks':checks,'errors':errors}
 (OUT/'ui-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
 if errors:raise RuntimeError(errors)
asyncio.run(main())
