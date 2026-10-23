import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApplication} from '../server/http.mjs';

// These tests catch missing identity/site checks, optimistic physical state,
// conflicting bookings and unsafe session-release transitions through the API.
async function fixture(options={}){
  const app=await createApplication({autoTick:false,handoverKey:'integration-test-key',creatorKey:'integration-creator-key',...options});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const call=async(route,body,identity='public-visitor',extra={})=>{
    const response=await fetch(base+'/api/public/'+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(identity?{authorization:'Bearer demo:'+identity}:{}),...(identity==='developer'?{'x-creator-key':'integration-creator-key'}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  };
  const state=async(identity='public-visitor')=>{const result=await call('state',undefined,identity);assert.equal(result.status,200,'Public parking state must be available');return result.data;};
  const slot=async(extra={})=>{const s=await state();return {bayId:'MALL-EV-01',plate:'DEMO2026',startAt:s.now,endAt:new Date(Date.parse(s.now)+3600000).toISOString(),requestId:crypto.randomUUID(),...extra};};
  return {app,call,state,slot};
}

test('creator credentials are absent from public profiles and developer access requires a separate key',async()=>{
 const f=await fixture();try{
  const profiles=(await f.call('demo-profiles')).data.profiles;assert.equal(profiles.some(p=>p.role==='developer'),false);
  assert.equal((await f.call('state',undefined,'developer',{'x-creator-key':''})).status,403);
  assert.equal((await f.call('developer/advance',{milliseconds:1000},'developer',{'x-creator-key':'wrong'})).status,403);
  assert.equal((await f.call('state',undefined,'developer')).status,200);
  assert.equal((await f.call('demo-profiles',undefined,'developer')).data.profiles.some(p=>p.role==='developer'),true);
 }finally{await f.app.close();}
});

test('legacy debugging routes cannot bypass the private creator key',async()=>{
 const f=await fixture();try{
  const address=`http://127.0.0.1:${f.app.server.address().port}/api/simulation/fault`;
  const request=async key=>fetch(address,{method:'POST',headers:{'content-type':'application/json','x-demo-actor':'management',...(key?{'x-creator-key':key}:{})},body:JSON.stringify({bayId:'R-104',fault:'sensor'})});
  assert.equal((await request()).status,403);assert.equal((await request('integration-creator-key')).status,200);
 }finally{await f.app.close();}
});

test('a stopped EV owner can request observed connector release and leave without security assistance',async()=>{
  const f=await fixture();try{
    assert.equal((await f.call('ev/action',{id:'seed-charge-alicia',action:'release'},'resident-alicia')).status,409);
    await f.call('ev/action',{id:'seed-charge-alicia',action:'stop'},'resident-alicia');
    await f.call('developer/advance',{milliseconds:3000},'developer');
    const requested=await f.call('ev/action',{id:'seed-charge-alicia',action:'release'},'resident-alicia');
    assert.equal(requested.status,200);assert.equal(requested.data.pending.kind,'RELEASE');
    assert.equal((await f.state('resident-alicia')).bays.find(b=>b.id==='RES-EV-01').locked,true);
    await f.call('developer/advance',{milliseconds:3000},'developer');
    const s=await f.state('resident-alicia');assert.equal(s.bays.find(b=>b.id==='RES-EV-01').locked,false);assert.equal(s.tasks.length,0);
    assert.equal((await f.call('developer/ev',{bayId:'RES-EV-01',action:'depart'},'developer')).status,200);
    assert.equal((await f.state('resident-alicia')).bookings.find(b=>b.id==='seed-charge-alicia').status,'COMPLETE');
  }finally{await f.app.close();}
});

test('a timed-out connector release retains the stopped session and permits a safe retry',async()=>{
 const f=await fixture();try{
  await f.call('ev/action',{id:'seed-charge-alicia',action:'stop'},'resident-alicia');
  await f.call('developer/advance',{milliseconds:3000},'developer');
  await f.call('ev/action',{id:'seed-charge-alicia',action:'release'},'resident-alicia');
  await f.call('developer/advance',{milliseconds:9000},'developer');
  const s=await f.state('resident-alicia');
  assert.equal(s.bookings.find(b=>b.id==='seed-charge-alicia').status,'STOPPED');
  assert.equal(s.bays.find(b=>b.id==='RES-EV-01').locked,true);
  assert.equal((await f.call('ev/action',{id:'seed-charge-alicia',action:'release'},'resident-alicia')).status,200);
 }finally{await f.app.close();}
});

test('connector release cannot be requested by another owner or using stale feedback',async()=>{
  const f=await fixture();try{
    assert.equal((await f.call('ev/action',{id:'seed-charge-alicia',action:'release'},'resident-daniel')).status,403);
    await f.call('ev/action',{id:'seed-charge-alicia',action:'stop'},'resident-alicia');await f.call('developer/advance',{milliseconds:3000},'developer');
    await f.call('developer/ev',{bayId:'RES-EV-01',action:'offline'},'developer');
    assert.equal((await f.call('ev/action',{id:'seed-charge-alicia',action:'release'},'resident-alicia')).status,409);
  }finally{await f.app.close();}
});

test('public portfolio exposes residential and retail parking but does not trust legacy role headers',async()=>{
  const f=await fixture();try{
    assert.equal((await f.call('state',undefined,null,{'x-demo-actor':'management'})).status,401);
    const s=await f.state();assert.equal(s.profile.role,'user');assert.ok(s.properties.some(p=>p.type==='residential'));assert.ok(s.properties.some(p=>p.type==='retail'));
    assert.equal((await f.call('developer/advance',{milliseconds:1000},'public-visitor',{'x-demo-actor':'management'})).status,403);
  }finally{await f.app.close();}
});

test('visitor approval belongs to the actual host and notifies only that site security after approval',async()=>{
  const f=await fixture();try{
    const created=await f.call('passes/request',{siteId:'RES-001',hostUnit:'10-02',plate:'VIS2026',requestId:'visit-one'});
    assert.equal(created.status,200);assert.equal(created.data.status,'PENDING');
    assert.ok((await f.state('resident-alicia')).notifications.some(n=>n.kind==='HOST_APPROVAL'&&n.reference===created.data.id));
    assert.equal((await f.call('passes/decision',{id:created.data.id,decision:'approve'},'security-res')).status,403);
    assert.equal((await f.call('passes/decision',{id:created.data.id,decision:'approve'},'resident-daniel')).status,403);
    assert.equal((await f.call('passes/decision',{id:created.data.id,decision:'approve'},'resident-alicia')).status,200);
    assert.ok((await f.state('security-res')).notifications.some(n=>n.kind==='PASS_APPROVED'&&n.reference===created.data.id));
    assert.ok(!(await f.state('security-mall')).notifications.some(n=>n.reference===created.data.id));
    assert.equal((await f.call('passes/check-in',{id:created.data.id},'security-mall')).status,403);
    assert.equal((await f.call('passes/check-in',{id:created.data.id},'security-res')).status,200);
  }finally{await f.app.close();}
});

test('denied or revoked passes cannot enter and an expired checked-in visitor can still leave',async()=>{
  const f=await fixture();try{
    const p=(await f.call('passes/request',{siteId:'RES-001',hostUnit:'10-02',plate:'VIS2026',requestId:'revoked'})).data;
    await f.call('passes/decision',{id:p.id,decision:'approve'},'resident-alicia');
    await f.call('passes/decision',{id:p.id,decision:'revoke'},'resident-alicia');
    assert.equal((await f.call('passes/check-in',{id:p.id},'security-res')).status,409);
    const mall=(await f.call('passes/request',{siteId:'MALL-001',plate:'VIS2026',requestId:'mall'})).data;
    assert.equal(mall.status,'APPROVED');await f.call('passes/check-in',{id:mall.id},'security-mall');
    await f.call('developer/advance',{milliseconds:9*3600000},'developer');
    assert.equal((await f.call('passes/check-out',{id:mall.id},'security-mall')).status,200);
    assert.equal((await f.state()).passes.find(x=>x.id===mall.id).status,'COMPLETE');
  }finally{await f.app.close();}
});

test('trusted handover provisions one invited homeowner, activation is bound and an event cannot be altered on replay',async()=>{
  const f=await fixture();try{
    const body={eventId:'handover-one',buyerId:'BUYER-001',name:'New Homeowner',email:'new@example.test',siteId:'RES-001',unit:'12-01',bayId:'R-201'};
    assert.equal((await f.call('integrations/handover',body,'public-visitor')).status,403);
    const created=await f.call('integrations/handover',body,null,{'x-handover-key':'integration-test-key'});
    assert.equal(created.status,200);assert.equal(created.data.accountStatus,'INVITED');
    const replay=await f.call('integrations/handover',body,null,{'x-handover-key':'integration-test-key'});assert.equal(replay.data.userId,created.data.userId);
    assert.equal((await f.call('integrations/handover',{...body,bayId:'R-999'},null,{'x-handover-key':'integration-test-key'})).status,409);
    assert.equal((await f.call('accounts/activate',{code:created.data.activationCode},'public-visitor')).status,403);
    assert.equal((await f.call('accounts/activate',{code:'incorrect'},created.data.userId)).status,403);
    assert.equal((await f.call('accounts/activate',{code:created.data.activationCode},created.data.userId)).status,200);
    const s=await f.state(created.data.userId);assert.equal(s.profile.accountStatus,'ACTIVE');assert.equal(s.profile.homes[0].bayId,'R-201');
    assert.equal((await f.call('accounts/activate',{code:created.data.activationCode},created.data.userId)).status,409);
  }finally{await f.app.close();}
});

test('overlapping EV bookings are exclusive and request retries cannot reserve twice or alter a slot',async()=>{
  const f=await fixture();try{
    const body=await f.slot({requestId:'booking-one'});
    const responses=await Promise.all([f.call('ev/book',body),f.call('ev/book',{...body,requestId:'competing',plate:'OTHER26'},'resident-daniel')]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const winner=responses.findIndex(r=>r.status===200),who=winner===0?'public-visitor':'resident-daniel',payload=winner===0?body:{...body,requestId:'competing',plate:'OTHER26'};
    assert.equal((await f.call('ev/book',payload,who)).data.id,responses[winner].data.id);
    assert.equal((await f.call('ev/book',{...payload,endAt:new Date(Date.parse(payload.endAt)+60000).toISOString()},who)).status,409);
    assert.equal((await f.state(who)).bookings.filter(b=>b.id===responses[winner].data.id).length,1);
  }finally{await f.app.close();}
});

test('residential EV needs a valid resident or host-approved pass and ownership cannot be forged in a booking',async()=>{
  const f=await fixture();try{
    const body=await f.slot({bayId:'RES-EV-02'});
    assert.equal((await f.call('ev/book',{...body,userId:'resident-alicia'})).status,403);
    const pass=(await f.call('passes/request',{siteId:'RES-001',hostUnit:'10-02',plate:'DEMO2026',requestId:'access'})).data;
    await f.call('passes/decision',{id:pass.id,decision:'approve'},'resident-alicia');
    assert.equal((await f.call('ev/book',body)).status,200);
    assert.equal((await f.state('resident-daniel')).bookings.length,0);
  }finally{await f.app.close();}
});

test('no-show releases only the reservation, creates a cooldown and preserves an observed occupied bay',async()=>{
  const f=await fixture();try{
    const booking=(await f.call('ev/book',await f.slot())).data;
    await f.call('developer/advance',{milliseconds:11*60000},'developer');
    assert.equal((await f.state()).bookings.find(b=>b.id===booking.id).status,'EXPIRED');
    assert.equal((await f.call('ev/book',await f.slot({requestId:'hoard-again'}))).status,429);
    const s=await f.state();assert.equal(s.bays.find(b=>b.id==='RES-EV-01').occupied,true);
  }finally{await f.app.close();}
});

test('charging and security unplug assistance require owner consent, stopped/unlocked observations and site scope',async()=>{
  const f=await fixture();try{
    const booking=(await f.call('ev/book',await f.slot())).data;
    assert.equal((await f.call('ev/action',{id:booking.id,action:'check-in'},'resident-daniel')).status,403);
    await f.call('ev/action',{id:booking.id,action:'check-in'});
    assert.equal((await f.call('ev/action',{id:booking.id,action:'start'})).status,409,'User check-in must not invent a plugged-in vehicle');
    await f.call('developer/ev',{bayId:'MALL-EV-01',action:'connect'},'developer');
    assert.equal((await f.call('ev/action',{id:booking.id,action:'start'})).data.status,'START_REQUESTED');
    await f.call('developer/advance',{milliseconds:3000},'developer');
    let s=await f.state();assert.equal(s.bookings.find(b=>b.id===booking.id).status,'CHARGING');assert.equal(s.bays.find(b=>b.id==='MALL-EV-01').soc,40);
    assert.equal((await f.call('ev/action',{id:booking.id,action:'assist'},'resident-daniel')).status,403);
    const task=(await f.call('ev/action',{id:booking.id,action:'assist'})).data;
    assert.equal((await f.call('assistance/complete',{id:task.id,ownerPresent:true},'security-mall')).status,409);
    await f.call('developer/advance',{milliseconds:3000},'developer');
    assert.equal((await f.call('assistance/complete',{id:task.id,ownerPresent:true},'security-res')).status,403);
    assert.equal((await f.call('assistance/complete',{id:task.id,ownerPresent:false},'security-mall')).status,409);
    assert.equal((await f.call('assistance/complete',{id:task.id,ownerPresent:true},'security-mall')).status,200);
    s=await f.state();assert.equal(s.bays.find(b=>b.id==='MALL-EV-01').occupied,true,'Assistance does not invent a vacant bay');
    assert.equal((await f.call('ev/book',await f.slot({plate:'ANOTHER26'}),'resident-daniel')).status,409);
    await f.call('developer/ev',{bayId:'MALL-EV-01',action:'depart'},'developer');
    s=await f.state();assert.equal(s.bookings.find(b=>b.id===booking.id).status,'COMPLETE');assert.equal(s.bays.find(b=>b.id==='MALL-EV-01').occupied,false);
  }finally{await f.app.close();}
});

test('unsupported or stale charging data never becomes an invented percentage and developer state excludes personal records',async()=>{
  const f=await fixture();try{
    const b=(await f.call('ev/book',await f.slot({bayId:'MALL-EV-02'}))).data;
    await f.call('ev/action',{id:b.id,action:'check-in'});await f.call('developer/ev',{bayId:'MALL-EV-02',action:'connect'},'developer');
    await f.call('ev/action',{id:b.id,action:'start'});await f.call('developer/advance',{milliseconds:3000},'developer');
    assert.equal((await f.state()).bays.find(x=>x.id==='MALL-EV-02').soc,null);
    await f.call('developer/ev',{bayId:'MALL-EV-02',action:'offline'},'developer');
    assert.equal((await f.call('ev/action',{id:b.id,action:'assist'})).status,409);
    const dev=await f.state('developer');assert.equal(dev.passes.length,0);assert.equal(dev.bookings.length,0);assert.equal(dev.notifications.length,0);assert.ok(!JSON.stringify(dev).includes('alicia@example.test'));
    const other=await f.state('resident-daniel');assert.equal(other.bays.find(x=>x.id==='RES-EV-01').soc,null);
  }finally{await f.app.close();}
});

test('booking checks connector compatibility, duration, hoarding, and observed occupancy after booking',async()=>{
  const f=await fixture();try{
    const s=await f.slot();assert.equal((await f.call('ev/book',{...s,connector:'Type 2'})).status,400);
    assert.equal((await f.call('ev/book',{...s,endAt:new Date(Date.parse(s.startAt)+10*60000).toISOString()})).status,400);
    const b=(await f.call('ev/book',s)).data;
    assert.equal((await f.call('ev/book',await f.slot({bayId:'MALL-EV-02',requestId:'hoard'}))).status,409);
    await f.call('developer/ev',{bayId:'MALL-EV-01',action:'obstruct'},'developer');
    assert.equal((await f.call('ev/action',{id:b.id,action:'check-in'})).status,409);
    assert.equal((await f.call('ev/action',{id:b.id,action:'cancel'})).status,409);
  }finally{await f.app.close();}
});

test('public account, approved pass and reservation persist across an API restart',async()=>{
  const folder=await mkdtemp(path.join(tmpdir(),'baypilot-public-'));let f;
  try{
    f=await fixture({publicFile:path.join(folder,'public.sqlite')});
    const p=(await f.call('passes/request',{siteId:'MALL-001',plate:'VIS2026',requestId:'persist-pass'})).data;
    const b=(await f.call('ev/book',await f.slot())).data;await f.app.close();
    f=await fixture({publicFile:path.join(folder,'public.sqlite')});
    const s=await f.state();assert.equal(s.passes.find(x=>x.id===p.id).status,'APPROVED');assert.equal(s.bookings.find(x=>x.id===b.id).status,'BOOKED');
  }finally{if(f)await f.app.close();await rm(folder,{recursive:true,force:true});}
});

test('a revoked residential pass cannot be reused to check in to an EV reservation',async()=>{
  const f=await fixture();try{
    const pass=(await f.call('passes/request',{siteId:'RES-001',hostUnit:'10-02',plate:'DEMO2026',requestId:'access-revoke'})).data;
    await f.call('passes/decision',{id:pass.id,decision:'approve'},'resident-alicia');
    const booking=(await f.call('ev/book',await f.slot({bayId:'RES-EV-02'}))).data;
    await f.call('passes/decision',{id:pass.id,decision:'revoke'},'resident-alicia');
    assert.equal((await f.call('ev/action',{id:booking.id,action:'check-in'})).status,403);
  }finally{await f.app.close();}
});

test('retrying a cancelled booking returns its current state and a visitor can cancel their own pending pass',async()=>{
  const f=await fixture();try{
    const body=await f.slot(),b=(await f.call('ev/book',body)).data;
    await f.call('ev/action',{id:b.id,action:'cancel'});
    assert.equal((await f.call('ev/book',body)).data.status,'CANCELLED');
    const p=(await f.call('passes/request',{siteId:'RES-001',hostUnit:'10-02',plate:'VIS2026',requestId:'cancel-request'})).data;
    assert.equal((await f.call('passes/cancel',{id:p.id},'resident-daniel')).status,403);
    assert.equal((await f.call('passes/cancel',{id:p.id})).data.status,'CANCELLED');
    assert.equal((await f.call('passes/decision',{id:p.id,decision:'approve'},'resident-alicia')).status,409);
  }finally{await f.app.close();}
});

test('a checked-in EV booking cannot start a new charge after its residential access was revoked',async()=>{
  const f=await fixture();try{
    const p=(await f.call('passes/request',{siteId:'RES-001',hostUnit:'10-02',plate:'DEMO2026',requestId:'revoke-start'})).data;
    await f.call('passes/decision',{id:p.id,decision:'approve'},'resident-alicia');
    const b=(await f.call('ev/book',await f.slot({bayId:'RES-EV-02'}))).data;
    await f.call('ev/action',{id:b.id,action:'check-in'});
    await f.call('developer/ev',{bayId:'RES-EV-02',action:'connect'},'developer');
    await f.call('passes/decision',{id:p.id,decision:'revoke'},'resident-alicia');
    assert.equal((await f.call('ev/action',{id:b.id,action:'start'})).status,403);
    assert.equal((await f.call('ev/action',{id:b.id,action:'assist'})).status,200,'Revocation must not prevent safe stop/departure assistance');
  }finally{await f.app.close();}
});

test('revoking residential permission cancels an unobserved queued start instead of starting later',async()=>{
  const f=await fixture();try{
    const p=(await f.call('passes/request',{siteId:'RES-001',hostUnit:'10-02',plate:'DEMO2026',requestId:'queued-revoke'})).data;
    await f.call('passes/decision',{id:p.id,decision:'approve'},'resident-alicia');
    const b=(await f.call('ev/book',await f.slot({bayId:'RES-EV-02'}))).data;
    await f.call('ev/action',{id:b.id,action:'check-in'});await f.call('developer/ev',{bayId:'RES-EV-02',action:'connect'},'developer');
    await f.call('ev/action',{id:b.id,action:'start'});await f.call('passes/decision',{id:p.id,decision:'revoke'},'resident-alicia');
    await f.call('developer/advance',{milliseconds:3000},'developer');
    const s=await f.state();assert.equal(s.bays.find(x=>x.id==='RES-EV-02').charging,false);assert.equal(s.bookings.find(x=>x.id===b.id).status,'CHECKED_IN');
  }finally{await f.app.close();}
});

test('an occupied vehicle cannot begin a new charging session after its reserved slot ends',async()=>{
  const f=await fixture();try{
    const b=(await f.call('ev/book',await f.slot())).data;
    await f.call('ev/action',{id:b.id,action:'check-in'});await f.call('developer/ev',{bayId:b.bayId,action:'connect'},'developer');
    await f.call('developer/advance',{milliseconds:61*60000},'developer');
    assert.equal((await f.call('ev/action',{id:b.id,action:'start'})).status,409);
    assert.equal((await f.call('ev/action',{id:b.id,action:'assist'})).status,200);
    assert.equal((await f.state()).bays.find(x=>x.id===b.bayId).availability,'OCCUPIED');
  }finally{await f.app.close();}
});

test('a queued charging start is not confirmed after crossing the end of its slot',async()=>{
  const f=await fixture();try{
    const b=(await f.call('ev/book',await f.slot())).data;
    await f.call('ev/action',{id:b.id,action:'check-in'});await f.call('developer/ev',{bayId:b.bayId,action:'connect'},'developer');
    await f.call('developer/advance',{milliseconds:3599000},'developer');
    assert.equal((await f.call('ev/action',{id:b.id,action:'start'})).data.status,'START_REQUESTED');
    await f.call('developer/advance',{milliseconds:3000},'developer');
    const s=await f.state();assert.equal(s.bays.find(x=>x.id===b.bayId).charging,false);assert.equal(s.bookings.find(x=>x.id===b.id).status,'CHECKED_IN');
  }finally{await f.app.close();}
});
