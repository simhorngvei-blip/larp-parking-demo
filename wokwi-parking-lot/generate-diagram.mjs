import {writeFileSync} from 'node:fs';
export const IDS=['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'];
const parts=[],connections=[];
const part=(type,id,left,top,attrs={})=>parts.push({type,id,left,top,attrs});
const wire=(a,b,color='green')=>connections.push([a.replace(/^mega:(\d+)$/,(_,n)=>Number(n)>=54?'mega:A'+(Number(n)-54):'mega:'+n),b,color,[]]);
const label=(id,text,x,y)=>part('wokwi-text',id,x,y,{text});
part('wokwi-arduino-mega','mega',0,-350);
part('wokwi-servo','entryGate',440,-290,{hornColor:'#3fbd97'});part('wokwi-servo','exitGate',850,-290,{hornColor:'#e3a352'});
for(const [id,x,pin] of [['emergency',300,2],['entryBeam',460,3],['exitBeam',870,4]]){part('wokwi-slide-switch',id,x,-140,{value:id==='emergency'?'0':'1',bounce:'0'});wire(`mega:${pin}`,id+':2');wire('mega:GND.1',id+':1','black');}
label('title','LARP | FULL PARKING LOT | 9 INDEPENDENT PARKING BARRIERS',0,-460);
label('entryLabel','ENTRANCE BOOM',440,-340);label('exitLabel','EXIT BOOM',850,-340);label('emergencyLabel','NC EMERGENCY',260,-195);
for(let i=0;i<9;i++){
 const id=IDS[i],slug=id.replace('-',''),x=(i%3)*420,y=Math.floor(i/3)*430,pin=14+6*i,occupied=[0,2].includes(i);
 label('label'+slug,id+' | '+(i<4?'RESIDENT':i<8?'VISITOR':'TEMPORARY'),x,y-35);
 part('chip-plant','plant'+slug,x,y,{jam:'0',initial:occupied?'100':'0'});
 part('wokwi-stepper-motor',i===1?'bayMotor':'motor'+slug,x+230,y+20,{size:'17'});
 part('wokwi-a4988','driver'+slug,x+240,y+175);
 part('wokwi-hc-sr04',i===1?'baySensor':'sensor'+slug,x+10,y+300,{distance:occupied?'30':'250'});
 const plant='plant'+slug,driver='driver'+slug,motor=i===1?'bayMotor':'motor'+slug,sensor=i===1?'baySensor':'sensor'+slug;
 for(const [offset,target] of [[0,driver+':STEP'],[1,driver+':DIR'],[2,plant+':DOWN'],[3,plant+':UP'],[4,sensor+':TRIG'],[5,sensor+':ECHO']])wire(`mega:${pin+offset}`,target);
 wire(`mega:${pin}`,plant+':STEP','orange');wire(`mega:${pin+1}`,plant+':DIR','orange');wire(sensor+':ECHO',plant+':ECHO','blue');wire(plant+':ENABLE',driver+':ENABLE','orange');
 for(const [from,to] of [['1B','B-'],['1A','B+'],['2A','A+'],['2B','A-']])wire(driver+':'+from,motor+':'+to,'orange');
 for(const target of [driver+':VDD',driver+':RESET',driver+':SLEEP',sensor+':VCC'])wire('mega:5V',target,'red');
 for(const target of [driver+':GND.1',driver+':MS1',driver+':MS2',driver+':MS3',sensor+':GND',plant+':GND'])wire('mega:GND.1',target,'black');
}
for(const [gate,pwm,open,closed,name] of [['entryGate',11,5,6,'ENTRY'],['exitGate',12,7,8,'EXIT']]){wire(`mega:${pwm}`,gate+':PWM');wire('mega:5V',gate+':V+','red');wire('mega:GND.1',gate+':GND','black');wire(`mega:${pwm}`,'plantR102:'+name+'_PWM','orange');wire(`mega:${open}`,'plantR102:'+name+'_OPEN');wire(`mega:${closed}`,'plantR102:'+name+'_CLOSED');}
writeFileSync(new URL('./diagram.json',import.meta.url),JSON.stringify({version:1,author:'LARP',editor:'wokwi',parts,connections,serialMonitor:{display:'always',newline:'lf'},dependencies:{}},null,2));
writeFileSync(new URL('./pin-map.json',import.meta.url),JSON.stringify(IDS.map((id,i)=>({id,step:14+6*i,dir:15+6*i,down:16+6*i,up:17+6*i,trig:18+6*i,echo:19+6*i})),null,2));
