import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createApplication} from '../server/http.mjs';
const require=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url)),{chromium}=require('playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),out=new URL('../artifacts/central/',import.meta.url);await mkdir(out,{recursive:true});
const app=await createApplication();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const api='http://127.0.0.1:'+app.server.address().port;
const base='http://127.0.0.1:5213',vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5213','--strictPort'],{cwd:root,env:{...process.env,PARKING_API_URL:api},stdio:'pipe'});
let browser,timer,seq=0;const errors=[],ids=['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'];
async function frame(){await fetch(api+'/api/wokwi/poll',{method:'POST',headers:{'content-type':'application/json','x-bridge-key':app.bridgeKey},body:JSON.stringify({instance:'central-browser',frame:{kind:'telemetry',seq:++seq,ms:seq*1000,bay:'UP',entry:'CLOSED',exit:'CLOSED',occupancy:'CLEAR',distance:250,health:'HEALTHY',emergency:0,entryBeam:0,exitBeam:0,bays:ids.map(id=>({id,bay:'UP',occupancy:'CLEAR',distance:250,health:'HEALTHY'}))}})});}
try{
 for(let i=0;i<80;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/central');await page.getByLabel('Creator key',{exact:true}).waitFor();assert.equal(await page.locator('[data-central-ready]').count(),0);
 await page.getByLabel('Creator key',{exact:true}).fill(app.creatorKey);await page.getByRole('button',{name:'Unlock creator console',exact:true}).click();await page.locator('[data-central-ready="true"]').waitFor();
 assert.equal(await page.getByRole('button',{name:/Inspect central bay /}).count(),48);assert.equal(await page.locator('.c-controller').count(),8);assert.equal(await page.locator('.c-slot.uncommissioned').count(),39);
 assert.equal(await page.getByRole('button',{name:'Simulate plate entry',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Inspect central bay V-02',exact:true}).click();assert.match(await page.locator('.c-route').innerText(),/BC-001[\s\S]*Node 6/);
 await page.getByRole('button',{name:'Inspect central bay P-048',exact:true}).click();assert.match(await page.locator('.c-route').innerText(),/BC-008[\s\S]*Node 6/);await page.getByText('NOT COMMISSIONED',{exact:true}).waitFor();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export registry and schema',exact:true}).click();const download=await downloadPromise;const data=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(data.topology.bays.length,48);assert.equal(JSON.stringify(data).includes(app.creatorKey),false);assert.ok(data.vehicles.some(v=>v.plate==='VAB8899'));
 await frame();timer=setInterval(()=>void frame(),1000);await page.waitForFunction(()=>!document.querySelector('.central-console form button')?.disabled);
 await page.getByRole('button',{name:'Inspect central bay R-102',exact:true}).click();await page.getByRole('button',{name:'Simulate plate entry',exact:true}).click();await page.getByText('VAB8899 / R-102',{exact:true}).waitFor();await page.getByRole('link',{name:'Open connected 3D journey',exact:true}).waitFor();
 const owner=await (await fetch(api+'/api/public/state',{headers:{authorization:'Bearer demo:resident-alicia'}})).json();assert.equal(owner.residential.journeys.length,1);assert.equal(owner.residential.journeys[0].route.controllerId,'BC-001');
 await page.screenshot({path:fileURLToPath(new URL('central-desktop.png',out)),fullPage:true});
 await page.setViewportSize({width:393,height:830});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:fileURLToPath(new URL('central-mobile.png',out)),fullPage:true});
 await page.goto(base+'/hardware/');assert.equal(await page.locator('img').count(),8);await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));const pdf=await (await fetch(base+'/hardware/BayPilot-Circuit-Pack.pdf')).arrayBuffer();assert.equal((Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,8);
 assert.deepEqual(errors,[]);await writeFile(new URL('browser-results.json',out),JSON.stringify({passed:true,at:new Date().toISOString(),checks:['creator lock','48 slots / 8 groups / 39 uncommissioned','route inspection','no arrival while disconnected','private export without keys','central arrival is shared owner journey','phone width','eight circuit sheets and eight-page PDF'],pageErrors:errors},null,2));console.log('CENTRAL BROWSER PASS');
}finally{clearInterval(timer);await browser?.close();vite.kill();await app.close();}
