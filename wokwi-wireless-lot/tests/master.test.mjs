import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {Rig} from '../../wokwi-parking-lot/tests/rig.mjs';
const require=createRequire(new URL('../../wokwi-parking-lot/package.json',import.meta.url)),avr=require('avr8js');
function master(){
 const r=new Rig();r.cpu.progMem.fill(0);let upper=0;const bytes=new Uint8Array(r.cpu.progMem.buffer);
 for(const line of readFileSync(new URL('../evidence/wireless-master.hex',import.meta.url),'utf8').split(/\r?\n/)){if(line.slice(7,9)==='04')upper=parseInt(line.slice(9,13),16)<<16;if(line.slice(7,9)==='00'){const address=upper+parseInt(line.slice(3,7),16);for(let i=0;i<parseInt(line.slice(1,3),16);i++)bytes[address+i]=parseInt(line.slice(9+i*2,11+i*2),16);}}
 const radios=[0xc8,0xd0].map((base,i)=>new avr.AVRUSART(r.cpu,{...avr.usart0Config,UCSRA:base,UCSRB:base+1,UCSRC:base+2,UBRRL:base+4,UBRRH:base+5,UDR:base+6,rxCompleteInterrupt:i?0x66:0x48,dataRegisterEmptyInterrupt:i?0x68:0x4a,txCompleteInterrupt:i?0x6a:0x4c},16000000));
 return {r,radios};
}
test('master ignores non-ASCII UART startup noise before a valid command identifier',()=>{
 const {r}=master();r.run(100);r.command('\u00f0clean','NOOP');assert.ok(r.frames.some(f=>f.kind==='ack'&&f.id==='clean'),'Noise must not change the application command identity');
});
test('startup does not publish false offline bay faults before radio discovery completes',()=>{
 const {r}=master();r.run(1400);assert.equal(r.frames.filter(f=>f.kind==='telemetry').length,0);
});
test('master drains both radio receivers while publishing a full USB telemetry frame',()=>{
 const {r,radios}=master();r.run(1040);const queue=[[],[]];for(let i=0;i<9;i++)queue[Math.floor(i/5)].push(...Buffer.from(`T ${i} 1 UP 250 CLEAR HEALTHY 500\n`));
 const end=r.cpu.cycles+16000*1400;let next=[0,0];
 while(r.cpu.cycles<end){for(let z=0;z<2;z++)if(queue[z].length&&!radios[z].rxBusy&&r.cpu.cycles>=next[z]){radios[z].writeByte(queue[z].shift());next[z]=r.cpu.cycles+1600;}avr.avrInstruction(r.cpu);r.cpu.tick();}
 assert.equal(r.latest.bays.filter(b=>b.health==='HEALTHY').length,9,'USB logging must not discard wireless bay reports');
});
