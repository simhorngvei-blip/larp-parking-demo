import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('all nine actuators and sensors terminate at local receivers; only packet channels cross zones',()=>{
 const d=JSON.parse(readFileSync(new URL('../diagram.json',import.meta.url)));assert.equal(d.parts.filter(p=>p.type==='chip-node').length,9);assert.equal(d.parts.filter(p=>p.type==='chip-gateway').length,2);
 for(const [a,b,color] of d.connections){
  if(a.startsWith('mega:')||b.startsWith('mega:'))assert.ok(![a,b].some(p=>/^(receiver|driver|sensor|baySensor|motor|bayMotor)/.test(p)),'Master must not control a bay through GPIO');
  if(color==='')assert.ok([a,b].some(p=>/^gateway[01]:AIR_/.test(p))&&[a,b].some(p=>/^receiver.*:(RX|TX)$/.test(p)),'Only disclosed medium links may be hidden');
 }
 const hidden=d.connections.filter(c=>c[2]==='');assert.equal(hidden.length,18);
 for(const p of d.parts.filter(p=>p.type==='chip-node')){assert.ok(d.connections.some(c=>c.includes(p.id+':STEP')&&c.some(e=>typeof e==='string'&&e.startsWith('driver'))));assert.ok(d.connections.some(c=>c.includes(p.id+':DOWN')));}
});
