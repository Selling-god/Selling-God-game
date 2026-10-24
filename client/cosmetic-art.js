/** Runtime pixel art: 12 silhouettes x 10 geometrically distinct detail layouts
 * in each cosmetic category. The same routines power shop previews and world sprites.
 * All shapes are authored with integer coordinates; no image/network dependency.
 */
const PI=Math.PI;
const rect=(c,x,y,w,h)=>c.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));
const line=(c,x,y,X,Y,w=2)=>{c.lineWidth=w;c.beginPath();c.moveTo(Math.round(x),Math.round(y));c.lineTo(Math.round(X),Math.round(Y));c.stroke();};
const poly=(c,points)=>{c.beginPath();c.moveTo(points[0][0],points[0][1]);for(const [x,y] of points.slice(1))c.lineTo(x,y);c.closePath();c.fill();};
const star=(c,x,y,s)=>{rect(c,x-s,y-1,2*s+1,3);rect(c,x-1,y-s,3,2*s+1);};
const bit=(c,x,y,kind,size=3)=>{
  if(kind===0)rect(c,x,y,size,size);
  else if(kind===1)star(c,x,y,size);
  else if(kind===2){line(c,x-size,y-size,x+size,y+size,2);line(c,x+size,y-size,x-size,y+size,2);}
  else if(kind===3)poly(c,[[x,y-size],[x+size,y],[x,y+size],[x-size,y]]);
  else if(kind===4){rect(c,x-size,y-size,2*size+1,2);rect(c,x-size,y+size,2*size+1,2);}
  else if(kind===5){rect(c,x-size,y-size,2*size+1,2);rect(c,x-size,y+size,2*size+1,2);rect(c,x-size,y-size,2,2*size+1);}
  else if(kind===6)poly(c,[[x,y-size],[x+size,y+size],[x-size,y+size]]);
  else if(kind===7){rect(c,x-size,y-1,size,3);rect(c,x+1,y-1,size,3);}
  else if(kind===8){rect(c,x-1,y-size,3,size);rect(c,x-size,y+1,2*size+1,2);}
  else {rect(c,x-size,y-size,size,3);rect(c,x,y+1,size,3);}
};
const design=item=>item?.design||{form:0,motif:0,primary:item?.color||'#cbbca7',secondary:'#eff0d3'};

/**
 * A 48x64 atlas actor renders at 40.8x54.4 with its feet at y+3.
 * Its head occupies roughly y-51..y-32. Costumes MUST stay below y-32:
 * a small chest/arm overlay and an optional cape behind the real sprite.
 * This keeps the character's eyes, hair, weapon and animations visible.
 */
function body(c,d,x,y,t,layer='front'){
  const f=d.form%12,m=d.motif%10;
  const primary=d.primary,trim=d.secondary,ink='#23313c';
  x=Math.round(x);y=Math.round(y);
  if(layer==='back'){
    // Cloth and capes behind the original character, never over the face.
    c.fillStyle=ink;
    if([1,2,5,6,7,8,10].includes(f)){
      const swing=Math.round(Math.sin(t/260+f)*2);
      poly(c,[[x-9,y-29],[x+9,y-29],[x+14+swing,y-1],[x+4,y+1],[x,y-5],[x-5,y+1],[x-14+swing,y-1]]);
      c.fillStyle=primary;
      poly(c,[[x-7,y-27],[x+7,y-27],[x+10+swing,y-4],[x+4,y-2],[x,y-7],[x-4,y-2],[x-10+swing,y-4]]);
      c.fillStyle=trim;rect(c,x-2,y-9,4,3);
    }else if([0,4,9,11].includes(f)){
      // Split short capes / mechanical fins are slim enough not to hide arms.
      for(const side of [-1,1]){
        c.fillStyle=ink;rect(c,x+side*12-2,y-28,5,20);
        c.fillStyle=primary;rect(c,x+side*12-1,y-26,3,17);
      }
    }
    return;
  }
  // Physically aligned breastplate/jacket: 18 px across, 17 px tall.
  // Face starts ABOVE this garment, so it remains unobscured.
  c.fillStyle=ink;rect(c,x-10,y-31,20,21);
  c.fillStyle=primary;rect(c,x-8,y-29,16,17);
  // Garment silhouette variations, kept within the sprite's actual arm span.
  switch(f){
    case 0: // knight: square pauldrons and chest plate
      c.fillStyle=ink;rect(c,x-15,y-28,7,8);rect(c,x+8,y-28,7,8);
      c.fillStyle=primary;rect(c,x-14,y-27,5,5);rect(c,x+9,y-27,5,5);break;
    case 1: // archer: crossed leather wrap and pointed cuffs
      c.fillStyle=trim;line(c,x-7,y-28,x+7,y-16,2);line(c,x+7,y-28,x-7,y-16,2);break;
    case 2: // mage: narrow high collar and fluttering hem
      c.fillStyle=ink;rect(c,x-9,y-32,18,3);rect(c,x-13,y-12,26,6);
      c.fillStyle=primary;rect(c,x-7,y-31,14,2);rect(c,x-12,y-11,24,4);break;
    case 3: // explorer: sleeved jacket with visible zip
      c.fillStyle=ink;rect(c,x-14,y-28,5,13);rect(c,x+9,y-28,5,13);
      c.fillStyle=primary;rect(c,x-13,y-27,3,10);rect(c,x+10,y-27,3,10);break;
    case 4: // paladin: broad plated collar and hard hip guards
      c.fillStyle=ink;rect(c,x-14,y-30,28,5);rect(c,x-12,y-11,9,7);rect(c,x+3,y-11,9,7);
      c.fillStyle=primary;rect(c,x-13,y-29,26,3);rect(c,x-11,y-10,7,5);rect(c,x+4,y-10,7,5);break;
    case 5: // court: asymmetric silk, long apron
      c.fillStyle=primary;poly(c,[[x-8,y-14],[x+8,y-14],[x+13,y-2],[x-10,y-3]]);
      c.fillStyle=trim;rect(c,x-9,y-29,18,2);break;
    case 6: // rogue: slim scarf that stays BELOW the head
      c.fillStyle=trim;poly(c,[[x-8,y-31],[x+8,y-26],[x+6,y-22],[x-8,y-27]]);
      c.fillStyle=primary;rect(c,x+9,y-19,5,11);break;
    case 7: // ranger: leafy pauldrons
      c.fillStyle=primary;
      poly(c,[[x-9,y-30],[x-16,y-25],[x-11,y-19],[x-8,y-25]]);
      poly(c,[[x+9,y-30],[x+16,y-25],[x+11,y-19],[x+8,y-25]]);break;
    case 8: // astrologer: star collar and long contrasting hem
      c.fillStyle=trim;rect(c,x-9,y-31,18,3);rect(c,x-10,y-12,20,2);
      c.fillStyle=primary;rect(c,x-12,y-10,24,5);break;
    case 9: // mechanist: plated arms and waist rivets
      c.fillStyle=ink;rect(c,x-16,y-25,7,9);rect(c,x+9,y-25,7,9);
      c.fillStyle=trim;rect(c,x-15,y-24,5,4);rect(c,x+10,y-24,5,4);break;
    case 10: // priest: shawl and split front
      c.fillStyle=trim;rect(c,x-9,y-30,18,3);
      c.fillStyle=primary;rect(c,x-10,y-11,20,8);
      c.fillStyle=ink;rect(c,x-1,y-11,2,8);break;
    case 11: // draconic scales and angled shoulders
      c.fillStyle=primary;
      poly(c,[[x-8,y-30],[x-16,y-31],[x-13,y-22],[x-9,y-23]]);
      poly(c,[[x+8,y-30],[x+16,y-31],[x+13,y-22],[x+9,y-23]]);break;
  }
  // Slim motif area (8x10), not a solid block across face or legs.
  c.fillStyle=trim;c.strokeStyle=trim;
  switch(m){
    case 0:rect(c,x-2,y-25,4,5);break;
    case 1:for(let k=-1;k<=1;k++)rect(c,x+k*4-1,y-25,2,9);break;
    case 2:bit(c,x,y-23,3,4);break;
    case 3:rect(c,x-6,y-27,3,10);bit(c,x+3,y-20,1,2);break;
    case 4:for(let k=0;k<3;k++)rect(c,x-5,y-26+k*4,10,1);break;
    case 5:for(let k=-1;k<=1;k++)bit(c,x+k*4,y-21,3,2);break;
    case 6:for(let k=-1;k<=1;k++)line(c,x+k*4-1,y-25,x+k*4+2,y-18,1);break;
    case 7:bit(c,x,y-25,1,3);rect(c,x-4,y-17,8,1);break;
    case 8:line(c,x-6,y-25,x,y-19,1);line(c,x,y-19,x+6,y-25,1);break;
    default:for(let k=0;k<3;k++)bit(c,x-5+k*5,y-25+k%2*5,4,1);break;
  }
  // Small belt separates chest and pants, so the sprite still reads as a body.
  c.fillStyle=ink;rect(c,x-9,y-12,18,3);
  c.fillStyle=trim;rect(c,x-2,y-12,4,2);
}
function wing(c,d,x,y,t){
  const f=d.form%12,m=d.motif%10,flap=Math.round(2*Math.sin(t/240+(m%3)));
  for(const side of [-1,1]){
    c.save();c.translate(Math.round(x+side*11),Math.round(y-32));c.scale(side*.72,.72);
    c.fillStyle=d.primary;
    switch(f){
      case 0: // fan feathers
        for(let k=0;k<5;k++){poly(c,[[0,k*4-2],[11+k*2+flap,k*2-15],[14+k*2+flap,k*5],[1,k*5+4]]);}break;
      case 1: // butterfly: 2 round lobes and antennae
        poly(c,[[0,0],[16,-27],[33,-17],[20,3],[30,22],[8,17]]);break;
      case 2: // mechanical saw
        poly(c,[[0,0],[19,-18],[24,-26],[33,-22],[29,-10],[38,-6],[31,3],[37,13],[19,22],[4,12]]);break;
      case 3: // dragon membrane with bone spikes
        poly(c,[[0,0],[11,-15],[18,-31],[29,-26],[36,-20],[30,-11],[34,2],[24,10],[31,23],[13,14]]);break;
      case 4: // fae web
        poly(c,[[0,0],[15,-29],[30,-18],[24,-4],[32,7],[23,27],[9,12]]);break;
      case 5:for(let k=0;k<4;k++)poly(c,[[0,k*5],[10+k*3,-20+k*4],[22+k*3,-15+k*6],[11+k*2,12+k*4]]);break;
      case 6:poly(c,[[0,0],[14,-24],[18,-13],[30,-29],[27,-6],[38,-5],[21,10],[29,23],[13,14]]);break;
      case 7:for(let k=0;k<4;k++)poly(c,[[0,k*4],[16+k*3,-21+k*9],[26+k*3,-13+k*9],[6,k*8+5]]);break;
      case 8:rect(c,3,-10,16,6);rect(c,17,-18,17,6);rect(c,22,-6,13,7);rect(c,10,3,20,6);break;
      case 9:for(let k=0;k<3;k++){c.lineWidth=4;c.strokeStyle=d.primary;c.beginPath();c.arc(22,-5,15+k*5,-1.85,1.8);c.stroke();}break;
      case 10:for(let k=0;k<6;k++)poly(c,[[0,k*4],[12+k*4,-25+k*7],[22+k*4,-12+k*9],[7,k*7]]);break;
      default:for(let k=0;k<7;k++)poly(c,[[0,k*3],[10+k*4,-16+k*6],[17+k*3,-10+k*7],[6,k*5+4]]);
    }
    c.fillStyle=d.secondary;
    // All ten border treatments affect the wing silhouette/ornament in different positions.
    for(let k=0;k<3+(m%4);k++){
      const px=10+k*4,py=-14+(k%3)*12+(m%2)*3;
      bit(c,px,py,(m+k)%10,1+(m%3));
    }
    if(m===3||m===7){c.strokeStyle=d.secondary;line(c,4,-2,26,-17,2);}
    if(m===5||m===8){rect(c,28,-22,5,4);rect(c,30,14,5,4);}
    c.restore();
  }
}
function aura(c,d,x,y,t){
  const f=d.form%12,m=d.motif%10,tick=t/700;
  c.globalAlpha=.46;c.strokeStyle=d.primary;c.fillStyle=d.primary;
  const drawOrbit=(rad,yScale=1,points=12)=>{
    for(let k=0;k<points;k++){const a=2*PI*k/points+tick*(m%2?-.3:.3),rx=rad+Math.sin(tick+k)*3;
      bit(c,x+Math.cos(a)*rx,y-19+Math.sin(a)*rx*yScale,(m+k)%10,1+k%2);
    }
  };
  switch(f){
    case 0:drawOrbit(28,.55);break;
    case 1:drawOrbit(31,.45);drawOrbit(17,.75,7);break;
    case 2:for(let k=0;k<20;k++){const a=k*.73+tick*.3;const radius=9+k*1.3;bit(c,x+Math.cos(a)*radius,y-18+Math.sin(a)*radius*.65,(m+k)%4,1);}break;
    case 3:for(let k=0;k<8;k++)rect(c,x-31+k*9,y-47-(k%3)*7+Math.sin(tick+k)*5,4,35+(k%3)*6);break;
    case 4:for(let k=0;k<9;k++){const a=k*PI*2/9+tick*.15;bit(c,x+Math.cos(a)*36,y-24+Math.sin(a)*24,1,2+(k+m)%4);}break;
    case 5:for(let k=0;k<14;k++){const a=k*PI*2/14;const r=27+(k%2)*7;bit(c,x+Math.cos(a)*r,y-20+Math.sin(a)*r*.7,3,3);}break;
    case 6:for(let k=0;k<13;k++)bit(c,x-27+k*5,y-42+(k%5)*12+Math.sin(tick+k)*5,6,2+k%2);break;
    case 7:drawOrbit(29,.6,8);for(let k=0;k<4;k++)bit(c,x-17+k*11,y-23+(k%2)*18,3,3);break;
    case 8:for(let k=0;k<5;k++){c.globalAlpha=.35+k*.06;rect(c,x-21-k*3+Math.sin(tick+k)*4,y-35+k*7,36+k*6,2);}break;
    case 9:for(let k=0;k<7;k++)poly(c,[[x-28+k*9,y-3],[x-32+k*9,y-22-(k%3)*8],[x-25+k*9,y-26-(k%3)*9]]);break;
    case 10:for(let k=0;k<19;k++)bit(c,x-30+(k*19)%63,y-53+((k*13+Math.floor(tick*5))%57),m%10,1+(k%2));break;
    default:drawOrbit(31,.65);for(let k=0;k<4;k++)line(c,x-34+k*23,y-39,x-34+k*23,y+1,3);
  }
  c.globalAlpha=.68;c.fillStyle=d.secondary;
  for(let k=0;k<3+(m%5);k++){
    const a=k*PI*2/(3+m%5)+tick*(m%2?-.8:.6);const r=13+(m%3)*4;
    bit(c,x+Math.cos(a)*r,y-25+Math.sin(a)*r,(m+k)%10,1+(m%3));
  }
}
function namePlate(c,d,x,y,width=80){
  const f=d.form%12,m=d.motif%10;
  const w=Math.max(58,Math.min(142,Math.round(width))),left=Math.round(x-w/2),top=Math.round(y);
  // A 15px-high name ribbon; old 19px frame and large ornaments hid titles.
  c.fillStyle='#11232de8';rect(c,left,top,w,15);
  c.strokeStyle=d.primary;c.lineWidth=1.5;
  c.strokeRect(left+.5,top+.5,w-1,14);
  c.fillStyle=d.primary;
  if([0,3,6,8].includes(f)){
    bit(c,x,top-3,(m+f)%10,2);
  }else if([1,5,7,10].includes(f)){
    for(const side of [-1,1])bit(c,x+side*(w/2+3),top+7,(m+f)%10,2);
  }else{
    rect(c,left+4,top-3,6,3);rect(c,left+w-10,top-3,6,3);
  }
  c.fillStyle=d.secondary;
  for(let k=0;k<1+m%3;k++){
    const px=left+7+k*5;
    bit(c,px,top+(m%2?11:4),(m+k)%10,1);
  }
}
function entrance(c,d,x,y,t,progress){
  const f=d.form%12,m=d.motif%10,a=1-Math.min(1,progress);
  if(a<=0)return;
  c.globalAlpha=a;c.fillStyle=d.primary;c.strokeStyle=d.primary;
  const rad=16+Math.round((1-progress)*38);
  switch(f){
    case 0:for(let k=0;k<11;k++)bit(c,x-35+k*6,y-57+Math.floor(k/2)*8+(1-progress)*30,(m+k)%4,2);break;
    case 1:for(let k=0;k<10;k++){const a=k*PI/5;bit(c,x+Math.cos(a)*rad,y-26+Math.sin(a)*rad*.8,6,3);}break;
    case 2:for(let k=0;k<9;k++)poly(c,[[x-30+k*7,y+2],[x-26+k*7,y-22-rad/2],[x-23+k*7,y]]);break;
    case 3:c.lineWidth=3;c.strokeRect(x-rad,y-45-rad/2,rad*2,rad*1.6);break;
    case 4:for(let k=0;k<5;k++){line(c,x-rad+k*7,y-65,x+rad-k*5,y-4,3);}break;
    case 5:for(let k=0;k<8;k++){const a=k*PI/4+progress;bit(c,x+Math.cos(a)*rad,y-28+Math.sin(a)*rad,3,3);}break;
    case 6:for(let k=0;k<4;k++)bit(c,x-23+k*15,y-47,1,4);break;
    case 7:for(let k=0;k<13;k++)bit(c,x-33+(k*13)%67,y-69+(k*11+progress*20)%70,6,2);break;
    case 8:for(let k=0;k<5;k++){rect(c,x-25+k*8,y-9-k*12,45-k*7,3);}break;
    case 9:for(let k=0;k<7;k++)line(c,x-28+k*9,y-62,x-19+k*8,y-5,2+(k%2));break;
    case 10:for(let k=0;k<8;k++)poly(c,[[x-27+k*8,y-11],[x-23+k*8,y-54],[x-17+k*8,y-16]]);break;
    default:for(let k=0;k<5;k++)line(c,x-rad,y-30+k*9,x+rad,y-29+k*9,3);
  }
  c.fillStyle=d.secondary;
  for(let k=0;k<6+(m%4);k++){
    const a=k*PI*2/(6+m%4)+progress*(m%2?2:-2);
    bit(c,x+Math.cos(a)*rad,y-28+Math.sin(a)*rad,(m+k)%10,1+m%3);
  }
}
/** Public art API, shared by live sprites and product preview canvases. */
export function drawCosmetic(c,item,x,y,t=0,options={}){
  if(!item)return;
  const d=design(item);
  c.save();c.imageSmoothingEnabled=false;
  if(item.slot==='costume')body(c,d,x,y,t,options.layer||'front');
  else if(item.slot==='wings')wing(c,d,x,y,t);
  else if(item.slot==='aura')aura(c,d,x,y,t);
  else if(item.slot==='nametag')namePlate(c,d,x,options.nameY??y-70,options.width??80);
  else if(item.slot==='entrance')entrance(c,d,x,y,t,options.progress??.25);
  c.restore();
}
export function paintCosmeticPreview(canvas,item){
  const c=canvas.getContext('2d');if(!c)return;
  canvas.width=108;canvas.height=98;
  c.clearRect(0,0,108,98);c.imageSmoothingEnabled=false;
  c.fillStyle='#1b303c';rect(c,3,3,102,92);
  const x=54,y=80;
  if(item.slot==='costume')drawCosmetic(c,item,x,y,840,{layer:'back'});
  if(item.slot==='wings'||item.slot==='aura')drawCosmetic(c,item,x,y,840);
  // 40x54 default mannequin matches the equipment sprite bounding box.
  if(item.slot!=='nametag'&&item.slot!=='entrance'){
    c.fillStyle='#253541';rect(c,x-13,y-31,26,21);
    c.fillStyle='#c49b7a';rect(c,x-9,y-52,18,18);
    c.fillStyle='#6b7d8f';rect(c,x-11,y-32,22,21);
    c.fillStyle='#283746';rect(c,x-10,y-12,8,13);rect(c,x+2,y-12,8,13);
    c.fillStyle='#f0d0a5';rect(c,x-5,y-46,4,3);rect(c,x+3,y-46,4,3);
  }
  if(item.slot!=='wings'&&item.slot!=='aura'){
    drawCosmetic(c,item,x,y,840,{nameY:22,width:82,progress:.28});
  }
  if(item.slot==='nametag'){
    c.fillStyle=item.design.secondary;c.font='9px sans-serif';c.textAlign='center';c.fillText('모험가',x,32);
  }
}
