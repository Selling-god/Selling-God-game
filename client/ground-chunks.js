// Fixed-size LRU tiles. A 5,120 x 3,584 map never allocates a full-map RGBA canvas.
import {TILE,ZONES} from '../shared/content.js';
export class GroundChunks {
 constructor(){this.cache=new Map();this.size=512;this.limit=36;this.created=0;}
 clear(){this.cache.clear();}
 get(map,cx,cy,atlas,meta){
  const key=`${map.id}:${cx}:${cy}`,old=this.cache.get(key);
  if(old){this.cache.delete(key);this.cache.set(key,old);return old;}
  const size=this.size,cv=document.createElement('canvas');cv.width=size;cv.height=size;
  const c=cv.getContext('2d');c.imageSmoothingEnabled=false;
  const startX=cx*size/TILE,startY=cy*size/TILE;
  for(let y=startY;y<Math.min(map.h,startY+size/TILE);y++)for(let x=startX;x<Math.min(map.w,startX+size/TILE);x++){
   const k=map.tiles[y*map.w+x],v=(x*17+y*31+x*y)%8;
   const tile=meta[`tile_${ZONES[map.id].theme}_${k}_${v}`]||meta[`tile_forest_${k}_${v}`];
   if(tile)c.drawImage(atlas,tile.x,tile.y,32,32,(x-startX)*TILE,(y-startY)*TILE,32,32);
   if(x>1&&y>1&&k!==2&&map.tiles[y*map.w+x-1]===2){
    c.fillStyle=map.id==='citadel'?'#a06850':'#7b8b72';c.fillRect((x-startX)*TILE,(y-startY)*TILE+3,3,22);
   }
   if(k===1&&x%4===1&&y%3===1){
    c.fillStyle=map.id==='ruins'?'#858495':'#989277';c.fillRect((x-startX)*TILE+7,(y-startY)*TILE+14,9,2);
   }
  }
  this.cache.set(key,cv);this.created++;
  while(this.cache.size>this.limit)this.cache.delete(this.cache.keys().next().value);
  return cv;
 }
 draw(ctx,map,camera,halfX,halfY,atlas,meta,lowPower){
  this.limit=lowPower?18:36;
  while(this.cache.size>this.limit)this.cache.delete(this.cache.keys().next().value);
  const s=this.size,x0=Math.max(0,Math.floor((camera.x-halfX)/s)),y0=Math.max(0,Math.floor((camera.y-halfY)/s));
  const x1=Math.min(Math.ceil(map.width/s)-1,Math.floor((camera.x+halfX)/s));
  const y1=Math.min(Math.ceil(map.height/s)-1,Math.floor((camera.y+halfY)/s));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)ctx.drawImage(this.get(map,x,y,atlas,meta),x*s,y*s);
 }
}
