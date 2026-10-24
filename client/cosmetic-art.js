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

function body(c,d,x,y,t){
  const f=d.form%12,m=d.motif%10;
  const yy=y-35;
  c.fillStyle='#26323f';rect(c,x-11,yy-1,22,23);
  c.fillStyle=d.primary;
  switch(f){
    case 0: // plated knight, squared pauldrons and cape
      rect(c,x-17,yy-1,34,8);rect(c,x-13,yy+6,26,15);rect(c,x-8,yy+21,16,9);break;
    case 1: // split archer cape, drawn with two torn fins
      poly(c,[[x-8,yy],[x-23,yy+10],[x-18,yy+30],[x-8,yy+20]]);
      poly(c,[[x+8,yy],[x+23,yy+8],[x+20,yy+28],[x+8,yy+19]]);rect(c,x-9,yy,18,16);break;
    case 2: // tapered mage robe and high neckline
      poly(c,[[x-8,yy],[x+8,yy],[x+18,yy+30],[x-18,yy+30]]);rect(c,x-12,yy-5,24,7);break;
    case 3: // sleeved adventurer jacket with straps
      rect(c,x-12,yy+1,24,21);rect(c,x-15,yy+2,6,17);rect(c,x+9,yy+2,6,17);
      rect(c,x-12,yy+23,10,5);rect(c,x+3,yy+23,9,5);break;
    case 4: // fortress plate and hip guards
      rect(c,x-18,yy+1,36,6);rect(c,x-13,yy+7,26,16);rect(c,x-18,yy+23,11,6);rect(c,x+7,yy+23,11,6);break;
    case 5: // long asymmetric ceremonial skirt
      poly(c,[[x-10,yy],[x+10,yy],[x+22,yy+31],[x-19,yy+29]]);
      rect(c,x-14,yy+3,8,7);rect(c,x+7,yy+1,8,7);break;
    case 6: // rogue with a diagonal scarf
      rect(c,x-12,yy,24,17);poly(c,[[x-7,yy-2],[x+14,yy+8],[x+6,yy+13],[x-12,yy+5]]);
      poly(c,[[x+12,yy+10],[x+22,yy+15],[x+9,yy+25]]);break;
    case 7: // leaf armor with irregular roots
      poly(c,[[x-8,yy],[x-17,yy+4],[x-12,yy+24],[x,yy+19],[x+15,yy+27],[x+18,yy+5],[x+8,yy]]);break;
    case 8: // astrologer vest and layered sleeves
      poly(c,[[x-11,yy],[x+11,yy],[x+12,yy+28],[x-12,yy+28]]);
      rect(c,x-17,yy+2,5,25);rect(c,x+12,yy+2,5,25);rect(c,x-15,yy+22,30,4);break;
    case 9: // mechanical armor, split chest and piston arms
      rect(c,x-15,yy-3,30,11);rect(c,x-11,yy+8,22,13);rect(c,x-19,yy+9,7,12);rect(c,x+12,yy+9,7,12);
      rect(c,x-15,yy+22,11,8);rect(c,x+5,yy+22,11,8);break;
    case 10: // priest, mantle and divided hem
      poly(c,[[x-11,yy-4],[x+11,yy-4],[x+12,yy+19],[x+17,yy+30],[x+3,yy+28],[x,yy+17],[x-3,yy+28],[x-18,yy+30]]);break;
    default: // scales and pointed draconic shoulders
      poly(c,[[x-20,yy-5],[x-9,yy+1],[x+9,yy+1],[x+20,yy-5],[x+13,yy+15],[x+11,yy+28],[x-11,yy+28],[x-13,yy+15]]);
  }
  c.fillStyle=d.secondary;
  // The ten motifs have genuinely different geometry, placement and symmetry.
  switch(m){
    case 0:rect(c,x-3,yy+9,6,8);rect(c,x-7,yy+2,14,2);break;
    case 1:for(let k=0;k<4;k++){rect(c,x-9+k*5,yy+7+(k%2)*4,2,13); }break;
    case 2:bit(c,x,yy+12,3,7);rect(c,x-12,yy+21,24,2);break;
    case 3:rect(c,x-11,yy+6,5,16);rect(c,x+4,yy+3,7,3);bit(c,x+7,yy+17,1,3);break;
    case 4:for(let k=0;k<3;k++)rect(c,x-9,yy+5+k*6,18,2);break;
    case 5:for(let k=0;k<3;k++)bit(c,x-6+k*6,yy+8+(k%2)*5,3,3);break;
    case 6:for(let k=0;k<5;k++)line(c,x-8+k*4,yy+17,x-6+k*4,yy+26,1);break;
    case 7:bit(c,x,yy+11,1,5);bit(c,x-7,yy+20,1,2);bit(c,x+7,yy+20,1,2);break;
    case 8:line(c,x-9,yy+7,x,yy+17,2);line(c,x,yy+17,x+9,yy+6,2);for(let k=-1;k<=1;k++)rect(c,x+k*6-1,yy+22,2,5);break;
    default:for(let k=0;k<4;k++)bit(c,x-9+k*6,yy+9+(k%2)*6,4,2);
  }
  c.fillStyle='#15232dbb';rect(c,x-2,yy+16,4,3);
}
function wing(c,d,x,y,t){
  const f=d.form%12,m=d.motif%10,flap=Math.round(2*Math.sin(t/240+(m%3)));
  for(const side of [-1,1]){
    c.save();c.translate(Math.round(x+side*11),Math.round(y-39));c.scale(side,1);
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
  c.globalAlpha=.65;c.strokeStyle=d.primary;c.fillStyle=d.primary;
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
  c.globalAlpha=.88;c.fillStyle=d.secondary;
  for(let k=0;k<3+(m%5);k++){
    const a=k*PI*2/(3+m%5)+tick*(m%2?-.8:.6);const r=13+(m%3)*4;
    bit(c,x+Math.cos(a)*r,y-25+Math.sin(a)*r,(m+k)%10,1+(m%3));
  }
}
function namePlate(c,d,x,y,width=80){
  const f=d.form%12,m=d.motif%10,left=x-width/2,top=y;
  c.fillStyle='#11232c';rect(c,left,top,width,19);
  c.strokeStyle=d.primary;c.fillStyle=d.primary;c.lineWidth=2;c.strokeRect(Math.round(left),Math.round(top),Math.round(width),19);
  switch(f){
    case 0:poly(c,[[x,top-10],[x+8,top],[x-8,top]]);break;
    case 1:for(let k=0;k<3;k++)rect(c,left+2+k*6,top-4,3,3);break;
    case 2:rect(c,left-9,top+2,8,15);rect(c,left+width+1,top+2,8,15);break;
    case 3:for(let k=0;k<3;k++)star(c,left+k*width/2,top-4,2);break;
    case 4:for(let k=0;k<4;k++)rect(c,left+k*width/4,top+19+(k%2?0:-4),10,3);break;
    case 5:poly(c,[[left-7,top],[left+2,top+9],[left-7,top+19]]);poly(c,[[left+width+7,top],[left+width-2,top+9],[left+width+7,top+19]]);break;
    case 6:poly(c,[[left+4,top-7],[left+13,top],[left+20,top-6]]);poly(c,[[left+width-20,top-6],[left+width-13,top],[left+width-4,top-7]]);break;
    case 7:for(const side of [-1,1])for(let k=0;k<3;k++)bit(c,x+side*(width/2+4+k*3),top+3+k*5,6,2);break;
    case 8:for(let k=0;k<4;k++)poly(c,[[left+k*width/4,top],[left+5+k*width/4,top-8],[left+10+k*width/4,top]]);break;
    case 9:rect(c,left-6,top+15,width+12,6);break;
    case 10:for(let k=0;k<6;k++)rect(c,left-4+k*(width+8)/5,top-6,5,5);break;
    default:for(let k=0;k<5;k++)poly(c,[[left-5+k*(width+10)/4,top-4],[left+k*(width+10)/4,top-9],[left+5+k*(width+10)/4,top-4]]);
  }
  c.fillStyle=d.secondary;
  // Personalized heraldry at different corners, number, orientation and contour.
  for(let k=0;k<1+m%4;k++){
    const px=left+7+(k*(width-15)/Math.max(1,m%4)),py=top+(m%2?14:4);
    bit(c,px,py,(m+k)%10,1+m%3);
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
  if(item.slot==='costume')body(c,d,x,y,t);
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
  c.fillStyle='#1b303c';rect(c,3,3,102,92);c.fillStyle='#31434e';rect(c,52,18,6,17);rect(c,48,35,14,18);
  if(item.slot!=='nametag'&&item.slot!=='entrance'){
    c.fillStyle='#c9b5a3';rect(c,47,16,16,17);c.fillStyle='#51687a';rect(c,44,33,21,31);rect(c,46,63,7,14);rect(c,57,63,7,14);
  }
  drawCosmetic(c,item,54,78,840,{nameY:37,width:90,progress:.28});
  if(item.slot==='nametag'){
    c.fillStyle=item.design.secondary;c.font='8px sans-serif';c.textAlign='center';c.fillText('모험가',54,51);
  }
}
