import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import path from 'node:path';import assert from 'node:assert/strict';
import {createApplication} from '../../parking-prototype/server/http.mjs';import {startBridge} from '../bridge.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=await createApplication({file:':memory:',autoTick:true,bridgeKey:'isolated-live-check'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const api=`http://127.0.0.1:${app.server.address().port}`;
const ui=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5187','--strictPort'],{cwd:path.resolve(root,'../parking-prototype'),env:{...process.env,PARKING_API_URL:api},stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let bridge;const evidence=[];
async function state(){return await (await fetch(api+'/api/state')).json();}
async function until(predicate,timeout=20000){for(let time=0;time<timeout;time+=250){const s=await state();if(predicate(s))return s;await delay(250);}throw new Error('Live condition timed out: '+JSON.stringify((await state()).wokwi));}
try{
 for(let n=0;n<60;n++){try{if((await fetch('http://127.0.0.1:5187')).ok)break;}catch{}await delay(250);}
 bridge=await startBridge({base:api,key:'isolated-live-check',headless:process.env.LIVE_HEADED!=='1',record:true,appUrl:'http://127.0.0.1:5187'});
 assert.ok(bridge.viewer,'Simultaneous viewer must be available');
 const dashboard=await bridge.context.newPage();await dashboard.goto(bridge.viewer.url);
 const page=dashboard.frameLocator('iframe');const errors=[];dashboard.on('pageerror',e=>errors.push(e.message));await until(s=>s.wokwi.connected);
 await page.getByRole('button',{name:'1. Arrive at entrance',exact:true}).waitFor({timeout:10000});
 await dashboard.waitForFunction(()=>{const image=document.querySelector('#circuit');return image?.naturalWidth>0;});
 const captureBefore=(await (await fetch(bridge.viewer.url+'/status')).json()).capturedAt;
 const before=(await state()).wokwi.telemetry.ms;await delay(10000);const after=(await state()).wokwi.telemetry.ms;
 assert.ok(after-before>=7000,`Background circuit clock stalled: only ${after-before} ms in ten seconds`);
 const captureAfter=(await (await fetch(bridge.viewer.url+'/status')).json()).capturedAt;assert.ok(captureAfter>captureBefore,'Live circuit view must continue updating');
 await page.getByLabel('Simulated vehicle plate').fill('BAD 1234');await page.getByRole('button',{name:'1. Arrive at entrance',exact:true}).click();await page.getByText('Plate is not authorized for this resident demo',{exact:true}).waitFor();assert.equal((await state()).wokwi.phase,'OUTSIDE');
 await page.getByLabel('Simulated vehicle plate').fill('VAB 8899');await page.getByRole('button',{name:'1. Arrive at entrance',exact:true}).click();
 await page.getByRole('button',{name:'2. Drive through entrance',exact:true}).click({timeout:20000});
 await page.getByRole('button',{name:'3. Reach my bay and park',exact:true}).click({timeout:20000});
 let s=await until(s=>s.wokwi.telemetry.occupancy==='PRESENT'&&s.wokwi.telemetry.entry==='CLOSED');evidence.push({step:'parked',wokwi:s.wokwi,bay:s.bays.find(b=>b.id==='R-102')});
 assert.equal(s.bays.find(b=>b.id==='R-102').position,'DOWN');await dashboard.screenshot({path:path.join(root,'evidence/app-parked.png'),fullPage:true});await bridge.page.screenshot({path:path.join(root,'evidence/circuit-parked.png'),fullPage:true});
 await page.getByRole('button',{name:'4. Leave my bay',exact:true}).click();await page.getByRole('button',{name:'5. Arrive at exit',exact:true}).click({timeout:10000});
 await page.getByRole('button',{name:'6. Drive through exit',exact:true}).click({timeout:20000});await page.getByRole('button',{name:'7. Clear exit lane',exact:true}).click({timeout:10000});
 s=await until(s=>s.wokwi.phase==='COMPLETE'&&s.wokwi.telemetry.bay==='UP',25000);evidence.push({step:'complete',wokwi:s.wokwi,bay:s.bays.find(b=>b.id==='R-102')});
 assert.equal(s.wokwi.telemetry.entry,'CLOSED');assert.equal(s.wokwi.telemetry.exit,'CLOSED');assert.equal(s.bays.find(b=>b.id==='R-102').position,'UP');assert.equal(errors.length,0,errors.join('\n'));
 const motor=await bridge.page.locator('#bayMotor').evaluate(e=>e.angle);assert.ok(Math.abs(motor)<2,'Stepper did not physically return to its initial position');
 await dashboard.screenshot({path:path.join(root,'evidence/app-complete.png'),fullPage:true});await bridge.page.screenshot({path:path.join(root,'evidence/circuit-complete.png'),fullPage:true});
 writeFileSync(path.join(root,'evidence/live-results.json'),JSON.stringify({passed:true,plateRejection:true,stepperReturned:true,finalMotorAngle:motor,evidence},null,2));
 console.log('LIVE PASS: app -> Wokwi firmware -> both barriers and reversible stepper -> observed app state.');
}catch(error){writeFileSync(path.join(root,'evidence/live-failure.json'),JSON.stringify({error:error.message,bridgeError:bridge?.error,state:await state()},null,2));if(bridge){await bridge.appPage.screenshot({path:path.join(root,'evidence/live-failure-app.png'),fullPage:true});await bridge.page.screenshot({path:path.join(root,'evidence/live-failure-circuit.png'),fullPage:true});}throw error;}finally{await bridge?.close();ui.kill();await app.close();}
