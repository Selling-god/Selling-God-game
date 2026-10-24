import { COSMETICS, PIXEL_WIDTH, PIXEL_HEIGHT, PIXEL_PALETTE, validPortrait } from '../shared/personalization.js';
import { drawCosmetic, paintCosmeticPreview } from './cosmetic-art.js';
// Player-visible cosmetics are data-only sprites. No arbitrary uploaded SVG or code is executed.
const cache = new Map();
function avatarCanvas(pixels) {
  if (!validPortrait(pixels)) return null;
  let cv = cache.get(pixels); if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = PIXEL_WIDTH; cv.height = PIXEL_HEIGHT;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(PIXEL_WIDTH, PIXEL_HEIGHT);
  for (let i = 0; i < pixels.length; i++) {
    const n = parseInt(pixels[i], 16), h = PIXEL_PALETTE[n]; if (!n) continue;
    img.data[4*i] = parseInt(h.slice(1,3),16); img.data[4*i+1] = parseInt(h.slice(3,5),16);
    img.data[4*i+2] = parseInt(h.slice(5,7),16); img.data[4*i+3] = 255;
  }
  ctx.putImageData(img,0,0); cache.set(pixels,cv);
  if (cache.size > 45) cache.delete(cache.keys().next().value);
  return cv;
}
export function customPortraitURL(pixels) { const cv=avatarCanvas(pixels); return cv ? cv.toDataURL('image/png') : null; }
const item=(p,slot)=>COSMETICS[p.vanity?.slots?.[slot]];
export function drawVanityBack(renderer,p,x,y,t){
  for(const slot of ['aura','wings']) drawCosmetic(renderer.ctx,item(p,slot),x,y,t);
  drawCosmetic(renderer.ctx,item(p,'costume'),x,y,t,{layer:'back'});
}
export function drawVanityBody(renderer,p,x,y,t){
  const c=renderer.ctx,pixels=p.vanity?.avatarPixels;
  if(pixels){const cv=avatarCanvas(pixels);if(cv){c.imageSmoothingEnabled=false;c.drawImage(cv,Math.round(x-20),Math.round(y-53),40,54);}}
  drawCosmetic(c,item(p,'costume'),x,y,t);
}
export function drawVanityName(renderer,p,x,y,self,party){
  const c=renderer.ctx,tag=item(p,'nametag');
  if(tag){
    c.save();c.font='500 10px sans-serif';
    const width=Math.min(142,Math.max(60,c.measureText(p.name).width+22));c.restore();
    drawCosmetic(c,tag,x,y,renderer.clock||0,{nameY:y-79,width});
  }
  renderer.label(p.name,x,tag?y-71:y-62,tag?.design?.secondary||tag?.color||(self?'#f2dbab':party?'#b2dfba':'#c2d6da'),10);
}
export function drawVanityEntrance(renderer,p,x,y,now){
  const entry=item(p,'entrance');if(!entry||!(p.arrivedAt>0))return;
  const progress=(now-p.arrivedAt)/1800;if(progress<0||progress>1)return;
  drawCosmetic(renderer.ctx,entry,x,y,now,{progress});
}
export function renderVanityPreviews(root){
  if(!root)return;
  for(const canvas of root.querySelectorAll('canvas[data-vanity-preview]')){
    const item=COSMETICS[canvas.dataset.vanityPreview];
    if(item)paintCosmeticPreview(canvas,item);
  }
}
