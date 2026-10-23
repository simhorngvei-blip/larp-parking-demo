import test from 'node:test';import assert from 'node:assert/strict';
import {JourneyDirector,PATHS,samplePath} from '../src/three/journey.ts';
const feedback=(extra={})=>({enabled:true,connected:true,phase:'OUTSIDE',pending:0,error:'',identity:'SIMULATED PLATE MATCH',projectUrl:null,telemetry:{seq:1,ms:1000,bay:'UP',entry:'CLOSED',exit:'CLOSED',occupancy:'CLEAR',distance:250,health:'HEALTHY',emergency:0,clearanceMs:0,entryBeam:0,exitBeam:0,...extra}});

test('the car stops at the plate checkpoint while the entrance remains closed',()=>{
 const d=new JourneyDirector();d.start(false);let event;for(let i=0;i<300;i++){const e=d.tick(.1,feedback(),1);if(e)event=e;}
 assert.equal(event?.action,'arrive');assert.ok(d.pose.x<-16);d.acknowledge('arrive');
 for(let i=0;i<300;i++)d.tick(.1,feedback(),1);assert.ok(d.pose.x<-16);assert.equal(d.stage,'entry-wait');
});

test('disconnect and emergency stop car movement and emit no sensor inputs',()=>{
 const d=new JourneyDirector();d.start(false);d.tick(.5,feedback(),1);const before={...d.pose};
 assert.equal(d.tick(3,{...feedback(),connected:false},1),null);assert.deepEqual(d.pose,before);
 assert.equal(d.tick(3,feedback({emergency:1}),1),null);assert.deepEqual(d.pose,before);
});
test('keyboard throttle and vehicle pause cannot move the car while stopped',()=>{
 const d=new JourneyDirector();d.start(false);const before={...d.pose};
 for(let i=0;i<50;i++)d.tick(.1,feedback(),0);assert.deepEqual(d.pose,before);
 d.paused=true;for(let i=0;i<50;i++)d.tick(.1,feedback(),1);assert.deepEqual(d.pose,before);
 d.paused=false;d.tick(.1,feedback(),1);assert.ok(d.pose.x>before.x);
});
test('a firmware clock restart stops the route until a fresh scene run is started',()=>{
 const d=new JourneyDirector();d.start(false);d.tick(.1,feedback({ms:5000}),1);const before={...d.pose};
 d.tick(.1,feedback({ms:100}),1);assert.deepEqual(d.pose,before);assert.equal(d.running,false);assert.match(d.error,/restart/i);
});

test('an entry sensor event is emitted at the crossing, never from a command acknowledgement alone',()=>{
 const d=new JourneyDirector();d.start(false);for(let i=0;i<100;i++){if(d.tick(.1,feedback(),1))break;}d.acknowledge('arrive');
 const open={...feedback({entry:'OPEN',bay:'DOWN'}),phase:'ARRIVAL_REQUESTED'};let event;
 for(let i=0;i<100;i++){event=d.tick(.1,open,1);if(event)break;}
 assert.equal(event?.action,'enter');assert.ok(d.pose.x>-19&&d.pose.x<-17);
 d.acknowledge('enter');const stopped={...d.pose};for(let i=0;i<30;i++)d.tick(.1,{...open,phase:'ENTERING'},1);assert.deepEqual(d.pose,stopped,'Wait for actual beam feedback');
});

test('a parked vehicle must reverse clear of the bay before departure changes the sensor',()=>{
 const d=new JourneyDirector();d.resumeParked();d.depart();const parked={...feedback({bay:'DOWN',occupancy:'PRESENT'}),phase:'PARKED'};
 let event;for(let i=0;i<100;i++){event=d.tick(.1,parked,1);if(event)break;}
 assert.equal(event?.action,'leave');assert.ok(d.pose.z>0,'Entire vehicle has cleared the bay mouth');
 const start=samplePath(PATHS.leave,0);assert.ok(start.z<-5);
});

test('a gate that times out while the driver pauses is reauthorized before crossing',()=>{
 const d=new JourneyDirector();d.start(false);for(let i=0;i<100;i++){if(d.tick(.1,feedback(),1))break;}d.acknowledge('arrive');
 const open={...feedback({entry:'OPEN',bay:'DOWN'}),phase:'ARRIVAL_REQUESTED'};d.tick(.1,open,1);d.tick(.1,open,1);const pose={...d.pose};
 const event=d.tick(.1,{...open,telemetry:{...open.telemetry,entry:'CLOSED'}},1);assert.equal(event?.action,'reopen-entry');assert.deepEqual(d.pose,pose);
});
