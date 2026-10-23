import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../server/http.mjs';

async function fixture() {
  const application=await createApplication({file:':memory:',autoTick:false});
  await new Promise(resolve => application.server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${application.server.address().port}`;
  return { application, call: async (action,body={},actor='guard') => {
    const response=await fetch(url+action,{method:action==='/api/state'?'GET':'POST',headers:{'Content-Type':'application/json','x-creator-key':application.creatorKey,'x-demo-actor':actor},body:action==='/api/state'?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  }};
}
test('resident arrival waits for independent controller feedback before ready', async () => {
  const {application,call}=await fixture();
  try {
    assert.equal((await call('/api/resident/arrive',{},'resident')).status,200);
    let state=(await call('/api/state')).body;
    assert.equal(state.bays.find(b=>b.id==='R-102').position,'MOVING_DOWN');
    await call('/api/simulation/advance',{milliseconds:2000},'management');
    state=(await call('/api/state')).body;
    assert.equal(state.bays.find(b=>b.id==='R-102').position,'DOWN');
    await call('/api/simulation/presence',{bayId:'R-102',distance:30},'resident');
    await call('/api/simulation/advance',{milliseconds:3000},'management');
    state=(await call('/api/state')).body;
    assert.equal(state.bays.find(b=>b.id==='R-102').occupancy,'PRESENT');
    await call('/api/simulation/presence',{bayId:'R-102',distance:250},'resident');
    await call('/api/simulation/advance',{milliseconds:12000},'management');
    state=(await call('/api/state')).body;
    assert.equal(state.bays.find(b=>b.id==='R-102').position,'UP');
  } finally { await application.close(); }
});
test('resident role cannot change another bay sensor or publish policy', async () => {
  const {application,call}=await fixture();
  try {
    assert.equal((await call('/api/simulation/presence',{bayId:'V-01',distance:30},'resident')).status,403);
    assert.equal((await call('/api/policy',{},'resident')).status,403);
  } finally {await application.close();}
});
test('jammed visitor unlock creates an incident and never reports ready', async () => {
  const {application,call}=await fixture();
  try {
    await call('/api/simulation/fault',{bayId:'V-01',fault:'jam'},'management');
    const registered=await call('/api/visits',{name:'Test Guest',plate:'TST 1234',unit:'10-02'});
    assert.equal(registered.status,200);
    const assigned=await call('/api/visits/assign',{id:registered.body.id});
    assert.equal(assigned.status,200);
    await call('/api/simulation/advance',{milliseconds:6000},'management');
    const state=(await call('/api/state')).body;
    assert.equal(state.bays.find(b=>b.id==='V-01').health,'MOTOR_FAULT');
    assert.equal(state.incidents.length,1);
  } finally {await application.close();}
});
test('guard fallback preserves isolation of the failed original bay', async () => {
  const {application,call}=await fixture();
  try {
    await call('/api/simulation/fault',{bayId:'V-01',fault:'jam'},'management');
    const visit=(await call('/api/visits',{name:'Fallback Guest',plate:'FBK 1234',unit:'10-02'})).body;
    await call('/api/visits/assign',{id:visit.id}); await call('/api/simulation/advance',{milliseconds:3000},'management');
    assert.equal((await call('/api/visits/fallback',{id:visit.id})).status,200);
    await call('/api/simulation/advance',{milliseconds:2000},'management');
    const state=(await call('/api/state')).body;
    assert.equal(state.visits.find(item=>item.id===visit.id).bayId,'T-01');
    assert.equal(state.bays.find(bay=>bay.id==='V-01').isolated,true);
    assert.equal(state.bays.find(bay=>bay.id==='T-01').position,'DOWN');
  } finally {await application.close();}
});
test('an occupied visitor overstay creates an alert without raising', async () => {
  const {application,call}=await fixture();
  try {
    await call('/api/policy',{requireHost:false,eligible:['V-01'],arrivalMinutes:1,visitMinutes:15},'management');
    const visit=(await call('/api/visits',{name:'Overstay Guest',plate:'OVR 1234',unit:'10-02'})).body;
    await call('/api/visits/assign',{id:visit.id});await call('/api/simulation/advance',{milliseconds:2000},'management');
    await call('/api/simulation/presence',{bayId:'V-01',distance:30});await call('/api/simulation/advance',{milliseconds:3000},'management');
    await call('/api/simulation/advance',{milliseconds:450000},'management');await call('/api/simulation/advance',{milliseconds:450000},'management');
    const state=(await call('/api/state')).body;
    assert.equal(state.visits.find(item=>item.id===visit.id).status,'OVERSTAY');
    assert.equal(state.bays.find(bay=>bay.id==='V-01').position,'DOWN');
    assert.equal(state.incidents.length,1);
  } finally {await application.close();}
});
test('reconnecting after local relock cannot retain a false ready visit', async () => {
  const {application,call}=await fixture();
  try {
    await call('/api/resident/arrive',{},'resident');await call('/api/simulation/advance',{milliseconds:2000},'management');
    await call('/api/simulation/connection',{connected:false},'management');
    await call('/api/simulation/advance',{milliseconds:600000},'management');await call('/api/simulation/advance',{milliseconds:3000},'management');
    await call('/api/simulation/connection',{connected:true},'management');
    const state=(await call('/api/state')).body;
    assert.equal(state.bays.find(bay=>bay.id==='R-102').position,'UP');
    assert.equal(state.visits.find(item=>item.kind==='resident').status,'COMPLETE');
  } finally {await application.close();}
});
