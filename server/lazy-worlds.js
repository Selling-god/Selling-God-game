/**
 * A region is instantiated on first access; unoccupied regions are retired.
 * Only future respawn/resource cooldowns survive retirement, so moving away cannot
 * instantly respawn a boss or refill a harvested node. Active events are pinned.
 */
export class LazyWorldMap extends Map {
 constructor(game,factory){super();this.game=game;this.factory=factory;this.residue=new Map();this.lastSweep=0;}
 get(id){
  let w=super.get(id);
  if(!w){
   w=this.factory(id);
   const memory=this.residue.get(id);
   if(memory){
    for(const m of w.mobs){const at=memory.mobs[m.id];if(at>this.game.now){m.alive=false;m.hp=0;m.respawnAt=at;}}
    for(const n of w.nodes)n.readyAt=Math.max(n.readyAt,memory.nodes[n.id]||0);
    this.residue.delete(id);
   }
   super.set(id,w);
  }
  w.lastAccess=this.game.now;
  return w;
 }
 sweep(now,occupied){
  if(now-this.lastSweep<10000)return;
  this.lastSweep=now;
  for(const [id,w]of this){
   if(id==='town'||occupied.has(id)||w.mobs.some(m=>m.worldKey&&m.alive)||w.fieldTrial)continue;
   if(now-(w.lastAccess||0)<90000)continue;
   const mobs=Object.fromEntries(w.mobs.filter(m=>!m.worldKey&&!m.trialKey&&!m.alive&&m.respawnAt>now&&Number.isFinite(m.respawnAt)).map(m=>[m.id,m.respawnAt]));
   const nodes=Object.fromEntries(w.nodes.filter(n=>n.readyAt>now).map(n=>[n.id,n.readyAt]));
   if(Object.keys(mobs).length||Object.keys(nodes).length)this.residue.set(id,{mobs,nodes,expires:Math.max(now+240000,...Object.values(mobs).filter(Number.isFinite)) + 30000});
   super.delete(id);
  }
  for(const [id,r]of this.residue)if(r.expires<now)this.residue.delete(id);
 }
}
