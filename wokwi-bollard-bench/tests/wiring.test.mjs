import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const d=JSON.parse(readFileSync(new URL('../diagram.json',import.meta.url),'utf8')),wired=(a,b)=>d.connections.some(w=>w[0]===a&&w[1]===b||w[0]===b&&w[1]===a);
test('the new circuit is exactly one ESP32 bay cell with independent mechanical end-stop inputs',()=>{
 assert.equal(d.parts.filter(p=>p.type==='board-esp32-devkit-c-v4').length,1);assert.equal(d.parts.filter(p=>p.type==='wokwi-a4988').length,1);assert.equal(d.parts.filter(p=>p.type==='wokwi-stepper-motor').length,1);assert.equal(d.parts.filter(p=>p.type==='chip-bollard').length,1);
 for(const [a,b]of [['esp32:18','driver:STEP'],['esp32:18','bollard:STEP'],['bollard:UP','esp32:32'],['bollard:DOWN','esp32:33'],['bollard:DRIVER_ENABLE','driver:ENABLE'],['esp32:3V3','driver:RESET'],['esp32:3V3','driver:SLEEP']])assert.ok(wired(a,b),a+' / '+b);
 assert.ok(!d.parts.some(p=>p.type==='chip-gateway'||p.type==='wokwi-hc-sr04'));assert.ok(wired('occupancy:2','esp32:26'));assert.ok(d.parts.some(p=>p.attrs?.text?.includes('Production ceiling sensor stays wired to the bay controller')));
});
