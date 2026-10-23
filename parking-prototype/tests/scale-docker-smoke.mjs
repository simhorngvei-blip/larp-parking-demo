import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url));const {chromium}=require('playwright');
const base=process.env.SMOKE_URL||'http://localhost:8080';const output=new URL('../artifacts/scale/',import.meta.url);await mkdir(output,{recursive:true});
async function get(p){const r=await fetch(base+p);assert.ok(r.ok,`${p}: ${r.status}`);return r.json();}
async function post(p,body,actor='management'){const r=await fetch(base+p,{method:'POST',headers:{'content-type':'application/json','x-demo-actor':actor},body:JSON.stringify(body)});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;}
async function until(fn,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){const state=await get('/api/state');if(state.wokwi.error)throw Error(state.wokwi.error);if(fn(state))return state;await new Promise(r=>setTimeout(r,400));}throw Error('Wokwi did not reach expected observed state');}
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await post('/api/scale/configure',{sites:1,baysPerSite:500,levels:10});
 await page.goto(base+'/?view=scale');await page.locator('.sd-canvas canvas').waitFor();await page.getByRole('button',{name:'Run 20 vehicles',exact:true}).click();
 for(let n=0;n<7;n++)await post('/api/scale/advance',{milliseconds:1000});
 await page.waitForFunction(()=>document.querySelector('.sd-tablewrap')?.textContent?.includes('automatic'));
 await page.screenshot({path:fileURLToPath(new URL('docker-active-500.png',output)),fullPage:true});
 for(let n=0;n<120;n++)await post('/api/scale/advance',{milliseconds:1000});
 const scaled=await get('/api/scale/state');assert.equal(scaled.summary.completed,20);assert.equal(scaled.summary.reserved,0);assert.ok(scaled.bays.every(b=>b.position==='UP'));
 await post('/api/scale/fault',{siteId:'SITE-001',kind:'gateway',id:'ZONE-001',active:true});assert.equal((await get('/api/scale/state')).bays.filter(b=>b.health==='GATEWAY_OFFLINE').length,5);await post('/api/scale/fault',{siteId:'SITE-001',kind:'gateway',id:'ZONE-001',active:false});
 let original=await get('/api/state');assert.equal(original.bays.length,9);assert.equal(original.wokwi.connected,true);assert.ok(original.bays.every(b=>b.health==='HEALTHY'));
 if(process.argv.includes('--wokwi')){
  assert.equal(original.wokwi.phase,'OUTSIDE');const selected=original.wokwi.configuration.bayId;
  await post('/api/journey/arrive',{plate:original.wokwi.configuration.plate},'resident');await until(s=>s.wokwi.telemetry.entry==='OPEN'&&s.bays.find(b=>b.id===selected).position==='DOWN');
  await post('/api/journey/action',{action:'enter'},'resident');await until(s=>s.wokwi.telemetry.entryBeam===1);
  await post('/api/journey/action',{action:'park'},'resident');await until(s=>s.bays.find(b=>b.id===selected).occupancy==='PRESENT');
  await post('/api/journey/action',{action:'leave'},'resident');await until(s=>s.bays.find(b=>b.id===selected).occupancy==='CLEAR');
  await post('/api/journey/action',{action:'exit'},'resident');await until(s=>s.wokwi.telemetry.exit==='OPEN');
  await post('/api/journey/action',{action:'pass-exit'},'resident');await until(s=>s.wokwi.telemetry.exitBeam===1);
  await post('/api/journey/action',{action:'clear-exit'},'resident');await until(s=>s.wokwi.phase==='COMPLETE'&&s.bays.find(b=>b.id===selected).position==='UP'&&s.wokwi.telemetry.entry==='CLOSED'&&s.wokwi.telemetry.exit==='CLOSED');
  await post('/api/journey/action',{action:'reset'},'resident');await until(s=>s.wokwi.phase==='OUTSIDE'&&s.wokwi.pending===0);original=await get('/api/state');
 }
 assert.deepEqual(errors,[]);await page.screenshot({path:fileURLToPath(new URL('docker-ready-500.png',output)),fullPage:true});
 await writeFile(new URL('docker-smoke-results.json',output),JSON.stringify({passed:true,date:new Date().toISOString(),scaled:{bays:scaled.total.bays,completed:scaled.summary.completed,gatewayOutageAffected:5},original:{bays:original.bays.length,connected:original.wokwi.connected,phase:original.wokwi.phase,pending:original.wokwi.pending,fullWokwiJourney:process.argv.includes('--wokwi')},pageErrors:errors},null,2));console.log('PASS: Docker 500-bay batch, five-node outage and original live circuit'+(process.argv.includes('--wokwi')?' full entry/parking/exit journey':''));
}catch(error){await writeFile(new URL('docker-smoke-failure.json',output),JSON.stringify({error:error.message},null,2));throw error;}finally{await browser.close();}
