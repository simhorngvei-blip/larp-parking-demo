import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createApplication} from '../server/http.mjs';
const {chromium}=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url))('playwright');
const app=await createApplication();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5194','--strictPort'],{cwd:new URL('../',import.meta.url),env:{...process.env,PARKING_API_URL:'http://127.0.0.1:'+app.server.address().port},stdio:'ignore'});
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5194')).ok)break}catch{}await new Promise(r=>setTimeout(r,150))}
 browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage();
 await page.addInitScript(()=>{window.drawnLabels=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,...args){window.drawnLabels.push(String(t));return original.call(this,t,...args)}});
 await page.goto('http://127.0.0.1:5194/?view=scale-three');await page.locator('.sj-canvas[data-ready="true"]').waitFor();
 const labels=await page.evaluate(()=>window.drawnLabels);
 assert.equal(labels.filter(t=>/baypilot/i.test(t)).length,0,'Rendered parking signs must use LARP');
 assert.ok(labels.some(t=>t==='LARP RESIDENCES'),'Building facade identifies LARP');
 assert.ok(labels.some(t=>t==='LARP / ENTRY'),'Entrance identifies LARP');
 console.log('LARP rendered building branding PASS');
}finally{await browser?.close();vite.kill();await app.close()}
