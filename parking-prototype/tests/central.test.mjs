import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApplication} from '../server/http.mjs';
const ids=['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'];
async function fixture(options={}){
 const app=await createApplication({autoTick:false,...options});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;let seq=0;
 const call=async(route,body,id='developer',key=app.creatorKey)=>{const r=await fetch(base+'/api/public/'+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',authorization:'Bearer demo:'+id,'x-creator-key':key},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const frame=async(changes={})=>{const r=await fetch(base+'/api/wokwi/poll',{method:'POST',headers:{'content-type':'application/json','x-bridge-key':app.bridgeKey},body:JSON.stringify({instance:'central-fixture',frame:{kind:'telemetry',seq:++seq,ms:seq*1000,bay:'UP',entry:'CLOSED',exit:'CLOSED',occupancy:'CLEAR',distance:250,health:'HEALTHY',emergency:0,entryBeam:0,exitBeam:0,bays:ids.map(id=>({id,bay:'UP',occupancy:'CLEAR',distance:250,health:'HEALTHY',...changes[id]}))}})});assert.ok(r.ok);};
 return {app,call,frame};
}
test('central registry provisions eight six-bay controllers while expansion slots remain uncommissioned',async()=>{
 const f=await fixture();try{await f.frame();const r=await f.call('central/state');assert.equal(r.status,200);const s=r.data;
 assert.equal(s.flows.length,1);assert.equal(s.controllers.length,8);assert.equal(s.bays.length,48);assert.equal(s.bays.filter(b=>b.mapping==='CURRENT_DEMO').length,9);
 assert.equal(s.bays.filter(b=>b.mapping==='UNCOMMISSIONED').length,39);assert.ok(s.bays.filter(b=>b.mapping==='UNCOMMISSIONED').every(b=>!b.fresh&&b.position==='UNKNOWN'));
 assert.equal(s.bays.find(b=>b.id==='V-02').controllerId,'BC-001');assert.equal(s.bays.find(b=>b.id==='V-02').nodeAddress,6);assert.equal(s.bays.find(b=>b.id==='V-03').controllerId,'BC-002');
 }finally{await f.app.close();}
});
test('central accounts, routes and export require the private creator credential',async()=>{
 const f=await fixture();try{
 assert.equal((await f.call('central/state',undefined,'public-visitor')).status,403);
 assert.equal((await f.call('central/state',undefined,'developer','wrong')).status,403);
 assert.equal((await f.call('central/export',undefined,'security-res')).status,403);
 assert.equal((await f.call('state',undefined,'public-visitor')).data.central,null);
 }finally{await f.app.close();}
});
test('central plate entry resolves the existing homeowner and starts the same routed circuit journey',async()=>{
 const f=await fixture();try{await f.frame();
 const response=await f.call('central/arrive',{plate:'VAB 8899',requestId:'central-owner'});assert.equal(response.status,200);const j=response.data;
 assert.equal(j.userId,'resident-alicia');assert.equal(j.bayId,'R-102');assert.equal(j.route.flowId,'FC-001');assert.equal(j.route.controllerId,'BC-001');assert.equal(j.route.nodeAddress,2);
 const owner=(await f.call('state',undefined,'resident-alicia')).data;assert.ok(owner.residential.journeys.some(v=>v.id===j.id));
 const center=(await f.call('central/state')).data;assert.ok(center.commands.some(c=>c.id===j.id&&c.bayId==='R-102'));assert.ok(center.accounts.some(a=>a.id==='resident-alicia'));assert.ok(center.vehicles.some(v=>v.plate==='VAB8899'));
 }finally{await f.app.close();}
});
test('central simulated plate entry cannot admit an unregistered vehicle or bypass user authorization',async()=>{
 const f=await fixture();try{await f.frame();
 assert.equal((await f.call('central/arrive',{plate:'BAD2026',requestId:'unknown'})).status,403);
 assert.equal((await f.call('central/arrive',{plate:'VAB8899',requestId:'bypass'},'public-visitor')).status,403);
 assert.equal((await f.call('state',undefined,'resident-alicia')).data.residential.journeys.length,0);
 }finally{await f.app.close();}
});
test('ordinary app controls record a central route and independently observed command outcome',async()=>{
 const f=await fixture();try{await f.frame();const c=(await f.call('residential/lower',{bayId:'R-102',requestId:'routed-lower'},'resident-alicia')).data;
 await f.frame({'R-102':{bay:'DOWN'}});const s=(await f.call('central/state')).data;const command=s.commands.find(v=>v.id===c.id);
 assert.equal(command.status,'CONFIRMED');assert.equal(command.controllerId,'BC-001');assert.equal(s.bays.find(b=>b.id==='R-102').position,'DOWN');
 }finally{await f.app.close();}
});
test('central topology and command journal survive restart without duplicating slots or faking fresh observations',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'baypilot-central-'));let f;
 try{const publicFile=path.join(folder,'public.sqlite');f=await fixture({publicFile});await f.frame();const c=(await f.call('residential/lower',{bayId:'R-102',requestId:'persisted-route'},'resident-alicia')).data;
 await f.frame({'R-102':{bay:'DOWN'}});await f.call('central/state');await f.app.close();f=null;
 f=await fixture({publicFile});const s=(await f.call('central/state')).data;assert.equal(s.bays.length,48);assert.ok(s.commands.some(v=>v.id===c.id));assert.equal(s.bays.find(b=>b.id==='R-102').fresh,false);
 const exported=(await f.call('central/export')).data;assert.equal(exported.topology.bays.length,48);assert.equal(JSON.stringify(exported).includes(f.app.creatorKey),false);
 }finally{await f?.app.close();const target=path.resolve(folder);if(path.dirname(target)!==path.resolve(tmpdir())||!path.basename(target).startsWith('baypilot-central-'))throw Error('Unsafe test cleanup');await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

test('central visitor projection reflects the same newly observed check-in within one response',async()=>{
 const f=await fixture();try{await f.frame();
 const pass=(await f.call('residential/invite',{guestId:'public-visitor',siteId:'RES-001',unit:'10-02',plate:'CEN2026',parkingBayId:'V-01',requestId:'central-guest'},'resident-alicia')).data;
 await f.call('central/arrive',{plate:'CEN2026',requestId:'central-guest-entry'});
 const center=(await f.call('central/state')).data;
 assert.equal(center.visits.find(v=>v.id===pass.id).status,'APPROVED');
 const j=center.journeys[0];
 const r=await fetch('http://127.0.0.1:'+f.app.server.address().port+'/api/wokwi/poll',{method:'POST',headers:{'content-type':'application/json','x-bridge-key':f.app.bridgeKey},body:JSON.stringify({instance:'central-fixture',frame:{kind:'telemetry',seq:2,ms:2000,bay:'UP',entry:'OPEN',exit:'CLOSED',occupancy:'CLEAR',distance:250,health:'HEALTHY',emergency:0,entryBeam:0,exitBeam:0,bays:ids.map(id=>({id,bay:id==='V-01'?'DOWN':'UP',occupancy:'CLEAR',distance:250,health:'HEALTHY'}))}})});assert.ok(r.ok);
 await f.call('residential/action',{journeyId:j.id,action:'enter'},'public-visitor');
 await fetch('http://127.0.0.1:'+f.app.server.address().port+'/api/wokwi/poll',{method:'POST',headers:{'content-type':'application/json','x-bridge-key':f.app.bridgeKey},body:JSON.stringify({instance:'central-fixture',frame:{kind:'telemetry',seq:3,ms:3000,bay:'UP',entry:'OPEN',exit:'CLOSED',occupancy:'CLEAR',distance:250,health:'HEALTHY',emergency:0,entryBeam:1,exitBeam:0,bays:ids.map(id=>({id,bay:id==='V-01'?'DOWN':'UP',occupancy:'CLEAR',distance:250,health:'HEALTHY'}))}})});
 await f.call('residential/action',{journeyId:j.id,action:'park'},'public-visitor');
 await fetch('http://127.0.0.1:'+f.app.server.address().port+'/api/wokwi/poll',{method:'POST',headers:{'content-type':'application/json','x-bridge-key':f.app.bridgeKey},body:JSON.stringify({instance:'central-fixture',frame:{kind:'telemetry',seq:4,ms:4000,bay:'UP',entry:'CLOSED',exit:'CLOSED',occupancy:'CLEAR',distance:250,health:'HEALTHY',emergency:0,entryBeam:0,exitBeam:0,bays:ids.map(id=>({id,bay:id==='V-01'?'DOWN':'UP',occupancy:id==='V-01'?'PRESENT':'CLEAR',distance:id==='V-01'?30:250,health:'HEALTHY'}))}})});
 const observed=(await f.call('central/state')).data;assert.equal(observed.visits.find(v=>v.id===pass.id).status,'CHECKED_IN');
 }finally{await f.app.close();}
});
