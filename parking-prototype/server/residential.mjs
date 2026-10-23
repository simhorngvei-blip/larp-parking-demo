import {randomUUID,randomBytes} from 'node:crypto';
const SITE='RES-001',VISITOR=['V-01','V-02','V-03','V-04'];
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const plate=value=>{const p=String(value||'').replace(/\s/g,'').toUpperCase();if(!/^[A-Z0-9]{2,12}$/.test(p)||!/[A-Z]/.test(p)||!/[0-9]/.test(p))fail(400,'Use a plate containing letters and numbers');return p;};
const active=p=>['APPROVED','CHECKED_IN','EXIT_ONLY'].includes(p.status);
const iso=n=>new Date(n).toISOString();

// Public identities/allocations are authoritative. This adapter consumes the
// same device observations as the original circuit journey and its 3D scene.
export class ResidentialOperations{
 constructor(parking,adapter){this.parking=parking;this.adapter=adapter;
  parking.transact((s,now)=>{for(const j of this.ensure(s).journeys.filter(j=>!['COMPLETE','FAILED'].includes(j.phase)))this.hold(s,now,j,'Server restarted with an unfinished or undispatched arrival');});
 }
 ensure(s){return s.residential??=( {commands:[],journeys:[],observations:[],audit:[],vehicles:{'resident-alicia':'VAB8899','resident-daniel':'DAN2026'}} );}
 audit(s,now,actor,action,target,reason){const o=this.ensure(s);o.audit.unshift({id:randomUUID(),at:iso(now),actor,action,target,reason});o.audit=o.audit.slice(0,150);}
 permitted(s,id,bayId){const u=this.parking.account(s,id);return u.accountStatus==='ACTIVE'&&u.homes.some(h=>h.siteId===SITE&&h.bayId===bayId);}
 staff(s,id){this.parking.security(s,id,SITE);}
 hold(s,now,j,reason){
  if(j.phase!=='RECOVERY_REQUIRED'){j.lastConfirmedPhase=j.phase;j.phase='RECOVERY_REQUIRED';j.error=reason;this.audit(s,now,'system','INSPECTION_REQUIRED',j.bayId,reason);}
  j.observed=false;if(this.adapter.state().wokwi.configuration.journeyId===j.id)this.adapter.hold?.(reason);
 }
 hasJourney(s,p){return this.ensure(s).journeys.some(j=>j.passId===p.id&&!['COMPLETE','FAILED'].includes(j.phase));}
 revokePass(s,now,p){
  p.entryRevokedAt??=iso(now);const j=this.ensure(s).journeys.find(j=>j.passId===p.id&&!['COMPLETE','FAILED'].includes(j.phase));
  if(j){j.exitOnly=true;if(j.admitted||['ENTERING','PARKED','LEFT_BAY','EXIT_REQUESTED','EXITING','EXIT_LANE_CLEARED'].includes(j.phase))p.status='EXIT_ONLY';else this.hold(s,now,j,'Entry permission withdrawn before confirmed admission; inspect bay and lanes');}
 }
 checkAction(s,j,action,raw){
  if(!j)fail(409,'Review the interrupted residential journey before vehicle progression');
  const p=s.passes.find(p=>p.id===j.passId),valid=p&&['APPROVED','CHECKED_IN'].includes(p.status)&&!p.entryRevokedAt;
  const safeParking=action==='park'&&p?.status==='EXIT_ONLY'&&j.admitted&&raw.wokwi.phase==='ENTERING';
  if(['enter','park','reopen-entry'].includes(action)&&p&&!valid&&!safeParking)fail(403,'Guest entry permission changed; safe departure remains available');
  if(j.phase==='RECOVERY_REQUIRED'||j.phase==='FAILED')fail(409,'Review the interrupted residential journey before vehicle progression');
 }
 assertCircuitAction(action){
  this.parking.transact((s,now)=>{
   const raw=this.adapter.state(),id=raw.wokwi.configuration.journeyId;if(!id)return;
   this.reconcile(s,now,raw);const j=this.ensure(s).journeys.find(j=>j.id===id);
   this.checkAction(s,j,action,raw);
  });
 }
 allocation(s,now,bayId){return s.passes.find(p=>p.siteId===SITE&&p.parkingBayId===bayId&&(this.hasJourney(s,p)||active(p)&&(p.status!=='APPROVED'||Date.parse(p.endAt)>now)));}
 allocate(s,now,hostId,p,requested){
  const raw=this.adapter.state(),bays=raw.bays,eligible=requested&&requested!=='auto'?[requested]:VISITOR;
  if(requested?.startsWith('R-')&&!this.permitted(s,hostId,requested))fail(403,'You may lend only your own assigned bay');
  const held=s.passes.filter(q=>q.id!==p.id&&q.siteId===SITE&&q.parkingBayId&&(active(q)||this.hasJourney(s,q)));
  if(held.some(q=>q.userId===p.userId||q.plate===p.plate))fail(409,'This visitor or plate already has an active residential allocation');
  if(held.filter(q=>q.hostId===hostId).length>=3)fail(429,'A home may hold at most three active guest parking allocations');
  const target=eligible.find(id=>{const b=bays.find(b=>b.id===id);return b&&raw.connected&&b.health==='HEALTHY'&&b.occupancy==='CLEAR'&&b.position==='UP'&&!b.isolated&&!this.allocation(s,now,id)&&!this.ensure(s).journeys.some(j=>j.bayId===id&&!['COMPLETE','FAILED'].includes(j.phase));});
  if(!target)fail(409,'No fresh healthy unallocated parking bay is available for this invitation');
  p.parkingBayId=target;return target;
 }
 reconcile(s,now,raw){
  const o=this.ensure(s),w=raw.wokwi;
  if(w.enabled)o.circuitBound=true;
  if(o.circuitBound&&!w.connected)raw.connected=false;
  o.observations=o.observations.filter(v=>raw.bays.find(b=>b.id===v.bayId)?.occupancy!=='CLEAR');
  for(const c of o.commands.filter(c=>['DISPATCHED','OUTCOME_UNKNOWN'].includes(c.status))){const b=raw.bays.find(b=>b.id===c.bayId);if(raw.connected&&b?.health==='HEALTHY'&&b.position===c.target&&(!w.enabled||w.telemetry?.seq>c.sequence)){c.status='CONFIRMED';c.confirmedAt=iso(now);}else if(now>c.expires)c.status='OUTCOME_UNKNOWN';}
  for(const j of o.journeys.filter(j=>!['COMPLETE','FAILED'].includes(j.phase))){
   if(w.configuration.journeyId===j.id){const b=raw.bays.find(b=>b.id===j.bayId),p=s.passes.find(p=>p.id===j.passId);
    if((w.entryPassed||w.telemetry?.entryBeam===1)&&['ENTERING','PARKED','LEFT_BAY','EXIT_REQUESTED','EXITING','EXIT_LANE_CLEARED'].includes(w.phase))j.admitted=true;
    if(j.circuitInstance&&j.circuitInstance!==w.instance||!w.connected||!b||b.health==='OFFLINE'||b.health==='RADIO_OFFLINE'||b.occupancy==='UNCERTAIN'||w.telemetry?.health==='GATE_FAULT'||w.telemetry?.emergency||w.error)this.hold(s,now,j,'Device or vehicle position uncertain; staff inspection required');
    else if(j.phase!=='RECOVERY_REQUIRED')j.phase=w.phase==='COMPLETE'&&(b.occupancy!=='CLEAR'||w.telemetry?.entry!=='CLOSED'||w.telemetry?.exit!=='CLOSED')?'EXIT_LANE_CLEARED':w.phase;
    if(j.phase==='RECOVERY_REQUIRED')this.adapter.hold?.(j.error||'Staff inspection required');
    j.observed=!!w.connected&&j.phase!=='RECOVERY_REQUIRED';j.updatedAt=iso(now);
    if(p&&(['REVOKED','EXPIRED','CANCELLED','DENIED'].includes(p.status)||p.entryRevokedAt))this.revokePass(s,now,p);
    if(p&&p.status==='APPROVED'&&!p.entryRevokedAt&&j.phase==='PARKED'&&b?.occupancy==='PRESENT'&&w.connected)p.status='CHECKED_IN';
    if(p&&j.phase==='COMPLETE'&&b?.occupancy==='CLEAR'&&w.connected&&w.telemetry?.entry==='CLOSED'&&w.telemetry?.exit==='CLOSED')p.status='COMPLETE';
   }else if(j.phase!=='REQUESTED'||now-Date.parse(j.createdAt)>15000)this.hold(s,now,j,'Arrival dispatch or circuit identity unconfirmed; inspect locally');
  }
 }
 diagnosis(raw,b){
  const steps=[{label:'Server / gateway observations',result:raw.connected?'FRESH':'UNAVAILABLE'},{label:'Bay receiver observations',result:b.health==='OFFLINE'?'MISSING':b.health},{label:'Occupancy and position',result:b.occupancy+' / '+b.position}];
  if(!raw.connected||b.health==='OFFLINE')return {confidence:'UNKNOWN',cause:'Power, receiver or communication cause unconfirmed',observation:'Missing fresh device feedback',next:'Inspect gateway connection, node supply and receiver independently. Do not replay expired commands.',steps};
  if(b.health!=='HEALTHY'||b.occupancy==='UNCERTAIN')return {confidence:'OBSERVED',cause:'Component root cause unconfirmed',observation:b.health==='HEALTHY'?'Uncertain presence':b.health,next:b.health==='MOTOR_FAULT'?'Inspect obstruction, motion limits, driver and motor supply.':'Inspect presence/limit feedback locally; preserve motion inhibition.',steps};
  return {confidence:'OBSERVED',cause:'No fault observed; component health is not independently certified',observation:'Fresh normal feedback',next:'Monitor and investigate reported exceptions.',steps};
 }
 state(s,now,id){
  const u=this.parking.account(s,id),o=this.ensure(s),raw=this.adapter.state();this.reconcile(s,now,raw);if(u.role==='security'&&!u.sites.includes(SITE))return null;
  const staff=u.role==='security'&&u.sites.includes(SITE),creator=u.role==='developer',own=raw.bays.filter(b=>this.permitted(s,id,b.id)||s.passes.some(p=>p.userId===id&&p.parkingBayId===b.id&&active(p)));
  const all=raw.bays.map(b=>{
   const allocation=this.allocation(s,now,b.id),owner=s.users.find(u=>u.homes.some(h=>h.siteId===SITE&&h.bayId===b.id));
   const expected=allocation?.plate||(owner?o.vehicles[owner.id]:null),obs=o.observations.find(v=>v.bayId===b.id&&now-v.at<300000),fresh=raw.connected&&b.health!=='OFFLINE';
   const compliance=!fresh||b.occupancy==='UNCERTAIN'?'UNKNOWN':b.occupancy==='CLEAR'?'VACANT':b.occupancy!=='PRESENT'||!obs?'OCCUPIED_UNVERIFIED':expected&&obs.plate===expected?'MATCHES_ALLOCATION':'POTENTIAL_MISMATCH';
   return {...b,fresh,expectedPlate:expected||null,observedPlate:obs?.plate||null,observationSource:obs?'STAFF_AT_BAY':null,compliance,allocationId:allocation?.id||null,diagnosis:this.diagnosis(raw,b)};
  });
  const visible=staff||creator?all:all.filter(b=>own.some(v=>v.id===b.id));
  return {siteId:SITE,source:o.circuitBound?'WOKWI_ESP32_SIMULATION':'BEHAVIORAL_BAY_MODEL',connected:raw.connected&&(!raw.wokwi.enabled||raw.wokwi.connected),observedAt:iso(Date.now()),bays:visible,
   availableVisitorBays:all.filter(b=>VISITOR.includes(b.id)&&b.fresh&&b.position==='UP'&&b.occupancy==='CLEAR'&&b.health==='HEALTHY'&&!b.allocationId&&!b.isolated).map(b=>b.id),
   inventory:{total:all.length,vacant:all.filter(b=>b.fresh&&b.occupancy==='CLEAR'&&!b.allocationId&&b.health==='HEALTHY').length,unknown:all.filter(b=>!b.fresh||b.occupancy==='UNCERTAIN').length},
   gates:{entry:raw.wokwi.connected?raw.wokwi.telemetry?.entry||'UNKNOWN':'UNKNOWN',exit:raw.wokwi.connected?raw.wokwi.telemetry?.exit||'UNKNOWN':'UNKNOWN'},
   registeredPlate:o.vehicles[id]||null,journeys:o.journeys.filter(j=>staff||creator||j.userId===id||s.passes.some(p=>p.id===j.passId&&p.hostId===id)).slice(0,25),
   commands:o.commands.filter(c=>staff||creator||c.actor===id).slice(0,30),audit:staff||creator?o.audit:[],simulation:staff||creator||o.journeys.some(j=>j.userId===id&&j.id===raw.wokwi.configuration.journeyId)?raw.wokwi:{...raw.wokwi,configuration:{plate:'PRIVATE',bayId:'PRIVATE'}},
   rehearsal:creator&&o.rehearsal?{...o.rehearsal,passed:raw.connected&&raw.bays.find(b=>b.id===o.rehearsal.bayId)?.health===o.rehearsal.expected}:null,
   guestProfiles:u.homes.length?s.users.filter(v=>v.role==='user'&&v.id!==id&&v.accountStatus==='ACTIVE').map(v=>({id:v.id,name:v.name})):[]};
 }
 async handle(id,action,input){
  let dispatch=null;
  const result=this.parking.transact((s,now)=>{
   const u=this.parking.account(s,id),o=this.ensure(s),raw=this.adapter.state();this.reconcile(s,now,raw);
   if(action==='repair-complete'){
    this.staff(s,id);if(String(input.reason||'').trim().length<12)fail(400,'Record the local repair inspection and verification');
    const b=raw.bays.find(b=>b.id===input.bayId)||fail(404,'Bay not found'),t=raw.wokwi.telemetry;
    if(!raw.connected||!raw.wokwi.connected||b.health!=='HEALTHY'||!['UP','DOWN'].includes(b.position)||!['CLEAR','PRESENT'].includes(b.occupancy)||t?.entry!=='CLOSED'||t?.exit!=='CLOSED'||t.health==='GATE_FAULT'||t.emergency||raw.wokwi.pending||o.journeys.some(j=>j.bayId===b.id&&!['COMPLETE','FAILED'].includes(j.phase)))fail(409,'Inspect the bay; need fresh healthy stable feedback, closed lanes, no emergency, pending command or unreconciled journey');
    this.audit(s,now,id,'REPAIR_INSPECTION_COMPLETE',b.id,String(input.reason).slice(0,250));dispatch=()=>this.adapter.resolveRepair(b.id);return {ok:true,bayId:b.id};
   }
   if(action==='inspect-resume'){
    this.staff(s,id);const j=o.journeys.find(j=>j.id===input.journeyId)||fail(404,'Journey not found'),b=raw.bays.find(b=>b.id===j.bayId),t=raw.wokwi.telemetry,obs=o.observations.find(v=>v.bayId===j.bayId&&v.plate===j.plate&&now-v.at<300000);
    if(j.phase!=='RECOVERY_REQUIRED'||String(input.reason||'').trim().length<12||!raw.wokwi.connected||raw.wokwi.configuration.journeyId!==j.id||!b||b.health!=='HEALTHY'||b.position!=='DOWN'||b.occupancy!=='PRESENT'||!obs||t?.entry!=='CLOSED'||t?.exit!=='CLOSED'||t.health==='GATE_FAULT'||t.emergency||raw.wokwi.pending)fail(409,'Need fresh matching at-bay plate inspection, healthy DOWN occupied bay, closed lanes, no emergency or outstanding command');
    j.phase='PARKED';j.error='';j.observed=true;j.admitted=true;j.circuitInstance=raw.wokwi.instance;dispatch=()=>this.adapter.resume(j);this.audit(s,now,id,'RESUME_AFTER_INSPECTION',j.bayId,String(input.reason).slice(0,250));return j;
   }
   if(action==='reconcile'){
    this.staff(s,id);const j=o.journeys.find(j=>j.id===input.journeyId)||fail(404,'Journey not found'),b=raw.bays.find(b=>b.id===j.bayId),t=raw.wokwi.telemetry;
    if(j.phase!=='RECOVERY_REQUIRED'||String(input.reason||'').trim().length<12||!raw.wokwi.connected||!b||b.health!=='HEALTHY'||b.occupancy!=='CLEAR'||!['UP','DOWN'].includes(b.position)||t?.entry!=='CLOSED'||t?.exit!=='CLOSED'||t.health==='GATE_FAULT'||t.emergency||raw.wokwi.pending)fail(409,'Inspect the affected empty bay and closed lanes; fresh healthy stable feedback, no emergency and no outstanding commands are required');
    j.phase='COMPLETE';j.exitVerification='STAFF_REVIEWED_CLEAR';const p=s.passes.find(p=>p.id===j.passId);if(p)p.status='COMPLETE';dispatch=()=>this.adapter.reconcile(j);this.audit(s,now,id,'RECONCILE_AFTER_INSPECTION',j.bayId,String(input.reason).slice(0,250));return j;
   }
   if(action==='developer-fault'){
    this.parking.developer(s,id);if(!raw.bays.some(b=>b.id===input.bayId)||!['sensor','jam','clear'].includes(input.fault))fail(400,'Select a valid bay and sensor, jam or recovery scenario');
    o.rehearsal={id:randomUUID(),name:input.fault==='clear'?'RECOVERY_CHECK':input.fault==='sensor'?'SENSOR_UNCERTAINTY':'MOTOR_JAM',bayId:input.bayId,expected:input.fault==='clear'?'HEALTHY':input.fault==='sensor'?'SENSOR_FAULT':'MOTOR_FAULT',at:iso(now)};
    dispatch=()=>this.adapter.fault(input);this.audit(s,now,id,'FAULT_FIXTURE',input.bayId,input.fault);return o.rehearsal;
   }
   if(action==='invite'){
    this.parking.user(s,id);const home=u.homes.find(h=>h.siteId===input.siteId&&h.unit===input.unit);if(!home)fail(403,'An activated homeowner may invite guests only to their own home');
    return this.parking.retry(s,id,'invitation',input,()=>{const guest=s.users.find(v=>v.id===input.guestId&&v.role==='user'&&v.accountStatus==='ACTIVE'&&v.id!==id)||fail(400,'Select an active synthetic guest account');
     const p={id:'pass-'+randomUUID(),userId:guest.id,visitorName:guest.name,siteId:home.siteId,hostId:id,hostUnit:home.unit,plate:plate(input.plate),status:'APPROVED',startAt:iso(now),endAt:iso(now+7200000),createdAt:iso(now),code:randomBytes(4).toString('hex').toUpperCase()};
     this.allocate(s,now,id,p,input.parkingBayId);s.passes.unshift(p);this.parking.notify(s,now,guest.id,'PASS_APPROVED',p.id,`Your host allocated ${p.parkingBayId}. Check current access before arrival.`,SITE);this.parking.notifySecurity(s,now,SITE,'PASS_APPROVED',p.id,`${p.plate}: host-approved visitor allocated ${p.parkingBayId}.`);this.audit(s,now,id,'INVITE',p.parkingBayId,'Host invitation with exclusive parking');return p;});
   }
   if(action==='vehicle'){this.parking.user(s,id);if(!u.homes.some(h=>h.siteId===SITE))fail(403,'Verified home required');if(o.journeys.some(j=>j.userId===id&&!['COMPLETE','FAILED'].includes(j.phase)))fail(409,'Finish the active journey before changing its vehicle');o.vehicles[id]=plate(input.plate);this.audit(s,now,id,'REGISTER_DEMO_VEHICLE',u.homes[0].bayId,'Owner entered synthetic vehicle; not a real ownership verification');return {plate:o.vehicles[id]};}
   if(action==='observe'){
    this.staff(s,id);if(String(input.reason||'').trim().length<8)fail(400,'Record how the vehicle was observed at this bay');const b=raw.bays.find(b=>b.id===input.bayId)||fail(404,'Bay not found');if(!raw.connected||b.occupancy!=='PRESENT')fail(409,'A fresh occupied bay is required for a patrol observation');
    o.observations=o.observations.filter(v=>v.bayId!==b.id);o.observations.unshift({bayId:b.id,plate:plate(input.plate),at:now,by:id,reason:String(input.reason).slice(0,250)});this.audit(s,now,id,'BAY_OBSERVATION',b.id,input.reason);return {ok:true};
   }
   if(action==='lower'||action==='relock'){
    const staff=u.role==='security';if(staff)this.staff(s,id);else{this.parking.user(s,id);if(action!=='lower'||!this.permitted(s,id,input.bayId))fail(403,'You may lower only your own assigned bollard');}
    if(staff&&String(input.reason||'').trim().length<8)fail(400,'A staff control reason is required');
    if(typeof input.requestId!=='string'||!/^[\w-]{1,100}$/.test(input.requestId))fail(400,'A request ID is required');
    const previous=o.commands.find(c=>c.actor===id&&c.requestId===input.requestId);if(previous){if(previous.bayId!==input.bayId||previous.action!==action)fail(409,'Request ID already used for another operation');return previous;}
    const b=raw.bays.find(b=>b.id===input.bayId)||fail(404,'Bay not found');if(!raw.connected||b.health!=='HEALTHY'||b.occupancy!=='CLEAR'||b.isolated||!['UP','DOWN'].includes(b.position)||raw.wokwi.telemetry?.emergency)fail(409,'Fresh healthy clear bay and consistent position required');
    const loan=this.allocation(s,now,b.id);if(!staff&&loan)fail(409,'This bay is currently lent to a guest; finish that allocation first');
    const c={id:randomUUID(),requestId:input.requestId,actor:id,bayId:b.id,action,target:action==='lower'?'DOWN':'UP',status:'DISPATCHED',issuedAt:iso(now),expires:now+(action==='lower'?8000:30000),sequence:raw.wokwi.telemetry?.seq||0,reason:String(input.reason||'Owner manual lower').slice(0,250)};
    c.route=this.parking.central.route(c.bayId);this.parking.central.record(c,c.action.toUpperCase(),now);
    o.commands.unshift(c);o.commands=o.commands.slice(0,200);this.audit(s,now,id,action.toUpperCase(),b.id,c.reason);dispatch=()=>this.adapter.command(c);return c;
   }
   if(action==='arrive'){
    const pass=input.passId?s.passes.find(p=>p.id===input.passId):null;let bayId,registration,unit,beneficiary=id;
    if(pass){if(u.role==='security')this.staff(s,id);else if(pass.userId!==id)fail(403,'Only this visitor or assigned security may prepare the arrival');if(pass.siteId!==SITE||pass.status!=='APPROVED'||Date.parse(pass.endAt)<=now||!pass.parkingBayId)fail(409,'A current approved pass with allocated parking is required');bayId=pass.parkingBayId;registration=pass.plate;unit=pass.hostUnit;beneficiary=pass.userId;}
    else{this.parking.user(s,id);const h=u.homes.find(h=>h.siteId===SITE);if(!h)fail(403,'An activated home or approved visitor allocation is required');bayId=h.bayId;unit=h.unit;registration=o.vehicles[id];if(!registration)fail(409,'Register your synthetic vehicle first');if(this.allocation(s,now,bayId))fail(409,'Your bay is currently lent to a guest');}
    if(!raw.wokwi.connected||!raw.wokwi.telemetry?.bays)fail(503,'Connect the full ESP32 circuit before starting the shared residential journey');
    const existing=o.journeys.find(j=>j.userId===beneficiary&&!['COMPLETE','FAILED'].includes(j.phase));if(existing){if(existing.bayId===bayId&&existing.plate===registration)return existing;fail(409,'Finish the existing journey first');}
    if(o.journeys.some(j=>!['COMPLETE','FAILED'].includes(j.phase))||!['OUTSIDE','COMPLETE'].includes(raw.wokwi.phase))fail(409,'The demonstration lane is serving another journey');
    const b=raw.bays.find(b=>b.id===bayId);if(!b||b.health!=='HEALTHY'||b.occupancy!=='CLEAR'||!['UP','DOWN'].includes(b.position)||b.isolated)fail(409,'Allocated bay is unavailable; request staff assistance');
    const j={id:randomUUID(),userId:beneficiary,actorName:this.parking.account(s,beneficiary).name,passId:pass?.id||null,bayId,plate:registration,unit,circuitInstance:raw.wokwi.instance,phase:'REQUESTED',createdAt:iso(now),observed:false};j.route=this.parking.central.route(bayId);this.parking.central.record(j,'ARRIVE',now);o.journeys.unshift(j);dispatch=()=>this.adapter.arrive(j);this.audit(s,now,id,'ARRIVAL',bayId,j.id);return j;
   }
   if(action==='action'){
    const j=o.journeys.find(j=>j.id===input.journeyId)||fail(404,'Journey not found');if(u.role==='security')this.staff(s,id);else if(j.userId!==id)fail(403,'Only this journey owner or assigned security may act');
    if(!['enter','clear-entry','park','leave','exit','pass-exit','clear-exit','reopen-entry','reopen-exit'].includes(input.action))fail(400,'Unknown journey action');
    if(!raw.wokwi.connected||raw.wokwi.configuration.journeyId!==j.id)fail(409,'Fresh matching journey feedback is required');
    this.checkAction(s,j,input.action,raw);
    dispatch=()=>this.adapter.action(input.action);this.audit(s,now,id,'VEHICLE_'+input.action,j.bayId,'Synthetic vehicle observation; firmware feedback remains independent');return j;
   }
   fail(404,'Residential route not found');
  });
  if(dispatch){try{await dispatch();}catch(error){this.parking.transact(s=>{const o=this.ensure(s),c=o.commands.find(c=>c.id===result.id),j=o.journeys.find(j=>j.id===result.id);if(c){c.status='OUTCOME_UNKNOWN';c.error=error.message;}if(j&&j.phase==='REQUESTED')this.hold(s,Date.now()+s.offset,j,'Arrival dispatch outcome unconfirmed: '+error.message);});throw Object.assign(error,{status:error.status||409});}
   return this.parking.transact((s,now)=>{this.reconcile(s,now,this.adapter.state());return this.ensure(s).commands.find(c=>c.id===result.id)||this.ensure(s).journeys.find(j=>j.id===result.id)||result;});}
  return result;
 }
}
