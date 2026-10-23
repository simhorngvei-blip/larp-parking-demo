import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../tools/mcp-node/package.json',import.meta.url));
const {chromium}=require('playwright');
const base=process.env.SMOKE_URL||'http://localhost:8080';
const output=new URL('../wokwi-integrated/evidence/',import.meta.url);await mkdir(output,{recursive:true});
const state=async()=>await(await fetch(base+'/api/state')).json();
async function until(fn,timeout=240000){const end=Date.now()+timeout;while(Date.now()<end){const s=await state();if(s.wokwi.error)throw Error(s.wokwi.error);if(fn(s))return s;await new Promise(r=>setTimeout(r,500));}throw Error('Timed out: '+JSON.stringify((await state()).wokwi));}
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:fileURLToPath(output),size:{width:1600,height:1000}}}),page=await context.newPage(),errors=[],checks=[];
const creatorKey=process.env.PARKING_CREATOR_KEY||await readFile(new URL('../parking-prototype/data/creator-console-key',import.meta.url),'utf8').then(s=>s.trim()).catch(()=>'');
if(!creatorKey)throw Error('Provide PARKING_CREATOR_KEY or mount the demo-data key file for configuration smoke tests.');
await context.addInitScript(key=>sessionStorage.setItem('baypilot-creator-key',key),creatorKey);
page.on('pageerror',e=>errors.push(e.message));
try{
 await until(s=>s.wokwi.connected&&s.wokwi.telemetry?.bays?.every(b=>b.health==='HEALTHY'));
 await page.goto(base+'/?view=three');await page.locator('.three-canvas[data-ready="true"]').waitFor();
 for(const [plate,level,id]of [['ABC1234','1','V-01'],['DEMO2026','2','V-04']]){
  await page.getByRole('textbox',{name:'Vehicle registration',exact:true}).fill(plate);
  await page.getByLabel('Parking level',{exact:true}).selectOption(level);
  await page.getByLabel('Assigned bay',{exact:true}).selectOption(id);
  await page.getByRole('button',{name:'Apply demo settings',exact:true}).click();
  await until(s=>s.wokwi.configuration?.plate===plate&&s.wokwi.configuration.bayId===id);
  await page.getByRole('button',{name:'Run full guided demo',exact:true}).click();
  await until(s=>s.wokwi.phase==='PARKED'&&s.bays.find(b=>b.id===id)?.occupancy==='PRESENT');
  const parked=await state();assert.equal(parked.bays.find(b=>b.id===id).position,'DOWN');assert.equal(parked.bays.find(b=>b.id==='R-102').position,'UP','Ground bay must stay locked');
  assert.ok(parked.visits.some(v=>v.plate===plate&&v.bayId===id));
  assert.equal(await page.getByLabel('Parking level',{exact:true}).isDisabled(),true);
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download 3D model',exact:true}).click();const download=await downloading;const modelPath=fileURLToPath(new URL(`multilevel-${level}-parked.glb`,output));await download.saveAs(modelPath);const glb=await readFile(modelPath),jsonLength=glb.readUInt32LE(12),model=JSON.parse(glb.subarray(20,20+jsonLength).toString('utf8')),car=model.nodes.find(n=>n.name==='Tenant_car');assert.ok(car,'Export contains the tenant vehicle');const height=car.translation?.[1]??car.matrix?.[13]??0;assert.ok(Math.abs(height-Number(level)*4)<.1,'Rendered tenant car is on the selected deck');
  await page.getByRole('button',{name:'My bay',exact:true}).click();await page.screenshot({path:fileURLToPath(new URL(`multilevel-${level}-parked.png`,output))});
  await until(s=>s.wokwi.phase==='COMPLETE'&&s.bays.find(b=>b.id===id)?.position==='UP');
  await page.getByRole('button',{name:'Apply demo settings',exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Run full guided demo',exact:true}).waitFor();
  checks.push({plate,level:Number(level),bayId:id,completed:true});
 }
 assert.deepEqual(errors,[]);
 await page.screenshot({path:fileURLToPath(new URL('multilevel-complete.png',output))});
 await writeFile(new URL('multilevel-results.json',output),JSON.stringify({passed:true,at:new Date().toISOString(),checks,errors,final:await state()},null,2));
 console.log('PASS: Two configured plates, Level 1 and Level 2 journeys, selected wireless receivers, bay relock and closed exit.');
}catch(error){await page.screenshot({path:fileURLToPath(new URL('multilevel-failure.png',output))}).catch(()=>{});await writeFile(new URL('multilevel-failure.json',output),JSON.stringify({error:error.message,errors,checks,state:await state()},null,2));throw error;}
finally{await context.close();await browser.close();}
