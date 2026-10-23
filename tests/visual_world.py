"""Opt-in local visual QA. Writes separate development-only fixture characters.
Never run against a production server or with real-account data.
"""
import asyncio, json, os, subprocess, uuid, time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('QA_DIR','test-results/world'));OUT.mkdir(parents=True,exist_ok=True)
async def main():
    ids=[str(uuid.uuid4()) for _ in range(3)]
    js=r"""
    import fs from 'node:fs';
    import {newCharacter} from './server/game.js';
    import {getStats,ITEMS} from './shared/content.js';
    const ids=JSON.parse(process.env.FIXTURE_IDS);
    const specs=[
      {name:'달빛을찾는자',classId:'mage',zone:'ruins',x:46*32+16,y:15*32+150,level:9},
      {name:'새벽의수호자',classId:'guardian',zone:'citadel',x:28*32+16,y:13*32+175,level:13},
      {name:'숲의여행자',classId:'ranger',zone:'forest',x:30*32+16,y:37*32+16,level:3}
    ];
    fs.mkdirSync('.local-data',{recursive:true});
    specs.forEach((s,i)=>{
      const p=Object.assign(newCharacter(ids[i],s.name,s.classId),s);
      p.gold=900;p.inventory.potion=50;p.inventory.mana=40;
      p.equipment.weapon=s.classId==='mage'?'star_staff':s.classId==='guardian'?'dawn_sword':'moon_bow';
      p.inventory[p.equipment.weapon]=1;
      p.equipment.armor=i===2?'leather':'moon_robe';p.inventory[p.equipment.armor]=1;
      p.hp=getStats(p).maxHp;p.mp=getStats(p).maxMp;
      fs.writeFileSync('.local-data/'+ids[i]+'.json',JSON.stringify(p));
    });"""
    subprocess.run(['node','--input-type=module','-e',js],cwd=ROOT,env={**os.environ,'FIXTURE_IDS':json.dumps(ids)},check=True)
    errors=[];reports=[]
    async with async_playwright() as pw:
        options={'headless':True,'args':['--no-sandbox']}
        if os.environ.get('BROWSER_EXECUTABLE'):options['executable_path']=os.environ['BROWSER_EXECUTABLE']
        browser=await pw.chromium.launch(**options)
        for i,id in enumerate(ids):
            context=await browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=1)
            await context.add_init_script("localStorage.setItem('starfall.dev-id',"+json.dumps(id)+");")
            page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto('http://127.0.0.1:3000');await page.wait_for_function("!document.getElementById('start').disabled")
            await page.click('#start');await page.wait_for_selector('#game-ui:not(.hidden)')
            await page.wait_for_timeout(4000)
            await page.keyboard.press('q');await page.keyboard.press('e')
            await page.keyboard.down(' ');await page.wait_for_timeout(900);await page.keyboard.up(' ')
            await page.screenshot(path=str(OUT/['10_moon_boss.png','11_dragon_boss.png','12_forest.png'][i]))
            fps=await page.evaluate("""()=>new Promise(resolve=>{const a=[];let last=performance.now();function f(t){a.push(t-last);last=t;if(a.length<120)requestAnimationFrame(f);else resolve({frames:a.length,averageMs:a.reduce((a,b)=>a+b)/a.length,p95Ms:[...a].sort((a,b)=>a-b)[113]});}requestAnimationFrame(f);})""")
            reports.append(fps)
            await context.close()
        await browser.close()
    (OUT/'visual-report.json').write_text(json.dumps({'errors':errors,'frameTimings':reports},indent=2))
    print(json.dumps({'errors':errors,'frameTimings':reports},indent=2))
    assert not errors
asyncio.run(main())
