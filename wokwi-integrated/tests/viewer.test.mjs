import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewer} from '../viewer.mjs';

test('circuit readings follow the assigned upstairs bay while retaining shared gate feedback',async()=>{
 const snapshot={wokwi:{connected:true,configuration:{bayId:'V-04'},telemetry:{bay:'UP',occupancy:'CLEAR',health:'HEALTHY',entry:'OPEN',exit:'CLOSED',bays:[{id:'R-102',bay:'UP',occupancy:'CLEAR',health:'HEALTHY'},{id:'V-04',bay:'DOWN',occupancy:'PRESENT',health:'HEALTHY'}]}}};
 const viewer=await createViewer({port:0,state:async()=>snapshot});
 try{
  let status=await(await fetch(viewer.url+'/status')).json();
  assert.equal(status.display?.bayId,'V-04');assert.equal(status.display.telemetry.bay,'DOWN');assert.equal(status.display.telemetry.occupancy,'PRESENT');assert.equal(status.display.telemetry.entry,'OPEN');
  snapshot.wokwi.telemetry.bays.pop();status=await(await fetch(viewer.url+'/status')).json();
  assert.equal(status.display.telemetry.bay,'UNKNOWN','Missing selected receiver must not inherit R-102 position');assert.equal(status.display.telemetry.health,'OFFLINE');
 }finally{await viewer.close();}
});

test('viewer can listen on a container interface rather than loopback IPv4',async()=>{
 const viewer=await createViewer({port:0,host:'::1',appUrl:'http://localhost:8080'});
 try{
  const port=new URL(viewer.url).port;
  const response=await fetch(`http://[::1]:${port}/`);
  assert.equal(response.status,200);
  assert.match(await response.text(),/http:\/\/localhost:8080\/\?view=journey/);
 }finally{await viewer.close();}
});

test('simultaneous viewer exposes the app, actual captured frames and honest frame freshness',async()=>{
 const viewer=await createViewer({port:0,appUrl:'http://127.0.0.1:5175',state:async()=>({wokwi:{connected:true,phase:'OUTSIDE'}})});
 try{
  const html=await (await fetch(viewer.url)).text();
  assert.ok(html.includes('http://127.0.0.1:5175/?view=journey'));
  assert.ok(html.includes('/circuit.jpg'));
  assert.equal((await fetch(viewer.url+'/circuit.jpg')).status,503,'No invented frame before capture');
  let status=await (await fetch(viewer.url+'/status')).json();assert.equal(status.frameAgeMs,null);
  const jpeg=Buffer.from([255,216,3,4,255,217]);viewer.publish(jpeg);
  const response=await fetch(viewer.url+'/circuit.jpg');assert.equal(response.headers.get('content-type'),'image/jpeg');assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),jpeg);
  status=await (await fetch(viewer.url+'/status')).json();assert.ok(status.frameAgeMs>=0);assert.equal(status.wokwi.phase,'OUTSIDE');
  assert.equal((await fetch(viewer.url+'/unknown')).status,404);
 }finally{await viewer.close();}
});
