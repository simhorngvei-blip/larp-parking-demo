import {writeFileSync,copyFileSync} from 'node:fs';
const ids=['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'];
const parts=[],connections=[];const part=(type,id,left,top,attrs={})=>parts.push({type,id,left,top,attrs});const wire=(a,b,color='green')=>connections.push([a,b,color,[]]);const label=(id,text,x,y)=>part('wokwi-text',id,x,y,{text});
part('board-esp32-devkit-c-v4','esp32',0,-500);
label('title','LARP | ADDRESSED WIRELESS BOLLARDS | 5 BAYS PER GATEWAY',0,-625);
label('disclosure','ESP32 MASTER CPU | Local gateway/bay ESP32s are behavioural models | Ideal packet medium, not native ESP-NOW',0,-580);
label('masterLabel','ESP32-WROOM MASTER | UART0 to application/server database',0,-540);
for(let z=0;z<2;z++){part('chip-gateway','gateway'+z,420+z*340,-490,{zone:String(z),offline:'0'});label('zone'+z,'ZONE '+(z?'B: 4 of 5 bays':'A: 5 bays')+' | TX/RX GATEWAY',420+z*340,-530);wire('esp32:'+(z?17:26),'gateway'+z+':RX','green');wire('gateway'+z+':TX','esp32:'+(z?16:25),'blue');wire('esp32:3V3','gateway'+z+':VCC','red');wire('esp32:GND.1','gateway'+z+':GND','black');}
for(const [id,x,pin] of [['emergency',50,4],['entryBeam',440,32],['exitBeam',860,33]]){part('wokwi-slide-switch',id,x,-140,{value:id==='emergency'?'0':'1',bounce:'0'});wire('esp32:'+pin,id+':2');wire('esp32:GND.1',id+':1','black');}
for(const [id,x,pwm,name,open,closed] of [['entryGate',430,18,'ENTRY',21,22],['exitGate',860,19,'EXIT',23,27]]){part('wokwi-servo',id,x,-275);wire('esp32:'+pwm,id+':PWM');wire('esp32:5V',id+':V+','red');wire('esp32:GND.1',id+':GND','black');wire('esp32:'+pwm,'plantR102:'+name+'_PWM','orange');wire('esp32:'+open,'plantR102:'+name+'_OPEN','blue');wire('esp32:'+closed,'plantR102:'+name+'_CLOSED','blue');label(id+'Label',name+' BOOM | LANE CONTROL',x,-320);}
for(let i=0;i<ids.length;i++){
 const id=ids[i],slug=id.replace('-',''),x=(i%3)*510,y=Math.floor(i/3)*470,occupied=[0,2].includes(i),node='receiver'+slug,plant='plant'+slug,driver='driver'+slug,motor=i===1?'bayMotor':'motor'+slug,sensor=i===1?'baySensor':'sensor'+slug,z=Math.floor(i/5),slot=i%5;
 label('bay'+slug,id+' | ZONE '+(z?'B':'A')+' | ADDRESSED LOCAL RX/TX + CONTROLLER',x,y-35);
 part('chip-node',node,x,y,{node:String(i),offline:'0'});part('chip-plant',plant,x+140,y,{initial:occupied?'100':'0',jam:'0'});part('wokwi-stepper-motor',motor,x+345,y+30,{size:'17'});part('wokwi-a4988',driver,x+350,y+190);part('wokwi-hc-sr04',sensor,x+140,y+300,{distance:occupied?'30':'250'});
 for(const [from,to] of [['STEP',driver+':STEP'],['DIR',driver+':DIR'],['STEP',plant+':STEP'],['DIR',plant+':DIR'],['DOWN',plant+':DOWN'],['UP',plant+':UP'],['TRIG',sensor+':TRIG'],['ECHO',sensor+':ECHO']])wire(node+':'+from,to);
 wire(sensor+':ECHO',plant+':ECHO','blue');wire(plant+':ENABLE',driver+':ENABLE','orange');
 for(const [from,to] of [['1B','B-'],['1A','B+'],['2A','A+'],['2B','A-']])wire(driver+':'+from,motor+':'+to,'orange');
 for(const p of [driver+':VDD',driver+':RESET',driver+':SLEEP',sensor+':VCC'])wire(node+':VCC',p,'red');
 for(const p of [driver+':GND.1',driver+':MS1',driver+':MS2',driver+':MS3',sensor+':GND',plant+':GND'])wire(node+':GND',p,'black');
 // Explicitly inventoried hidden links implement the ideal packet medium.
 // These are NOT hidden ESP32-to-actuator control wires.
 wire('gateway'+z+':AIR_TX'+slot,node+':RX','');wire(node+':TX','gateway'+z+':AIR_RX'+slot,'');
 label('power'+slug,'LOCAL POWER MODEL | actual supply / battery design pending',x+10,y+400);
}
wire('esp32:TX','$serialMonitor:RX','purple');wire('$serialMonitor:TX','esp32:RX','purple');
writeFileSync(new URL('diagram.json',import.meta.url),JSON.stringify({version:1,author:'LARP',editor:'wokwi',parts,connections,serialMonitor:{display:'always',newline:'lf'},dependencies:{}},null,2));
writeFileSync(new URL('node.chip.json',import.meta.url),JSON.stringify({name:'ESP32 bay receiver/controller BEHAVIOURAL MODEL',author:'LARP',pins:['RX','TX','STEP','DIR','DOWN','UP','TRIG','ECHO','VCC','GND'],controls:[{id:'offline',label:'Radio offline',type:'range',min:0,max:1,step:1}]},null,2));
writeFileSync(new URL('gateway.chip.json',import.meta.url),JSON.stringify({name:'ESP32 five-bay gateway + ideal medium MODEL',author:'LARP',pins:['RX','TX','VCC','GND',...Array.from({length:5},(_,i)=>['AIR_RX'+i,'AIR_TX'+i]).flat()],controls:[{id:'offline',label:'Zone radio offline',type:'range',min:0,max:1,step:1}]},null,2));
writeFileSync(new URL('radio-map.json',import.meta.url),JSON.stringify({transport:'IDEAL_PACKET_MEDIUM_NOT_NATIVE_ESP_NOW',hiddenConnections:'Only gateway AIR pins to node RX/TX; no master-to-bay GPIO',nodes:ids.map((bayId,i)=>({bayId,nodeId:i,zone:i<5?'A':'B',gateway:'gateway'+Math.floor(i/5),receiver:'receiver'+bayId.replace('-',''),slot:i%5}))},null,2));
for(const file of ['plant.chip.c','plant.chip.json'])copyFileSync(new URL('../wokwi-parking-lot/'+file,import.meta.url),new URL(file,import.meta.url));
copyFileSync(new URL('firmware/esp32_master/esp32_master.ino',import.meta.url),new URL('sketch.ino',import.meta.url));
