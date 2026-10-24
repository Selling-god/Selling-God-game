const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const positive=(value,fallback)=>Number.isFinite(value)&&value>0?value:fallback;

/** Camera bounds allow scenery beyond the map so edge players stay clear of HUDs. */
export function cameraTarget(map,player,viewport){
 const zoom=positive(viewport.zoom,1),width=positive(viewport.width,1),height=positive(viewport.height,1);
 const mapWidth=positive(map.width,1),mapHeight=positive(map.height,1);
 const halfX=width/zoom/2,halfY=height/zoom/2;
 // Portrait controls occupy both sides above/below the middle; follow more closely there.
 // Tiny maps naturally collapse each interval to the map's center.
 const portrait=width<700&&height>width;
 const insetX=Math.min(mapWidth/2,halfX*(portrait?.2:.45)),insetY=Math.min(mapHeight/2,halfY*(portrait?.1:.45));
 const x=Number.isFinite(player.x)?player.x:mapWidth/2;
 const y=Number.isFinite(player.y)?player.y:mapHeight/2;
 const bottomRoom=(portrait?-height*.02:Math.min(48,height*.055))/zoom;
 return {x:clamp(x,insetX,mapWidth-insetX),y:clamp(y+bottomRoom,insetY,mapHeight-insetY)};
}

/** Frame-rate independent follow; snapping is reserved for transport and viewport changes. */
export function followCamera(camera,map,player,viewport,dt,{snap=false}={}){
 const target=cameraTarget(map,player,viewport);
 if(snap||!Number.isFinite(camera?.x)||!Number.isFinite(camera?.y))return target;
 const amount=1-Math.exp(-10*clamp(Number.isFinite(dt)?dt:0,0,.1));
 return {x:camera.x+(target.x-camera.x)*amount,y:camera.y+(target.y-camera.y)*amount};
}
