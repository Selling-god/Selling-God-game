export class Sound {
  constructor(){this.ctx=null;this.sfx=.28;this.music=0;this.step=0;this.zone='town';this.timer=null;}
  start(){
    if(this.ctx){this.ctx.resume().catch(()=>{});return;}
    try{this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.timer=setInterval(()=>this.musicTick(),650);}catch{}
  }
  tone(freq,duration=.15,type='sine',volume=.2,delay=0){
    if(!this.ctx||this.ctx.state!=='running')return;
    const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(volume,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g);g.connect(this.ctx.destination);o.start(t);o.stop(t+duration+.02);
  }
  play(name){
    if(!this.sfx)return;
    if(name==='hit')this.tone(150+Math.random()*60,.08,'triangle',this.sfx*.2);
    if(name==='hurt')this.tone(100,.18,'sawtooth',this.sfx*.12);
    if(name==='cast'){this.tone(460,.22,'sine',this.sfx*.18);this.tone(720,.2,'triangle',this.sfx*.1,.08);}
    if(name==='loot'){this.tone(660,.15,'sine',this.sfx*.2);this.tone(880,.25,'sine',this.sfx*.14,.08);}
    if(name==='level')for(let i=0;i<4;i++)this.tone([392,494,587,784][i],.55,'triangle',this.sfx*.22,i*.1);
    if(name==='boss'){this.tone(65,.8,'triangle',this.sfx*.23);this.tone(98,.7,'sine',this.sfx*.18,.1);}
    if(name==='click')this.tone(440,.06,'sine',this.sfx*.12);
  }
  musicTick(){
    if(!this.music||document.hidden||!this.ctx)return;
    const notes=this.zone==='town'?[196,246.94,293.66,392,293.66,246.94,220,293.66]:
      this.zone==='forest'?[174.61,220,261.63,349.23,293.66,220,196,261.63]:
      this.zone==='ruins'?[164.81,196,246.94,329.63,293.66,246.94,196,164.81]:
      [146.83,174.61,220,293.66,261.63,220,174.61,146.83];
    const n=notes[this.step++%notes.length];
    this.tone(n,1.6,'sine',this.music*.08);
    if(this.step%4===0)this.tone(n/2,2.4,'triangle',this.music*.06);
    if(this.step%3===0)this.tone(n*2,.7,'sine',this.music*.05,.2);
  }
}
