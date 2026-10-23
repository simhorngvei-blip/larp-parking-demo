import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const diagram=()=>JSON.parse(readFileSync(new URL('../diagram.json',import.meta.url)));
test('an ESP32 CPU controls both lane barriers and both gateway UARTs without driving bay GPIO',()=>{
 const d=diagram(),masters=d.parts.filter(p=>p.type==='board-esp32-devkit-c-v4');assert.equal(masters.length,1,'Replace the compiled Mega CPU with an ESP32 CPU');assert.ok(!d.parts.some(p=>p.type.includes('arduino')));
 const id=masters[0].id,linked=(a,b)=>d.connections.some(c=>c.includes(a)&&c.includes(b));
 for(const [pin,target]of [[18,'entryGate:PWM'],[19,'exitGate:PWM'],[26,'gateway0:RX'],[25,'gateway0:TX'],[17,'gateway1:RX'],[16,'gateway1:TX']])assert.ok(linked(id+':'+pin,target),`ESP32 GPIO ${pin} must connect to ${target}`);
 for(const c of d.connections)if(c.some(e=>typeof e==='string'&&e.startsWith(id+':')))assert.ok(!c.some(e=>typeof e==='string'&&/^(receiver|driver|sensor|baySensor|motor|bayMotor)/.test(e)),'A bay must receive addressed packets, not master GPIO');
 assert.equal(d.parts.filter(p=>p.type==='chip-node').length,9);assert.equal(d.parts.filter(p=>p.type==='chip-gateway').length,2);
 for(let z=0;z<2;z++)assert.ok(linked(id+':3V3',`gateway${z}:VCC`),'Gateway logic must use the ESP32 3.3 V rail');
 for(const gate of ['entryGate','exitGate'])assert.ok(linked(id+':5V',gate+':V+'),'Servo power must not come from a 3.3 V GPIO');
});
test('only the documented ideal radio medium has hidden links',()=>{
 const d=diagram(),hidden=d.connections.filter(c=>c[2]==='');assert.equal(hidden.length,18);for(const c of hidden)assert.ok(c.some(p=>/^gateway[01]:AIR_/.test(p))&&c.some(p=>/^receiver.*:(RX|TX)$/.test(p)));
});
