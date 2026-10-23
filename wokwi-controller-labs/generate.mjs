import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url),dest=new URL('../parking-prototype/public/controller-labs/',root);
for(const role of ['flow','bay']){
 const dir=new URL(role+'/',root);mkdirSync(dir,{recursive:true});
 const d={version:1,author:'LARP',editor:'wokwi',parts:[],connections:[],serialMonitor:{display:'always',newline:'lf'}};
 const part=(type,id,x,y,attrs={})=>d.parts.push({type,id,left:x,top:y,attrs}),wire=(a,b,color='green')=>d.connections.push([a,b,color,[]]);
 part('board-esp32-devkit-c-v4','esp32',0,0);wire('esp32:TX','$serialMonitor:RX','purple');wire('$serialMonitor:TX','esp32:RX','purple');
 part('wokwi-text','title',0,-115,{text:role==='flow'?'LARP FLOW CONTROLLER | ESP32 CPU + 8 ADDRESSED PEER MODELS':'LARP BAY CONTROLLER | ESP32 CPU + SIX CEILING-SENSOR BENCH CHANNELS'});
 part('wokwi-text','scope',0,-75,{text:'ISOLATED BENCH: not connected to parking API. No physical RF / RS-485 / power certification.'});
 if(role==='flow'){
  part('chip-bus','bus',340,20,{offlineAddress:'0'});wire('esp32:17','bus:RX');wire('bus:TX','esp32:16','blue');wire('esp32:4','bus:DE','orange');wire('esp32:3V3','bus:VCC','red');wire('esp32:GND.1','bus:GND','black');
  part('wokwi-text','busLabel',320,-20,{text:'UART + direction-controlled ideal bus. Click chip: drop address 1-8. 0 restores all.'});
  part('wokwi-slide-switch','upstream',260,220);wire('upstream:2','esp32:32');wire('upstream:1','esp32:GND.1','black');
  part('wokwi-text','networkLabel',240,260,{text:'Upstream link input fixture (switch). No W5500 or Ethernet stack emulated.'});
  const pins=[13,14,18,19,21,22,25,26];pins.forEach((pin,i)=>{part('wokwi-led','peer'+(i+1),540+(i%4)*110,80+Math.floor(i/4)*150,{color:'green',label:'BC '+(i+1)});part('wokwi-resistor','r'+i,550+(i%4)*110,130+Math.floor(i/4)*150,{value:'330'});wire('esp32:'+pin,'r'+i+':1');wire('r'+i+':2','peer'+(i+1)+':A');wire('peer'+(i+1)+':C','esp32:GND.1','black');});
 }else{
  const trig=[13,14,18,19,21,22],echo=[32,33,34,35,36,39];
  for(let i=0;i<6;i++){
   const x=340+(i%3)*270,y=Math.floor(i/3)*240;
   part('wokwi-hc-sr04','sensor'+(i+1),x,y,{distance:'250'});part('wokwi-text','label'+i,x,y-30,{text:'CEILING SENSOR '+(i+1)+' (short-wire bench alternative)'});
   part('wokwi-resistor','series'+i,x+70,y+100,{value:'10000'});part('wokwi-resistor','shunt'+i,x+150,y+140,{value:'15000'});
   const echoPad=echo[i]===36?'VP':echo[i]===39?'VN':String(echo[i]);
   wire('esp32:'+trig[i],'sensor'+(i+1)+':TRIG');wire('sensor'+(i+1)+':ECHO','series'+i+':1','blue');wire('series'+i+':2','esp32:'+echoPad,'blue');wire('series'+i+':2','shunt'+i+':1','blue');wire('shunt'+i+':2','esp32:GND.1','black');wire('sensor'+(i+1)+':VCC','esp32:5V','red');wire('sensor'+(i+1)+':GND','esp32:GND.1','black');
  }
  part('wokwi-led','health',200,30,{color:'green',label:'6 sensors healthy'});part('wokwi-resistor','statusR',200,90,{value:'330'});wire('esp32:2','statusR:1');wire('statusR:2','health:A');wire('health:C','esp32:GND.1','black');
  part('wokwi-text','instructions',330,500,{text:'Serial: SENSOR_OFF 2 / SENSOR_ON 2. Select each HC-SR04 to change distance. No bollard motion.'});
  part('wokwi-text','limits',330,540,{text:'Echo dividers shown. Trigger buffer / production addressed RS-485 sensors remain reference-only.'});
 }
 writeFileSync(new URL('diagram.json',dir),JSON.stringify(d,null,2)+'\n');
 mkdirSync(new URL(role+'/',dest),{recursive:true});
 for(const name of ['sketch.ino','diagram.json',...(role==='flow'?['bus.chip.c','bus.chip.json']:[])])copyFileSync(new URL(name,dir),new URL(role+'/'+name,dest));
}
console.log('Generated two controller benches and downloadable source files.');
