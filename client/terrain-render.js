import {SURFACES as S} from '../shared/terrain-layouts.js';

// Colors are materials, while elevation and surface come from the collision map.
// A visible wall is solid. A visible bridge is the actual traversable route.
export const TERRAIN_PALETTES={
 forest:['#172a25','#304c34','#4c6844','#72865c','#a5ac77','#182c36'],
 meadow:['#283429','#485e3b','#728453','#9ba66a','#c4bd87','#20373b'],
 ruins:['#25283c','#3d4055','#555b70','#7a8094','#b6b2c8','#161e33'],
 citadel:['#251e29','#473139','#61454a','#896359','#bc9a73','#381e2c'],
 coast:['#1b343e','#3e635c','#648a71','#a5b38c','#dfd5a4','#163549'],
 desert:['#392b2a','#755340','#a5764f','#cd9e66','#e3c990','#362932'],
 swamp:['#202d2d','#354b3a','#56664b','#788365','#a6ab79','#192e33'],
 frost:['#243b50','#547389','#87a5b4','#b9d0d3','#e9efdc','#1b304d'],
 sky:['#232b47','#454d6c','#717b99','#a7b1c2','#e1d8b4','#151f36'],
 abyss:['#171528','#392d47','#5c4965','#867185','#b49bab','#0e1226'],
 observatory:['#272736','#4c4b5a','#767580','#a6a39b','#dbd1ab','#151c32'],
 sunscar:['#39232b','#754837','#ae7045','#d6a666','#f0d496','#2d2030'],
 deepsea:['#132a3a','#2c4b58','#4a7075','#7a9796','#b1c3ae','#0c2538'],
 wildroot:['#202a24','#3d5035','#657047','#8b9359','#b7b37a','#17272a'],
 clockwork:['#242a34','#45535b','#6d7a7b','#99a69d','#d1c39a','#15222d'],
 stormcrown:['#24243c','#45435e','#71667f','#9e92a5','#dbcea7','#16172e'],
 voidfront:['#20162c','#402b49','#69466a','#946c8a','#c39caf','#0c1021'],
 astralforge:['#302029','#653b35','#9e5c45','#d79562','#f6cf91','#351a28'],
 dawnend:['#302b39','#625366','#978974','#c6bc94','#f4e4b7','#211e34'],
 heaven:['#34344c','#71768a','#a3a9b6','#d4d4c8','#fff0cc','#4d6780'],
 inferno:['#2b1a25','#663331','#a7563d','#d08b55','#f3be7f','#3a1827'],
 mirror:['#1d2338','#3c4563','#667492','#a1b1be','#d3eee2','#121c31'],
 forge:['#2b202b','#633d39','#8c5c4e','#c2956e','#f5ca8b','#341827'],
 archive:['#242936','#424b59','#63716e','#a29c80','#ddc994','#141e32'],
 observatory_dungeon:['#1c2237','#3c4562','#6a7290','#9fa6bf','#e7dcae','#10152c']
};
function palette(map){
 const style=map.terrain.style;
 if(map.id==='party_dungeon')return TERRAIN_PALETTES.forge;
 if(map.id==='party_archive')return TERRAIN_PALETTES.archive;
 if(map.id==='party_observatory')return TERRAIN_PALETTES.observatory_dungeon;
 return TERRAIN_PALETTES[style]||TERRAIN_PALETTES[map.id]||TERRAIN_PALETTES.ruins;
}
const hash=(x,y)=>(Math.imul(x+731,374761393)^Math.imul(y+191,668265263))>>>0;
export function drawTerrainCell(c,map,x,y,px,py){
 const t=map.terrain,i=y*map.w+x,s=t.surface[i],e=t.elevation[i],pal=palette(map),[ink,dark,mid,light,rim,depth]=pal,n=hash(x,y);
 const r=(xx,yy,w,h,color)=>{c.fillStyle=color;c.fillRect(px+xx,py+yy,w,h);};
 const neighbor=(dx,dy)=>{const xx=x+dx,yy=y+dy;return xx<0||yy<0||xx>=map.w||yy>=map.h?{s:S.WALL,e:4}:{s:t.surface[yy*map.w+xx],e:t.elevation[yy*map.w+xx]};};
 const blocked=q=>[S.WATER,S.VOID,S.LAVA,S.WALL].includes(q.s);
 r(0,0,32,32,depth);
 if(s===S.VOID){
  if(n%5===0){r(n%27,Math.floor(n/31)%25,2,2,mid);if(n%11===0){r(n%27-2,Math.floor(n/31)%25,6,1,light);r(n%27,Math.floor(n/31)%25-2,1,6,light);}}
  if((x+y*3)%17===0){r(5,19,16,2,dark);r(9,17,10,2,dark);}
  return;
 }
 if(s===S.WATER||s===S.LAVA){
  const hot=s===S.LAVA;
  r(0,0,32,32,hot?'#7a3331':depth);r(0,0,32,4,hot?'#572631':ink);
  for(let k=0;k<3;k++){
   const xx=(n>>(k*5))%21,yy=5+k*9;
   r(xx,yy,8+(n>>(k*3))%7,2,hot?'#c96a3b':dark);r(xx+3,yy+2,6,1,hot?'#f2b15b':mid);
  }
  if(hot&&n%4===0){r(6,9,7,6,'#432737');r(8,9,3,2,'#f8cc74');}
  return;
 }
 if(s===S.WALL){
  const top=neighbor(0,-1),bottom=neighbor(0,1),left=neighbor(-1,0),right=neighbor(1,0);
  const masonry=['ruins','citadel','clockwork','observatory','mirror'].includes(t.style)||map.id.startsWith('party_');
  if(!masonry){
   // Natural ridges are broad rock/tree-root masses with faces only along their
   // boundary, rather than repeating one masonry box over the entire mountain.
   const forest=['forest','wildroot','meadow','swamp'].includes(t.style),face=bottom.s!==S.WALL;
   r(0,0,32,32,dark);r(0,0,32,face?21:32,mid);
   if(n%3===0){r(4+n%7,7,10,2,dark);r(12+n%7,9,2,6,dark);r(16,6,7,1,light);}
   if(forest){if(n%2===0){r(3,5,9,4,dark);r(14,15,12,4,dark);r(4,4,6,2,light);}if(n%5===0)r(24,8,3,6,light);}
   if(top.s!==S.WALL){r(0,0,32,2,rim);r(3,2,25,2,light);}
   if(left.s!==S.WALL){r(0,0,3,32,light);r(3,3,2,24,mid);}
   if(right.s!==S.WALL)r(29,0,3,32,ink);
   if(face){r(0,20,32,3,light);r(0,23,32,9,ink);r(2,24,27,6,dark);r(5,24,3,6,mid);r(17,24,2,7,mid);r(25,24,3,5,mid);}
   return;
  }
  r(0,0,32,32,ink);r(0,0,32,22,dark);r(2,2,28,17,mid);r(2,2,28,2,light);
  if(top.s!==S.WALL)r(0,0,32,3,rim);
  if(left.s!==S.WALL){r(0,0,3,32,light);r(3,22,2,10,dark);}
  if(right.s!==S.WALL)r(29,0,3,32,ink);
  if(bottom.s!==S.WALL){r(0,19,32,3,light);r(2,22,28,6,dark);r(4,24,2,4,mid);r(23,23,3,6,mid);r(0,30,32,2,'#111b2a');}
  if(map.id==='party_archive'){
   r(2,4,28,15,ink);for(let k=0;k<6;k++){const colors=[mid,light,'#826154','#52747b'];r(3+k*4,5+(k%2),3,11-(k%2),colors[(n+k)%4]);r(3+k*4,7+(k%2),3,1,rim);}r(1,18,30,3,dark);
  }else if(['clockwork','observatory'].includes(t.style)||map.id==='party_dungeon'){
   r(7,6,18,9,dark);r(8,7,16,1,light);for(const xx of [4,27])for(const yy of [4,16])r(xx,yy,2,2,rim);
  }else if(['forest','wildroot'].includes(t.style)){
   for(let k=0;k<3;k++){r(5+k*9,4,2,16,dark);r(7+k*8,9,3,2,light);}if(n%3===0){r(8,2,10,3,'#63834e');r(3,5,5,3,'#4c6c45');}
  }else {r(5+(n%9),7,2,8,dark);r(7+(n%9),13,7,2,dark);r(20,4,5,2,light);}
  return;
 }
 // Height variation is shaded in material bands; cliffs occupy blocked cells.
 r(0,0,32,32,e>=3?mid:dark);
 if(s===S.PATH){
  r(0,0,32,32,mid);r(0,0,32,1,dark);r(0,16,32,1,dark);r((y%2)*16,0,1,16,dark);r(16-(y%2)*16,16,1,16,dark);r(3,3,10,1,light);if(n%3===0)r(20,20,8,1,light);
 }else if(s===S.BRIDGE){
  const vertical=[S.BRIDGE,S.STAIRS].includes(neighbor(0,-1).s)||[S.BRIDGE,S.STAIRS].includes(neighbor(0,1).s),metal=['clockwork','astralforge','inferno'].includes(t.style)||map.id==='party_dungeon';
  r(0,0,32,32,ink);
  for(let k=0;k<4;k++)if(vertical){r(2,k*8+1,28,6,mid);r(3,k*8+1,26,1,light);if(metal){r(6,k*8+3,2,2,rim);r(24,k*8+3,2,2,rim);}}
  else {r(k*8+1,2,6,28,mid);r(k*8+1,3,1,26,light);if(metal){r(k*8+3,6,2,2,rim);r(k*8+3,24,2,2,rim);}}
  const sides=vertical?[[-1,0],[1,0]]:[[0,-1],[0,1]];
  for(const [dx,dy]of sides)if(blocked(neighbor(dx,dy))){if(vertical){r(dx<0?0:29,0,3,32,light);r(dx<0?1:28,0,3,4,rim);}else{r(0,dy<0?0:29,32,3,light);r(0,dy<0?1:28,4,3,rim);}}
 }else if(s===S.STAIRS){
  const vertical=neighbor(0,-1).e!==neighbor(0,1).e||neighbor(-1,0).e===neighbor(1,0).e;
  for(let k=0;k<4;k++)if(vertical){r(0,k*8,32,7,mid);r(0,k*8,32,2,light);r(0,k*8+6,32,2,ink);}else{r(k*8,0,7,32,mid);r(k*8,0,2,32,light);r(k*8+6,0,2,32,ink);}
  if(vertical){r(0,0,2,32,rim);r(30,0,2,32,dark);}else{r(0,0,32,2,rim);r(0,30,32,2,dark);}
 }else if(s===S.ICE){
  r(0,0,32,32,mid);r(3,4,19,2,light);r(13,6,10,1,rim);r(5,21,15,2,light);r(20,17,2,5,dark);r(22,16,4,2,dark);
 }else{
  const indoors=/ruins|clockwork|observatory|mirror/.test(t.style)||map.id.startsWith('party_');
  if(indoors){r(0,0,32,1,ink);r(0,0,1,32,ink);r(2,2,28,1,mid);if(n%4===0){r(6,22,8,1,mid);r(13,23,2,4,ink);}}
  else for(let k=0;k<4;k++){const xx=(n>>(k*4))%27,yy=(n>>(k*3+1))%27;r(xx,yy,2+(n%3),2,k%2?mid:light);if(/forest|wildroot|meadow|swamp/.test(t.style))r(xx+1,yy-2,1,3,mid);}
 }
 if(s!==S.BRIDGE){
  for(const [dx,dy]of [[0,-1],[-1,0],[1,0],[0,1]]){const q=neighbor(dx,dy);if(!blocked(q)||q.s===S.WALL)continue;
   if(dy===-1){r(0,0,32,2,rim);r(2,2,28,2,light);}if(dx===-1){r(0,0,2,32,rim);r(2,3,2,28,light);}if(dx===1)r(29,0,3,32,ink);
   if(dy===1){r(0,24,32,2,light);r(0,26,32,6,ink);r(2,27,28,3,dark);r(6,26,3,4,mid);r(24,26,3,3,mid);}
  }
 }
}

export function drawTerrainAmbient(renderer,map,t){
 if(!map.terrain)return;
 const c=renderer.ctx,hx=renderer.w/renderer.zoom/2+32,hy=renderer.h/renderer.zoom/2+32,camera=renderer.camera;
 const x0=Math.max(0,Math.floor((camera.x-hx)/32)),x1=Math.min(map.w-1,Math.ceil((camera.x+hx)/32));
 const y0=Math.max(0,Math.floor((camera.y-hy)/32)),y1=Math.min(map.h-1,Math.ceil((camera.y+hy)/32));
 let budget=renderer.lowPower?14:32;
 for(let y=y0;y<=y1&&budget>0;y++)for(let x=x0;x<=x1&&budget>0;x++){
  const s=map.terrain.surface[y*map.w+x],n=hash(x,y);if(n%7)continue;
  if(s===S.WATER||s===S.LAVA||s===S.VOID){
   const frame=Math.floor(t/260+n)%4,xx=x*32+6+(n%11),yy=y*32+9-frame*2;
   c.fillStyle=s===S.LAVA?'#ffc46a99':s===S.VOID?'#d0c4ff66':'#b7e5dd66';
   c.fillRect(xx,yy,s===S.WATER?8:2,2);if(frame===2)c.fillRect(xx+3,yy-3,2,2);budget--;
  }
 }
}
