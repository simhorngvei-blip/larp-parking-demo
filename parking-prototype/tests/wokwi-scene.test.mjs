import test from 'node:test';import assert from 'node:assert/strict';import {WokwiSession} from '../server/wokwi-session.mjs';
const frame=(seq,extra={})=>({kind:'telemetry',seq,ms:seq*500,bay:'UP',entry:'CLOSED',exit:'CLOSED',occupancy:'CLEAR',distance:250,health:'HEALTHY',emergency:0,entryBeam:0,exitBeam:0,...extra});
test('wireless circuit observations link to the correct circuit instead of the old wired project',()=>{
 const s=new WokwiSession('test');s.poll('test',{frame:frame(1,{transport:'SIMULATED_WIRELESS',bays:['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'].map(id=>({id,bay:'UP',occupancy:'CLEAR',distance:250,health:'HEALTHY'}))})});
 assert.equal(s.snapshot().projectUrl,'https://wokwi.com/projects/478327634016887809');
});
test('3D can clear the entrance beam after passage and park later using the observed passage evidence',()=>{
 const s=new WokwiSession('test');s.poll('test',{frame:frame(1)});s.arrive('VAB8899');s.poll('test',{frame:frame(2,{entry:'OPEN',bay:'DOWN'})});s.action('enter');
 assert.throws(()=>s.action('clear-entry'));
 s.poll('test',{frame:frame(3,{entry:'OPEN',bay:'DOWN',entryBeam:1})});s.action('clear-entry');
 s.poll('test',{frame:frame(4,{entry:'CLOSED',bay:'DOWN',entryBeam:0})});s.action('park');assert.equal(s.phase,'PARKED');
 assert.ok(s.queue.some(c=>c.op==='distance'&&c.value===30));
});
test('gate reopening requires an existing authorized journey and does not change observed position',()=>{
 const s=new WokwiSession('test');s.poll('test',{frame:frame(1)});assert.throws(()=>s.action('reopen-entry'));assert.throws(()=>s.action('reopen-exit'));
 s.arrive('VAB8899');s.poll('test',{frame:frame(2,{bay:'DOWN'})});s.action('reopen-entry');
 assert.ok(s.queue.some(c=>c.verb==='ENTER'&&c.bayId==='R-102'));assert.equal(s.telemetry.entry,'CLOSED');
});
