// Explicit opt-in: operates the synthetic running circuit and never resets it.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
if(process.env.RUN_CENTRAL_LIVE!=='1')throw Error('Set RUN_CENTRAL_LIVE=1 to operate the local synthetic demo.');
const {chromium}=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url))('playwright'),base=process.env.LIVE_DEMO_URL||'http://localhost:8080',out=new URL('../artifacts/central/',import.meta.url);await mkdir(out,{recursive:true});
const key=process.env.PARKING_CREATOR_KEY||execFileSync('docker',['compose','-f','compose.yaml','exec','-T','api','cat','data/creator-console-key'],{cwd:new URL('../../',import.meta.url),encoding:'utf8'}).trim();
async function api(route,body,id='developer'){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer demo:'+id,'content-type':'application/json',...(id==='developer'?{'x-creator-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
const core=()=>api('/api/state'),central=()=>api('/api/public/central/state');
async function until(check,timeout=180000){const end=Date.now()+timeout;while(Date.now()<end){const c=await central(),s=await core();if(await check(s,c))return {s,c};await new Promise(r=>setTimeout(r,700));}throw Error('Live central condition timed out: '+JSON.stringify((await core()).wokwi));}
const initial=await core();assert.ok(initial.wokwi.connected);assert.ok(['OUTSIDE','COMPLETE'].includes(initial.wokwi.phase),'Finish existing trip before rehearsal');assert.equal(initial.wokwi.pending,0);assert.equal(initial.wokwi.telemetry.entry,'CLOSED');assert.equal(initial.wokwi.telemetry.exit,'CLOSED');
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),context=await browser.newContext({viewport:{width:1024,height:768}}),page=await context.newPage(),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
try{
 const c=await central();assert.equal(c.bays.length,48);assert.equal(c.bays.filter(b=>b.fresh).length,9);assert.ok(c.bays.filter(b=>b.mapping==='UNCOMMISSIONED').every(b=>!b.fresh&&b.position==='UNKNOWN'));checks.push('48-slot registry / nine fresh endpoints / 39 unknown slots');
 await page.goto(base+'/central');await page.getByLabel('Creator key',{exact:true}).fill(key);await page.getByRole('button',{name:'Unlock creator console',exact:true}).click();await page.locator('[data-central-ready="true"]').waitFor();
 await page.getByLabel('Observed demo plate',{exact:true}).fill('VAB8899');await page.getByRole('button',{name:'Simulate plate entry',exact:true}).click();await page.getByText('VAB8899 / R-102',{exact:true}).waitFor();
 const started=await central(),j=started.journeys.find(j=>!['COMPLETE','FAILED'].includes(j.phase));assert.ok(j);assert.equal(j.route.controllerId,'BC-001');assert.equal(j.route.nodeAddress,2);
 const owner=await api('/api/public/state',undefined,'resident-alicia'),staff=await api('/api/public/state',undefined,'security-res');assert.ok(owner.residential.journeys.some(v=>v.id===j.id));assert.ok(staff.residential.journeys.some(v=>v.id===j.id));checks.push('Central UI plate entry resolves existing owner and shared security journey');
 await page.screenshot({path:fileURLToPath(new URL('live-central-entry.png',out)),fullPage:true});
 await page.goto(base+'/?view=three');await page.locator('.three-canvas[data-ready="true"]').waitFor({timeout:45000});
 const parked=await until(s=>s.wokwi.phase==='PARKED'&&s.bays.find(b=>b.id==='R-102')?.occupancy==='PRESENT');assert.equal(parked.s.wokwi.configuration.journeyId,j.id);assert.equal(parked.c.commands.find(v=>v.id===j.id)?.status,'PARKED');checks.push('Compiled ESP32 observed entry and parking; central journal PARKED');
 await page.screenshot({path:fileURLToPath(new URL('live-central-parked.png',out))});await page.getByRole('button',{name:'Leave my bay',exact:true}).click();
 const complete=await until((s,c)=>s.wokwi.phase==='COMPLETE'&&s.bays.find(b=>b.id==='R-102')?.position==='UP'&&c.commands.find(v=>v.id===j.id)?.status==='COMPLETE');assert.equal(complete.s.wokwi.telemetry.entry,'CLOSED');assert.equal(complete.s.wokwi.telemetry.exit,'CLOSED');checks.push('Departure, relock and closed entrance/exit; central journal COMPLETE');
 const exported=await api('/api/public/central/export');assert.ok(exported.commands.some(v=>v.id===j.id));assert.equal(JSON.stringify(exported).includes(key),false);
 const unauth=await fetch(base+'/api/public/central/state',{headers:{authorization:'Bearer demo:public-visitor'}});assert.equal(unauth.status,403);checks.push('Export contains routed journey; public identity denied full registry');
 const gallery=await context.newPage();await gallery.goto(base+'/hardware/');await gallery.waitForFunction(()=>document.images.length===8&&[...document.images].every(i=>i.complete&&i.naturalWidth>0));await gallery.close();assert.deepEqual(errors,[]);
 await writeFile(new URL('live-results.json',out),JSON.stringify({passed:true,at:new Date().toISOString(),journeyId:j.id,route:j.route,checks,pageErrors:errors},null,2));console.log('CENTRAL LIVE PASS: '+checks.join('; '));
}catch(error){await writeFile(new URL('live-failure.json',out),JSON.stringify({error:error.message,state:await core(),central:await central(),body:await page.locator('body').innerText().catch(()=>''),errors},null,2));throw error;}finally{await context.close();await browser.close();}
