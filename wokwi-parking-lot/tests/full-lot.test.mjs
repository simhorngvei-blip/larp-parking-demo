import test from 'node:test';
import assert from 'node:assert/strict';
import {Rig} from './rig.mjs';

test('missing entrance end feedback reports a gate fault and prevents fresh authorizations',()=>{
 const r=new Rig();r.run(2500);r.gateJam[0]=true;r.command('gate','ARRIVE',600000);r.run(6000);
 assert.equal(r.latest.health,'GATE_FAULT');assert.notEqual(r.latest.entry,'OPEN');
 r.command('blocked','EXIT');assert.ok(r.frames.some(f=>f.kind==='ack'&&f.id==='blocked'&&f.accepted===0));
});

test('all nine bays report independently and an authorized visitor bay lowers without moving its neighbours',()=>{
 const r=new Rig();r.run(2500);assert.equal(r.latest.bays.length,9);
 r.command('v1','UNLOCK V-01',600000);r.run(5000);
 assert.equal(r.bay('V-01').bay,'DOWN');assert.equal(r.steps[4],100);
 assert.equal(r.bay('R-104').bay,'UP');assert.equal(r.steps[3],0);
 r.distance[4]=30;r.run(4000);assert.equal(r.bay('V-01').occupancy,'PRESENT');
 r.distance[4]=250;r.run(17000);assert.equal(r.bay('V-01').bay,'UP');assert.equal(r.steps[4],0);
});

test('an occupied bay rejects unlock and a local jam cannot invent DOWN feedback or fault a neighbour',()=>{
 const r=new Rig();r.distance[0]=30;r.run(2500);
 r.command('bad','UNLOCK R-101',600000);assert.ok(r.frames.some(f=>f.kind==='ack'&&f.id==='bad'&&f.accepted===0));
 r.jam[8]=true;r.command('jam','UNLOCK T-01',600000);r.run(10000);
 assert.equal(r.bay('T-01').health,'MOTOR_FAULT');assert.notEqual(r.bay('T-01').bay,'DOWN');assert.equal(r.bay('V-02').health,'HEALTHY');
});

test('the entrance and exit remain part of the resident journey and emergency never raises an occupied bay',()=>{
 const r=new Rig();r.run(2500);r.command('a','ARRIVE',600000);r.run(5000);
 assert.equal(r.latest.entry,'OPEN');assert.equal(r.bay('R-102').bay,'DOWN');
 r.set(3,false);r.run(1000);r.set(3,true);r.distance[1]=30;r.run(4000);assert.equal(r.latest.entry,'CLOSED');
 r.set(2,true);r.run(5500);assert.equal(r.latest.emergency,1);assert.equal(r.latest.entry,'OPEN');assert.equal(r.latest.exit,'OPEN');
 r.set(2,false);r.command('reset','RESET');r.run(12000);assert.equal(r.bay('R-102').bay,'DOWN');
});
