import {PIXEL_WIDTH,PIXEL_HEIGHT,PIXEL_PALETTE,PORTRAIT_PIXELS,validPortrait} from '../shared/personalization.js';
/** Rasterizes user-selected image locally. No image bytes or remote URLs are uploaded. */
export async function pixelateAvatar(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('PNG, JPG 또는 WebP 파일을 선택하세요.');
 if(file.size>2*1024*1024)throw new Error('이미지는 최대 2MB입니다.');
 const image=await createImageBitmap(file);
 try{
  const c=document.createElement('canvas');c.width=PIXEL_WIDTH;c.height=PIXEL_HEIGHT;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;
  const ratio=Math.min(image.width/PIXEL_WIDTH,image.height/PIXEL_HEIGHT),w=PIXEL_WIDTH*ratio,h=PIXEL_HEIGHT*ratio;
  ctx.clearRect(0,0,PIXEL_WIDTH,PIXEL_HEIGHT);
  ctx.drawImage(image,(image.width-w)/2,(image.height-h)/2,w,h,0,0,PIXEL_WIDTH,PIXEL_HEIGHT);
  const pixels=ctx.getImageData(0,0,PIXEL_WIDTH,PIXEL_HEIGHT).data;
  const palette=PIXEL_PALETTE.slice(1).map(h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]);
  let result='';
  for(let i=0;i<PORTRAIT_PIXELS;i++){
   const k=i*4;if(pixels[k+3]<64){result+='0';continue;}
   let best=0,distance=Infinity;
   for(let j=0;j<palette.length;j++){
    const d=(pixels[k]-palette[j][0])**2+(pixels[k+1]-palette[j][1])**2+(pixels[k+2]-palette[j][2])**2;
    if(d<distance){distance=d;best=j+1;}
   }
   result+=best.toString(16);
  }
  if(!validPortrait(result))throw new Error('너무 투명한 그림입니다. 캐릭터가 보이는 사진을 골라 주세요.');
  return result;
 }finally{image.close();}
}
export function portraitCanvas(pixels,scale=5){
 if(!validPortrait(pixels))return null;
 const cv=document.createElement('canvas');cv.width=PIXEL_WIDTH;cv.height=PIXEL_HEIGHT;
 const c=cv.getContext('2d');const out=c.createImageData(PIXEL_WIDTH,PIXEL_HEIGHT);
 for(let i=0;i<pixels.length;i++){
  const index=parseInt(pixels[i],16),hex=PIXEL_PALETTE[index];
  if(!index)continue;
  out.data[i*4]=parseInt(hex.slice(1,3),16);out.data[i*4+1]=parseInt(hex.slice(3,5),16);
  out.data[i*4+2]=parseInt(hex.slice(5,7),16);out.data[i*4+3]=255;
 }
 c.putImageData(out,0,0);cv.style.width=PIXEL_WIDTH*scale+'px';cv.style.height=PIXEL_HEIGHT*scale+'px';cv.style.imageRendering='pixelated';return cv;
}
