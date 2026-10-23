import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApplication} from '../server/http.mjs';

test('scaled API exposes a scoped inventory without replacing the nine-bay circuit',async()=>{
 const app=await createApplication({autoTick:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 try{
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const response=await fetch(base+'/api/scale/state');
  assert.equal(response.status,200,'Scaled inventory API must be available');
  const state=await response.json();assert.equal(state.total.bays,50);assert.equal(state.total.gateways,10);
  assert.equal((await(await fetch(base+'/api/state')).json()).bays.length,9);
  const denied=await fetch(base+'/api/scale/configure',{method:'POST',headers:{'content-type':'application/json','x-demo-actor':'resident'},body:JSON.stringify({sites:1,baysPerSite:500,levels:10})});
  assert.equal(denied.status,403);
 }finally{await app.close();}
});

// Real persisted state machines; virtual time replaces waiting, not the devices under test.
async function engine(options={}){const {ScaleDemo}=await import('../server/scale.mjs');return new ScaleDemo(options);}
const first={siteId:'SITE-001',bayId:'B-0001',plate:'CAR100',requestId:'request-1'};
test('configuration can generate 100 separate 500-bay sites and returns only the selected level',async()=>{
 const e=await engine();try{e.configure({sites:100,baysPerSite:500,levels:10});const s=e.state({siteId:'SITE-100',level:9});assert.equal(s.total.bays,50000);assert.equal(s.total.gateways,10000);assert.equal(s.total.sites,100);assert.equal(s.bays.length,50);assert.ok(s.bays.every(b=>b.siteId==='SITE-100'&&b.level===9));assert.equal(s.gateways.length,100);assert.throws(()=>e.state({siteId:'BAD'}),/site/i);assert.throws(()=>e.configure({sites:101,baysPerSite:500,levels:10}),/range|limit|100/i);}finally{e.close();}
});
test('two concurrent arrivals reserve independent bays and conflicting allocation cannot overwrite one',async()=>{
 const e=await engine();try{const a=e.arrive(first),b=e.arrive({...first,bayId:'B-0002',plate:'CAR200',requestId:'request-2'});assert.notEqual(a.id,b.id);assert.throws(()=>e.arrive({...first,plate:'OTHER3',requestId:'conflict'}),/reserved|available/i);assert.throws(()=>e.arrive({...first,bayId:'B-0003',requestId:'same-vehicle'}),/active|vehicle/i);e.advance(0);assert.equal(e.state().journeys.filter(j=>j.phase==='PREPARING').length,2);e.advance(2100);assert.equal(e.state().journeys.filter(j=>j.phase==='READY').length,2);assert.equal(e.state().bays[2].position,'UP');}finally{e.close();}
});
test('duplicate request is idempotent and altered payload with same request ID is rejected',async()=>{
 const e=await engine();try{const j=e.arrive(first);assert.equal(e.arrive(first).id,j.id);assert.throws(()=>e.arrive({...first,bayId:'B-0002'}),/payload|different/i);e.advance(2100);assert.equal(e.state().commands.length,1);}finally{e.close();}
});
test('gateway outage hides only its five nodes and blocks readiness until observed recovery',async()=>{
 const e=await engine();try{e.arrive(first);e.advance(0);e.fault({siteId:first.siteId,kind:'gateway',id:'ZONE-001',active:true});e.advance(2100);let s=e.state();assert.equal(s.bays.filter(b=>b.health==='GATEWAY_OFFLINE').length,5);assert.equal(s.journeys[0].phase,'PREPARING');assert.equal(s.bays[5].health,'HEALTHY');e.fault({siteId:first.siteId,kind:'gateway',id:'ZONE-001',active:false});e.advance(0);assert.equal(e.state().journeys[0].phase,'READY');}finally{e.close();}
});
test('entrance lane occupancy serializes passage but not independent bay preparation',async()=>{
 const e=await engine();try{const a=e.arrive(first),b=e.arrive({...first,bayId:'B-0002',plate:'CAR200',requestId:'request-2'});assert.throws(()=>e.action({siteId:first.siteId,journeyId:a.id,action:'enter',laneId:'ENTRY-01'}),/ready|DOWN/i);e.advance(2100);e.action({siteId:first.siteId,journeyId:a.id,action:'enter',laneId:'ENTRY-01'});assert.throws(()=>e.action({siteId:first.siteId,journeyId:b.id,action:'enter',laneId:'ENTRY-01'}),/busy/i);e.action({siteId:first.siteId,journeyId:b.id,action:'enter',laneId:'ENTRY-02'});e.advance(2100);assert.equal(e.state().journeys.filter(j=>j.phase==='ADMITTED').length,2);}finally{e.close();}
});
test('continuous local clearance is reset by returning presence and operates during WAN loss',async()=>{
 const e=await engine();try{const j=e.arrive(first);e.advance(2100);e.action({siteId:first.siteId,journeyId:j.id,action:'enter'});e.advance(2100);e.action({siteId:first.siteId,journeyId:j.id,action:'park'});e.action({siteId:first.siteId,journeyId:j.id,action:'leave'});e.advance(9000);e.presence({...first,present:true});e.advance(5000);assert.equal(e.state().bays[0].position,'DOWN');e.presence({...first,present:false});e.fault({siteId:first.siteId,kind:'wan',active:true});assert.throws(()=>e.arrive({...first,bayId:'B-0003',plate:'NEW300',requestId:'offline'}),/WAN|offline/i);e.advance(10000);assert.equal(e.state().bays[0].position,'MOVING_UP');e.advance(2100);assert.equal(e.state().bays[0].position,'UP');}finally{e.close();}
});
test('a failed bay relock does not prevent independently protected exit passage',async()=>{
 const e=await engine();try{const j=e.arrive(first);e.advance(2100);e.action({siteId:first.siteId,journeyId:j.id,action:'enter'});e.advance(2100);e.action({siteId:first.siteId,journeyId:j.id,action:'park'});e.fault({siteId:first.siteId,kind:'bay',id:first.bayId,active:true});e.action({siteId:first.siteId,journeyId:j.id,action:'leave'});e.action({siteId:first.siteId,journeyId:j.id,action:'exit'});e.advance(2100);assert.equal(e.state().journeys[0].phase,'COMPLETE');assert.equal(e.state().bays[0].health,'MOTOR_FAULT');assert.equal(e.state().lanes.find(l=>l.id==='EXIT-01').position,'CLOSED');}finally{e.close();}
});
test('durable journal preserves inventory and marks interrupted motion uncertain after restart',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'baypilot-scale-'));const file=path.join(dir,'scale.sqlite');let e=await engine({file});
 try{e.configure({sites:2,baysPerSite:50,levels:2});e.arrive(first);e.advance(0);e.close();e=await engine({file});const s=e.state();assert.equal(s.total.bays,100);assert.equal(s.bays[0].position,'UNKNOWN');assert.equal(s.bays[0].health,'RECOVERY_REQUIRED');assert.equal(s.commands[0].status,'OUTCOME_UNKNOWN');e.advance(30000);assert.notEqual(e.state().journeys[0].phase,'READY');}finally{e.close();rmSync(dir,{recursive:true,force:true});}
});
test('automatic traffic completes concurrent journeys without leaking lane reservations',async()=>{
 const e=await engine();try{e.traffic({siteId:first.siteId,count:20});for(let n=0;n<240;n++)e.advance(500);const s=e.state();assert.equal(s.journeys.filter(j=>j.phase==='COMPLETE').length,20);assert.ok(s.lanes.every(l=>l.position==='CLOSED'&&!l.journeyId));assert.equal(s.summary.reserved,0);assert.ok(s.bays.every(b=>b.position==='UP'));}finally{e.close();}
});
test('undelivered commands expire without leaving a permanently preparing journey',async()=>{
 const e=await engine();try{e.arrive(first);e.fault({siteId:first.siteId,kind:'gateway',id:'ZONE-001',active:true});e.advance(9000);e.advance(0);const s=e.state();assert.equal(s.commands[0].status,'EXPIRED');assert.equal(s.journeys[0].phase,'FAULT');assert.equal(s.bays[0].position,'UNKNOWN');e.fault({siteId:first.siteId,kind:'gateway',id:'ZONE-001',active:false});e.advance(0);assert.equal(e.state().bays[0].position,'UP');}finally{e.close();}
});
test('a local fault before outbox dispatch rejects movement rather than driving an unhealthy node',async()=>{
 const e=await engine();try{e.arrive(first);e.fault({siteId:first.siteId,kind:'bay',id:first.bayId,active:true});e.advance(0);const s=e.state();assert.equal(s.bays[0].position,'UP');assert.equal(s.commands[0].status,'REJECTED');assert.equal(s.journeys[0].phase,'FAULT');}finally{e.close();}
});
test('traffic batches create valid plates even when UUID prefixes contain letters only',async(t)=>{
 const crypto=(await import('node:crypto')).default;const {syncBuiltinESMExports}=await import('node:module');let sequence=1;
 // Randomness can legitimately produce a digit-free prefix. IDs remain distinct.
 const replacement=t.mock.method(crypto,'randomUUID',()=>`${(sequence++).toString(6).replace(/[0-5]/g,d=>'abcdef'[Number(d)]).padStart(8,'a')}-aaaa-4aaa-aaaa-aaaaaaaaaaaa`);syncBuiltinESMExports();
 const e=await engine();try{const batch=e.traffic({siteId:first.siteId,count:20});assert.equal(batch.length,20);assert.ok(batch.every(j=>/[0-9]/.test(j.plate)));}finally{e.close();replacement.mock.restore();syncBuiltinESMExports();}
});
test('a failed traffic batch rolls back earlier reservations rather than leaving a partial batch',async(t)=>{
 const crypto=(await import('node:crypto')).default;const {syncBuiltinESMExports}=await import('node:module');
 const replacement=t.mock.method(crypto,'randomUUID',()=> 'abcde123-abcd-4abc-abcd-abcdefabcdef');syncBuiltinESMExports();const e=await engine();
 try{assert.throws(()=>e.traffic({siteId:first.siteId,count:2}),/active|UNIQUE|payload/i);assert.equal(e.state().journeys.length,0);assert.equal(e.state().commands.length,0);}finally{e.close();replacement.mock.restore();syncBuiltinESMExports();}
});
test('cinematic lane passage waits for the car to clear rather than closing on a two-second timer',async()=>{
 const e=await engine();try{const j=e.arrive({...first,cinematic:true});e.advance(2100);e.action({siteId:first.siteId,journeyId:j.id,action:'enter',laneId:'ENTRY-01'});e.advance(5000);assert.equal(e.state().lanes.find(l=>l.id==='ENTRY-01').position,'OPEN');assert.equal(e.state().journeys[0].phase,'ENTERING');assert.throws(()=>e.action({siteId:first.siteId,journeyId:j.id,action:'park'}),/admitted/i);e.action({siteId:first.siteId,journeyId:j.id,action:'clear-entry'});assert.equal(e.state().journeys[0].phase,'ADMITTED');e.action({siteId:first.siteId,journeyId:j.id,action:'park'});e.action({siteId:first.siteId,journeyId:j.id,action:'leave'});e.action({siteId:first.siteId,journeyId:j.id,action:'exit',laneId:'EXIT-01'});e.advance(5000);assert.equal(e.state().lanes.find(l=>l.id==='EXIT-01').position,'OPEN');e.action({siteId:first.siteId,journeyId:j.id,action:'clear-exit'});assert.equal(e.state().journeys[0].phase,'COMPLETE');assert.equal(e.state().lanes.find(l=>l.id==='EXIT-01').position,'CLOSED');}finally{e.close();}
});
test('building snapshots stay scoped to one site and explicit passage cannot clear a different journey lane',async()=>{
 const e=await engine();try{e.configure({sites:2,baysPerSite:500,levels:10});const a=e.arrive({...first,cinematic:true}),b=e.arrive({...first,bayId:'B-0002',plate:'OTHER200',requestId:'other-request',cinematic:true});const s=e.state({siteId:'SITE-001',building:true});assert.equal(s.bays.length,500);assert.ok(s.bays.every(b=>b.siteId==='SITE-001'));assert.equal(e.state({siteId:'SITE-002',building:true,journeyId:a.id}).journeys.length,0);e.advance(2100);e.action({siteId:first.siteId,journeyId:a.id,action:'enter',laneId:'ENTRY-01'});assert.throws(()=>e.action({siteId:first.siteId,journeyId:b.id,action:'clear-entry'}),/passage|lane/i);assert.equal(e.state().lanes.find(l=>l.id==='ENTRY-01').journeyId,a.id);}finally{e.close();}
});
test('a cinematic boom reports OPEN only after its simulated opening travel completes',async()=>{
 const e=await engine();try{const j=e.arrive({...first,cinematic:true});e.advance(2100);e.action({siteId:first.siteId,journeyId:j.id,action:'enter',laneId:'ENTRY-01'});assert.equal(e.state().lanes.find(l=>l.id==='ENTRY-01').position,'OPENING');e.advance(500);assert.equal(e.state().lanes.find(l=>l.id==='ENTRY-01').position,'OPENING');e.advance(300);assert.equal(e.state().lanes.find(l=>l.id==='ENTRY-01').position,'OPEN');}finally{e.close();}
});
