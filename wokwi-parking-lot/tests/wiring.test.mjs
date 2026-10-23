import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('nine barrier/driver/sensor nodes use valid Mega labels, including analog header names',()=>{
 const d=JSON.parse(readFileSync(new URL('../diagram.json',import.meta.url),'utf8'));
 assert.equal(d.parts.filter(p=>p.type==='chip-plant').length,9);assert.equal(d.parts.filter(p=>p.type==='wokwi-a4988').length,9);assert.equal(d.parts.filter(p=>p.type==='wokwi-hc-sr04').length,9);
 for(const connection of d.connections)for(const pin of connection.slice(0,2).filter(s=>s.startsWith('mega:'))){const name=pin.slice(5);assert.ok(/^(?:[0-9]|[1-4][0-9]|5[0-3]|A(?:[0-9]|1[0-5])|5V|GND\.1)$/.test(name),'Invalid Mega simulator pin '+name);}
});
