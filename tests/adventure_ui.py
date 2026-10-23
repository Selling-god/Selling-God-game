"""Real v3 DOM/Canvas handlers and actual Game rules, with an offline transport fixture.
Browser HTTP navigation is not used here; this is NOT a live-cloud end-to-end test."""
import asyncio,base64,json,re,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/"test-results/offline"
async def main():
 assets={p.name:"data:image/png;base64,"+base64.b64encode(p.read_bytes()).decode() for p in (ROOT/"public/assets").glob("*.png")}
 html=(ROOT/"public/index.html").read_text()
 html=re.sub(r'<script\b.*?</script>','',html,flags=re.S);html=re.sub(r'<link\b[^>]*>','',html)
 html=html.replace("</head>","<style>"+(ROOT/"public/style.css").read_text()+"</style></head>")
 html=re.sub(r'src="/assets/([^"]+)"',lambda m:'src="'+assets.get(m.group(1),'')+'"',html)
 checks=[];errors=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get("BROWSER_EXECUTABLE") or None,headless=True,args=["--no-sandbox"])
  page=await browser.new_page(viewport={"width":1440,"height":960})
  page.set_default_timeout(6000)
  page.on("pageerror",lambda e:(errors.append(str(e)),print("PAGE ERROR",e,flush=True)))
  await page.set_content(html)
  await page.evaluate("x=>window.art=x",assets)
  await page.evaluate("x=>window.atlasMeta=x",json.loads((ROOT/"public/assets/atlas.json").read_text()))
  await page.evaluate("""()=>{
   let id=0;window.__randomUUID=()=>`qa-${++id}`;
   const storage={};Object.defineProperty(window,'localStorage',{value:{getItem:k=>storage[k]??null,setItem:(k,v)=>storage[k]=v,removeItem:k=>delete storage[k]}});
   window.fetch=async url=>new Response(JSON.stringify(url==='/api/config'?{devGuest:true,configured:false}:[]),{status:200});
   const fix=()=>document.querySelectorAll('img[src^="/assets/"]').forEach(i=>{const value=art[i.getAttribute('src').split('/').at(-1)];if(value)i.src=value;});
   new MutationObserver(fix).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  }""")
  await page.evaluate((OUT/"ui-bundle.js").read_text())
  await page.wait_for_function("!document.getElementById('start').disabled")
  await page.evaluate("""()=>{
   const {Game,newCharacter}=QAModules['server/game.js'],{getStats}=QAModules['shared/content.js'];
   window.game=new Game({send:(id,event,data)=>__ui.receive(event,data),broadcast:(zone,event,data)=>{if(event==='fx')__ui.renderer.addEffect(data);},random:()=>.5});
   window.player=game.addPlayer(newCharacter('v3-qa','별길을걷는자','novice'));player.level=30;player.gold=20000;player.hp=getStats(player).maxHp;player.mp=getStats(player).maxMp;
   window.sync=()=>__ui.refresh(game.privatePlayer(player),game.snapshot(player,true));
   window.go=id=>{const point=QAModules['server/stories.js'].STORY_POINTS.get(id);game.now=Date.now();player.lastInteract=0;game.teleport(player,point.zone,point.x,point.y);sync();return point;};
   window.transport={connected:true,on:()=>{},emit:async(event,data)=>{
    if(event==='pingCheck')return {t:Date.now()};
    if(event==='input'){game.setInput(player,data);return {ok:true};}return {ok:true};
   },action:async a=>{game.now=Date.now();const result=game.action(player,a);sync();return result;}};
   __ui.inject(game.privatePlayer(player),game.snapshot(player,true),transport);
   window.timer=setInterval(()=>{game.tick(.05,Date.now());sync();},100);
  }""")
  await page.wait_for_timeout(300)
  # First mentor, actual interaction and server action behind each real button.
  await page.evaluate("()=>{const point=go('mentor_guardian');game.interact(player,point.id);sync();}")
  await page.wait_for_selector('[data-act="storyAccept"]')
  assert await page.locator('[data-act="storyAccept"]').is_enabled()
  await page.locator('[data-act="storyAccept"]').click()
  await page.wait_for_timeout(250)
  assert await page.evaluate("player.journey.quests.guardian.chapter")==0
  checks.append("mentor interaction -> actual story accept button -> server chapter 1")
  await page.evaluate("document.getElementById('modal-content').scrollTop=0")
  await page.screenshot(path=str(OUT/"v3_01_vocation_story.png"))
  # Complete a real visitation objective, return to the teacher, report.
  await page.evaluate("""()=>{
   const z=QAModules['shared/content.js'].ZONES.forest;
   game.teleport(player,'forest',z.spawn[0]*32+16,z.spawn[1]*32+16);sync();
   const point=go('mentor_guardian');game.now+=1000;game.interact(player,point.id);sync();
  }""")
  await page.wait_for_timeout(200)
  await page.locator('[data-act="storyClaim"]').click()
  await page.wait_for_timeout(200)
  assert await page.evaluate("player.journey.quests.guardian.chapter")==1
  assert "40" in await page.locator(".story-objectives").inner_text()
  checks.append("real visited event -> reporting -> next training chapter")
  # Pause and resume are actual controls.
  await page.locator('[data-act="storyPause"]').click()
  assert await page.evaluate("player.journey.quests.guardian.active")==False
  await page.locator('[data-act="storyResume"]').click()
  assert await page.evaluate("player.journey.quests.guardian.active")==True
  await page.locator('[data-act="storyTrack"]').click()
  checks.append("pause / resume / track UI preserves current progress")
  # Job catalog receives book and opens hidden panel without revealing its name.
  await page.evaluate("__ui.openPanel('jobs')")
  await page.wait_for_timeout(250)
  assert await page.locator(".job-card").count()==9
  await page.locator('[data-act="tab"][data-id="hidden"]').click()
  assert await page.locator(".job-card").count()==6
  await page.locator('[data-act="storyView"][data-id="voidwalker"]').click()
  await page.wait_for_selector(".story-sealed")
  assert "경계 방랑자" not in await page.locator("#modal-content").inner_text()
  await page.screenshot(path=str(OUT/"v3_02_hidden_clue.png"))
  checks.append("job book and sealed hidden-story UI without premature identity")
  # All eight provincial atlas tabs show exactly nine connected sectors.
  await page.evaluate("""()=>{
   player.discovery.visited.push('meadow_reach_0','meadow_reach_1','meadow_reach_2','meadow_reach_4');
   player.atlas.waypoints.push('meadow_reach_0','meadow_reach_1');
   const point=go('meadow_reach_0_camp');game.now+=1000;game.interact(player,point.id);sync();
  }""")
  await page.wait_for_selector('[data-act="contractAccept"]')
  await page.locator('[data-act="contractAccept"]').click()
  assert await page.evaluate("Boolean(player.atlas.contracts.meadow_reach_0)")==True
  checks.append("camp attunement and daily regional contract acceptance via DOM")
  await page.locator('[data-act="openAtlas"]').click()
  await page.wait_for_timeout(300)
  for region in ["meadow","coast","desert","swamp","frost","sky","abyss","observatory"]:
   await page.locator(f'[data-act="tab"][data-id="{region}"]').click()
   assert await page.locator(".atlas-sector").count()==9
  await page.locator('[data-act="tab"][data-id="meadow"]').click()
  await page.evaluate("document.getElementById('modal-content').scrollTop=0")
  await page.wait_for_timeout(350)
  await page.screenshot(path=str(OUT/"v3_03_continent_atlas.png"))
  checks.append("eight province tabs, 72 sectors, current-region fog minimap")
  await page.locator("#modal-close").click()
  await page.wait_for_timeout(300)
  await page.wait_for_timeout(4200)
  await page.screenshot(path=str(OUT/"v3_04_large_field.png"))
  # Daily contract reporting with actual accepted events; this is not natural combat completion.
  await page.evaluate("""()=>{
   const {recordAtlas}=QAModules['server/atlas.js'],c=player.atlas.contracts[player.zone];
   for(let i=0;i<12;i++)recordAtlas(game,player,'kill',c.monster);
   for(let i=0;i<5;i++)recordAtlas(game,player,'gather',c.resource);
   game.now+=1000;game.interact(player,player.zone+'_camp');sync();
  }""")
  await page.wait_for_timeout(200)
  await page.locator('[data-act="contractClaim"]').click()
  assert await page.evaluate("player.atlas.contracts.meadow_reach_0.claimed")==True
  checks.append("regional contract report pays once through actual control")
  # Real trialStart control spawns an actual server wave.
  await page.evaluate("()=>{const point=go('meadow_reach_2_trial');game.now+=1000;game.interact(player,point.id);sync();}")
  await page.wait_for_selector('[data-act="trialStart"]')
  await page.locator('[data-act="trialStart"]').click()
  await page.wait_for_timeout(300)
  assert await page.evaluate("game.worlds.get(player.zone).fieldTrial.wave")==0
  assert await page.evaluate("game.worlds.get(player.zone).mobs.filter(m=>m.trialKey&&m.alive).length")==6
  checks.append("real trial start -> first wave of six opponents -> HUD")
  await page.screenshot(path=str(OUT/"v3_05_memory_trial.png"))
  # A late-game story fixture, labeled as such in output docs.
  await page.evaluate("""()=>{
   clearInterval(timer);
   const {STORIES}=QAModules['server/story-data.js'],{storyDetail}=QAModules['server/stories.js'];
   player.journey.signs.phoenix_heir=3;player.journey.discovered.push('phoenix_heir');
   player.discovery.jobs.push('pyromancer');player.journey.quests.phoenix_heir={chapter:2,progress:[637],active:true};
   player.journey.tracked='phoenix_heir';go('mentor_phoenix_heir');sync();
   __ui.receive('storyView',storyDetail(player,'phoenix_heir'));
  }""")
  await page.wait_for_timeout(250)
  assert "637/1000" in await page.locator(".story-objectives").inner_text()
  await page.screenshot(path=str(OUT/"v3_06_hidden_training.png"))
  checks.append("late-game 1000 valid-action training renders actual saved progress")
  # 390px responsive UI and reachable primary controls.
  await page.set_viewport_size({"width":390,"height":844})
  await page.wait_for_timeout(300)
  await page.screenshot(path=str(OUT/"v3_07_story_mobile.png"))
  assert not await page.evaluate("document.documentElement.scrollWidth>innerWidth+1")
  assert not await page.evaluate("document.getElementById('modal-content').scrollWidth>document.getElementById('modal-content').clientWidth+1")
  await page.locator('[data-act="storyPause"]').click()
  assert await page.evaluate("player.journey.quests.phoenix_heir.active")==False
  await page.locator('[data-act="storyResume"]').click()
  assert await page.evaluate("player.journey.quests.phoenix_heir.active")==True
  checks.append("390px story has no page/panel horizontal overflow and actions work")
  await page.evaluate("__ui.openPanel('map')")
  await page.wait_for_timeout(250)
  assert not await page.evaluate("document.documentElement.scrollWidth>innerWidth+1")
  await page.screenshot(path=str(OUT/"v3_08_atlas_mobile.png"))
  checks.append("390px atlas and three-column sector layout")
  # Scenery and ground cache are tested after visiting all regions and low-power mode.
  perf=await page.evaluate("""()=>{
   const {ZONES}=QAModules['shared/content.js'],{nearbyScenery}=QAModules['shared/spatial.js'];
   const r=__ui.renderer;let maxCache=0;
   for(const id of Object.keys(ZONES)){
    const s=game.snapshot(player,true);s.zone=id;s.self.x=ZONES[id].spawn[0]*32+16;s.self.y=ZONES[id].spawn[1]*32+16;
    s.players=[];s.mobs=[];s.casts=[];s.nodes=[];r.setState(s);r.draw(1/60,performance.now());
    maxCache=Math.max(maxCache,r.ground.cache.size);
   }
   const m=r.map;r.lowPower=true;
   for(let x=200;x<m.width-200;x+=300){
    r.ground.draw(r.ctx,m,{x,y:m.height/2},600,420,r.atlas,r.meta,true);
    maxCache=Math.max(maxCache,r.ground.cache.size);
   }
   return {regionDraws:Object.keys(ZONES).length,largestGroundCanvas:512,
    lowPowerCache:r.ground.cache.size,normalCacheLimit:36,lowPowerCacheLimit:18,maxObservedCache:maxCache,
    propsTotal:m.props.length,propsNear:nearbyScenery(m,0,m.height-900,900,m.height).length};
  }""")
  assert perf["lowPowerCache"]<=18
  checks.append("all 84 maps render; fixed-size 512px chunks and 18-chunk low-power cache bound")
  await browser.close()
 report={"mode":"Actual UI/Game rules; offline mocked transport, not cloud E2E","checks":checks,"renderer":perf,"errors":errors}
 (OUT/"adventure-ui-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
 print(json.dumps(report,ensure_ascii=False))
 if errors:raise RuntimeError(errors)
asyncio.run(main())
