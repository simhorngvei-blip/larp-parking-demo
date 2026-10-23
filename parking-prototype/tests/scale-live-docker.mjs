// Check the deployed production bundle without resetting the persistent fleet.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url)),{chromium}=require('playwright'),base=process.env.SMOKE_URL||'http://localhost:8080',out=new URL('../artifacts/scale-live/',import.meta.url);
const state=async()=>await(await fetch(base+'/api/scale/state?building=1')).json();
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const before=await state();assert.equal(before.config.baysPerSite,500);assert.equal(before.config.levels,10);const bay=before.bays.find(b=>b.level===0&&b.position==='UP'&&b.health==='HEALTHY'&&b.occupancy==='CLEAR');assert.ok(bay,'A healthy vacant ground bay is needed');
 await page.goto(base+'/?view=scale-three');await page.locator('.sj-canvas[data-ready="true"]').waitFor();
 await page.getByLabel('Journey vehicle registration',{exact:true}).fill('POLISH2026');await page.getByLabel('Journey parking level',{exact:true}).selectOption('0');await page.getByLabel('Journey assigned bay',{exact:true}).selectOption(bay.id);await page.getByLabel('Journey playback speed',{exact:true}).selectOption('8');await page.getByRole('button',{name:'Drive in & park',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.sj-canvas')?.getAttribute('data-stage')==='parked',{},{timeout:90000});assert.equal((await state()).bays.find(b=>b.id===bay.id).occupancy,'PRESENT');
 await page.getByRole('button',{name:'My bay',exact:true}).click();await page.waitForTimeout(800);await page.screenshot({path:fileURLToPath(new URL('docker-polished-parked.png',out))});assert.ok(await page.locator('.sj-canvas').getAttribute('data-resolution-scale'),'Updated adaptive renderer must be deployed');
 await page.getByRole('button',{name:'Leave my bay',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sj-canvas')?.getAttribute('data-stage')==='complete',{},{timeout:90000});
 for(let n=0;n<60;n++){if((await state()).bays.find(b=>b.id===bay.id).position==='UP')break;await page.waitForTimeout(250);}
 const final=await state(),j=final.journeys.find(j=>j.plate==='POLISH2026');assert.equal(j.phase,'COMPLETE');assert.equal(final.bays.find(b=>b.id===bay.id).position,'UP');assert.ok(final.lanes.every(l=>l.position==='CLOSED'));assert.deepEqual(errors,[]);
 await writeFile(new URL('docker-results.json',out),JSON.stringify({passed:true,bays:500,levels:10,plate:'POLISH2026',bay:bay.id,phase:j.phase,allLanesClosed:true,bollard:'UP',pageErrors:errors},null,2));console.log('PASS: deployed polished journey, observed parking, reverse departure, exit and relock.');
}finally{await browser.close();}
