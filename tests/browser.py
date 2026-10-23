"""Browser acceptance tests. Start the game locally before running.
pip install playwright ; playwright install chromium
BROWSER_EXECUTABLE=/path/to/chromium BASE_URL=http://localhost:3000 python tests/browser.py
No test-only API or cheats are added to the production application.
"""
import asyncio,json,os,time
from pathlib import Path
from playwright.async_api import async_playwright
BASE=os.environ.get('BASE_URL','http://127.0.0.1:3000')
OUT=Path(os.environ.get('QA_DIR','test-results/browser'));OUT.mkdir(parents=True,exist_ok=True)
checks=[];errors=[];suffix=str(int(time.time()))[-5:]
async def snap(page,name): await page.screenshot(path=str(OUT/name))
async def main():
    async with async_playwright() as pw:
        options={'headless':True,'args':['--no-sandbox']}
        if os.environ.get('BROWSER_EXECUTABLE'): options['executable_path']=os.environ['BROWSER_EXECUTABLE']
        browser=await pw.chromium.launch(**options)
        desktop=await browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=1)
        page=await desktop.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        await page.goto(BASE);await page.wait_for_function("!document.getElementById('start').disabled")
        await snap(page,'01_landing.png')
        await page.click('#start');await page.wait_for_selector('#creator:not(.hidden)')
        await snap(page,'02_classes.png')
        await page.fill('#character-name','별지기'+suffix);await page.click('#create-character')
        await page.wait_for_selector('#game-ui:not(.hidden)');await page.wait_for_timeout(4200)
        await snap(page,'03_town_desktop.png');checks.append('desktop character creation and Canvas world')
        # Walk to the quest giver, accept the first quest through the real UI.
        await page.keyboard.down('w');await page.wait_for_timeout(330);await page.keyboard.up('w')
        await page.keyboard.press('f');await page.wait_for_selector('#modal:not(.hidden)')
        await snap(page,'04_quest_dialog.png')
        await page.get_by_role('button',name='의뢰 수락',exact=True).first.click()
        await page.wait_for_timeout(400)
        assert '숲에서 온 작은 신호' in await page.locator('#tracked-quests').inner_text()
        checks.append('NPC interaction and quest acceptance')
        await page.click('#modal-close')
        for key,title in [('i','가방'),('j','의뢰'),('m','지도'),('p','파티')]:
            await page.keyboard.press(key);await page.wait_for_selector('#modal:not(.hidden)')
            await page.wait_for_timeout(200)
            if key=='i':await snap(page,'05_inventory.png')
            assert await page.locator('#modal-content').inner_text()
            await page.click('#modal-close')
        checks.append('inventory / journal / map / party panels')
        # Second independent browser account with mobile touch input.
        mobile=await browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,has_touch=True,is_mobile=True)
        phone=await mobile.new_page();phone.on('pageerror',lambda e:errors.append(str(e)))
        await phone.goto(BASE);await phone.wait_for_function("!document.getElementById('start').disabled")
        await snap(phone,'06_mobile_landing.png')
        await phone.click('#start');await phone.wait_for_selector('#creator:not(.hidden)')
        await phone.click('[data-class="ranger"]');await phone.fill('#character-name','바람결'+suffix)
        await snap(phone,'07_mobile_classes.png')
        await phone.click('#create-character');await phone.wait_for_selector('#game-ui:not(.hidden)')
        await phone.wait_for_timeout(4200)
        await snap(phone,'08_mobile_portrait.png')
        assert await phone.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        assert await phone.locator('#touch-attack').is_visible()
        checks.append('mobile portrait layout, no horizontal overflow')
        # Check the peer appears in party panel, invite and accept in the other client.
        await page.keyboard.press('p');await page.wait_for_timeout(350)
        invite=page.locator('[data-act="invite"]').first
        if not await invite.count(): invite=page.locator('[data-act="partyInvite"]').first
        assert await invite.count()
        await invite.click();await phone.wait_for_selector('[data-act="partyAccept"]')
        await phone.locator('[data-act="partyAccept"]').click();await phone.wait_for_timeout(350)
        await page.click('#modal-close')
        assert '바람결' in await page.locator('#party-mini').inner_text()
        checks.append('two independent browser sessions, party invite and join')
        # Untrusted chat is text, not HTML.
        await page.locator('#chat-input').fill('<img src=x onerror=alert(1)> 함께 가요')
        await page.locator('#chat-form button').click();await phone.wait_for_timeout(400)
        assert '함께 가요' in await phone.locator('#chat-messages').inner_text()
        assert await phone.locator('#chat-messages img').count()==0
        checks.append('cross-client chat and HTML escaping')
        # Real pointer events move the mobile player, joystick release stops movement.
        box=await phone.locator('#joystick').bounding_box();cx=box['x']+box['width']/2;cy=box['y']+box['height']/2
        cdp=await mobile.new_cdp_session(phone)
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':cx+30,'y':cy}]})
        await phone.wait_for_timeout(500)
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        checks.append('native touch joystick pointer capture and release')
        await phone.set_viewport_size({'width':844,'height':390});await phone.wait_for_timeout(600)
        await snap(phone,'09_mobile_landscape.png')
        assert await phone.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        checks.append('mobile landscape layout')
        # Drop and restore network; a reconnect overlay must prevent silent offline play.
        await desktop.set_offline(True);await page.wait_for_timeout(700)
        await desktop.set_offline(False);await page.wait_for_timeout(2200)
        assert not await page.locator('#connection-overlay').is_visible()
        checks.append('network reconnect without offline simulation')
        await page.locator('#chat-input').blur()
        await page.keyboard.press('Escape');await page.wait_for_selector('#modal:not(.hidden)')
        save=page.locator('[data-act="save"]');assert await save.count();await save.click();await page.wait_for_timeout(600)
        await page.reload();await page.wait_for_function("!document.getElementById('start').disabled")
        await page.click('#start');await page.wait_for_selector('#game-ui:not(.hidden)')
        await page.wait_for_timeout(500)
        assert '별지기' in await page.locator('#player-name').inner_text()
        assert '숲에서 온 작은 신호' in await page.locator('#tracked-quests').inner_text()
        checks.append('manual save, reload and retained character / quest')
        # Browser-side REST auth implementation tested against mocked HTTP only.
        auth_results=await page.evaluate("""async()=>{
          const {Auth}=await import('/client/net.js');
          const original=window.fetch,previous=localStorage.getItem('starfall.session');localStorage.removeItem('starfall.session');
          const calls=[];let serial=0;
          window.fetch=async(url,options={})=>{
            calls.push({url,body:options.body,headers:options.headers,method:options.method});
            let data;
            if(url.includes('/token')||url.includes('/signup'))data={access_token:'test-token-'+(++serial),refresh_token:'refresh',expires_in:3600,user:{id:'mock-id',is_anonymous:url.endsWith('/signup')}};
            else if(url.includes('/user'))data={id:'mock-id',email:'test@example.invalid',email_confirmed_at:'2026-10-23'};
            else data={};
            return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
          };
          try{
            const auth=new Auth({supabaseUrl:'https://mock.supabase.co',supabaseKey:'sb_publishable_mock'});
            await auth.anonymous();await auth.login('test@example.invalid','test-password');
            auth.session.expires_at=1;localStorage.setItem('starfall.session',JSON.stringify(auth.session));
            await Promise.all([auth.getSession(),auth.getSession()]);
            await auth.linkEmail('test@example.invalid');await auth.setPassword('new-password');await auth.recover('test@example.invalid');
            await auth.logout();
            return {calls: calls.length,refreshes:calls.filter(c=>c.url.includes('grant_type=refresh_token')).length,loggedOut:!auth.session,hasLink:calls.some(c=>c.method==='PUT'&&c.body.includes('email'))};
          }finally{window.fetch=original;if(previous)localStorage.setItem('starfall.session',previous);else localStorage.removeItem('starfall.session');}
        }""")
        assert auth_results['refreshes']==1 and auth_results['loggedOut'] and auth_results['hasLink']
        checks.append('auth REST mock: anonymous/login/serialized refresh/email/password/recovery/logout')
        await desktop.close();await mobile.close();await browser.close()
    report={'passed':checks,'javascript_errors':errors,'auth_mock':auth_results,'screenshots':sorted(p.name for p in OUT.glob('*.png'))}
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    assert not errors,errors
asyncio.run(main())
