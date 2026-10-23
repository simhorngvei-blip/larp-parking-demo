import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base=process.env.SMOKE_URL||'http://localhost:8080',out=new URL('../evidence/',import.meta.url);
const state=async()=>await(await fetch(base+'/api/state')).json();
async function post(path,body){const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-demo-actor':'resident'},body:JSON.stringify(body)}),value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value;}
async function until(fn,timeout=90000){const end=Date.now()+timeout;let s;while(Date.now()<end){s=await state();assert.equal(s.wokwi.error,'');if(fn(s))return s;await new Promise(r=>setTimeout(r,300));}throw Error('Deployed ESP32 timeout: '+JSON.stringify(s.wokwi));}
const initial=await until(s=>s.wokwi.connected&&s.wokwi.telemetry?.controller==='ESP32'&&s.bays.every(b=>b.health==='HEALTHY'));
assert.ok(['OUTSIDE','COMPLETE'].includes(initial.wokwi.phase),'Finish the current user journey before this smoke test');
const {plate,bayId}=initial.wokwi.configuration;assert.equal(initial.bays.find(b=>b.id===bayId).position,'UP');
const selected=s=>s.bays.find(b=>b.id===bayId),unchanged=initial.bays.filter(b=>b.id!==bayId).map(b=>({id:b.id,position:b.position,occupancy:b.occupancy}));
await post('/api/journey/arrive',{plate});await until(s=>selected(s).position==='DOWN'&&s.wokwi.telemetry.entry==='OPEN');
await post('/api/journey/action',{action:'enter'});await until(s=>s.wokwi.telemetry.entryBeam===1);
await post('/api/journey/action',{action:'clear-entry'});await until(s=>s.wokwi.telemetry.entryBeam===0);
await post('/api/journey/action',{action:'park'});await until(s=>selected(s).occupancy==='PRESENT'&&s.wokwi.telemetry.entry==='CLOSED');
await post('/api/journey/action',{action:'leave'});await until(s=>selected(s).occupancy==='CLEAR');
await post('/api/journey/action',{action:'exit'});await until(s=>s.wokwi.telemetry.exit==='OPEN');
await post('/api/journey/action',{action:'pass-exit'});await until(s=>s.wokwi.telemetry.exitBeam===1);
await post('/api/journey/action',{action:'clear-exit'});
const final=await until(s=>s.wokwi.phase==='COMPLETE'&&selected(s).position==='UP'&&s.wokwi.telemetry.entry==='CLOSED'&&s.wokwi.telemetry.exit==='CLOSED');
assert.deepEqual(final.bays.filter(b=>b.id!==bayId).map(b=>({id:b.id,position:b.position,occupancy:b.occupancy})),unchanged);
const picture=await fetch(base+'/circuit.jpg');assert.ok(picture.ok);const bytes=Buffer.from(await picture.arrayBuffer());assert.ok(bytes.length>1000);assert.equal(bytes.readUInt16BE(0),0xffd8);await writeFile(new URL('docker-circuit.jpg',out),bytes);
const result={passed:true,at:new Date().toISOString(),controller:final.wokwi.telemetry.controller,projectUrl:final.wokwi.projectUrl,plate,bayId,phase:final.wokwi.phase,healthyBays:final.bays.filter(b=>b.health==='HEALTHY').length,bayPosition:selected(final).position,entry:final.wokwi.telemetry.entry,exit:final.wokwi.telemetry.exit,otherBaysUnchanged:true,circuitImageBytes:bytes.length};
await writeFile(new URL('docker-results.json',out),JSON.stringify(result,null,2));console.log('PASS: deployed ESP32 app-to-circuit arrival, observed parking, relock, both lane passages and live circuit image.');
