import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../server/http.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const ids=['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'];
async function removeFixtureFolder(folder){
 const target=path.resolve(folder);
 if(path.dirname(target)!==path.resolve(tmpdir())||!path.basename(target).startsWith('residential-'))throw Error('Refusing cleanup outside the named residential test temporary folder');
 await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
async function fixture(options={}){
 const app=await createApplication({autoTick:false,bridgeKey:'residential-bridge',creatorKey:'residential-creator',...options});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${app.server.address().port}`;let seq=0;
 const request=async(route,body,id='resident-alicia',extra={})=>{const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',authorization:'Bearer demo:'+id,'x-creator-key':'residential-creator',...extra},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const call=(route,body,id,extra)=>request('/api/public/'+route,body,id,extra);
 const frame=async(changes={},root={},instance='default')=>request('/api/wokwi/poll',{instance,frame:{kind:'telemetry',seq:++seq,ms:seq*1000,bay:'UP',entry:'CLOSED',exit:'CLOSED',occupancy:'CLEAR',distance:250,health:'HEALTHY',emergency:0,entryBeam:0,exitBeam:0,bays:ids.map(id=>({id,bay:'UP',occupancy:'CLEAR',distance:250,health:'HEALTHY',...changes[id]})),...root}},'developer',{'x-bridge-key':'residential-bridge','x-demo-actor':'management'});
 await frame();return {app,call,request,frame,state:async id=>(await call('state',undefined,id)).data};
}
test('owner lower is authorized by entitlement and remains queued until independent circuit feedback',async()=>{
 const f=await fixture();try{
  assert.equal((await f.call('residential/lower',{bayId:'R-103',requestId:'foreign'})).status,403);
  const first=await f.call('residential/lower',{bayId:'R-102',requestId:'own'});assert.equal(first.status,200);assert.equal(first.data.status,'DISPATCHED');
  assert.equal((await f.state()).residential.bays.find(b=>b.id==='R-102').position,'UP');
  assert.equal((await f.call('residential/lower',{bayId:'R-102',requestId:'own'})).data.id,first.data.id);
  await f.frame({'R-102':{bay:'DOWN'}});
  assert.equal((await f.state()).residential.commands.find(c=>c.id===first.data.id).status,'CONFIRMED');
 }finally{await f.app.close();}
});
test('homeowner invitations allocate one available bay and cannot lend a neighbours bay',async()=>{
 const f=await fixture();try{
  const input={guestId:'public-visitor',siteId:'RES-001',unit:'10-02',plate:'VIS2026',parkingBayId:'V-01',requestId:'invite'};
  const first=await f.call('residential/invite',input);assert.equal(first.status,200);assert.equal(first.data.parkingBayId,'V-01');assert.equal(first.data.status,'APPROVED');
  assert.equal((await f.call('residential/invite',{...input,requestId:'duplicate-slot'})).status,409);
  assert.equal((await f.call('residential/invite',{...input,parkingBayId:'R-103',requestId:'neighbour'})).status,403);
  assert.equal((await f.call('residential/invite',{...input,parkingBayId:'V-02',requestId:'public'},'public-visitor')).status,403);
  assert.ok((await f.state('public-visitor')).passes.some(p=>p.id===first.data.id));
  assert.ok((await f.state('security-res')).notifications.some(n=>n.kind==='PASS_APPROVED'&&n.reference===first.data.id));
 }finally{await f.app.close();}
});
test('a visitor allocation starts the same circuit journey shown to owner, security and original 3D',async()=>{
 const f=await fixture();try{
  const pass=(await f.call('residential/invite',{guestId:'public-visitor',siteId:'RES-001',unit:'10-02',plate:'VIS2026',parkingBayId:'V-01',requestId:'invite'})).data;
  const j=await f.call('residential/arrive',{passId:pass.id,requestId:'guest-arrival'},'public-visitor');assert.equal(j.status,200);
  const legacy=(await f.request('/api/state')).data;assert.equal(legacy.wokwi.configuration.plate,'VIS2026');assert.equal(legacy.wokwi.configuration.bayId,'V-01');
  assert.equal(legacy.wokwi.phase,'ARRIVAL_REQUESTED');
  const guard=await f.state('security-res');assert.equal(guard.residential.journeys[0].id,j.data.id);assert.equal(guard.residential.journeys[0].plate,'VIS2026');
  assert.equal((await f.call('residential/action',{journeyId:j.data.id,action:'enter'},'public-visitor')).status,409);
  assert.equal((await f.call('residential/action',{journeyId:j.data.id,action:'park'},'resident-daniel')).status,403);
  await f.frame({'V-01':{bay:'DOWN'}},{entry:'OPEN'});
  assert.equal((await f.call('residential/action',{journeyId:j.data.id,action:'enter'},'public-visitor')).status,200);
  await f.frame({'V-01':{bay:'DOWN'}},{entry:'OPEN',entryBeam:1});
  await f.call('residential/action',{journeyId:j.data.id,action:'park'},'public-visitor');await f.frame({'V-01':{bay:'DOWN',occupancy:'PRESENT',distance:30}});
  const state=await f.state('public-visitor');assert.equal(state.residential.journeys[0].phase,'PARKED');assert.equal(state.passes[0].status,'CHECKED_IN');
  assert.equal(state.residential.bays.find(b=>b.id==='V-01').compliance,'OCCUPIED_UNVERIFIED');
 }finally{await f.app.close();}
});
test('the connected 3D adapter cannot admit a revoked public-app visitor',async()=>{
 const f=await fixture();try{
  const pass=(await f.call('residential/invite',{guestId:'public-visitor',siteId:'RES-001',unit:'10-02',plate:'REV2026',parkingBayId:'V-01',requestId:'revoke-invite'})).data;
  await f.call('residential/arrive',{passId:pass.id,requestId:'revoke-arrive'},'public-visitor');
  await f.frame({'V-01':{bay:'DOWN'}},{entry:'OPEN'});
  await f.call('passes/decision',{id:pass.id,decision:'revoke'});
  assert.equal((await f.request('/api/journey/action',{action:'enter'},'public-visitor',{'x-demo-actor':'resident'})).status,403);
 }finally{await f.app.close();}
});

test('device faults expose observations and unknown cause, and block inappropriate controls',async()=>{
 const f=await fixture();try{
  await f.frame({'R-102':{health:'OFFLINE',bay:'UNKNOWN',occupancy:'UNCERTAIN',distance:-1}});
  const b=(await f.state('security-res')).residential.bays.find(b=>b.id==='R-102');assert.equal(b.diagnosis.confidence,'UNKNOWN');assert.match(b.diagnosis.cause,/unconfirmed|unknown/i);
  assert.equal((await f.call('residential/lower',{bayId:'R-102',requestId:'offline'})).status,409);
  assert.equal((await f.call('residential/lower',{bayId:'R-102',requestId:'foreign-site',reason:'On-site inspection'},'security-mall')).status,403);
 }finally{await f.app.close();}
});
test('staff bay-plate review distinguishes unknown observations from a potential mismatch',async()=>{
 const f=await fixture();try{
  await f.frame({'R-102':{bay:'DOWN',occupancy:'PRESENT',distance:30}});
  assert.equal((await f.state('security-res')).residential.bays.find(b=>b.id==='R-102').compliance,'OCCUPIED_UNVERIFIED');
  assert.equal((await f.call('residential/observe',{bayId:'R-102',plate:'BAD2026',reason:'Patrol read at assigned bay'},'public-visitor')).status,403);
  assert.equal((await f.call('residential/observe',{bayId:'R-102',plate:'BAD2026',reason:'Patrol read at assigned bay'},'security-res')).status,200);
  assert.equal((await f.state('security-res')).residential.bays.find(b=>b.id==='R-102').compliance,'POTENTIAL_MISMATCH');
  assert.equal((await f.state('resident-daniel')).residential.bays.some(b=>b.observedPlate==='BAD2026'),false);
 }finally{await f.app.close();}
});

test('creator fault rehearsal waits for observed fault and recovery instead of declaring button success',async()=>{
 const f=await fixture();try{
  assert.equal((await f.call('developer/residential',{bayId:'R-104',fault:'sensor'},'public-visitor')).status,403);
  assert.equal((await f.call('developer/residential',{bayId:'R-104',fault:'sensor'},'developer')).status,200);
  assert.equal((await f.state('developer')).residential.rehearsal.passed,false);
  await f.frame({'R-104':{health:'SENSOR_FAULT',occupancy:'UNCERTAIN',distance:100}});
  assert.equal((await f.state('developer')).residential.rehearsal.passed,true);
  await f.call('developer/residential',{bayId:'R-104',fault:'clear'},'developer');
  assert.equal((await f.state('developer')).residential.rehearsal.passed,false);
  await f.frame();assert.equal((await f.state('developer')).residential.rehearsal.passed,true);
 }finally{await f.app.close();}
});

test('a restarted bridge leaves an active journey for review and scoped reconciliation does not reset other bays',async()=>{
 const f=await fixture();try{
  const j=(await f.call('residential/arrive',{requestId:'owner'})).data;
  const update={kind:'telemetry',seq:100,ms:1000,bay:'UP',entry:'CLOSED',exit:'CLOSED',occupancy:'CLEAR',distance:250,health:'HEALTHY',emergency:0,entryBeam:0,exitBeam:0,bays:ids.map(id=>({id,bay:id==='R-103'?'DOWN':'UP',occupancy:id==='R-103'?'PRESENT':'CLEAR',distance:id==='R-103'?30:250,health:'HEALTHY'}))};
  await f.request('/api/wokwi/poll',{frame:{...update,health:'GATE_FAULT'},instance:'replacement'},'developer',{'x-bridge-key':'residential-bridge','x-demo-actor':'management'});
  assert.equal((await f.state()).residential.journeys.find(v=>v.id===j.id).phase,'RECOVERY_REQUIRED');
  assert.equal((await f.call('residential/reconcile',{journeyId:j.id,reason:'Inspected empty bay and closed lanes'},'security-res')).status,409,'Closed positions cannot override an observed gate fault');
  await f.request('/api/wokwi/poll',{frame:{...update,seq:101},instance:'replacement'},'developer',{'x-bridge-key':'residential-bridge','x-demo-actor':'management'});
  assert.equal((await f.call('residential/reconcile',{journeyId:j.id,reason:'Inspected empty bay and closed lanes'},'security-res')).status,200);
  const legacy=(await f.request('/api/state')).data;assert.equal(legacy.wokwi.phase,'COMPLETE');assert.equal(legacy.bays.find(b=>b.id==='R-103').occupancy,'PRESENT');
 }finally{await f.app.close();}
});

async function guestJourney(f,{park=true}={}){
 const pass=(await f.call('residential/invite',{guestId:'public-visitor',siteId:'RES-001',unit:'10-02',plate:'SAFE2026',parkingBayId:'V-01',requestId:crypto.randomUUID()})).data;
 const j=(await f.call('residential/arrive',{passId:pass.id,requestId:crypto.randomUUID()},'public-visitor')).data;
 await f.frame({'V-01':{bay:'DOWN'}},{entry:'OPEN'});
 await f.call('residential/action',{journeyId:j.id,action:'enter'},'public-visitor');
 await f.frame({'V-01':{bay:'DOWN'}},{entry:'OPEN',entryBeam:1});
 if(park){await f.call('residential/action',{journeyId:j.id,action:'park'},'public-visitor');await f.frame({'V-01':{bay:'DOWN',occupancy:'PRESENT',distance:30}});await f.state('public-visitor');}
 return {pass,j};
}

test('polling cannot restore entry permission after a checked-in visitor was revoked',async()=>{
 const f=await fixture();try{
  const {pass}=await guestJourney(f);await f.call('passes/decision',{id:pass.id,decision:'revoke'});
  for(let i=0;i<3;i++)assert.equal((await f.state('public-visitor')).passes.find(p=>p.id===pass.id).status,'EXIT_ONLY');
 }finally{await f.app.close();}
});

test('revocation after observed entrance passage retains temporary parking and safe departure only',async()=>{
 const f=await fixture();try{
  const {pass,j}=await guestJourney(f,{park:false});await f.call('passes/decision',{id:pass.id,decision:'revoke'});
  assert.equal((await f.call('residential/action',{journeyId:j.id,action:'park'},'public-visitor')).status,200);
  await f.frame({'V-01':{bay:'DOWN',occupancy:'PRESENT',distance:30}});
  assert.equal((await f.state('public-visitor')).passes.find(p=>p.id===pass.id).status,'EXIT_ONLY');
  assert.equal((await f.call('residential/action',{journeyId:j.id,action:'leave'},'public-visitor')).status,200);
 }finally{await f.app.close();}
});

test('revocation before admission retains its bay until staff inspect closed lanes and clear parking',async()=>{
 const f=await fixture();try{
  const pass=(await f.call('residential/invite',{guestId:'public-visitor',siteId:'RES-001',unit:'10-02',plate:'WAIT2026',parkingBayId:'V-01',requestId:'hold'})).data;
  const j=(await f.call('residential/arrive',{passId:pass.id,requestId:'hold-arrive'},'public-visitor')).data;
  await f.call('passes/decision',{id:pass.id,decision:'revoke'});
  const s=await f.state('security-res');assert.equal(s.residential.journeys.find(v=>v.id===j.id).phase,'RECOVERY_REQUIRED');
  assert.equal(s.residential.availableVisitorBays.includes('V-01'),false);
  await f.frame();assert.equal((await f.call('residential/reconcile',{journeyId:j.id,reason:'Inspected empty bay, vehicle outside and both lanes closed'},'security-res')).status,200);
 }finally{await f.app.close();}
});

test('manual checkout cannot release a pass while its connected vehicle remains parked',async()=>{
 const f=await fixture();try{
  const {pass}=await guestJourney(f);
  assert.equal((await f.call('passes/check-out',{id:pass.id},'security-res')).status,409);
  assert.equal((await f.state('public-visitor')).passes.find(p=>p.id===pass.id).status,'CHECKED_IN');
 }finally{await f.app.close();}
});

test('one active visitor or plate cannot hoard multiple residential bays',async()=>{
 const f=await fixture();try{
  const input={guestId:'public-visitor',siteId:'RES-001',unit:'10-02',plate:'ONE2026',parkingBayId:'V-01',requestId:'one'};
  assert.equal((await f.call('residential/invite',input)).status,200);
  assert.equal((await f.call('residential/invite',{...input,parkingBayId:'V-02',requestId:'two'})).status,409);
  assert.equal((await f.state('security-res')).passes.filter(p=>p.status==='APPROVED').length,1);
 }finally{await f.app.close();}
});

test('uncertain occupied-vehicle recovery needs fresh matching patrol evidence and staff inspection',async()=>{
 const f=await fixture();try{
  const {j}=await guestJourney(f);
  await f.frame({'V-01':{bay:'UNKNOWN',occupancy:'UNCERTAIN',health:'OFFLINE',distance:-1}},{},'replacement');
  assert.equal((await f.state('security-res')).residential.journeys.find(v=>v.id===j.id).phase,'RECOVERY_REQUIRED');
  await f.frame({'V-01':{bay:'DOWN',occupancy:'PRESENT',distance:30}},{},'replacement');
  assert.equal((await f.call('residential/action',{journeyId:j.id,action:'leave'},'public-visitor')).status,409);
  const inspect={journeyId:j.id,reason:'Patrol inspected this car and closed entrance and exit lanes'};
  assert.equal((await f.call('residential/inspect-resume',inspect,'security-res')).status,409);
  await f.call('residential/observe',{bayId:'V-01',plate:'SAFE2026',reason:'Plate read beside vehicle at V-01'},'security-res');
  assert.equal((await f.call('residential/inspect-resume',inspect,'security-res')).status,200);
  assert.equal((await f.call('residential/action',{journeyId:j.id,action:'leave'},'public-visitor')).status,200);
 }finally{await f.app.close();}
});

test('a persisted arrival intent with no dispatch becomes recoverable after server restart',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'residential-intent-'));let f;
 try{
  const publicFile=path.join(folder,'public.sqlite');f=await fixture({publicFile});
  const j=(await f.call('residential/arrive',{requestId:'crash-window'})).data;await f.app.close();f=null;
  // Reproduce the durable checkpoint immediately before the external dispatch.
  const db=new DatabaseSync(publicFile),s=JSON.parse(db.prepare('SELECT data FROM public_parking_state WHERE id=1').get().data);
  s.residential.journeys.find(v=>v.id===j.id).phase='REQUESTED';db.prepare('UPDATE public_parking_state SET data=? WHERE id=1').run(JSON.stringify(s));db.close();
  f=await fixture({publicFile});assert.equal((await f.state('security-res')).residential.journeys.find(v=>v.id===j.id).phase,'RECOVERY_REQUIRED');
  assert.equal((await f.call('residential/reconcile',{journeyId:j.id,reason:'Inspected that no vehicle arrived and both lanes are closed'},'security-res')).status,200);
 }finally{await f?.app.close();await removeFixtureFolder(folder);}
});

test('correct-parking status requires fresh plate evidence at an observed occupied bay',async()=>{
 const f=await fixture();try{
  await f.frame({'R-102':{bay:'DOWN',occupancy:'PRESENT',distance:30}});
  assert.equal((await f.state('security-res')).residential.bays.find(b=>b.id==='R-102').compliance,'OCCUPIED_UNVERIFIED');
  await f.call('residential/observe',{bayId:'R-102',plate:'VAB8899',reason:'Patrol plate read at actual bay'},'security-res');
  assert.equal((await f.state('security-res')).residential.bays.find(b=>b.id==='R-102').compliance,'MATCHES_ALLOCATION');
  await f.call('developer/advance',{milliseconds:301000},'developer');
  assert.equal((await f.state('security-res')).residential.bays.find(b=>b.id==='R-102').compliance,'OCCUPIED_UNVERIFIED');
 }finally{await f.app.close();}
});

test('a connected visit is complete only after its bay and both lanes are observed clear',async()=>{
 const f=await fixture();try{
  const {j,pass}=await guestJourney(f);
  await f.call('residential/action',{journeyId:j.id,action:'leave'},'public-visitor');await f.frame({'V-01':{bay:'DOWN'}});
  await f.call('residential/action',{journeyId:j.id,action:'exit'},'public-visitor');await f.frame({'V-01':{bay:'DOWN'}},{exit:'OPEN'});
  await f.call('residential/action',{journeyId:j.id,action:'pass-exit'},'public-visitor');await f.frame({'V-01':{bay:'DOWN'}},{exit:'OPEN',exitBeam:1});
  await f.call('residential/action',{journeyId:j.id,action:'clear-exit'},'public-visitor');await f.frame({}, {entry:'OPEN'});
  assert.notEqual((await f.state('security-res')).residential.journeys.find(v=>v.id===j.id).phase,'COMPLETE');
  await f.frame();assert.equal((await f.state('public-visitor')).passes.find(p=>p.id===pass.id).status,'COMPLETE');
 }finally{await f.app.close();}
});

test('a real API close and reopen retains occupied visitor identity and requires inspected recovery',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'residential-restart-'));let f;
 try{
  const options={file:path.join(folder,'parking.sqlite'),publicFile:path.join(folder,'public.sqlite')};
  f=await fixture(options);const {pass,j}=await guestJourney(f);await f.call('passes/decision',{id:pass.id,decision:'revoke'});await f.app.close();f=null;
  f=await fixture(options);await f.frame({'V-01':{bay:'DOWN',occupancy:'PRESENT',distance:30}},{},'after-restart');
  const before=await f.state('security-res');assert.equal(before.residential.journeys.find(v=>v.id===j.id).phase,'RECOVERY_REQUIRED');assert.equal(before.passes.find(p=>p.id===pass.id).status,'EXIT_ONLY');
  assert.equal((await f.call('residential/action',{journeyId:j.id,action:'leave'},'public-visitor')).status,409);
  await f.call('residential/observe',{bayId:'V-01',plate:'SAFE2026',reason:'Patrol located the same vehicle after server restart'},'security-res');
  assert.equal((await f.call('residential/inspect-resume',{journeyId:j.id,reason:'Inspected parked vehicle and both closed lane barriers after restart'},'security-res')).status,200);
  assert.equal((await f.state('public-visitor')).passes.find(p=>p.id===pass.id).status,'EXIT_ONLY');
  assert.equal((await f.call('residential/action',{journeyId:j.id,action:'leave'},'public-visitor')).status,200);
 }finally{await f?.app.close();await removeFixtureFolder(folder);}
});

test('an arrival dispatch rejected behind a pending device command remains inspectable rather than silently failed',async()=>{
 const f=await fixture();try{
  await f.call('residential/lower',{bayId:'R-102',requestId:'pending-lower'});
  const response=await f.call('residential/arrive',{requestId:'early-arrival'});assert.equal(response.status,409);
  const j=(await f.state('security-res')).residential.journeys.find(v=>v.userId==='resident-alicia');assert.equal(j.phase,'RECOVERY_REQUIRED');
  const queued=(await f.request('/api/wokwi/poll',{},'developer',{'x-bridge-key':'residential-bridge'})).data.commands;
  await f.request('/api/wokwi/poll',{acks:queued.map(c=>({id:c.id,accepted:1}))},'developer',{'x-bridge-key':'residential-bridge'});
  await f.frame();assert.equal((await f.call('residential/reconcile',{journeyId:j.id,reason:'Inspected that no vehicle entered and the bay and lanes are clear'},'security-res')).status,200);
 }finally{await f.app.close();}
});
