"""Build isolated browser bundles for QA only; never used by the application.
No browser policies or network restrictions are changed.
"""
from pathlib import Path
import json,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/offline'
OUT.mkdir(parents=True,exist_ok=True)
def bundle(entries,integrated=False):
 seen={};order=[]
 def visit(rel):
  if rel in seen:return
  src=(ROOT/rel).read_text(encoding='utf-8');seen[rel]=src
  for m in re.finditer(r"import\s+\{([^}]+)\}\s+from\s+['\"]([^'\"]+)['\"]\s*;",src):
   if m.group(2).startswith('node:'):continue
   dep=((ROOT/rel).parent/m.group(2)).resolve().relative_to(ROOT).as_posix();visit(dep)
  order.append(rel)
 for e in entries:visit(e)
 chunks=["window.QAModules={};"]
 for rel in order:
  src=seen[rel]
  def replace(m):
   if m.group(2)=='node:crypto':return "const randomUUID=()=>globalThis.__randomUUID();"
   dep=((ROOT/rel).parent/m.group(2)).resolve().relative_to(ROOT).as_posix()
   names=re.sub(r'\s+as\s+',':',m.group(1))
   return f"const {{{names}}}=QAModules[{json.dumps(dep)}];"
  src=re.sub(r"import\s+\{([^}]+)\}\s+from\s+['\"]([^'\"]+)['\"]\s*;",replace,src)
  names=re.findall(r"export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)",src)
  src=re.sub(r"\bexport\s+(?=const|let|var|function|class)","",src)
  if integrated and rel=='client/main.js':
   src=src.replace("bootstrap();","""window.__ui={
     renderer,openPanel,profileChanged,closeModal,
     inject(p,s,n){net=n;state=s;lastStateAt=performance.now();beginGame(p,true);renderer.setState(s);},
     refresh(p,s){state=s;lastStateAt=performance.now();profileChanged(p);renderer.setState(s);},
     death(d){openPanel('deathSummary',d);},
     receive(event,data){
      if(event==='storyView')openPanel('story',data);
      if(event==='atlasScene')openPanel('atlasScene',data);
      if(event==='jobBook'){jobBookData=data;if(modal==='jobs')refreshPanel();}
     },
     config:()=>config
    };bootstrap();""")
   src=src.replace("const renderer=new Renderer($('world')),sound=new Sound();","""Renderer.prototype.load=async function(){this.atlas=await new Promise(resolve=>{const im=new Image();im.onload=()=>resolve(im);im.src=art['atlas.png'];});this.meta=atlasMeta;};
     const renderer=new Renderer($('world')),sound=new Sound();""")
  chunks.append(f"QAModules[{json.dumps(rel)}]=(()=>{{\n{src}\nreturn {{{','.join(names)}}};}})();")
 return '\n'.join(chunks)
(OUT/'bundle.js').write_text(bundle(['client/render.js','client/rpg-ui.js','client/expansion-ui.js']),encoding='utf-8')
(OUT/'ui-bundle.js').write_text(bundle(['server/game.js','client/main.js'],True),encoding='utf-8')
subprocess.run(['node','tests/visual-fixtures.mjs',str(OUT/'fixtures.json')],cwd=ROOT,check=True)
print('Offline fixtures ready:',OUT)
