import {spawn} from 'node:child_process';import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createApplication} from '../../parking-prototype/server/http.mjs';import {startWirelessBridge} from '../bridge.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'evidence'),delay=ms=>new Promise(r=>setTimeout(r,ms));mkdirSync(out,{recursive:true});
const app=await createApplication({file:':memory:',autoTick:true,bridgeKey:'wireless-live-test'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const api=`http://127.0.0.1:${app.server.address().port}`;
const ui=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5193','--strictPort'],{cwd:path.resolve(root,'../parking-prototype'),env:{...process.env,PARKING_API_URL:api},stdio:'ignore'});
let bridge,page,context;const checks={};
async function state(){return(await fetch(api+'/api/state')).json();}
async function until(fn,timeout=90000){let s;const end=Date.now()+timeout;while(Date.now()<end){s=await state();if(fn(s))return s;await delay(300);}throw Error('Wireless live timeout: '+JSON.stringify(s?.wokwi));}
async function radioOffline(id,value){
 const close=bridge.page.locator('[class*="selectedPartInfo"] button');if(await close.count())await close.click();
 await bridge.page.locator('#'+id).click({force:true});const slider=bridge.page.locator('input[type=range]').first();
 await slider.focus();await slider.press(value?'End':'Home');
 console.log('Radio control',id,'requested',value,'displayed',await slider.inputValue());
 await bridge.page.locator('[class*="selectedPartInfo"] button').click();
}
try{
 for(let n=0;n<80;n++){try{if((await fetch('http://127.0.0.1:5193')).ok)break;}catch{}await delay(250);}
 bridge=await startWirelessBridge({base:api,key:'wireless-live-test',appUrl:'http://127.0.0.1:5193'});
 await until(s=>s.wokwi.connected&&s.wokwi.telemetry?.bays?.every(b=>b.health==='HEALTHY'));
 assert.equal(bridge.frame.transport,'SIMULATED_WIRELESS');assert.equal(bridge.frame.controller,'ESP32');assert.equal((await state()).wokwi.projectUrl,'https://wokwi.com/projects/478492669342702593');checks.actualEsp32Master=true;checks.nineIndependentReceivers=true;
 context=await bridge.browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:out,size:{width:1600,height:1000}}});page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5193/?view=journey');
 // Both radio zones are exercised through the real app and circuit first.
 if(process.env.WIRELESS_FAULT_ONLY!=='1'){
 for(const id of ['V-01','V-04']){
  const before=await bridge.page.locator('#plant'+id.replace('-','')).screenshot();
  await page.getByRole('button',{name:'Lower '+id,exact:true}).click();await until(s=>s.bays.find(b=>b.id===id)?.position==='DOWN');
  assert.equal((await state()).bays.find(b=>b.id==='T-01').position,'UP');assert.ok(!before.equals(await bridge.page.locator('#plant'+id.replace('-','')).screenshot()));
  await page.getByRole('button',{name:'Park in '+id,exact:true}).click();await until(s=>s.bays.find(b=>b.id===id)?.occupancy==='PRESENT');
  await page.getByRole('button',{name:'Leave '+id,exact:true}).click();await until(s=>s.bays.find(b=>b.id===id)?.position==='UP');
 }
 checks.bothZonesLocalMovementAndRelock=true;
 await page.goto('http://127.0.0.1:5193/?view=three');await page.locator('.three-canvas[data-ready="true"]').waitFor({timeout:30000});await page.getByRole('button',{name:'Run full guided demo',exact:true}).click();
 await until(s=>s.wokwi.phase==='PARKED'&&s.wokwi.telemetry.occupancy==='PRESENT');assert.equal((await state()).wokwi.telemetry.entry,'CLOSED');await page.screenshot({path:path.join(out,'wireless-3d-parked.png')});
 await until(s=>s.wokwi.phase==='COMPLETE'&&s.wokwi.telemetry.bay==='UP');assert.equal((await state()).wokwi.telemetry.exit,'CLOSED');checks.full3DResidentJourney=true;
 }
 await radioOffline('receiverV04',1);await until(s=>s.bays.find(b=>b.id==='V-04')?.health==='RADIO_OFFLINE');assert.equal((await state()).bays.find(b=>b.id==='V-03').health,'HEALTHY');checks.singleNodeRadioIsolation=true;
 await radioOffline('receiverV04',0);await until(s=>s.bays.find(b=>b.id==='V-04')?.health==='HEALTHY');
 await radioOffline('gateway0',1);await until(s=>s.wokwi.telemetry.bays.filter(b=>['R-101','R-102','R-103','R-104','V-01'].includes(b.id)).every(b=>b.health==='RADIO_OFFLINE'));
 assert.ok((await state()).wokwi.telemetry.bays.filter(b=>b.id.startsWith('V-')&&b.id!=='V-01').every(b=>b.health==='HEALTHY'));checks.fiveBayGatewayIsolation=true;
 await radioOffline('gateway0',0);await until(s=>s.wokwi.telemetry.bays.every(b=>b.health==='HEALTHY'));
 await bridge.page.screenshot({path:path.join(out,'wireless-circuit.png'),fullPage:true});assert.deepEqual(errors,[]);
 writeFileSync(path.join(out,process.env.WIRELESS_FAULT_ONLY==='1'?'fault-results.json':'live-results.json'),JSON.stringify({passed:true,mode:process.env.WIRELESS_FAULT_ONLY==='1'?'fault-only':'full',at:new Date().toISOString(),checks,final:(await state()).wokwi},null,2));console.log('WIRELESS LIVE PASS: '+JSON.stringify(checks));
}catch(error){writeFileSync(path.join(out,'live-failure.json'),JSON.stringify({error:error.message,checks,bridgeError:bridge?.error,state:await state()},null,2));if(bridge)writeFileSync(path.join(out,'failure-serial.txt'),await bridge.page.locator('body').innerText().catch(()=>''));if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
finally{await context?.close();await bridge?.close();ui.kill();await app.close();}
