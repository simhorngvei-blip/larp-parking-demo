import {readFileSync} from 'node:fs';
import {CPU,avrInstruction,AVRIOPort,AVRTimer,AVRUSART,portBConfig,portCConfig,portDConfig,timer0Config,timer1Config,timer2Config,usart0Config} from 'avr8js';
export class Rig {
 constructor(){
  const flash=new Uint8Array(32768);for(const line of readFileSync(new URL('../evidence/integrated.hex',import.meta.url),'utf8').split(/\r?\n/)){if(line.slice(7,9)==='00'){const len=parseInt(line.slice(1,3),16),address=parseInt(line.slice(3,7),16);for(let n=0;n<len;n++)flash[address+n]=parseInt(line.slice(9+2*n,11+2*n),16);}}
  this.cpu=new CPU(new Uint16Array(flash.buffer));this.ports={B:new AVRIOPort(this.cpu,portBConfig),C:new AVRIOPort(this.cpu,portCConfig),D:new AVRIOPort(this.cpu,portDConfig)};this.timers=[new AVRTimer(this.cpu,timer0Config),new AVRTimer(this.cpu,timer1Config),new AVRTimer(this.cpu,timer2Config)];this.uart=new AVRUSART(this.cpu,usart0Config,16000000);
  this.buffer='';this.frames=[];this.distance=250;this.steps=0;this.jam=false;this.gates=[false,false];this.gateTargets=[false,false];this.pulses=[];
  this.uart.onByteTransmit=b=>{if(b===10){try{const frame=JSON.parse(this.buffer.trim());this.frames.push(frame);if(frame.kind==='telemetry')this.latest=frame;}catch{}this.buffer='';}else this.buffer+=String.fromCharCode(b);};
  for(const pin of [0,2,11,12,18,19])this.set(pin,true);this.set(2,false);this.set(8,false);this.limits();
  this.listen(5,high=>{if(high&&!this.jam){this.steps+=this.value(6)?1:-1;this.steps=Math.max(0,Math.min(100,this.steps));this.limits();}});
  this.listen(7,high=>{if(!high&&Number.isFinite(this.distance)){const width=this.distance*58*16;this.cpu.addClockEvent(()=>{this.set(8,true);this.cpu.addClockEvent(()=>this.set(8,false),width);},3200);}});
  for(const [index,pin] of [[0,9],[1,10]]){let start;this.listen(pin,high=>{if(high)start=this.cpu.cycles;else if(start!==undefined){const width=(this.cpu.cycles-start)/16;start=undefined;if(width<400||width>2400)return;this.pulses.push({index,width});const open=width>1000;if(open!==this.gateTargets[index]){this.gateTargets[index]=open;this.set(14+index*2,true);this.set(15+index*2,true);this.cpu.addClockEvent(()=>{if(this.gateTargets[index]===open){this.gates[index]=open;this.limits();}},9600000);}}});}
 }
 pin(n){return n<8?[this.ports.D,n]:n<14?[this.ports.B,n-8]:[this.ports.C,n-14];}
 set(n,value){const [p,b]=this.pin(n);p.setPin(b,value);}
 value(n){const [p,b]=this.pin(n);return Boolean(p.lastValue&(1<<b));}
 listen(n,fn){const [p,b]=this.pin(n);p.addListener((v,old)=>{if((v^old)&(1<<b))fn(Boolean(v&(1<<b)));});}
 limits(){this.set(3,this.steps!==100);this.set(4,this.steps!==0);for(let i=0;i<2;i++){this.set(14+i*2,!this.gates[i]);this.set(15+i*2,this.gates[i]);}}
 run(ms){const end=this.cpu.cycles+ms*16000;while(this.cpu.cycles<end){avrInstruction(this.cpu);this.cpu.tick();}return this.latest;}
 command(id,verb,value=''){for(const byte of Buffer.from(`${id} ${verb} ${value}\n`)){while(this.uart.rxBusy||(this.cpu.data[0xc0]&128))this.run(.1);this.uart.writeByte(byte);this.run(2);}this.run(300);}
}
