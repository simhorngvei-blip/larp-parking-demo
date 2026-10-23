import {spawn} from 'node:child_process';import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createApplication} from '../../parking-prototype/server/http.mjs';import {startFullLotBridge} from '../bridge.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),delay=ms=>new Promise(r=>setTimeout(r,ms));mkdirSync(path.join(root,'evidence'),{recursive:true});
const app=await createApplication({file:':memory:',autoTick:true,bridgeKey:'full-lot-live'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const api=`http://127.0.0.1:${app.server.address().port}`;
const ui=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5189','--strictPort'],{cwd:path.resolve(root,'../parking-prototype'),env:{...process.env,PARKING_API_URL:api},stdio:'ignore'});
let bridge,dashboard;
async function state(){return await(await fetch(api+'/api/state')).json();}
async function until(fn,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const s=await state();if(fn(s))return s;await delay(300);}throw new Error('Live condition timed out: '+JSON.stringify((await state()).wokwi));}
try{
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:5189')).ok)break;}catch{}await delay(250);}
 bridge=await startFullLotBridge({base:api,key:'full-lot-live',appUrl:'http://127.0.0.1:5189'});
 dashboard=await bridge.context.newPage();await dashboard.goto(bridge.viewer.url);const page=dashboard.frameLocator('iframe');
 await until(s=>s.wokwi.connected&&s.wokwi.telemetry.bays.length===9&&s.wokwi.telemetry.bays.every(b=>b.health==='HEALTHY'));
 if(process.env.LOT_COVERAGE==='1'){
  const otherIds=(await state()).bays.map(b=>b.id).filter(id=>id!=='R-102');
  for(const bayId of ['R-101','R-103'])await fetch(api+'/api/simulation/presence',{method:'POST',headers:{'content-type':'application/json','x-demo-actor':'management'},body:JSON.stringify({bayId,distance:250})});
  await until(s=>otherIds.every(id=>s.bays.find(b=>b.id===id).position==='UP'),45000);
  for(const id of otherIds)await page.getByRole('button',{name:'Lower '+id,exact:true}).click({timeout:10000});
  await until(s=>otherIds.every(id=>s.bays.find(b=>b.id===id).position==='DOWN'),30000);
  for(const id of otherIds)await page.getByRole('button',{name:'Park in '+id,exact:true}).click({timeout:10000});
  await until(s=>otherIds.every(id=>s.bays.find(b=>b.id===id).occupancy==='PRESENT'),30000);
  await dashboard.screenshot({path:path.join(root,'evidence/all-bays-parked.png'),fullPage:true});
  for(const id of otherIds)await page.getByRole('button',{name:'Leave '+id,exact:true}).click({timeout:10000});
  await until(s=>otherIds.every(id=>s.bays.find(b=>b.id===id).position==='UP'),45000);
  console.log('Eight non-resident-journey bays completed independent lower / park / leave / raise cycles.');
 }
 const beforeImage=await bridge.page.locator('#plantV04').screenshot();
 await page.getByRole('button',{name:'Lower V-04',exact:true}).click({timeout:10000});await until(s=>s.bays.find(b=>b.id==='V-04').position==='DOWN');
 const afterImage=await bridge.page.locator('#plantV04').screenshot();assert.ok(!beforeImage.equals(afterImage),'The actual parking barrier image must change');
 let s=await state();assert.equal(s.bays.find(b=>b.id==='T-01').position,'UP');
 await page.getByRole('button',{name:'Park in V-04',exact:true}).click();await until(s=>s.bays.find(b=>b.id==='V-04').occupancy==='PRESENT');
 await dashboard.screenshot({path:path.join(root,'evidence/full-lot-parked.png'),fullPage:true});
 await page.getByRole('button',{name:'Leave V-04',exact:true}).click();await until(s=>s.bays.find(b=>b.id==='V-04').position==='UP',45000);
 const visitResponse=await fetch(api+'/api/visits',{method:'POST',headers:{'content-type':'application/json','x-demo-actor':'guard'},body:JSON.stringify({name:'Wokwi Visitor',plate:'VIS2345',unit:'10-02'})});const visit=await visitResponse.json();
 const assign=await fetch(api+'/api/visits/assign',{method:'POST',headers:{'content-type':'application/json','x-demo-actor':'guard'},body:JSON.stringify({id:visit.id})});const assigned=await assign.json();assert.equal(assign.status,200);
 await until(s=>s.bays.find(b=>b.id===assigned.bayId).position==='DOWN');
 for(const distance of [30,250]){const response=await fetch(api+'/api/simulation/presence',{method:'POST',headers:{'content-type':'application/json','x-demo-actor':'guard'},body:JSON.stringify({bayId:assigned.bayId,distance})});assert.equal(response.status,200);await until(s=>s.bays.find(b=>b.id===assigned.bayId).occupancy===(distance===30?'PRESENT':'CLEAR'));}
 await until(s=>s.bays.find(b=>b.id===assigned.bayId).position==='UP',45000);
 await page.getByRole('button',{name:'1. Arrive at entrance',exact:true}).click();await page.getByRole('button',{name:'2. Drive through entrance',exact:true}).click({timeout:20000});await page.getByRole('button',{name:'3. Reach my bay and park',exact:true}).click({timeout:20000});
 await until(s=>s.wokwi.telemetry.entry==='CLOSED'&&s.wokwi.telemetry.occupancy==='PRESENT');
 await page.getByRole('button',{name:'4. Leave my bay',exact:true}).click();await page.getByRole('button',{name:'5. Arrive at exit',exact:true}).click({timeout:15000});await page.getByRole('button',{name:'6. Drive through exit',exact:true}).click({timeout:15000});await page.getByRole('button',{name:'7. Clear exit lane',exact:true}).click({timeout:15000});
 s=await until(s=>s.wokwi.phase==='COMPLETE'&&s.wokwi.telemetry.bay==='UP',45000);assert.equal(s.wokwi.telemetry.exit,'CLOSED');
 const first=await(await fetch(bridge.viewer.url+'/status')).json();await delay(5000);const last=await(await fetch(bridge.viewer.url+'/status')).json();assert.ok(last.capturedAt>first.capturedAt);assert.ok(last.frameAgeMs<4000);
 await dashboard.screenshot({path:path.join(root,'evidence/full-lot-complete.png'),fullPage:true});await bridge.page.screenshot({path:path.join(root,'evidence/circuit-complete.png'),fullPage:true});
 writeFileSync(path.join(root,'evidence/live-results.json'),JSON.stringify({passed:true,allNineBayCycles:process.env.LOT_COVERAGE==='1',visibleParkingBarrierChanges:true,visitorAssignment:true,independentBayReturn:true,residentEntranceExit:true,frameAgeMs:last.frameAgeMs,final:s.wokwi},null,2));console.log('FULL LOT LIVE PASS: visible bay barriers, independent parking/departure, visitor allocation and resident entrance/exit.');
}catch(error){writeFileSync(path.join(root,'evidence/live-failure.json'),JSON.stringify({error:error.message,bridgeError:bridge?.error,state:await state()},null,2));if(dashboard)await dashboard.screenshot({path:path.join(root,'evidence/live-failure.png'),fullPage:true}).catch(()=>{});throw error;}finally{await bridge?.close();ui.kill();await app.close();}
