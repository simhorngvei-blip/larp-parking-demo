// Isolated browser acceptance with explicitly synthetic firmware observations.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createApplication} from '../server/http.mjs';
const {chromium}=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url))('playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),out=new URL('../artifacts/residential/acceptance/',import.meta.url);await mkdir(out,{recursive:true});
const app=await createApplication({autoTick:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5212','--strictPort'],{cwd:root,env:{...process.env,PARKING_API_URL:base},stdio:'ignore'});
let browser,pulse,seq=0,selected={bay:'UP',occupancy:'CLEAR',health:'HEALTHY',distance:250},entry='CLOSED',entryBeam=0;
async function api(route,body,id='resident-alicia',extra={}){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',authorization:'Bearer demo:'+id,...extra},body:body===undefined?undefined:JSON.stringify(body)}),result=await r.json();assert.ok(r.ok,JSON.stringify(result));return result;}
async function frame(){return api('/api/wokwi/poll',{frame:{kind:'telemetry',seq:++seq,ms:seq*1000,bay:'UP',occupancy:'CLEAR',health:'HEALTHY',distance:250,entry,exit:'CLOSED',entryBeam,exitBeam:0,emergency:0,bays:['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'].map(id=>({id,bay:'UP',occupancy:'CLEAR',health:'HEALTHY',distance:250,...(id==='V-01'?selected:{})}))}},'developer',{'x-bridge-key':app.bridgeKey});}
try{
 for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:5212')).ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
 await frame();const pass=await api('/api/public/residential/invite',{guestId:'public-visitor',siteId:'RES-001',unit:'10-02',plate:'SAFE2026',parkingBayId:'V-01',requestId:'browser-invite'});
 const j=await api('/api/public/residential/arrive',{passId:pass.id,requestId:'browser-arrive'},'public-visitor');
 selected.bay='DOWN';entry='OPEN';await frame();await api('/api/public/residential/action',{journeyId:j.id,action:'enter'},'public-visitor');entryBeam=1;await frame();await api('/api/public/residential/action',{journeyId:j.id,action:'park'},'public-visitor');
 selected.occupancy='PRESENT';selected.distance=30;entry='CLOSED';entryBeam=0;await frame();pulse=setInterval(()=>frame().catch(()=>{}),900);
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),three=await context.newPage();page.setDefaultTimeout(15000);
 await page.goto('http://127.0.0.1:5212/app?identity=public-visitor');await page.getByRole('button',{name:'Visitor passes',exact:true}).click();
 await api('/api/public/passes/decision',{id:pass.id,decision:'revoke'});await page.getByText(/Entry withdrawn\. No re-entry/).waitFor();assert.equal(await page.getByRole('button',{name:'Leave parking bay',exact:true}).isEnabled(),true);
 await three.goto('http://127.0.0.1:5212/?view=three');await three.getByRole('button',{name:'Leave my bay',exact:true}).waitFor({timeout:45000});
 selected={bay:'UNKNOWN',occupancy:'UNCERTAIN',health:'OFFLINE',distance:-1};await frame();await page.getByText(/Vehicle progression is paused/).waitFor();
 assert.equal(await page.getByRole('button',{name:'Leave parking bay',exact:true}).isDisabled(),true);await three.waitForFunction(()=>document.querySelector('.three-error')?.textContent?.includes('inspection'));assert.equal(await three.getByRole('button',{name:'Leave my bay',exact:true}).isDisabled(),true);
 selected={bay:'DOWN',occupancy:'PRESENT',health:'HEALTHY',distance:30};await frame();await page.goto('http://127.0.0.1:5212/security');await page.getByRole('button',{name:'Resume parked vehicle after inspection',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Resume parked vehicle after inspection',exact:true}).isDisabled(),true);
 await page.locator('.p-fleet-bay').filter({hasText:'V-01'}).click();await page.getByLabel('Control / patrol reason',{exact:true}).fill('Patrol inspected the parked car and both closed entrance and exit lanes');await page.getByLabel('Plate observed at this bay',{exact:true}).fill('SAFE2026');await page.getByRole('button',{name:'Record patrol observation',exact:true}).click();
 await page.getByRole('button',{name:'Resume parked vehicle after inspection',exact:true}).click();await page.getByRole('status').filter({hasText:'observed parked vehicle'}).waitFor();
 await three.waitForFunction(()=>!document.querySelector('.three-error'));assert.equal(await three.getByRole('button',{name:'Leave my bay',exact:true}).isEnabled(),true);
 const s=await api('/api/public/state',undefined,'public-visitor');assert.equal(s.passes.find(p=>p.id===pass.id).status,'EXIT_ONLY');assert.equal(s.residential.journeys.find(v=>v.id===j.id).phase,'PARKED');
 await page.screenshot({path:fileURLToPath(new URL('inspection-security.png',out)),fullPage:true});await writeFile(new URL('browser-results.json',out),JSON.stringify({passed:true,at:new Date().toISOString(),source:'ISOLATED_SYNTHETIC_FIRMWARE_FRAMES',checks:['revoked visitor has exit-only controls','uncertainty disables user and 3D movement','healthy reconnection alone does not resume','staff requires matching at-bay plate before inspected recovery','same 3D tab regains parked departure after inspection','revocation retained after recovery']},null,2));console.log('EXCEPTION BROWSER PASS');
}finally{clearInterval(pulse);await browser?.close();vite.kill();await app.close();}
