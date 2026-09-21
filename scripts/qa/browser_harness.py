# Optional UI harness: renders local HTML in memory; HTTP is real, SSE and localStorage are test doubles.
from pathlib import Path
import json, re, urllib.request, urllib.error, os
ROOT=Path(os.environ.get('FUSEWILD_ROOT',Path(__file__).resolve().parents[2]))
BASE=os.environ.get('FUSEWILD_QA_BASE','http://127.0.0.1:3010')
def api_bridge(arg):
    body=arg.get('body')
    req=urllib.request.Request(BASE+arg['path'],data=body.encode() if body else None,method=arg.get('method','GET'),headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=20) as r: return {'status':r.status,'body':r.read().decode()}
    except urllib.error.HTTPError as e: return {'status':e.code,'body':e.read().decode()}
def load_game(page, profile='qa-visual',extra_state=None):
    page.expose_function('localTestAPI',api_bridge)
    html=(ROOT/'public/index.html').read_text()
    html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S)
    html=re.sub(r'<link\b[^>]*>','',html)
    css=(ROOT/'public/styles.css').read_text()
    if (ROOT/'public/expedition.css').exists(): css+='\n'+(ROOT/'public/expedition.css').read_text()
    html=html.replace('</head>',f'<base href="{BASE}/"><style>{css}</style></head>')
    page.set_content(html)
    values={'riftdeck.guestProfileId':profile,'riftdeck.guestMode':'1','riftdeck.sound':'off'}
    values.update(extra_state or {})
    page.evaluate('''(values)=>{
        const store={...values};Object.defineProperty(window,'localStorage',{value:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]},configurable:true});
        window.fetch=async(u,o={})=>{const url=new URL(u,document.baseURI);const d=await window.localTestAPI({path:url.pathname+url.search,method:o.method||'GET',body:o.body});return {ok:d.status<400,status:d.status,json:async()=>JSON.parse(d.body),text:async()=>d.body};};
        window.EventSource=class{constructor(){this.listeners={}}addEventListener(n,f){this.listeners[n]=f}close(){}};
    }''',values)
    page.add_script_tag(content=(ROOT/'public/resonance.js').read_text())
    source=(ROOT/'public/app.js').read_text().replace('  init();','  window.__qa={state,renderRoom,renderBattle,renderReward,renderExpeditionPrep,renderGacha,renderHome,acceptRoomUpdate,fwConnectionStatus};\n  init();')
    page.add_script_tag(content=source)
    page.wait_for_selector('#app:not(.hidden)',timeout=10000)
    page.wait_for_timeout(450)
