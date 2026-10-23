// Explicit opt-in rehearsal against the running demo. Never resets the fleet.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url));
const {chromium}=require('playwright'),base=process.env.LIVE_DEMO_URL||'http://localhost:8080';
if(process.env.RUN_RESIDENTIAL_LIVE!=='1')throw Error('Set RUN_RESIDENTIAL_LIVE=1 to operate the local synthetic demo.');
const output=new URL('../artifacts/residential/',import.meta.url);await mkdir(output,{recursive:true});
const key=process.env.PARKING_CREATOR_KEY||execFileSync('docker',['compose','-f','compose.yaml','exec','-T','api','cat','data/creator-console-key'],{cwd:new URL('../../',import.meta.url),encoding:'utf8'}).trim();
async function api(route,body,id='resident-alicia'){
 const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',authorization:'Bearer demo:'+id,...(id==='developer'?{'x-creator-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)}),data=await r.json();assert.equal(r.ok,true,JSON.stringify(data));return data;
}
const publicState=id=>api('/api/public/state',undefined,id),state=()=>api('/api/state');
const selected=s=>s.wokwi.telemetry?.bays?.find(b=>b.id===s.wokwi.configuration.bayId)||s.wokwi.telemetry;
async function until(fn,timeout=180000){const end=Date.now()+timeout;while(Date.now()<end){const s=await state();await publicState();if(await fn(s))return s;await new Promise(r=>setTimeout(r,650));}throw Error('Live condition timed out: '+JSON.stringify((await state()).wokwi));}
const initial=await state();assert.ok(['OUTSIDE','COMPLETE'].includes(initial.wokwi.phase),'Existing journey must finish before this opt-in rehearsal');assert.ok(initial.wokwi.connected);
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 const lower=await api('/api/public/residential/lower',{bayId:'R-102',requestId:crypto.randomUUID()});
 await until(async()=>{const s=await publicState();return s.residential.commands.find(c=>c.id===lower.id)?.status==='CONFIRMED';});checks.push('Owner lowering confirmed by compiled circuit feedback');
 const journey=await api('/api/public/residential/arrive',{requestId:crypto.randomUUID()});
 const staff=await publicState('security-res');assert.ok(staff.residential.journeys.some(j=>j.id===journey.id));
 await page.goto(base+'/?view=three');await page.locator('.three-canvas[data-ready="true"]').waitFor({timeout:45000});
 await until(s=>s.wokwi.phase==='PARKED'&&selected(s).occupancy==='PRESENT');
 assert.equal((await state()).wokwi.configuration.journeyId,journey.id);await page.screenshot({path:fileURLToPath(new URL('live-owner-parked.png',output))});
 await page.getByRole('button',{name:'Leave my bay',exact:true}).click();
 await until(s=>s.wokwi.phase==='COMPLETE'&&selected(s).bay==='UP');checks.push('App-authorized owner trip joined by 3D, parked and exited through ESP32');
 const pass=await api('/api/public/residential/invite',{siteId:'RES-001',unit:'10-02',guestId:'public-visitor',plate:'LIVE2026',parkingBayId:'auto',requestId:crypto.randomUUID()});
 const guest=await api('/api/public/residential/arrive',{passId:pass.id,requestId:crypto.randomUUID()},'public-visitor');
 await page.waitForFunction(plate=>document.querySelector('input[aria-label="Vehicle registration"]')?.value===plate,guest.plate,{timeout:30000});
 await until(s=>s.wokwi.phase==='PARKED'&&selected(s).occupancy==='PRESENT');
 const visitor=await publicState('public-visitor');assert.equal(visitor.passes.find(p=>p.id===pass.id).status,'CHECKED_IN');assert.equal((await state()).wokwi.configuration.journeyId,guest.id);
 await page.getByRole('button',{name:'Leave my bay',exact:true}).click();
 await until(s=>s.wokwi.phase==='COMPLETE'&&selected(s).bay==='UP');assert.equal((await publicState('public-visitor')).passes.find(p=>p.id===pass.id).status,'COMPLETE');checks.push('Exclusive guest allocation entered, occupied and exited the same circuit bay');
 const before=(await state()).bays.filter(b=>b.id!=='R-104').map(b=>({id:b.id,position:b.position,occupancy:b.occupancy}));
 await api('/api/public/developer/residential',{bayId:'R-104',fault:'sensor'},'developer');
 await until(s=>s.bays.find(b=>b.id==='R-104')?.health==='SENSOR_FAULT');
 const diagnostic=(await publicState('security-res')).residential.bays.find(b=>b.id==='R-104').diagnosis;assert.equal(diagnostic.confidence,'OBSERVED');assert.match(diagnostic.cause,/unconfirmed/i);
 await api('/api/public/developer/residential',{bayId:'R-104',fault:'clear'},'developer');
 await until(s=>s.bays.find(b=>b.id==='R-104')?.health==='HEALTHY');
 assert.deepEqual((await state()).bays.filter(b=>b.id!=='R-104').map(b=>({id:b.id,position:b.position,occupancy:b.occupancy})),before);checks.push('100 cm uncertainty fault observed, scoped recovery retained other bays');
 assert.deepEqual(errors,[]);await writeFile(new URL('live-results.json',output),JSON.stringify({passed:true,at:new Date().toISOString(),checks,errors},null,2));console.log('PASS: '+checks.join('; '));
}catch(error){await writeFile(new URL('live-failure.json',output),JSON.stringify({error:error.message,state:await state(),body:await page.locator('body').innerText().catch(()=>''),errors},null,2));throw error;}
finally{await context.close();await browser.close();}
