import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const require=createRequire(new URL('../tools/mcp-node/package.json',import.meta.url));
const {chromium}=require('playwright');
const base=process.env.SMOKE_URL||'http://web',live=process.env.SMOKE_LIVE==='1';
const output=new URL('../wokwi-integrated/evidence/',import.meta.url);
await mkdir(output,{recursive:true});
async function state(){const response=await fetch(base+'/api/state');assert.equal(response.status,200);return response.json();}
async function until(predicate,timeout=180000){const end=Date.now()+timeout;while(Date.now()<end){const s=await state();if(predicate(s))return s;await new Promise(r=>setTimeout(r,500));}throw new Error('Timed out waiting for firmware: '+JSON.stringify((await state()).wokwi));}
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true,recordVideo:{dir:output.pathname,size:{width:1600,height:1000}}});
const creatorKey=process.env.PARKING_CREATOR_KEY||await readFile(new URL('../parking-prototype/data/creator-console-key',import.meta.url),'utf8').then(s=>s.trim()).catch(()=>'');
if(creatorKey)await context.addInitScript(key=>sessionStorage.setItem('baypilot-creator-key',key),creatorKey);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 const initial=await state();assert.equal(initial.bays.length,9);
 await page.goto(base+'/?view=overview');await page.getByRole('button',{name:'Live journey',exact:true}).waitFor();
 await page.goto(base+'/?view=three');await page.locator('.three-canvas[data-ready="true"]').waitFor({timeout:45000});
 assert.equal(await page.locator('canvas').count()>0,true);
 assert.equal(await page.getByRole('link',{name:'Circuit lab'}).getAttribute('href'),'/circuit/');
 await page.getByRole('button',{name:'Cutaway',exact:true}).click();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download 3D model',exact:true}).click();
 const download=await downloadPromise;await download.saveAs(new URL('docker-building.glb',output).pathname);
 if(live){
  await until(s=>s.wokwi.connected&&s.wokwi.telemetry?.bays?.length===9);
  const image=await fetch(base+'/circuit/circuit.jpg');assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/jpeg/);
  const html=await (await fetch(base+'/circuit/')).text();assert.match(html,/BayPilot app controls/);
  await page.getByRole('button',{name:'Full building',exact:true}).click();
  await page.getByRole('button',{name:'Run full guided demo',exact:true}).click();
  await until(s=>s.wokwi.phase==='PARKED'&&s.wokwi.telemetry.occupancy==='PRESENT');
  const parked=await state();assert.equal(parked.wokwi.telemetry.bay,'DOWN');assert.equal(parked.wokwi.telemetry.entry,'CLOSED');
  await page.screenshot({path:new URL('docker-parked.png',output).pathname});
  const final=await until(s=>s.wokwi.phase==='COMPLETE'&&s.wokwi.telemetry.bay==='UP');
  assert.equal(final.wokwi.telemetry.entry,'CLOSED');assert.equal(final.wokwi.telemetry.exit,'CLOSED');
 }
 assert.deepEqual(errors,[]);
 await page.screenshot({path:new URL('docker-complete.png',output).pathname});
 await writeFile(new URL('docker-smoke.json',output),JSON.stringify({passed:true,live,at:new Date().toISOString(),state:await state()},null,2));
 console.log(live?'PASS: Docker app, WebGL, export, circuit image and full firmware-driven 3D journey.':'PASS: Docker app, nine bays, WebGL scene, portable circuit link and model export (offline).');
}catch(error){await page.screenshot({path:new URL('docker-failure.png',output).pathname}).catch(()=>{});await writeFile(new URL('docker-failure.json',output),JSON.stringify({error:error.message,state:await state()},null,2));throw error;}
finally{await context.close();await browser.close();}
