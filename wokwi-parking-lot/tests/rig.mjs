import {readFileSync} from 'node:fs';
import * as avr from 'avr8js';
const ids=['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'];
const mapping=['E0','E1','E4','E5','G5','E3','H3','H4','H5','H6','B4','B5','B6','B7','J1','J0','H1','H0','D3','D2','D1','D0',...Array.from({length:8},(_,i)=>'A'+i),...Array.from({length:8},(_,i)=>'C'+(7-i)),'D7','G2','G1','G0',...Array.from({length:8},(_,i)=>'L'+(7-i)),'B3','B2','B1','B0',...Array.from({length:8},(_,i)=>'F'+i),...Array.from({length:8},(_,i)=>'K'+i)];
export class Rig{
 constructor(){
  const flash=new Uint8Array(262144);let upper=0;
  for(const line of readFileSync(new URL('../evidence/full-lot.hex',import.meta.url),'utf8').split(/\r?\n/)){const type=line.slice(7,9);if(type==='04')upper=parseInt(line.slice(9,13),16)<<16;if(type==='00'){const len=parseInt(line.slice(1,3),16),address=upper+parseInt(line.slice(3,7),16);for(let i=0;i<len;i++)flash[address+i]=parseInt(line.slice(9+i*2,11+i*2),16);}}
  this.cpu=new avr.CPU(new Uint16Array(flash.buffer),0x2200);this.ports={};for(const letter of 'ABCDEFGHJKL')this.ports[letter]=new avr.AVRIOPort(this.cpu,{...avr['port'+letter+'Config'],pinChange:undefined,externalInterrupts:[]});
  this.timers=[new avr.AVRTimer(this.cpu,{...avr.timer0Config,compAInterrupt:0x2a,compBInterrupt:0x2c,ovfInterrupt:0x2e}),new avr.AVRTimer(this.cpu,{...avr.timer1Config,captureInterrupt:0x20,compAInterrupt:0x22,compBInterrupt:0x24,compCInterrupt:0x26,ovfInterrupt:0x28,compPinA:5,compPinB:6})];
  this.uart=new avr.AVRUSART(this.cpu,{...avr.usart0Config,rxCompleteInterrupt:0x32,dataRegisterEmptyInterrupt:0x34,txCompleteInterrupt:0x36},16000000);
  this.distance=ids.map(()=>250);this.steps=ids.map(()=>0);this.jam=ids.map(()=>false);this.frames=[];this.buffer='';this.gates=[false,false];this.targets=[false,false];this.gateJam=[false,false];
  this.uart.onByteTransmit=b=>{if(b===10){try{const f=JSON.parse(this.buffer);this.frames.push(f);if(f.kind==='telemetry')this.latest=f;}catch{}this.buffer='';}else this.buffer+=String.fromCharCode(b);};
  this.set(2,false);this.set(3,true);this.set(4,true);
  for(let i=0;i<9;i++){const base=14+6*i;this.limits(i);this.set(base+5,false);this.listen(base,v=>{if(v&&!this.jam[i]){this.steps[i]=Math.max(0,Math.min(100,this.steps[i]+(this.value(base+1)?1:-1)));this.limits(i);}});this.listen(base+4,v=>{if(!v&&Number.isFinite(this.distance[i]))this.cpu.addClockEvent(()=>{this.set(base+5,true);this.cpu.addClockEvent(()=>this.set(base+5,false),this.distance[i]*58*16);},3200);});}
  for(let i=0;i<2;i++){this.gateLimits(i);let start;this.listen(11+i,high=>{if(high)start=this.cpu.cycles;else if(start!==undefined){const width=(this.cpu.cycles-start)/16;start=undefined;if(width<400||width>2400)return;const target=width>1000;if(target!==this.targets[i]){this.targets[i]=target;this.set(5+i*2,true);this.set(6+i*2,true);this.cpu.addClockEvent(()=>{if(!this.gateJam[i]){this.gates[i]=target;this.gateLimits(i);}},9600000);}}});}
 }
 pin(n){const [letter,bit]=mapping[n];return [this.ports[letter],Number(bit)];}
 set(n,v){const[p,b]=this.pin(n);p.setPin(b,v);}
 value(n){const[p,b]=this.pin(n);return Boolean(p.lastValue&(1<<b));}
 listen(n,fn){const[p,b]=this.pin(n);p.addListener((v,old)=>{if((v^old)&(1<<b))fn(Boolean(v&(1<<b)));});}
 limits(i){this.set(16+i*6,this.steps[i]!==100);this.set(17+i*6,this.steps[i]!==0);}
 gateLimits(i){this.set(5+i*2,!this.gates[i]);this.set(6+i*2,this.gates[i]);}
 run(ms){const end=this.cpu.cycles+ms*16000;while(this.cpu.cycles<end){avr.avrInstruction(this.cpu);this.cpu.tick();}return this.latest;}
 command(id,verb,value=''){for(const b of Buffer.from(`${id} ${verb} ${value}\n`)){while(this.uart.rxBusy||(this.cpu.data[0xc0]&128))this.run(.1);this.uart.writeByte(b);this.run(2);}this.run(300);}
 bay(id){return this.latest?.bays.find(b=>b.id===id);}
}
