// Region topology is shared by the server, collision queries and the renderer.
// The layouts below replace the old pond-and-crossroads ground, without moving
// progression markers or changing a saved region/resource identity.
export const SURFACES=Object.freeze({GROUND:0,PATH:1,WATER:2,WALL:3,BRIDGE:4,STAIRS:5,LAVA:6,VOID:7,ICE:8});
const S=SURFACES,T=32;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=text=>{let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const randomFor=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

const DESIGNS={
 forest:{id:'woodland-hollows',name:'숲의 굽은 골짜기',style:'woodland',barrier:S.WALL,hint:'나무 절벽 사이의 굽은 숲길과 두 갈래 고갯길을 따라 이동하세요.'},
 ruins:{id:'ruined-courts',name:'무너진 회랑과 안뜰',style:'ruins',barrier:S.WALL,hint:'안뜰을 잇는 회랑과 옆문을 이용하면 돌벽 뒤로 우회할 수 있습니다.'},
 citadel:{id:'moated-keep',name:'해자 위의 성채',style:'fortress',barrier:S.LAVA,hint:'해자를 건너 외성 회랑에 진입하고 계단을 따라 내성으로 올라가세요.'},
 meadow:{id:'ridge-meadows',name:'능선 사이의 초원',style:'meadow',barrier:S.WALL,hint:'초원을 가르는 두 능선에는 서로 다른 위치에 통과로가 있습니다.'},
 coast:{id:'tidal-archipelago',name:'물길과 징검 섬',style:'coast',barrier:S.WATER,hint:'넓은 섬과 좁은 다리를 번갈아 지나며 섬의 가장자리에서 우회로를 찾으세요.'},
 desert:{id:'serpentine-canyon',name:'굽이치는 모래 협곡',style:'desert',barrier:S.WALL,hint:'절벽을 관통하는 길은 없습니다. 굽은 협곡과 옆 골짜기를 따라가세요.'},
 swamp:{id:'marsh-boardwalks',name:'늪의 목책 순환로',style:'swamp',barrier:S.WATER,hint:'젖은 땅 사이의 나무다리는 갈라졌다가 다시 만나는 순환로입니다.'},
 frost:{id:'snow-switchbacks',name:'설원의 층계 고개',style:'frost',barrier:S.WALL,hint:'높은 눈턱은 바로 넘을 수 없습니다. 양 끝을 번갈아 잇는 계단을 이용하세요.'},
 sky:{id:'floating-ring',name:'부서진 하늘 고리',style:'sky',barrier:S.VOID,hint:'공중섬은 고리 모양으로 연결되어 있습니다. 중앙섬으로 가는 다리는 두 곳입니다.'},
 abyss:{id:'rift-banks',name:'심연을 가르는 단층',style:'abyss',barrier:S.VOID,hint:'깊은 균열 양편은 북쪽과 남쪽의 다리로만 이어집니다.'},
 observatory:{id:'orbital-ruins',name:'엇갈린 천문 회랑',style:'observatory',barrier:S.VOID,hint:'바깥 고리와 안쪽 고리의 연결 위치가 다릅니다. 회랑을 돌아 이동하세요.'},
 sunscar:{id:'quarry-terraces',name:'층층이 깎인 채석 고원',style:'sunscar',barrier:S.WALL,hint:'사각 채석장 둘레의 층계와 모서리 계단이 상하 단을 연결합니다.'},
 deepsea:{id:'flooded-locks',name:'세 수문과 침수 회랑',style:'deepsea',barrier:S.WATER,hint:'긴 수로를 가로지르는 수문다리는 번갈아 배치되어 있습니다.'},
 wildroot:{id:'root-labyrinth',name:'거목 뿌리 미로',style:'wildroot',barrier:S.WALL,hint:'뿌리 방과 갈림길이 이어집니다. 막다른 방 옆의 다른 가지를 확인하세요.'},
 clockwork:{id:'factory-blocks',name:'기계 성채의 작업동',style:'clockwork',barrier:S.WALL,hint:'작업실마다 출입구가 다릅니다. 긴 외곽 복도와 옆문을 이용하세요.'},
 stormcrown:{id:'storm-stair-isles',name:'폭풍의 부유 계단',style:'stormcrown',barrier:S.VOID,hint:'지그재그 섬 사슬과 높은 계단이 이어집니다. 옆 사슬은 돌아가는 길입니다.'},
 voidfront:{id:'fractured-ribbons',name:'찢어진 경계의 띠',style:'voidfront',barrier:S.VOID,hint:'엇갈린 두 지형 띠 사이에 놓인 연결부를 찾아 균열을 건너세요.'},
 astralforge:{id:'molten-foundry',name:'용암 수로와 제련대',style:'astralforge',barrier:S.LAVA,hint:'용암 수로를 건너 제련대를 오가며 외곽 작업로로 우회할 수 있습니다.'},
 dawnend:{id:'dawn-causeways',name:'새벽빛의 별가지 길',style:'dawnend',barrier:S.VOID,hint:'여섯 갈래 단상과 바깥 연결로가 있습니다. 가지 끝에서 다음 길을 살펴보세요.'},
 heaven:{id:'heaven-terraces',name:'천상의 매달린 정원',style:'heaven',barrier:S.VOID,hint:'구름 아래는 빈 공간입니다. 정원을 잇는 계단과 밝은 다리를 따라가세요.'},
 inferno:{id:'infernal-chainworks',name:'지옥의 사슬 용광로',style:'inferno',barrier:S.LAVA,hint:'용암 웅덩이를 둘러싼 감옥 방과 사슬다리가 서로 다른 길로 이어집니다.'},
 mirror:{id:'folded-mirror-halls',name:'뒤틀린 거울 회랑',style:'mirror',barrier:S.VOID,hint:'보이는 맞은편 길은 직접 이어지지 않습니다. 엇갈린 연결 회랑을 찾으세요.'}
};

function planner(map,zone,design){
 const {w,h}=map,sector=Number.isInteger(zone.sector)?zone.sector:0,variant=sector%9,rand=randomFor(hash(map.id));
 const blocked=new Uint8Array(w*h).fill(1),surface=new Uint8Array(w*h).fill(design.barrier),elevation=new Uint8Array(w*h).fill(design.barrier===S.WALL?4:0),features=[];
 const floor=zone.theme==='frost'&&(zone.province||zone.id)!=='clockwork'?S.ICE:S.GROUND,scale=Math.min(w,h)/44;
 const inside=(x,y)=>x>=2&&y>=2&&x<w-2&&y<h-2;
 const point=(u,v)=>{
  // Eight orientations plus a ninth branch variant. Only topology is rotated;
  // the stable portal/quest/device coordinates are attached afterwards.
  if(zone.expedition){
   if(variant&1)u=1-u;
   if(variant&2)v=1-v;
   if(variant&4)[u,v]=[v,u];
   if(variant===8){u=1-u;v=clamp(v+(u-.5)*.12,.04,.96);}
  }
  return [Math.round(u*(w-1)),Math.round(v*(h-1))];
 };
 const set=(x,y,s=floor,level=1,solid=false)=>{if(!inside(x,y))return;const i=y*w+x;blocked[i]=solid?1:0;surface[i]=s;elevation[i]=level;};
 const brush=(x,y,r=1,s=floor,level=1,solid=false)=>{
  for(let yy=Math.floor(y-r);yy<=Math.ceil(y+r);yy++)for(let xx=Math.floor(x-r);xx<=Math.ceil(x+r);xx++)if((xx-x)**2+(yy-y)**2<=(r+.45)**2)set(xx,yy,s,level,solid);
 };
 const polygon=(vertices,s=floor,level=1,solid=false)=>{
  const a=vertices.map(([u,v])=>point(u,v)),minX=Math.max(2,Math.floor(Math.min(...a.map(p=>p[0])))),maxX=Math.min(w-3,Math.ceil(Math.max(...a.map(p=>p[0])))),minY=Math.max(2,Math.floor(Math.min(...a.map(p=>p[1])))),maxY=Math.min(h-3,Math.ceil(Math.max(...a.map(p=>p[1]))));
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
   let yes=false;for(let i=0,j=a.length-1;i<a.length;j=i++){
    const [ax,ay]=a[i],[bx,by]=a[j];if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)yes=!yes;
   }
   if(yes)set(x,y,s,level,solid);
  }
 };
 const rect=(x1,y1,x2,y2,s=floor,level=1,solid=false)=>polygon([[x1,y1],[x2,y1],[x2,y2],[x1,y2]],s,level,solid);
 const room=(u,v,rx,ry,level=1,angular=false)=>{
  const n=angular?8:20,vertices=[];
  for(let i=0;i<n;i++){const a=i*Math.PI*2/n,rough=angular?1:1+.06*Math.sin(i*3+variant);vertices.push([u+Math.cos(a)*rx*rough,v+Math.sin(a)*ry*rough]);}
  polygon(vertices,floor,level);const [x,y]=point(u,v);features.push({kind:'room',x,y,w:Math.round(rx*w*2),h:Math.round(ry*h*2),level});return [x,y];
 };
 const segment=(a,b,r=1.3,level=1,kind=null)=>{
  const [ax,ay]=a,[bx,by]=b,n=Math.max(Math.abs(bx-ax),Math.abs(by-ay),1),rr=Math.max(1,Math.round(r*scale));
  for(let k=0;k<=n;k++){
   const x=Math.round(ax+(bx-ax)*k/n),y=Math.round(ay+(by-ay)*k/n);
   for(let yy=y-rr;yy<=y+rr;yy++)for(let xx=x-rr;xx<=x+rr;xx++){
    if(!inside(xx,yy))continue;const i=yy*w+xx;
    const s=kind??(blocked[i]&&[S.WATER,S.LAVA,S.VOID].includes(surface[i])?S.BRIDGE:S.PATH);
    set(xx,yy,s,level);
   }
  }
 };
 const path=(vertices,r=1.3,level=1,kind=null)=>{
  const a=vertices.map(([u,v])=>point(u,v));for(let i=1;i<a.length;i++)segment(a[i-1],a[i],r,level,kind);
  if(kind===S.BRIDGE||kind===S.STAIRS){const xs=a.map(p=>p[0]),ys=a.map(p=>p[1]);features.push({kind:kind===S.BRIDGE?'bridge':'stairs',x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs)+1,h:Math.max(...ys)-Math.min(...ys)+1,level});}
 };
 const ring=(u,v,rx,ry,thick,level=1,start=0,end=Math.PI*2)=>{
  const n=Math.ceil((end-start)*32),p=[];for(let i=0;i<=n;i++){const a=start+(end-start)*i/n;p.push([u+Math.cos(a)*rx,v+Math.sin(a)*ry]);}path(p,thick,level,floor);
 };
 const wall=(vertices,r=1.3,level=4)=>{
  const a=vertices.map(([u,v])=>point(u,v));for(let i=1;i<a.length;i++){
   const [ax,ay]=a[i-1],[bx,by]=a[i],n=Math.max(Math.abs(bx-ax),Math.abs(by-ay),1);
   for(let k=0;k<=n;k++)brush(Math.round(ax+(bx-ax)*k/n),Math.round(ay+(by-ay)*k/n),Math.max(1,r*scale),S.WALL,level,true);
  }
 };
 return {w,h,zone,design,variant,rand,scale,floor,blocked,surface,elevation,features,inside,point,set,brush,polygon,rect,room,path,ring,wall,segment};
}

function buildShape(g,key,zone){
 const {room,rect,path,ring,wall,polygon,variant}=g;
 if(zone.realmArea==='sanctum'){
  if(key==='heaven'){
   room(.50,.33,.20,.23,4,true);room(.21,.67,.14,.11,2,true);room(.79,.67,.14,.11,3,true);
   room(.50,.85,.14,.08,1,true);
   path([[.50,.85],[.32,.78],[.21,.67],[.28,.49],[.37,.42]],1.15,2,S.STAIRS);
   path([[.50,.85],[.70,.79],[.79,.67],[.72,.49],[.63,.42]],1.15,3,S.STAIRS);
   wall([[.40,.25],[.40,.35]],.65,4);wall([[.60,.25],[.60,.35]],.65,4);
   return;
  }
  if(key==='inferno'){
   rect(.32,.10,.68,.53,g.floor,3);
   for(const [u,v]of [[.15,.24],[.85,.24],[.16,.68],[.84,.68]])room(u,v,.09,.12,1,true);
   rect(.34,.78,.65,.92,g.floor,2);
   path([[.15,.24],[.35,.28]],1,2,S.BRIDGE);path([[.65,.28],[.85,.24]],1,2,S.BRIDGE);
   path([[.16,.68],[.34,.61],[.42,.49]],1,2,S.STAIRS);path([[.84,.68],[.69,.57],[.60,.49]],1,2,S.STAIRS);
   path([[.16,.68],[.22,.84],[.49,.85],[.78,.84],[.84,.68]],1.05,1,S.BRIDGE);
   return;
  }
  if(key==='mirror'){
   room(.50,.34,.21,.24,3,true);
   rect(.12,.56,.37,.69,g.floor,1);rect(.65,.58,.89,.72,g.floor,2);rect(.34,.81,.67,.92,g.floor,1);
   path([[.25,.63],[.25,.43],[.35,.34]],1,2,S.BRIDGE);
   path([[.76,.65],[.82,.46],[.65,.34]],1,3,S.BRIDGE);
   path([[.25,.63],[.17,.78],[.42,.87]],1,1,S.STAIRS);path([[.76,.65],[.76,.87],[.60,.87]],1,2,S.STAIRS);
   rect(.45,.43,.51,.52,S.VOID,0,true);rect(.54,.11,.61,.21,S.VOID,0,true);
   return;
  }
 }
 if(key==='meadow'){
  rect(.04,.06,.96,.95,g.floor,1);
  wall([[.15,.06],[.18,.29],[.37,.37],[.37,.56],[.20,.68],[.24,.95]],2.1,3);
  wall([[.76,.05],[.68,.23],[.70,.43],[.83,.58],[.70,.75],[.74,.96]],2.4,4);
  path([[.12,.40],[.27,.46],[.49,.48],[.62,.34],[.80,.34],[.91,.25]],1.4,2,S.STAIRS);
  path([[.09,.79],[.27,.77],[.47,.70],[.64,.80],[.80,.84],[.93,.78]],1.5,1,S.PATH);
  room(.49,.22,.14,.11,2);room(.51,.75,.15,.11,1);
 }else if(key==='forest'){
  const p=[[.16,.74],[.24,.43],[.17,.20],[.51,.17],[.72,.31],[.81,.57],[.61,.78],[.39,.66],[.24,.43]];
  path(p,2.0,1,S.PATH);for(let i=0;i<p.length-1;i++)room(...p[i],.12,.12,1);
  path([[.51,.17],[.45,.38],[.53,.53],[.61,.78]],1.35,2,S.STAIRS);
  room(.53,.53,.12,.12,2);room(.87,.20,.09,.09,2);path([[.72,.31],[.87,.20]],1,2);
 }else if(key==='coast'){
  const p=[[.17,.23],[.53,.16],[.82,.30],[.74,.67],[.41,.81],[.16,.65]];
  for(let i=0;i<p.length;i++)room(...p[i],i%2?.155:.18,i%2?.13:.16,1+i%2);
  path([...p,p[0]],1.2,1,S.BRIDGE);room(.47,.48,.14,.13,2);
  path([[.53,.16],[.47,.48],[.41,.81]],1.1,2,S.BRIDGE);
  // A tidal channel bites into one island instead of another ornamental pond.
  wall([[.81,.18],[.75,.28],[.80,.40]],.8,3);
 }else if(key==='desert'){
  const p=[[.12,.16],[.73,.16],[.86,.28],[.78,.43],[.22,.43],[.13,.59],[.28,.76],[.83,.76],[.90,.89]];
  path(p,2.7,1,g.floor);for(const [u,v]of [[.20,.16],[.80,.30],[.22,.50],[.49,.76]])room(u,v,.12,.115,1);
  path([[.50,.16],[.50,.27],[.36,.29]],1.2,2,S.STAIRS);room(.34,.29,.09,.07,2);
  path([[.78,.43],[.88,.51],[.88,.60],[.73,.64]],1.2,3,S.STAIRS);room(.72,.62,.09,.08,3);
 }else if(key==='swamp'){
  const p=[[.14,.17],[.44,.20],[.75,.14],[.87,.42],[.72,.76],[.41,.86],[.13,.66],[.25,.43]];
  for(let i=0;i<p.length;i++)room(...p[i],.095+(i%3)*.012,.095,1);
  path([...p,p[0]],1,1,S.BRIDGE);path([[.44,.20],[.43,.43],[.25,.43]],1,1,S.BRIDGE);
  path([[.43,.43],[.55,.57],[.72,.76]],1,2,S.BRIDGE);room(.53,.53,.12,.11,2);
  path([[.25,.43],[.13,.43]],1,1,S.BRIDGE);room(.10,.43,.055,.065,1);
 }else if(key==='frost'||key==='heaven'){
  const heavenly=key==='heaven',ys=heavenly?[.17,.40,.65,.85]:[.15,.38,.61,.84];
  for(let i=0;i<ys.length;i++){
   if(heavenly)polygon([[.14,ys[i]-.07],[.78,ys[i]-.10],[.89,ys[i]+.01],[.73,ys[i]+.08],[.15,ys[i]+.06]],g.floor,4-i);
   else rect(.13+(i%2)*.05,ys[i]-.07,.88-(i%2)*.03,ys[i]+.08,g.floor,4-i);
  }
  for(let i=1;i<ys.length;i++){const x=i%2?.79:.21;path([[x,ys[i-1]],[x+(i%2?.05:-.05),ys[i]-.10],[x,ys[i]]],1.25,5-i,S.STAIRS);}
  if(!heavenly)path([[.47,.38],[.43,.61]],1,3,S.STAIRS);
  else {room(.09,.52,.055,.065,2);path([[.21,.40],[.09,.52],[.21,.65]],1,2,S.BRIDGE);}
 }else if(key==='sky'){
  const p=[];for(let i=0;i<7;i++){const a=(i/7)*Math.PI*2-.4;p.push([.50+Math.cos(a)*.34,.49+Math.sin(a)*.33]);}
  for(let i=0;i<p.length;i++)room(...p[i],.11,.105,1+i%3,true);
  path([...p,p[0]],.95,2,S.BRIDGE);room(.50,.49,.13,.13,3,true);
  path([p[1],[.58,.59],[.50,.49]],1,3,S.STAIRS);path([p[4],[.39,.42],[.50,.49]],1,3,S.BRIDGE);
 }else if(key==='abyss'){
  polygon([[.06,.08],[.39,.07],[.46,.25],[.35,.43],[.42,.59],[.34,.77],[.44,.94],[.06,.94]],g.floor,2);
  polygon([[.65,.06],[.94,.06],[.94,.94],[.60,.94],[.54,.73],[.64,.55],[.55,.38],[.64,.25]],g.floor,3);
  path([[.33,.24],[.50,.20],[.69,.27]],1.2,3,S.BRIDGE);
  path([[.31,.76],[.47,.83],[.67,.77]],1.2,2,S.BRIDGE);
  wall([[.16,.30],[.26,.36],[.25,.54]],1.2,4);wall([[.79,.45],[.85,.57],[.78,.72]],1.6,4);
 }else if(key==='observatory'){
  ring(.49,.49,.35,.35,2.5,1);ring(.49,.49,.20,.20,2.0,3);
  room(.49,.49,.09,.09,4,true);
  path([[.79,.66],[.69,.58],[.66,.53]],1,3,S.STAIRS);
  path([[.19,.32],[.29,.36],[.33,.39]],1,2,S.BRIDGE);
  path([[.44,.29],[.43,.41],[.49,.49]],1,4,S.STAIRS);
  if(variant%3===0){room(.84,.18,.07,.07,3,true);path([[.75,.25],[.84,.18]],1,3,S.BRIDGE);}
 }else if(key==='sunscar'){
  // Nested rectangular benches with alternating corner ramps, rather than rings
  // of color on a walkable plane. The gaps between benches remain cliffs.
  path([[.12,.13],[.87,.13],[.87,.86],[.12,.86],[.12,.13]],2.3,4,g.floor);
  path([[.28,.29],[.72,.29],[.72,.70],[.28,.70],[.28,.29]],2.0,2,g.floor);
  room(.50,.50,.12,.13,1,true);
  path([[.12,.27],[.28,.35]],1.3,3,S.STAIRS);path([[.87,.73],[.72,.62]],1.3,3,S.STAIRS);
  path([[.60,.29],[.61,.43],[.50,.50]],1.2,2,S.STAIRS);
  room(.87,.45,.06,.12,4,true);
 }else if(key==='deepsea'){
  rect(.09,.10,.26,.90,g.floor,2);rect(.43,.18,.59,.82,g.floor,3);rect(.75,.08,.91,.92,g.floor,1);
  path([[.22,.23],[.34,.17],[.48,.25]],1.3,2,S.BRIDGE);
  path([[.53,.70],[.65,.79],[.79,.72]],1.3,2,S.BRIDGE);
  path([[.22,.76],[.35,.68],[.48,.73]],1,3,S.STAIRS);
  path([[.55,.30],[.65,.35],[.79,.27]],1,2,S.BRIDGE);
  wall([[.13,.42],[.21,.43]],.7,4);wall([[.80,.51],[.89,.51]],.7,4);
 }else if(key==='wildroot'){
  const columns=4,rows=4,visited=new Set([0]),stack=[0],links=[],rnd=g.rand;
  while(stack.length){const a=stack.at(-1),x=a%columns,y=Math.floor(a/columns),choices=[];
   for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,b=yy*columns+xx;if(xx>=0&&yy>=0&&xx<columns&&yy<rows&&!visited.has(b))choices.push(b);}
   if(!choices.length){stack.pop();continue;}const b=choices[Math.floor(rnd()*choices.length)];visited.add(b);links.push([a,b]);stack.push(b);
  }
  const cell=i=>[.14+(i%4)*.24,.14+Math.floor(i/4)*.24];
  for(let i=0;i<16;i++)room(...cell(i),.075+(i%3)*.008,.078,1+i%3);
  for(const [a,b]of links){const p=cell(a),q=cell(b);path([p,[(p[0]+q[0])*.5+.025,(p[1]+q[1])*.5-.025],q],1.25,1);}
  for(const [a,b]of [[4,5],[10,11]])path([cell(a),cell(b)],1.1,2,S.STAIRS);
 }else if(key==='clockwork'||key==='ruins'){
  const xs=key==='ruins'?[.19,.50,.81]:[.17,.49,.81],ys=[.19,.49,.80];
  for(let y=0;y<3;y++)for(let x=0;x<3;x++)rect(xs[x]-.115,ys[y]-.11,xs[x]+.115,ys[y]+.11,g.floor,1+(y+x)%3);
  for(let y=0;y<3;y++)for(let x=0;x<2;x++){
   const yy=ys[y]+((x+y+variant)%2?.065:-.065);path([[xs[x],yy],[xs[x+1],yy]],1.05,2,S.PATH);
  }
  for(let y=0;y<2;y++)for(const x of (y%2?[0,1]:[1,2]))path([[xs[x]+.055,ys[y]],[xs[x]+.055,ys[y+1]]],1,2,S.STAIRS);
  path([[.08,.19],[.05,.19],[.05,.80],[.18,.80]],1,1,S.PATH);
  for(const [x,y]of [[.17,.19],[.49,.49],[.81,.80]])rect(x-.025,y-.025,x+.025,y+.025,S.WALL,4,true);
 }else if(key==='stormcrown'){
  const p=[[.17,.87],[.38,.73],[.18,.55],[.42,.38],[.25,.16],[.59,.12],[.80,.29],[.61,.51],[.82,.73]];
  for(let i=0;i<p.length;i++)room(...p[i],.10,.085,1+Math.floor(i/3),true);
  path(p,1.0,2,S.STAIRS);path([[.38,.73],[.58,.83],[.82,.73]],1,1,S.BRIDGE);room(.58,.83,.075,.075,1,true);
  path([[.42,.38],[.61,.51]],1,3,S.BRIDGE);
 }else if(key==='voidfront'){
  path([[.09,.17],[.32,.27],[.52,.16],[.74,.28],[.91,.17]],2.0,3,g.floor);
  path([[.10,.80],[.31,.66],[.53,.82],[.75,.65],[.91,.77]],2.2,1,g.floor);
  for(const [u,v]of [[.31,.27],[.74,.28],[.31,.66],[.75,.65]])room(u,v,.12,.09,v<.5?3:1,true);
  path([[.31,.27],[.20,.44],[.31,.66]],1,2,S.BRIDGE);room(.20,.44,.07,.08,2,true);
  path([[.74,.28],[.81,.46],[.75,.65]],1,2,S.STAIRS);room(.81,.46,.08,.08,2,true);
  path([[.52,.16],[.50,.38],[.57,.49]],1,3,S.BRIDGE);room(.54,.49,.12,.11,3,true);
 }else if(key==='astralforge'||key==='inferno'){
  const hell=key==='inferno';
  rect(.09,.12,.29,.83,g.floor,2);rect(.72,.15,.92,.88,g.floor,3);rect(.28,.74,.75,.90,g.floor,1);
  room(.49,.22,.15,.12,4,true);room(.49,.51,.13,.13,2,true);
  path([[.22,.21],[.35,.13],[.49,.22],[.65,.12],[.79,.24]],1.2,3,S.BRIDGE);
  path([[.22,.56],[.49,.51],[.79,.60]],1.1,2,S.BRIDGE);
  path([[.20,.80],[.45,.81],[.79,.80]],1.3,1,S.STAIRS);
  if(hell){wall([[.17,.34],[.30,.34]],1.0,4);wall([[.72,.43],[.84,.43]],1.0,4);path([[.49,.51],[.54,.65],[.45,.81]],1,2,S.BRIDGE);}
  else {rect(.39,.38,.59,.42,S.LAVA,0,true);path([[.49,.22],[.56,.32],[.56,.51]],1,3,S.STAIRS);}
 }else if(key==='dawnend'){
  const p=[];for(let i=0;i<6;i++){const a=i*Math.PI/3-Math.PI/2;p.push([.5+Math.cos(a)*.34,.5+Math.sin(a)*.35]);}
  room(.5,.5,.14,.14,4,true);
  for(let i=0;i<6;i++){room(...p[i],.10,.09,1+i%3,true);path([[.5,.5],[(p[i][0]+.5)*.5+(i%2?.035:-.035),(p[i][1]+.5)*.5],p[i]],1.0,3,i%2?S.STAIRS:S.BRIDGE);}
  path([p[1],p[2],p[3],p[4]],.9,1,S.BRIDGE);
 }else if(key==='citadel'){
  path([[.13,.16],[.85,.16],[.85,.83],[.13,.83],[.13,.16]],2,1,g.floor);
  rect(.33,.20,.67,.60,g.floor,3);rect(.34,.72,.64,.91,g.floor,1);
  path([[.49,.82],[.59,.68],[.59,.50]],1.5,2,S.STAIRS);
  path([[.13,.36],[.33,.41]],1,3,S.BRIDGE);path([[.67,.29],[.85,.29]],1,3,S.BRIDGE);
  wall([[.39,.24],[.39,.44]],1,4);wall([[.60,.30],[.60,.49]],1,4);
 }else if(key==='mirror'){
  const sanctum=zone.realmArea==='sanctum';
  rect(.12,.11,.29,.87,g.floor,2);rect(.42,.13,.58,.88,g.floor,3);rect(.72,.10,.89,.88,g.floor,1);
  path([[.24,.19],[.43,.19]],1,3,S.BRIDGE);path([[.55,.77],[.77,.77]],1,2,S.BRIDGE);
  path([[.24,.70],[.42,.61]],1,2,S.STAIRS);path([[.56,.35],[.75,.27]],1,2,S.BRIDGE);
  rect(.12,.40,.23,.46,S.VOID,0,true);rect(.48,.43,.58,.48,S.VOID,0,true);rect(.80,.52,.89,.58,S.VOID,0,true);
  if(sanctum){room(.50,.35,.18,.14,3,true);wall([[.34,.29],[.34,.42]],.75,4);}
 }
 // The ninth sector adds a high overlook off an existing branch. This gives the
 // final sector a different silhouette even when its orientation repeats.
 if(zone.expedition&&variant===8){room(.85,.89,.07,.06,4,true);path([[.73,.76],[.80,.80],[.85,.89]],1,4,S.STAIRS);}
}

function connected(g,start){
 const {w,h,blocked}=g,seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
 if(start<0||blocked[start])return seen;queue[tail++]=start;seen[start]=1;
 while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);
  for(const n of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1])if(n>=0&&!blocked[n]&&!seen[n]){seen[n]=1;queue[tail++]=n;}
 }
 return seen;
}

// Attach a fixed marker to the nearest existing floor. This is a short local
// spur, never a road to the center of the map. Authored loops/turns remain intact.
function attach(g,x,y,r=1,level=null){
 const {w,h,blocked,surface,elevation}=g;const tx=clamp(Math.floor(x/T),2,w-3),ty=clamp(Math.floor(y/T),2,h-3),start=ty*w+tx;
 if(blocked[start]){
  const previous=new Int32Array(w*h).fill(-1),queue=new Int32Array(w*h);let head=0,tail=0,end=-1;
  previous[start]=start;queue[tail++]=start;
  while(head<tail&&end<0){const i=queue[head++],xx=i%w,yy=Math.floor(i/w);
   // The axis priority varies by tile, keeping equally short spurs deterministic.
   const candidates=(tx+ty)%2?[i-w,i+w,i-1,i+1]:[i-1,i+1,i-w,i+w];
   for(const n of candidates){const nx=n%w,ny=Math.floor(n/w);if(!g.inside(nx,ny)||Math.abs(nx-xx)+Math.abs(ny-yy)!==1||previous[n]!==-1)continue;
    previous[n]=i;if(!blocked[n]){end=n;break;}queue[tail++]=n;
   }
  }
  if(end>=0){let i=end;const route=[];while(i!==start){route.push([i%w,Math.floor(i/w)]);i=previous[i];}route.push([tx,ty]);
   const lv=level??Math.max(1,elevation[end]);for(let n=1;n<route.length;n++)g.segment(route[n-1],route[n],1/g.scale,lv);
  }
 }
 const lv=level??Math.max(1,elevation[start]);
 for(let yy=ty-r;yy<=ty+r;yy++)for(let xx=tx-r;xx<=tx+r;xx++)if(g.inside(xx,yy)&&(xx-tx)**2+(yy-ty)**2<=(r+.45)**2){
  const i=yy*w+xx,was=surface[i];g.set(xx,yy,was===S.ICE?S.ICE:g.floor,lv);
 }
}

function joinComponents(g,spawn){
 const {w,h,blocked}=g,start=spawn[1]*w+spawn[0];let seen=connected(g,start),repairs=0;
 // Builders are connected by design. This repairs only rasterization seams and
 // an optional detached overlook, and keeps a record for regression checks.
 for(let attempt=0;attempt<24;attempt++){
  let target=-1;for(let i=0;i<blocked.length;i++)if(!blocked[i]&&!seen[i]){target=i;break;}if(target<0)return repairs;
  const prev=new Int32Array(w*h).fill(-1),q=new Int32Array(w*h);let head=0,tail=0,end=-1;prev[target]=target;q[tail++]=target;
  while(head<tail&&end<0){const i=q[head++],x=i%w,y=Math.floor(i/w);
   for(const n of [i-1,i+1,i-w,i+w]){const nx=n%w,ny=Math.floor(n/w);if(!g.inside(nx,ny)||Math.abs(nx-x)+Math.abs(ny-y)!==1||prev[n]!==-1)continue;
    prev[n]=i;if(seen[n]){end=n;break;}q[tail++]=n;
   }
  }
  if(end<0)throw new Error(`Cannot connect terrain ${g.zone.id}`);
  let i=end;const path=[];while(i!==target){path.push([i%w,Math.floor(i/w)]);i=prev[i];}path.push([target%w,Math.floor(target/w)]);
  for(let n=1;n<path.length;n++)g.segment(path[n-1],path[n],1/g.scale,Math.max(1,g.elevation[end]));repairs++;seen=connected(g,start);
 }
 if(blocked.some((b,i)=>!b&&!seen[i]))throw new Error(`Disconnected terrain ${g.zone.id}`);return repairs;
}

function safeCells(g,r=1){
 const out=[];for(let y=3;y<g.h-3;y++)for(let x=3;x<g.w-3;x++){
  let safe=true;for(let yy=y-r;yy<=y+r&&safe;yy++)for(let xx=x-r;xx<=x+r;xx++)if(g.blocked[yy*g.w+xx]){safe=false;break;}
  if(safe)out.push(y*g.w+x);
 }return out;
}

function relocateOptional(map,g,anchors){
 const candidates=safeCells(g,1),used=[],rnd=randomFor(hash(map.id+' supplies'));
 for(const item of [...(map.chests||[]),...(map.resources||[])]){
  let best=-1,bestScore=-Infinity;
  // Deterministic candidates spread supplies across actual rooms and branches.
  // Their IDs and types stay intact, including already opened/depleted IDs.
  for(let k=0;k<Math.min(120,candidates.length);k++){
   const i=candidates[Math.floor(rnd()*candidates.length)],x=(i%g.w)*T+16,y=Math.floor(i/g.w)*T+16;
   if(anchors.some(a=>Math.hypot(x-a.x,y-a.y)<(a.kind==='boss'?150:70)))continue;
   const separation=used.length?Math.min(...used.map(p=>Math.hypot(x-p.x,y-p.y))):300;
   const oldDistance=Math.hypot(x-item.x,y-item.y),score=Math.min(240,separation)-oldDistance*.018;
   if(score>bestScore){bestScore=score;best=i;}
  }
  if(best<0)best=candidates[Math.floor(rnd()*candidates.length)];
  if(best===undefined)throw new Error(`No supply location in ${map.id}`);
  item.x=(best%g.w)*T+16;item.y=Math.floor(best/g.w)*T+16;used.push(item);
 }
}

function placeEncounters(map,g,anchors){
 if(!map.encounters)return;
 const cells=safeCells(g,2),chosen=[],camp=map.camp||{x:g.zone.spawn[0]*T+16,y:g.zone.spawn[1]*T+16};
 const desired=g.zone.expedition?8:g.zone.secretRealm?4:5;
 const acceptable=i=>{const p={x:(i%g.w)*T+16,y:Math.floor(i/g.w)*T+16};return Math.hypot(p.x-camp.x,p.y-camp.y)>330&&!anchors.some(a=>(a.kind==='boss'||a.kind==='trial')&&Math.hypot(p.x-a.x,p.y-a.y)<220);};
 const pool=cells.filter(acceptable),rnd=randomFor(hash(map.id+' encounters'));
 for(let n=0;n<desired&&pool.length;n++){
  let best=-1,score=-Infinity;
  for(let k=0;k<Math.min(150,pool.length);k++){
   const index=Math.floor(rnd()*pool.length),i=pool[index],p={x:(i%g.w)*T+16,y:Math.floor(i/g.w)*T+16};
   const separation=chosen.length?Math.min(...chosen.map(q=>Math.hypot(p.x-q.x,p.y-q.y))):Math.hypot(p.x-camp.x,p.y-camp.y);
   if(separation>score){score=separation;best=index;}
  }
  if(best<0)break;const [i]=pool.splice(best,1);chosen.push({x:(i%g.w)*T+16,y:Math.floor(i/g.w)*T+16});
 }
 // Small sanctums can have only a few broad landings; a safe fallback still
 // respects the player's entry space and never places a mob in the abyss.
 if(!chosen.length){const i=cells.find(acceptable);if(i!==undefined)chosen.push({x:(i%g.w)*T+16,y:Math.floor(i/g.w)*T+16});}
 map.encounters=chosen;
}

function placeScenery(map,g,key,anchors){
 const keep=(map.props||[]).filter(p=>/altar|tent|lantern|event-altar/.test(p.id)&&!g.blocked[Math.floor(p.y/T)*g.w+Math.floor(p.x/T)]);
 const wood=['forest','meadow','swamp','wildroot'].includes(key);
 const sprite=wood?(key==='swamp'||key==='wildroot'?'giant_mushroom':'tree'):
  ['desert','sunscar','inferno','astralforge'].includes(key)?'desert_ruin':key==='frost'?'frost_pine':
  ['sky','stormcrown','heaven','dawnend'].includes(key)?'sky_crystal':['abyss','voidfront','mirror'].includes(key)?'void_crystal':'pillar';
 const rnd=randomFor(hash(map.id+' scenery')),props=[...keep];
 for(let y=3;y<g.h-3;y++)for(let x=3;x<g.w-3;x++){
  const i=y*g.w+x,px=x*T+16,py=y*T+20;
  if(g.blocked[i]&&g.surface[i]===S.WALL){
   const edge=[i-1,i+1,i-g.w,i+g.w].some(n=>!g.blocked[n]);
   if(edge&&rnd()<.22&&!anchors.some(a=>Math.hypot(px-a.x,py-a.y)<90))props.push({id:`${map.id}_terrain_${i}`,sprite,x:px,y:py,scale:wood?1.05:.8});
  }else if(!g.blocked[i]&&[S.GROUND,S.ICE].includes(g.surface[i])&&rnd()<.025&&!anchors.some(a=>Math.hypot(px-a.x,py-a.y)<85)){
   props.push({id:`${map.id}_ground_${i}`,sprite:g.surface[i]===S.ICE?'snow_grass':wood?'flowers':key==='desert'||key==='sunscar'?'desert_grass':'rune',x:px,y:py,scale:.55+rnd()*.25});
  }
 }
 map.props=props;
}

export function applyTerrainLayout(map,zone,{boss=null}={}){
 if(!map||!zone||map.id==='town'||zone.challenge||zone.dungeon||map.terrain?.version===1)return map;
 const key=zone.secretRealm?zone.realm:zone.province||map.id,design=DESIGNS[key]||DESIGNS.forest;
 const g=planner(map,zone,design);buildShape(g,key,zone);
 const bossPoint=boss||map.boss||(zone.realmArea==='sanctum'?{x:28*T+16,y:15*T+16}:null);
 const anchors=[{x:zone.spawn[0]*T+16,y:zone.spawn[1]*T+16,kind:'spawn',r:3},
  ...(map.portals||[]).map(p=>({...p,kind:'portal',r:2})),
  ...(map.npcs||[]).map(p=>({...p,kind:'npc',r:2})),
  ...(map.relics||[]).map(p=>({...p,kind:'relic',r:2})),
  ...(map.storyPoints||[]).map(p=>({...p,r:p.kind==='trial'?7:p.kind==='camp'?4:2}))];
 if(bossPoint)anchors.push({...bossPoint,kind:'boss',r:zone.expedition?7:6});
 if(map.eventArena&&['meadow','coast','frost','abyss'].includes(map.id))anchors.push({...map.eventArena,kind:'worldBoss',r:7});
 // Some old return portals arrive several cells in front of the visible gate.
 if(['forest','ruins','citadel'].includes(map.id))anchors.push({x:(map.id==='forest'?30:28)*T+16,y:7*T+16,kind:'arrival',r:2});
 for(const a of anchors)attach(g,a.x,a.y,a.r);
 const repairCount=joinComponents(g,zone.spawn);
 relocateOptional(map,g,anchors);placeEncounters(map,g,anchors);placeScenery(map,g,key,anchors);
 const tiles=new Uint8Array(g.w*g.h);for(let i=0;i<tiles.length;i++)tiles[i]=g.blocked[i]?2:[S.PATH,S.BRIDGE,S.STAIRS].includes(g.surface[i])?1:0;
 map.blocked=g.blocked;map.tiles=tiles;
 map.terrain={version:1,id:design.id+(zone.secretRealm?'-'+zone.realmArea:''),name:design.name,instruction:design.hint,style:design.style,
  surface:g.surface,elevation:g.elevation,features:g.features,variant:zone.sector??0,repairCount};
 return map;
}

export const TERRAIN_ARCHETYPES=Object.freeze(Object.fromEntries(Object.entries(DESIGNS).map(([id,d])=>[id,Object.freeze({id:d.id,name:d.name,style:d.style})])));
