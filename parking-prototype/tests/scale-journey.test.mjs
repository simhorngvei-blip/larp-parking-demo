import test from 'node:test';
import assert from 'node:assert/strict';
import * as route from '../src/scale/route.ts';
import {pathLength,sampleVehiclePath} from '../src/three/journey.ts';
const config={baysPerSite:500,levels:10};
const feedback={clock:1000,bay:{position:'UP',occupancy:'CLEAR',health:'HEALTHY'},journey:{phase:'PREPARING'},entry:{position:'CLOSED',journeyId:null},exit:{position:'CLOSED',journeyId:null}};
test('the scaled journey reaches level nine by connected ramps and returns to a separate ground-floor exit',()=>{
 assert.equal(typeof route.routesForScaleBay,'function','Scaled journeys need building routes, not a single-floor animation');
 const r=route.routesForScaleBay(config,'B-0500');assert.equal(r.park.at(-1).y,36);assert.equal(r.park.at(-1).z,6);assert.equal(r.departure.at(-1).y,0);assert.equal(r.ramps.length,9);
 for(const points of [r.drive,r.departure])for(let n=0;n<pathLength(points);n+=.25){const a=sampleVehiclePath(points,n),b=sampleVehiclePath(points,n+.25);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.251,'No teleport between floors');}
 for(const ramp of r.ramps)assert.ok(ramp.run>=28,'Usable ramp length is independent of the number of levels');
});
test('a car stops at closed entry and only reports clearance after its whole body crosses',()=>{
 assert.equal(typeof route.ScaleJourneyDirector,'function');const d=new route.ScaleJourneyDirector(config,'B-0001');d.start(false);let event;
 for(let n=0;n<200;n++){event=d.tick(.1,feedback);if(event)break;}assert.equal(event.action,'arrive');d.acknowledge('arrive','journey-1');const stopped={...d.pose};
 for(let n=0;n<100;n++)assert.equal(d.tick(.1,feedback),null);assert.deepEqual(d.pose,stopped);
 const ready={...feedback,bay:{...feedback.bay,position:'DOWN'},journey:{phase:'READY'}};assert.equal(d.tick(.1,ready).action,'enter');d.acknowledge('enter');const waiting={...d.pose};for(let n=0;n<30;n++)d.tick(.1,ready);assert.deepEqual(d.pose,waiting);
 const open={...ready,journey:{phase:'ENTERING'},entry:{position:'OPEN',journeyId:'journey-1'}};for(let n=0;n<100;n++){event=d.tick(.1,open);if(event)break;}assert.equal(event.action,'clear-entry');assert.ok(d.pose.x>route.scaleBuildingLayout(config).entry.x+4,'The rear axle/body must clear the boom before closing');
});
test('pause, stale feedback and an unconfirmed lowered bay cannot advance the selected car',()=>{
 assert.equal(typeof route.ScaleJourneyDirector,'function');const d=new route.ScaleJourneyDirector(config,'B-0500');d.start(true);d.paused=true;const p={...d.pose};d.tick(1,feedback);assert.deepEqual(d.pose,p);d.paused=false;d.tick(1,null);assert.deepEqual(d.pose,p);
});
test('departure reports bay clear only after reversing entirely past the bollard',()=>{
 assert.equal(typeof route.ScaleJourneyDirector,'function');const d=new route.ScaleJourneyDirector(config,'B-0500');d.resumeParked('journey-1');d.depart();let event;const parked={...feedback,bay:{position:'DOWN',occupancy:'PRESENT',health:'MOTOR_FAULT'},journey:{phase:'PARKED'}};
 for(let n=0;n<200;n++){event=d.tick(.1,parked);if(event)break;}assert.equal(event.action,'leave');assert.ok(d.pose.z+2.1<3.4,'Front of the reversing vehicle must clear its south-row bollard');assert.equal(d.pose.reverse,true);
});
test('the ramp access corridor stays beyond the end bays instead of driving through their raised bollards',()=>{
 for(const config of [{baysPerSite:50,levels:2},{baysPerSite:500,levels:10}]){
  const layout=route.scaleBuildingLayout(config);const eastmost=route.scaleBayLayout(config,'B-'+String(layout.columns).padStart(4,'0'));
  assert.ok(layout.portalX-1>eastmost.x+1.5,'The whole car needs a separate corridor outside the parking envelope');
 }
});
test('ground arrivals turn directly into their bay without an east-end U-turn',()=>{
 const r=route.routesForScaleBay(config,'B-0001');assert.ok(Math.max(...r.drive.map(p=>p.x))<-30,'A ground-floor arrival must not visit the ramp portal and double back');
});
test('parking and reverse-out paths preserve the vehicle heading at stage boundaries',()=>{
 const angle=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
 for(const id of ['B-0001','B-0050','B-0250','B-0500']){
  const r=route.routesForScaleBay(config,id),drive=sampleVehiclePath(r.drive,pathLength(r.drive)-.01),park=sampleVehiclePath(r.park,.01),reverse=sampleVehiclePath(r.reverse,pathLength(r.reverse)-.01),departure=sampleVehiclePath(r.departure,.01);
  assert.ok(angle(drive.yaw,park.yaw)<.08,'Parking must continue a turn instead of rotating in place');
  assert.ok(angle(reverse.yaw+Math.PI,departure.yaw)<.08,'Changing from reverse to forward must preserve the body heading');
 }
});
test('flat turns have a bounded continuous heading and tyre-scale turning radius',()=>{
 for(const id of ['B-0001','B-0050','B-0250','B-0500']){
  const r=route.routesForScaleBay(config,id);
  for(const key of ['drive','park','reverse','departure']){
   for(let d=.2;d<pathLength(r[key])-.2;d+=.1){const a=sampleVehiclePath(r[key],d-.1),b=sampleVehiclePath(r[key],d+.1);const change=Math.abs(Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw)));assert.ok(change<.09,`The car cannot pivot at a corner in ${id}/${key}`);}
  }
 }
});
test('the selected vehicle accelerates from rest rather than jumping to full speed',()=>{
 const d=new route.ScaleJourneyDirector(config,'B-0001');d.start(false);const before={...d.pose};d.tick(.1,feedback);assert.ok(Math.hypot(d.pose.x-before.x,d.pose.z-before.z)<.05,'First movement should be a small acceleration step');
});

test('structural columns leave a clear ramp portal when the building width changes',()=>{
 assert.equal(typeof route.scaleColumnXs,'function');
 for(const config of [{baysPerSite:500,levels:10},{baysPerSite:50,levels:2},{baysPerSite:200,levels:5}]){
  const {portalX,half}=route.scaleBuildingLayout(config);
  for(const x of route.scaleColumnXs(config)){assert.ok(Math.abs(x-portalX)>=3.2,'Columns must stay outside the six-metre access corridor');assert.ok(x>=-half&&x<=half);}
 }
});
