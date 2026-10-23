import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
const root=new URL('./',import.meta.url),assets=new URL('../parking-prototype/public/controller-labs/bollard/',root);mkdirSync(assets,{recursive:true});
const d={version:1,author:'LARP',editor:'wokwi',parts:[],connections:[],serialMonitor:{display:'always',newline:'lf'}};
const part=(type,id,x,y,attrs={})=>d.parts.push({type,id,left:x,top:y,attrs}),wire=(a,b,color='green')=>d.connections.push([a,b,color,[]]);
part('wokwi-text','title',0,-145,{text:'LARP | SINGLE PARKING BAY / BOLLARD NODE | REAL ESP32 CPU'});
part('wokwi-text','scope',0,-105,{text:'INDEPENDENT BENCH. Buttons emulate authorised requests. No parking API or real RF connection.'});
part('wokwi-text','actuatorScope',0,-65,{text:'A4988 + stepper = actuator surrogate. Animated mechanical plant supplies independent limit feedback.'});
part('board-esp32-devkit-c-v4','esp32',0,0);wire('esp32:TX','$serialMonitor:RX','purple');wire('$serialMonitor:TX','esp32:RX','purple');
part('wokwi-a4988','driver',340,40);part('wokwi-stepper-motor','motor',535,225,{size:'17',display:'steps',arrow:'orange'});part('chip-bollard','bollard',675,0);
wire('esp32:18','driver:STEP','orange');wire('esp32:18','bollard:STEP','orange');wire('esp32:19','driver:DIR','blue');wire('esp32:19','bollard:DIR','blue');wire('esp32:23','bollard:REQUEST_ENABLE','yellow');wire('bollard:DRIVER_ENABLE','driver:ENABLE','yellow');wire('esp32:3V3','driver:VDD','red');wire('esp32:3V3','driver:RESET','red');wire('esp32:3V3','driver:SLEEP','red');wire('esp32:GND.1','driver:GND.1','black');wire('esp32:GND.1','driver:GND.2','black');wire('esp32:GND.1','bollard:GND','black');
wire('driver:1B','motor:B-','green');wire('driver:1A','motor:B+','green');wire('driver:2A','motor:A+','blue');wire('driver:2B','motor:A-','blue');wire('bollard:UP','esp32:32');wire('bollard:DOWN','esp32:33');
part('wokwi-text','supply',305,195,{text:'VMOT: external protected motor rail (not electrically simulated).'});
part('wokwi-text','plantHelp',670,245,{text:'Click plant: Jam=1 for timeout. Service position only works while disabled.'});
for(const [id,label,pin,x,color]of [['lower','LOWER',13,0,'green'],['raise','RAISE',14,145,'blue'],['reset','RESET after inspection',21,290,'yellow'],['estop','HOLD E-STOP',25,465,'red']]){part('wokwi-pushbutton',id,x,330,{color,label,bounce:'0'});wire(id+':1.l','esp32:'+pin);wire(id+':2.l','esp32:GND.1','black');}
for(const [id,label,pin,x]of [['occupancy','BC occupancy: left CLEAR / right OCCUPIED',26,0],['obstruction','Safety loop: left CLEAR / right BLOCKED',27,275],['power','Power-status fixture: left OK / right FAIL',4,550],['link','RF-link fixture: left ONLINE / right OFFLINE',16,825]]){part('wokwi-slide-switch',id,x,450);wire(id+':2','esp32:'+pin);wire(id+':1','esp32:GND.1','black');part('wokwi-text',id+'Label',x-20,495,{text:label});}
wire('occupancy:2','bollard:OCCUPIED');
for(const [id,label,pin,x,color]of [['up','UP limit confirmed',2,20,'green'],['down','DOWN limit confirmed',17,195,'blue'],['fault','FAULT / inspect',22,370,'red']]){part('wokwi-led',id,x,230,{color,label});part('wokwi-resistor',id+'R',x,285,{value:'330'});wire('esp32:'+pin,id+'R:1');wire(id+'R:2',id+':A');wire(id+':C','esp32:GND.1','black');}
part('wokwi-text','architecture',0,565,{text:'Production ceiling sensor stays wired to the bay controller. This node receives only an occupancy-status fixture.'});
part('wokwi-text','help',0,605,{text:'Serial commands: LOWER / RAISE / RESET. Raising requires 2 seconds CLEAR. No movement from counters alone.'});
writeFileSync(new URL('diagram.json',root),JSON.stringify(d,null,2)+'\n');for(const file of ['sketch.ino','control.h','diagram.json','bollard.chip.c','bollard.chip.json','README.md'])copyFileSync(new URL(file,root),new URL(file,assets));console.log('Generated single-bay circuit and public source assets.');
