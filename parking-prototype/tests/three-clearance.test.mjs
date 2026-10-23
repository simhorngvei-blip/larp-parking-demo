import test from 'node:test';
import assert from 'node:assert/strict';
import * as journey from '../src/three/journey.ts';
import * as layout from '../src/three/layout.ts';

test('the entire car clears a ramp before a turn on either upstairs journey',()=>{
 for(const id of ['V-01','V-04'])for(const name of ['bay','exit']){
  const points=journey.pathsForBay(id)[name];
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i];if((a.y||0)===(b.y||0))continue;
   const direction=Math.sign(b.z-a.z),before=points[i-2],after=points[i+1];
   assert.ok(before&&after,'A ramp requires approach and runout');
   assert.ok(Math.abs(before.x-a.x)<.001&&direction*(a.z-before.z)>=2.2,'Straight approach prevents a car corner cutting through the ramp railing');
   assert.ok(Math.abs(after.x-b.x)<.001&&direction*(after.z-b.z)>=2.2,'Straight runout clears the back axle before turning');
  }
 }
});

test('the exit vehicle fits beneath both ramps and both raised booms clear every upper slab',()=>{
 const exit=journey.pathsForBay('V-04').exit;
 for(const ramp of [{x:19,y:0,fromZ:7,toZ:-7},{x:24,y:4,fromZ:-7,toZ:7}]){
  const crossing=exit.find(p=>p.y===0&&p.x>ramp.x);
  assert.ok(crossing,'Exit travels past both ramp structures');
  const lowZ=crossing.z+(ramp.toZ>ramp.fromZ?-1:1)*1;
  const underside=ramp.y+(lowZ-ramp.fromZ)/(ramp.toZ-ramp.fromZ)*4-.18;
  assert.ok(underside>=2.2,'Vehicle roof needs clearance across its full width, not only its centre');
 }
 assert.equal(typeof layout.GATES,'object','Gate placement must share the scene layout');
 assert.ok(layout.GATES.entry.x < -15.6);
 assert.ok(layout.GATES.exit.x > 27.6,'Exit boom must also clear the external ramp landings');
});

test('car wheels follow the ramp grade and blend continuously onto a flat landing',()=>{
 const points=[{x:19,y:0,z:11},{x:19,y:0,z:7},{x:19,y:4,z:-7},{x:19,y:4,z:-11}];
 const centre=journey.samplePath(points,4+Math.hypot(14,4)/2);
 assert.ok(Math.abs(centre.pitch+Math.atan2(4,14))<.0001,'Pitch follows the incline');
 assert.equal(typeof journey.sampleVehiclePath,'function');
 const before=journey.sampleVehiclePath(points,3.9),after=journey.sampleVehiclePath(points,4.1);
 assert.ok(before.y>0&&before.pitch<0,'Front axle climbs before the car centre reaches the ramp');
 assert.ok(Math.abs(before.pitch-after.pitch)<.03,'No abrupt pitch snap at the ramp joint');
 const parked=journey.sampleVehiclePath(points,journey.pathLength(points));
 assert.equal(parked.y,4);assert.ok(Math.abs(parked.pitch)<.00001);
});

test('flat landings start beyond the slope and leave a full turning envelope',()=>{
 assert.ok(Array.isArray(layout.LANDINGS),'Scene and route need a shared landing layout');
 for(const landing of layout.LANDINGS){
  assert.ok(Math.abs(landing.z)-landing.depth/2>=7,'Flat slab must not cap the sloping road');
  assert.ok(landing.depth>=6,'Landing accommodates the full vehicle while it turns');
 }
});
