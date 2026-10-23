import test from 'node:test';import assert from 'node:assert/strict';
import {createApplication} from '../server/http.mjs';
const ids=['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'];
const frame=()=>({kind:'telemetry',seq:1,ms:1500,bay:'UP',entry:'CLOSED',exit:'CLOSED',occupancy:'CLEAR',distance:250,health:'HEALTHY',emergency:0,entryBeam:0,exitBeam:0,bays:ids.map(id=>({id,bay:'UP',occupancy:'CLEAR',distance:250,health:'HEALTHY',clearanceMs:0}))});
test('all lot bays use observed firmware feedback and visitor commands reach their actual circuit bay',async()=>{
 const app=await createApplication({autoTick:false,bridgeKey:'lot-test'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const call=async(url,body,actor='management')=>{const response=await fetch(base+url,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-creator-key':app.creatorKey,'x-demo-actor':actor,'x-bridge-key':'lot-test'},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()};};
 try{
  const f=frame();f.bays[4].bay='DOWN';await call('/api/wokwi/poll',{frame:f});
  assert.equal((await call('/api/state')).body.bays.find(b=>b.id==='V-01').position,'DOWN');
  const visit=(await call('/api/visits',{name:'Lot visitor',plate:'VIS1234',unit:'10-02'},'guard')).body;
  const assigned=await call('/api/visits/assign',{id:visit.id},'guard');assert.equal(assigned.status,200);
  const poll=await call('/api/wokwi/poll',{frame:{...f,seq:2,ms:2000}});
  assert.ok(poll.body.commands.some(c=>c.verb==='UNLOCK'&&c.bayId===assigned.body.bayId));
  const before=(await call('/api/state')).body.bays.find(b=>b.id===assigned.body.bayId);assert.equal(before.position,'UP','Command must not invent DOWN');
  await call('/api/simulation/presence',{bayId:'V-01',distance:30},'guard');
  const presence=await call('/api/wokwi/poll',{frame:{...f,seq:3,ms:2500}});assert.ok(presence.body.commands.some(c=>c.op==='distance'&&c.bayId==='V-01'));
  await call('/api/simulation/fault',{bayId:'T-01',fault:'jam'});
  const fault=await call('/api/wokwi/poll',{frame:{...f,seq:4,ms:3000}});assert.ok(fault.body.commands.some(c=>c.op==='jam'&&c.bayId==='T-01'&&c.value===1));
  await call('/api/wokwi/poll',{frame:{...f,seq:5,ms:3500,health:'GATE_FAULT'}});
  assert.equal((await call('/api/lot/unlock',{bayId:'R-104'})).status,400,'Gate faults must block fresh unlock authorization');
 }finally{await app.close();}
});

test('a partial full-lot telemetry packet is rejected rather than borrowing behavioural bay states',async()=>{
 const app=await createApplication({autoTick:false,bridgeKey:'lot-test'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 try{const f=frame();f.bays.pop();const response=await fetch(`http://127.0.0.1:${app.server.address().port}/api/wokwi/poll`,{method:'POST',headers:{'content-type':'application/json','x-bridge-key':'lot-test','x-demo-actor':'management'},body:JSON.stringify({frame:f})});assert.equal(response.status,400);}finally{await app.close();}
});
