import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdirSync,writeFileSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createApplication} from '../server/http.mjs';import {startFullLotBridge} from '../../wokwi-parking-lot/bridge.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),artifacts=path.join(root,'artifacts/three');mkdirSync(artifacts,{recursive:true});
const app=await createApplication({file:':memory:',autoTick:true,bridgeKey:'three-live-check'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const api=`http://127.0.0.1:${app.server.address().port}`;
const ui=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5191','--strictPort'],{cwd:root,env:{...process.env,PARKING_API_URL:api},stdio:'ignore'}),delay=ms=>new Promise(r=>setTimeout(r,ms));
let bridge,context,page,video;
async function state(){return await(await fetch(api+'/api/state')).json();}
async function until(fn,timeout=180000){const end=Date.now()+timeout;while(Date.now()<end){const s=await state();if(fn(s))return s;await delay(500);}throw new Error('3D journey timed out: '+JSON.stringify((await state()).wokwi));}
try{
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:5191')).ok)break;}catch{}await delay(250);}
 bridge=await startFullLotBridge({base:api,key:'three-live-check',appUrl:'http://127.0.0.1:5191'});
 context=await bridge.browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:artifacts,size:{width:1600,height:1000}}});await context.addInitScript(key=>sessionStorage.setItem('baypilot-creator-key',key),app.creatorKey);page=await context.newPage();video=page.video();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5191/?view=three');await page.locator('.three-canvas[data-ready="true"]').waitFor({timeout:30000});await until(s=>s.wokwi.connected&&s.wokwi.telemetry.bays?.length===9);
 await page.screenshot({path:path.join(artifacts,'overview.png')});
 await page.getByRole('button',{name:'Cutaway',exact:true}).click();await delay(1400);await page.screenshot({path:path.join(artifacts,'full-building.png')});await page.getByRole('button',{name:'Full building',exact:true}).click();
 await page.getByRole('button',{name:'Driving assist',exact:true}).click();
 await page.getByRole('button',{name:'Run full guided demo',exact:true}).click({timeout:20000});
 await delay(1500);assert.equal((await state()).wokwi.phase,'OUTSIDE','Keyboard mode must wait for the accelerator');await page.keyboard.down('w');await delay(800);await page.keyboard.up('w');await page.getByRole('button',{name:'Keyboard drive',exact:true}).click();
 await until(s=>s.wokwi.phase==='PARKED'&&s.wokwi.telemetry.occupancy==='PRESENT');
 let s=await state();assert.equal(s.wokwi.telemetry.bay,'DOWN');assert.equal(s.wokwi.telemetry.entry,'CLOSED','Entrance must close after the car clears its beam');
 await page.getByRole('button',{name:'My bay',exact:true}).click();await delay(900);await page.screenshot({path:path.join(artifacts,'parked.png')});
 await until(s=>s.wokwi.phase==='COMPLETE'&&s.wokwi.telemetry.bay==='UP');await page.getByText('Journey complete',{exact:true}).waitFor({timeout:20000});
 s=await state();assert.equal(s.wokwi.telemetry.entry,'CLOSED');assert.equal(s.wokwi.telemetry.exit,'CLOSED');assert.equal(errors.length,0,errors.join('\n'));
 const events=s.events.map(e=>e.detail);assert.ok(events.some(e=>e==='clear-entry'),'3D must clear the entrance beam separately from bay parking');assert.ok(events.some(e=>e==='leave'));assert.ok(events.some(e=>e==='clear-exit'));
 await page.getByRole('button',{name:'Overview',exact:true}).click();await delay(1000);await page.screenshot({path:path.join(artifacts,'complete.png')});
 writeFileSync(path.join(artifacts,'live-results.json'),JSON.stringify({passed:true,webglRendered:true,carDrivenSensors:true,entranceClosedBeforeParking:true,stepperReturned:true,final:s.wokwi},null,2));console.log('3D LIVE PASS: rendered building and tenant car drove entrance, bay presence, departure and exit through actual Wokwi firmware.');
}catch(error){writeFileSync(path.join(artifacts,'failure.json'),JSON.stringify({error:error.message,state:await state(),body:page?await page.locator('body').innerText().catch(()=>''):''},null,2));if(page)await page.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});throw error;}finally{await context?.close();if(video)await video.saveAs(path.join(artifacts,'3d-demo.webm'));await bridge?.close();ui.kill();await app.close();}
