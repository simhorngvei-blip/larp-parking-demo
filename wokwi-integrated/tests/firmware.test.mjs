import test from 'node:test';import assert from 'node:assert/strict';import {Rig} from './rig.mjs';
import {writeFileSync} from 'node:fs';
test('a complete tenant journey opens and closes both barriers and reverses the bay stepper',()=>{
 const r=new Rig();r.run(500);assert.equal(r.latest?.bay,'UP');assert.equal(r.latest.entry,'CLOSED');
 r.command('a1','ARRIVE',600000);r.run(2200);assert.equal(r.latest.bay,'DOWN');assert.equal(r.latest.entry,'OPEN');assert.equal(r.steps,100);
 r.set(11,false);r.run(1000);assert.equal(r.latest.entry,'OPEN');r.set(11,true);r.distance=30;r.run(4000);assert.equal(r.latest.occupancy,'PRESENT');assert.equal(r.latest.entry,'CLOSED');
 r.distance=250;r.run(12000);assert.equal(r.latest.bay,'UP');assert.equal(r.steps,0);
 r.command('x1','EXIT');r.run(1000);assert.equal(r.latest.exit,'OPEN');r.set(12,false);r.run(1000);assert.equal(r.latest.exit,'OPEN');r.set(12,true);r.run(2500);assert.equal(r.latest.exit,'CLOSED');
 writeFileSync(new URL('../evidence/complete-journey.json',import.meta.url),JSON.stringify(r.frames,null,2));
});
test('a blocked entrance beam keeps the barrier open beyond its ordinary hold',()=>{const r=new Rig();r.run(400);r.command('a1','ARRIVE',600000);r.run(1200);r.set(11,false);r.run(18000);assert.equal(r.latest?.entry,'OPEN');});
test('a jam produces a movement fault without inventing DOWN feedback',()=>{const r=new Rig();r.jam=true;r.run(400);r.command('a1','ARRIVE',600000);r.run(6000);assert.equal(r.latest?.health,'MOTOR_FAULT');assert.notEqual(r.latest.bay,'DOWN');assert.equal(r.steps,0);});
test('a duplicate serial command does not reopen a completed entrance passage',()=>{const r=new Rig();r.run(400);r.command('a1','ARRIVE',600000);r.run(1500);r.set(11,false);r.run(500);r.set(11,true);r.run(2500);assert.equal(r.latest?.entry,'CLOSED');r.command('a1','ARRIVE',600000);r.run(1000);assert.equal(r.latest.entry,'CLOSED');});
test('emergency opens access and reset cannot raise under an occupied bay',()=>{const r=new Rig();r.run(400);r.command('a1','ARRIVE',600000);r.run(1800);r.distance=30;r.run(3500);r.set(2,true);r.run(1000);assert.equal(r.latest?.emergency,1);assert.equal(r.latest.entry,'OPEN');r.set(2,false);r.command('r1','RESET');r.run(12000);assert.equal(r.latest.emergency,0);assert.equal(r.latest.bay,'DOWN');});
