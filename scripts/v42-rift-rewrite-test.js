'use strict';
const fs = require('fs');
const assert = require('assert');

const server = fs.readFileSync('server.js','utf8');
const app = fs.readFileSync('public/app.js','utf8');

for (const needle of [
  "const MOVE_REWRITES = [",
  "function levelCapForFloor(floor)",
  "function biomeForkCandidates(room)",
  "function moveRewriteOfferForPc(room,pc)",
  "if (wave === 7)",
  "action === 'rewrite-move'",
  "action === 'skip-rewrite'"
]) assert(server.includes(needle), `missing server feature: ${needle}`);

for (const needle of [
  "RIFT REWRITE",
  "data-action=\"rewrite-pick\"",
  "data-action=\"skip-rewrite\"",
  "RIFT HUNTER",
  "다음 10웨이브를 고르세요",
  "LEVEL CAP"
]) assert(app.includes(needle), `missing client feature: ${needle}`);

const rewriteIds = [...server.matchAll(/id:'(echo|overclock|breaker|blood|zero|aegis|feedback|resonator|orbit)'/g)].map(m=>m[1]);
assert.strictEqual(new Set(rewriteIds).size, 9, 'expected 9 unique move rewrites');
console.log('V42_RIFT_REWRITE_OK rewrites=9 cadence=10wave rival=wave7 biomeFork=enabled');
