import test from 'node:test';
import assert from 'node:assert/strict';
import {WokwiSession} from '../server/wokwi-session.mjs';
import {JourneyDirector,samplePath,pathLength} from '../src/three/journey.ts';
import {createApplication} from '../server/http.mjs';
const ids=['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'];
function frame(seq=1){return {kind:'telemetry',seq,ms:seq*200,bay:'UP',entry:'CLOSED',exit:'CLOSED',occupancy:'CLEAR',distance:250,health:'HEALTHY',emergency:0,entryBeam:0,exitBeam:0,bays:ids.map(id=>({id,bay:'UP',occupancy:'CLEAR',distance:250,health:'HEALTHY',clearanceMs:0}))};}
test('a configured plate authorizes only its selected bay and waits for DOWN before opening entry',()=>{
 const s=new WokwiSession('key');s.poll('key',{frame:frame()});
 assert.equal(typeof s.configure,'function','Demo allocation must be configurable');
 s.configure({plate:' abc 1234 ',bayId:'V-04'});
 assert.throws(()=>s.arrive('VAB8899'),/authorized/);
 s.arrive('ABC1234');let commands=s.poll('key',{frame:frame(2)}).commands;
 assert.ok(commands.some(c=>c.verb==='UNLOCK'&&c.bayId==='V-04'));
 assert.ok(!commands.some(c=>c.verb==='ENTER'));
 assert.throws(()=>s.configure({plate:'NEW123',bayId:'R-104'}),/active/);
 const next=frame(3);next.bays[7].bay='DOWN';commands=s.poll('key',{frame:next}).commands;
 assert.ok(commands.some(c=>c.verb==='ENTER'&&c.bayId==='V-04'));
 next.seq++;next.ms+=200;next.entry='OPEN';s.poll('key',{frame:next});s.action('enter');
 next.seq++;next.ms+=200;next.entryBeam=1;s.poll('key',{frame:next});s.action('park');
 assert.ok(s.queue.some(c=>c.op==='distance'&&c.bayId==='V-04'&&c.value===30));
 assert.ok(!s.queue.some(c=>c.op==='distance'&&c.bayId==='R-102'));
});
test('configuration rejects malformed plates and occupied, unknown or unhealthy bays',()=>{
 const s=new WokwiSession('key'),f=frame();f.bays[0].occupancy='PRESENT';f.bays[3].health='RADIO_OFFLINE';s.poll('key',{frame:f});
 assert.equal(typeof s.configure,'function');
 for(const config of [{plate:'',bayId:'V-04'},{plate:'<script>',bayId:'V-04'},{plate:'ABC1234',bayId:'BAD'},{plate:'ABC1234',bayId:'R-101'},{plate:'ABC1234',bayId:'R-104'}])assert.throws(()=>s.configure(config));
 assert.equal(s.snapshot().configuration.bayId,'R-102');
});
test('upstairs route climbs two continuous ramps, parks at level 2 and descends before the exit',()=>{
 const d=new JourneyDirector();assert.equal(typeof d.configure,'function','The route must follow a chosen bay');d.configure('V-04');
 const routes=d.paths,arrival=routes.bay,departure=routes.exit;
 assert.equal(arrival.at(-1).y,8);assert.equal(arrival.at(-1).x,-6.8);assert.equal(arrival.at(-1).z,-5.6);
 assert.equal(departure[0].y,8);assert.equal(departure.at(-1).y,0);
 assert.ok(arrival.some(p=>p.x===19&&p.y===4));assert.ok(arrival.some(p=>p.x===24&&p.y===8));
 for(let n=0;n<pathLength(arrival);n+=.1){const a=samplePath(arrival,n),b=samplePath(arrival,n+.1);assert.ok(Math.hypot(b.x-a.x,(b.y||0)-(a.y||0),b.z-a.z)<.101,'No teleport between floors');}
 d.resumeParked();assert.equal(d.pose.y,8);d.depart();
 const w={connected:true,error:'',phase:'PARKED',telemetry:{...frame(),bay:'UP',bays:frame().bays.map(b=>b.id==='V-04'?{...b,bay:'DOWN',occupancy:'PRESENT'}:b)}};
 let event;for(let i=0;i<100;i++){event=d.tick(.1,w);if(event)break;}assert.equal(event?.action,'leave','Use selected receiver feedback, not the ground-floor mirror');
});
test('demo settings enforce management role and record the configured plate and bay on arrival',async()=>{
 const app=await createApplication({autoTick:false,bridgeKey:'key'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const call=async(url,body,actor='management')=>{const r=await fetch(`http://127.0.0.1:${app.server.address().port}`+url,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-creator-key':app.creatorKey,'x-demo-actor':actor,'x-bridge-key':'key'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
 try{
  await call('/api/wokwi/poll',{frame:frame()});
  assert.equal((await call('/api/demo/configure',{plate:'ABC1234',bayId:'V-04'},'resident')).status,403);
  assert.equal((await call('/api/demo/configure',{plate:'ABC1234',bayId:'V-04'})).status,200);
  assert.equal((await call('/api/journey/arrive',{plate:'ABC1234'},'resident')).status,200);
  const state=(await call('/api/state')).body;
  assert.ok(state.visits.some(v=>v.plate==='ABC1234'&&v.bayId==='V-04'));
  assert.equal((await call('/api/demo/configure',{plate:'NEW1234',bayId:'V-03'})).status,400);
 }finally{await app.close();}
});
