import {randomBytes} from 'node:crypto';
const bayStates=['UP','DOWN','MOVING_DOWN','MOVING_UP','UNKNOWN'];
const gates=['CLOSED','OPEN','OPENING','CLOSING','UNKNOWN'];
const lotIds=['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'];
export class WokwiSession {
 constructor(key){this.key=key;this.enabled=false;this.telemetry=null;this.lastSeen=0;this.queue=[];this.phase='OUTSIDE';this.error='';this.instance=null;this.unlocks=new Map();this.entryPassed=false;this.configuration={plate:'VAB8899',bayId:'R-102'};this.entryRequested=false;this.diagnosticEvents=[];this.diagnosticSequence=0;}
 record(kind,result,message,targets=[]){this.diagnosticEvents.push({id:++this.diagnosticSequence,at:new Date().toISOString(),kind,result,message,targets});this.diagnosticEvents=this.diagnosticEvents.slice(-240);}
 configure({plate,bayId},{allowPrepared=false}={}){
  if(!['OUTSIDE','COMPLETE'].includes(this.phase)||this.queue.length)throw new Error('This resident journey is already active.');
  plate=String(plate||'').replace(/\s/g,'').toUpperCase();
  if(!/^[A-Z0-9]{2,12}$/.test(plate)||!/[A-Z]/.test(plate)||!/[0-9]/.test(plate))throw new Error('Use a plate with 2-12 letters and numbers.');
  if(!lotIds.includes(bayId))throw new Error('Unknown parking bay');
  const t=this.observed(bayId);if(this.enabled&&(!this.fresh()||!t||!(allowPrepared?['UP','DOWN']:['UP']).includes(t.bay)||t.occupancy!=='CLEAR'||t.health!=='HEALTHY'||this.telemetry.emergency||this.telemetry.health==='GATE_FAULT'))throw new Error('Select a healthy vacant bay with its barrier UP.');
  this.configuration={plate,bayId};return this.configuration;
 }
 fullLot(){return Array.isArray(this.telemetry?.bays);}
 hasBay(id){return this.enabled&&(this.fullLot()?lotIds.includes(id):id==='R-102');}
 observed(id){return this.fullLot()?this.telemetry.bays.find(b=>b.id===id):id==='R-102'?this.telemetry:null;}
 unlockBay(id,duration,logicalId){
  if(this.unlocks.has(logicalId))return {accepted:true,queued:true,bayId:id};
  const t=this.observed(id);if(!this.fresh()||this.telemetry?.health==='GATE_FAULT'||!t||t.health!=='HEALTHY'||t.occupancy!=='CLEAR'||t.bay!=='UP'||this.telemetry.emergency)throw new Error('Fresh healthy vacant-bay feedback is required.');
  this.enqueue('command',{verb:'UNLOCK',bayId:id,value:Math.max(5000,Math.min(600000,duration))});this.unlocks.set(logicalId,id);return {accepted:true,queued:true,bayId:id};
 }
 presence(id,distance){const t=this.observed(id);if(!t)throw new Error('Bay is not in the connected circuit');if(distance!==null&&distance<50&&t.bay!=='DOWN')throw new Error('Wait for the parking barrier to confirm DOWN before parking');return this.enqueue('distance',{bayId:id,value:distance===null?100:distance});}
 fresh(){return this.enabled&&Date.now()-this.lastSeen<6000;}
 enqueue(op,extra={}){if(!this.fresh())throw new Error('Start the Wokwi bridge and wait for fresh firmware telemetry.');const item={id:randomBytes(6).toString('hex'),op,...extra,created:Date.now(),expires:Date.now()+8000};this.queue.push(item);this.record('COMMAND_QUEUED','INFO',item.id+' '+(item.verb||op)+' queued; not a movement confirmation.',[item.bayId||this.configuration.bayId,...(['ARRIVE','ENTER'].includes(item.verb)?['ENTRY']:item.verb==='EXIT'?['EXIT']:[])]);return item;}
 poll(key,{frame,acks=[],instance='default'}={}){
  if(key!==this.key)throw Object.assign(new Error('Local bridge credential required'),{status:403});
  const oldPhase=this.phase;
  if(this.enabled&&!this.fresh()&&!['OUTSIDE','COMPLETE','RECOVERY_REQUIRED'].includes(this.phase)){
   this.queue=[];this.phase='RECOVERY_REQUIRED';this.error='Heartbeat gap during an active journey. Staff inspection required before resuming.';
  }
  if(frame){
   if(frame.bays!==undefined&&(!Array.isArray(frame.bays)||frame.bays.length!==9||new Set(frame.bays.map(b=>b.id)).size!==9||frame.bays.some(b=>!lotIds.includes(b.id)||!bayStates.includes(b.bay)||!['CLEAR','DETECTING','PRESENT','UNCERTAIN'].includes(b.occupancy)||!Number.isFinite(b.distance)||typeof b.health!=='string')))throw new Error('Malformed full-lot telemetry');
   if(frame.kind!=='telemetry'||!Number.isInteger(frame.seq)||!Number.isFinite(frame.ms)||!bayStates.includes(frame.bay)||!gates.includes(frame.entry)||!gates.includes(frame.exit)||!['CLEAR','DETECTING','PRESENT','UNCERTAIN'].includes(frame.occupancy)||!Number.isFinite(frame.distance)||typeof frame.health!=='string'||![0,1].includes(frame.emergency))throw new Error('Malformed firmware telemetry');
   if(this.instance&&this.instance!==instance&&this.enabled){this.queue=[];this.unlocks.clear();this.entryPassed=false;this.phase='RECOVERY_REQUIRED';this.error='Bridge restarted. Review the physical model before resetting the journey.';this.telemetry=null;}
   this.instance=instance;
   if(!this.telemetry||frame.seq>this.telemetry.seq){
    const previous=this.telemetry;
    if(!previous)this.record('BRIDGE_CONNECTED','PASS','Authenticated '+(frame.controller||'firmware')+' simulator telemetry received.');
    for(const b of frame.bays||[{...frame,id:'R-102'}]){const before=previous?.bays?.find(v=>v.id===b.id)||(b.id==='R-102'?previous:null);if(!before||['bay','occupancy','health'].some(k=>before[k]!==b[k]))this.record('BAY_OBSERVATION',b.health==='HEALTHY'?'INFO':'FAIL',b.id+' position='+b.bay+' occupancy='+b.occupancy+' health='+b.health+' distance='+b.distance+'cm',[b.id]);}
    for(const gate of ['entry','exit'])if(!previous||previous[gate]!==frame[gate])this.record('GATE_OBSERVATION',frame.health==='GATE_FAULT'?'FAIL':'INFO',gate.toUpperCase()+' position='+frame[gate]+' beam='+(frame[gate+'Beam']??'not reported'),[gate.toUpperCase()]);
    this.telemetry=frame;this.lastSeen=Date.now();this.enabled=true;
   }
  }
  for(const ack of acks){const item=this.queue.find(c=>c.id===ack.id);if(!item)continue;this.record('COMMAND_ACK',ack.accepted===1?'PASS':'FAIL',item.id+' '+(item.verb||item.op)+' '+(ack.accepted===1?'acknowledged; final position must still be observed.':'rejected by firmware/bridge.'),[item.bayId||this.configuration.bayId,...(['ARRIVE','ENTER'].includes(item.verb)?['ENTRY']:item.verb==='EXIT'?['EXIT']:[])]);if(ack.accepted===0)this.error='Firmware rejected '+(item.verb||item.op)+'. Check presence, position and emergency status.';this.queue=this.queue.filter(c=>c.id!==ack.id);}
  const expired=this.queue.filter(c=>c.expires<Date.now());if(expired.length)this.error='A bridge command expired before acknowledgement. It will not be replayed.';
  for(const item of expired)this.record('COMMAND_TIMEOUT','FAIL',item.id+' expired before acknowledgement; not replayed.',[item.bayId||this.configuration.bayId]);
  this.queue=this.queue.filter(c=>c.expires>=Date.now());
  if(this.phase==='ARRIVAL_REQUESTED'&&this.configuration.bayId!=='R-102'&&!this.entryRequested&&this.fresh()&&!this.error){const b=this.observed(this.configuration.bayId);if(b?.bay==='DOWN'&&b.occupancy==='CLEAR'&&b.health==='HEALTHY'&&this.telemetry.health==='HEALTHY'&&!this.telemetry.emergency){this.enqueue('command',{verb:'ENTER',bayId:this.configuration.bayId});this.entryRequested=true;}}
  const selected=this.observed(this.configuration.bayId);
  if(this.phase==='EXIT_LANE_CLEARED'&&this.telemetry?.exit==='CLOSED'&&this.telemetry?.entry==='CLOSED'&&selected?.occupancy==='CLEAR'&&selected?.health==='HEALTHY'&&this.telemetry.health!=='GATE_FAULT'&&!this.telemetry.emergency)this.phase='COMPLETE';
  if(!['OUTSIDE','COMPLETE','RECOVERY_REQUIRED'].includes(this.phase)&&this.fresh()&&(this.telemetry?.emergency||this.telemetry?.health==='GATE_FAULT'||selected?.health!=='HEALTHY'||selected?.occupancy==='UNCERTAIN')){
   this.queue=[];this.phase='RECOVERY_REQUIRED';this.error='Active journey feedback is uncertain or faulty. Staff inspection required.';
  }
  if(this.phase!==oldPhase)this.record('JOURNEY_STATE',this.phase==='RECOVERY_REQUIRED'?'FAIL':'INFO',oldPhase+' -> '+this.phase+(this.error?': '+this.error:''),[this.configuration.bayId]);
  return {commands:this.fresh()?this.queue:[],phase:this.phase};
 }
 arrive(plate){
  if(plate.replaceAll(/\s/g,'').toUpperCase()!==this.configuration.plate)throw Object.assign(new Error('Plate is not authorized for this resident demo'),{status:403});
  if(!['OUTSIDE','COMPLETE'].includes(this.phase))throw new Error('This resident journey is already active.');
  const selected=this.observed(this.configuration.bayId);
  if(!this.fresh()||this.telemetry.health!=='HEALTHY'||this.telemetry.emergency||!selected||selected.health!=='HEALTHY'||!['UP','DOWN'].includes(selected.bay)||selected.occupancy!=='CLEAR')throw new Error('Fresh healthy vacant-bay feedback is required.');
  const prepared=selected.bay==='DOWN';const command=prepared?this.enqueue('command',{verb:'ENTER',bayId:this.configuration.bayId}):this.configuration.bayId==='R-102'?this.enqueue('command',{verb:'ARRIVE',value:600000}):this.enqueue('command',{verb:'UNLOCK',bayId:this.configuration.bayId,value:600000});this.entryRequested=prepared;this.entryPassed=false;this.phase='ARRIVAL_REQUESTED';this.error='';return command;
 }
 action(action){
  if(!this.fresh())throw new Error('Firmware is disconnected or stale.');const b=this.observed(this.configuration.bayId),t={...this.telemetry,...b};if(!b)throw new Error('Selected bay has no circuit feedback');if(this.telemetry.health==='GATE_FAULT')t.health='GATE_FAULT';
  if(action==='enter'){if(this.phase!=='ARRIVAL_REQUESTED'||t.entry!=='OPEN')throw new Error('Wait for the entrance barrier to be confirmed open.');this.enqueue('entryBeam',{blocked:true});this.phase='ENTERING';}
  else if(action==='reopen-entry'){if(this.phase!=='ARRIVAL_REQUESTED'||t.bay!=='DOWN'||t.health!=='HEALTHY'||t.emergency)throw new Error('An authorized arrival and lowered healthy bay are required');this.enqueue('command',{verb:'ENTER',bayId:this.configuration.bayId});}
  else if(action==='reopen-exit'){if(this.phase!=='EXIT_REQUESTED'||t.occupancy!=='CLEAR'||t.health!=='HEALTHY'||t.emergency)throw new Error('An authorized exit and clear bay are required');this.enqueue('command',{verb:'EXIT',bayId:this.configuration.bayId});}
  else if(action==='clear-entry'){if(this.phase!=='ENTERING'||t.entryBeam!==1)throw new Error('Wait for observed entrance passage before clearing the lane');this.entryPassed=true;this.enqueue('entryBeam',{blocked:false});}
  else if(action==='park'){if(this.phase!=='ENTERING'||(t.entryBeam!==1&&!this.entryPassed)||t.bay!=='DOWN'||t.health!=='HEALTHY'||t.emergency)throw new Error('A confirmed lowered healthy bay is required before parking.');this.enqueue('entryBeam',{blocked:false});this.enqueue('distance',{bayId:this.configuration.bayId,value:30});this.phase='PARKED';}
  else if(action==='leave'){if(this.phase!=='PARKED'||t.occupancy!=='PRESENT')throw new Error('Wait for confirmed parking before leaving.');this.enqueue('distance',{bayId:this.configuration.bayId,value:250});this.phase='LEFT_BAY';}
  else if(action==='exit'){if(this.phase!=='LEFT_BAY'||t.occupancy!=='CLEAR'||t.health!=='HEALTHY'||t.emergency)throw new Error('Clear bay presence and healthy telemetry are required at the exit.');this.enqueue('command',{verb:'EXIT',bayId:this.configuration.bayId});this.phase='EXIT_REQUESTED';}
  else if(action==='pass-exit'){if(this.phase!=='EXIT_REQUESTED'||t.exit!=='OPEN')throw new Error('Wait for the exit barrier to be confirmed open.');this.enqueue('exitBeam',{blocked:true});this.phase='EXITING';}
  else if(action==='clear-exit'){if(this.phase!=='EXITING'||t.exitBeam!==1)throw new Error('The car must pass the exit first.');this.enqueue('exitBeam',{blocked:false});this.phase='EXIT_LANE_CLEARED';}
  else if(action==='reset'){if(!this.telemetry||!['UP','DOWN'].includes(t.bay)||t.emergency||t.occupancy!=='CLEAR'||t.entry!=='CLOSED'||t.exit!=='CLOSED')throw new Error('Close the barriers and clear the bay before resetting the journey.');this.queue=[];this.enqueue('command',{verb:'RESET'});this.phase='OUTSIDE';this.entryPassed=false;this.error='';}
  else throw new Error('Unknown live journey action');
  return {ok:true,phase:this.phase};
 }
 baySnapshot(id='R-102'){const observed=this.observed(id);const t=observed?{...this.telemetry,...observed}:null;if(!t)return null;const health=this.fresh()?t.health:'OFFLINE';let state=t.bay==='UP'?'LOCKED_VACANT':t.bay==='MOVING_DOWN'?'UNLOCKING':t.bay==='MOVING_UP'?'RELOCKING':'AWAITING_ARRIVAL';if(t.occupancy==='PRESENT')state='OCCUPIED_PARKED';if(t.bay==='DOWN'&&(id===this.configuration.bayId&&this.phase==='LEFT_BAY'||t.departing))state='DEPARTURE_DELAY';if(health!=='HEALTHY'||t.occupancy==='UNCERTAIN')state='FAULT_HOLD';if(t.emergency)state='EMERGENCY_LATCHED';return {id,position:t.bay,occupancy:t.occupancy,state,health,mode:t.emergency?'EMERGENCY_LATCHED':'NORMAL',distance:t.distance<0?null:t.distance,now:t.ms,clearanceMs:t.clearanceMs||0,holdRemainingMs:0};}
 snapshot(){return {instance:this.instance,lastSeenAt:this.lastSeen?new Date(this.lastSeen).toISOString():null,telemetryAgeMs:this.lastSeen?Date.now()-this.lastSeen:null,diagnosticEvents:this.diagnosticEvents,entryPassed:this.entryPassed,configuration:this.configuration,enabled:this.enabled,connected:this.fresh(),phase:this.phase,telemetry:this.telemetry,pending:this.queue.length,error:this.error,projectUrl:this.telemetry?.controller==='ESP32'&&this.telemetry?.transport==='SIMULATED_WIRELESS'?'https://wokwi.com/projects/478492669342702593':this.telemetry?.transport==='SIMULATED_WIRELESS'?'https://wokwi.com/projects/478327634016887809':this.fullLot()?'https://wokwi.com/projects/478304280215843841':this.enabled?'https://wokwi.com/projects/478131710214850561':null,identity:'SIMULATED PLATE MATCH'};}
}
