import test from 'node:test';
import assert from 'node:assert/strict';
import { Sound } from '../client/audio.js';

function setupAudioMocks(){
  const old = { Audio:globalThis.Audio, window:globalThis.window, document:globalThis.document };
  const instances=[];
  const listeners={};
  class MockAudio {
    constructor(src){this.src=src;this.loop=false;this.preload='';this.volume=1;this.paused=true;this.plays=0;this.pauses=0;instances.push(this);}
    play(){this.plays++;this.paused=false;return Promise.resolve();}
    pause(){this.pauses++;this.paused=true;}
  }
  class MockContext {
    constructor(){this.state='running';this.currentTime=0;this.destination={};}
    resume(){this.state='running';return Promise.resolve();}
    createOscillator(){return {type:null,frequency:{setValueAtTime(){}},connect(){},start(){},stop(){}};}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
  }
  globalThis.Audio=MockAudio;
  globalThis.window={AudioContext:MockContext};
  globalThis.document={hidden:false,addEventListener(name,fn){listeners[name]??=[];listeners[name].push(fn);}};
  return { instances, emit(name){for(const fn of listeners[name]||[])fn();}, teardown(){globalThis.Audio=old.Audio;globalThis.window=old.window;globalThis.document=old.document;} };
}

test('background music uses the supplied MP3, loops and does not duplicate players',async()=>{
  const env=setupAudioMocks();
  try{
    const sound=new Sound();sound.music=.35;sound.start();
    assert.equal(env.instances.length,1);
    assert.equal(env.instances[0].src,'/assets/bgm_starfall_20261025.mp3');
    assert.equal(env.instances[0].loop,true);
    assert.equal(env.instances[0].volume,.35);
    assert.equal(env.instances[0].plays,1);
    sound.start();
    assert.equal(env.instances.length,1);
    sound.sfx=.28;
    assert.doesNotThrow(()=>sound.play('hit'));
  }finally{env.teardown();}
});

test('music volume, on/off, and backgrounding pause and resume without losing position',async()=>{
  const env=setupAudioMocks();
  try{
    const sound=new Sound();sound.music=.3;sound.start();
    const player=env.instances[0];
    sound.music=0;
    assert.equal(player.paused,true);
    sound.music=.7;
    assert.equal(player.volume,.7);
    assert.equal(player.paused,false);
    globalThis.document.hidden=true;
    env.emit('visibilitychange');
    assert.equal(player.paused,true);
    globalThis.document.hidden=false;
    env.emit('visibilitychange');
    assert.equal(player.paused,false);
    await Promise.resolve();
  }finally{env.teardown();}
});

test('autoplay denial does not crash settings or sound effects',async()=>{
  const env=setupAudioMocks();
  try{
    const sound=new Sound();sound.music=.4;sound.start();
    const bgm=env.instances[0];
    bgm.paused=true;
    bgm.play=()=>Promise.reject(new Error('NotAllowedError'));
    assert.doesNotThrow(()=>sound.syncMusic());
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(sound.music,.4);
  }finally{env.teardown();}
});
