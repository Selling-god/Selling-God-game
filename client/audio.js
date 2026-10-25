export class Sound {
  constructor(){
    this.ctx=null;
    this.sfx=.28;
    this._music=0;
    this.zone='town';
    this.bgm=null;
    this._visibilityBound=false;
  }
  get music(){return this._music;}
  set music(value){
    const n=Number(value);
    this._music=Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
    this.syncMusic();
  }
  start(){
    // The start button/settings switch is the required user gesture for browsers.
    if(!this.ctx){
      try{this.ctx=new (window.AudioContext||window.webkitAudioContext)();}catch{}
    }else if(this.ctx.state==='suspended'){
      try{this.ctx.resume()?.catch(()=>{});}catch{}
    }
    if(!this.bgm){
      try{
        this.bgm=new Audio('/assets/bgm_starfall_20261025.mp3');
        this.bgm.loop=true;
        this.bgm.preload='none';
        this.bgm.volume=this._music;
        if(!this._visibilityBound){
          document.addEventListener('visibilitychange',()=>this.syncMusic());
          this._visibilityBound=true;
        }
      }catch{this.bgm=null;}
    }
    this.syncMusic();
  }
  syncMusic(){
    if(!this.bgm)return;
    this.bgm.volume=this._music;
    if(!this._music||document.hidden){
      this.bgm.pause();
      return;
    }
    if(this.bgm.paused){
      try{
        const request=this.bgm.play();
        if(request&&typeof request.catch==='function')request.catch(()=>{});
      }catch{} // Some browsers block playback until a user interacts.
    }
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
}
