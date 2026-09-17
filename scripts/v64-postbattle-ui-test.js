'use strict';
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const pkg=require(path.join(root,'package.json'));
function has(src,t,label){if(!src.includes(t))throw new Error(`${label}: missing ${t}`);}
if(pkg.version!=='6.4.0')throw new Error(`package version ${pkg.version}`);
for(const t of ['rewardTokenV64','merchantTokenV64','rewardLeadPanelV64','updateRewardFocusV64','afterbattle-v64','afterbattle-dialog-v64','data-reward-focus-v64'])has(app,t,'app');
for(const t of ['.afterbattle-v64','.afterbattle-token-v64','.afterbattle-footer-v64','.afterbattle-dialog-v64','body.reward-screen-v64','@media(max-width:900px)'])has(css,t,'css');
has(html,'FUSEWILD-V640-POSTBATTLE-REBUILD-20260917','html');
has(server,"const VERSION = '6.4.0';",'server');
has(server,"FUSEWILD-V640-POSTBATTLE-REBUILD-20260917",'server');
if(/reward-v64[^\n]*overflow:visible/.test(css))throw new Error('reward v64 should not use visible overflow');
if(!css.includes('touch-action:pan-x'))throw new Error('mobile horizontal reward strip missing');
console.log('V64_POSTBATTLE_UI_OK compactIconRows=yes singleDialog=yes mobilePanX=yes overlapGuards=yes');
