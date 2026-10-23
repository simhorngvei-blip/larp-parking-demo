import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ScaleJourneyDirector} from '../src/scale/route.ts';
import {JourneyDirector} from '../src/three/journey.ts';
const location=p=>[p.x,p.y,p.z,p.yaw,p.pitch].map(v=>v||0);
const feedback={clock:5000,bay:{position:'DOWN',occupancy:'CLEAR',health:'HEALTHY'},journey:{phase:'ADMITTED'},entry:{position:'CLOSED',journeyId:null},exit:{position:'CLOSED',journeyId:null}};
test('scaled refresh restores the selected vehicle midway through a route and still waits for fresh feedback',()=>{
 const d=new ScaleJourneyDirector({baysPerSite:500,levels:10},'B-0500');d.start(false);d.journeyId='saved-journey';d.stage='drive';for(let i=0;i<40;i++)d.tick(.1,feedback);
 assert.equal(typeof d.checkpoint,'function','Mid-journey route progress needs a restorable checkpoint');
 const saved=JSON.parse(JSON.stringify(d.checkpoint())),reloaded=new ScaleJourneyDirector({baysPerSite:500,levels:10},'B-0500');
 assert.equal(reloaded.restore(saved,'ADMITTED'),true);assert.deepEqual(location(reloaded.pose),location(d.pose));assert.equal(reloaded.journeyId,'saved-journey');
 reloaded.tick(.1,null);assert.deepEqual(location(reloaded.pose),location(d.pose));reloaded.tick(.1,feedback);assert.notDeepEqual(reloaded.pose,d.pose);
 assert.equal(new ScaleJourneyDirector({baysPerSite:500,levels:10},'B-0001').restore(saved,'ADMITTED'),false);
});
test('a lost response restores from server phase without resending an already recorded lane clearance',()=>{
 const d=new ScaleJourneyDirector({baysPerSite:5,levels:1},'B-0001');d.start(false);d.journeyId='journey';d.stage='crossing';d.travelled=100;
 const open={...feedback,journey:{phase:'ENTERING'},entry:{position:'OPEN',journeyId:'journey'}};const event=d.tick(.1,open);assert.equal(event.action,'clear-entry');
 assert.equal(typeof d.checkpoint,'function');const recovered=new ScaleJourneyDirector({baysPerSite:5,levels:1},'B-0001');assert.equal(recovered.restore(d.checkpoint(),'ADMITTED'),true);assert.equal(recovered.stage,'drive');
});
test('the connected nine-bay 3D can join a public-app-authorized arrival without inventing another admission',()=>{
 const d=new JourneyDirector();assert.equal(typeof d.resumeObserved,'function','An externally authorized journey must be joinable');
 d.resumeObserved({phase:'ARRIVAL_REQUESTED',entryPassed:false});assert.equal(d.stage,'entry-wait');assert.equal(d.running,true);
 assert.equal(typeof d.checkpoint,'function');const reloaded=new JourneyDirector();assert.equal(reloaded.restore(JSON.parse(JSON.stringify(d.checkpoint())),'ARRIVAL_REQUESTED'),true);assert.deepEqual(location(reloaded.pose),location(d.pose));
});
