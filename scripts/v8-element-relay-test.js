'use strict';
// Rules shared by Node and the browser. No production data or external services used.
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const relay = require('../public/resonance');
let checks = 0;
function eq(actual, expected, name) { assert.deepEqual(actual, expected, name); checks++; }
function yes(condition, name) { assert.ok(condition, name); checks++; }
function suite(r) {
  eq(JSON.parse(JSON.stringify(r.normalize(null))), {elements:[],activations:0}, 'old saves start empty');
  eq(JSON.parse(JSON.stringify(r.normalize({elements:['fire','fire',null,'water','void'],activations:-4}))), {elements:['water','void'],activations:0}, 'corrupt values normalized');
  eq(r.normalize({activations:Infinity}).activations,0,'non-finite counter');
  eq(r.normalize({activations:2.9}).activations,2,'integer counter');
  const seed={elements:[],activations:0};
  const first=r.advance(seed,'fire');
  eq(JSON.parse(JSON.stringify(seed)),{elements:[],activations:0},'input not mutated');
  eq(Array.from(first.state.elements),['fire'],'first charge');
  const second=r.advance(first.state,'water');
  eq(Array.from(second.state.elements),['fire','water'],'second charge');
  yes(r.preview(second.state,'void').burst,'third preview');
  yes(!r.preview(second.state,'water').burst,'repeat preview');
  const third=r.advance(second.state,'void',{kind:'burst'});
  yes(third.burst,'third distinct damaging attack bursts');
  eq(third.powerBonus,.2,'power bonus');
  eq(third.breakBonus,8,'break bonus');
  eq(third.state.activations,1,'activation recorded');
  eq(Array.from(third.state.elements),[],'charges consumed');
  eq(Array.from(third.sequence),['fire','water','void'],'sequence retained for FX');
  eq(Array.from(r.advance(second.state,'water').state.elements),['water'],'repeat restarts chain');
  eq(Array.from(r.advance(second.state,'void',{hit:false}).state.elements),['fire','water'],'miss preserves charges');
  for(const kind of ['guard','heal','status']) {
    const result=r.advance(second.state,'void',{kind});
    yes(!result.burst,'support cannot burst: '+kind);
    eq(Array.from(result.state.elements),['fire','water'],'support preserves: '+kind);
  }
  for(const value of [null,undefined,'',5,{},'x'.repeat(25)]) yes(!r.preview(second.state,value).eligible,'invalid element');
  const a=r.advance(seed,'fire'),b=r.advance(seed,'void');
  eq(Array.from(a.state.elements),['fire'],'player A isolated');eq(Array.from(b.state.elements),['void'],'player B isolated');
  const restored=JSON.parse(JSON.stringify(second.state));
  yes(r.advance(restored,'void').burst,'serialized state resumes');
}
suite(relay);
const sandbox={};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/resonance.js'),'utf8'),sandbox);
yes(!!sandbox.FusewildRelay,'browser UMD export');
suite(sandbox.FusewildRelay);
console.log(`V8_ELEMENT_RELAY_OK checks=${checks} nodeAndBrowser=yes legacySave=yes`);
