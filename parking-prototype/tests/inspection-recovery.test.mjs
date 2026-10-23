import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WokwiSession} from '../server/wokwi-session.mjs';
import {JourneyDirector} from '../src/three/journey.ts';
const frame=seq=>({kind:'telemetry',seq,ms:seq*1000,bay:'UP',entry:'CLOSED',exit:'CLOSED',occupancy:'CLEAR',distance:250,health:'HEALTHY',emergency:0,entryBeam:0,exitBeam:0});
test('fresh telemetry after a heartbeat gap cannot replay an interrupted vehicle command',t=>{
 t.mock.timers.enable({apis:['Date'],now:1000000});
 const w=new WokwiSession('key');w.poll('key',{frame:frame(1)});w.arrive('VAB8899');
 t.mock.timers.tick(6100);
 const response=w.poll('key',{frame:frame(2)});
 assert.equal(response.phase,'RECOVERY_REQUIRED');assert.deepEqual(response.commands,[]);
 assert.match(w.error,/inspect|review/i);
});
test('connected 3D freezes before moving when staff inspection is required',()=>{
 const d=new JourneyDirector();d.start(false);d.stage='bay';
 const before={...d.pose};
 const event=d.tick(.1,{connected:true,phase:'RECOVERY_REQUIRED',error:'',telemetry:{...frame(1),bay:'DOWN'}});
 assert.deepEqual(d.pose,before);assert.equal(event,null);assert.match(d.label,/inspect|review/i);
});

test('a transient presence fault cannot silently resume a vehicle after healthy feedback returns',()=>{
 const w=new WokwiSession('key');w.poll('key',{frame:frame(1)});w.arrive('VAB8899');
 w.poll('key',{frame:{...frame(2),occupancy:'UNCERTAIN',health:'SENSOR_FAULT',distance:100}});
 assert.equal(w.phase,'RECOVERY_REQUIRED');
 w.poll('key',{frame:frame(3)});assert.equal(w.phase,'RECOVERY_REQUIRED');
});

test('an exit closure cannot report completion while the entrance remains open',()=>{
 const w=new WokwiSession('key');w.poll('key',{frame:frame(1)});w.phase='EXIT_LANE_CLEARED';
 w.poll('key',{frame:{...frame(2),entry:'OPEN'}});assert.notEqual(w.phase,'COMPLETE');
 w.poll('key',{frame:frame(3)});assert.equal(w.phase,'COMPLETE');
});
