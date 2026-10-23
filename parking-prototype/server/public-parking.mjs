import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {CentralRegistry} from './central.mjs';
import {EventEmitter} from 'node:events';
import {operationsState,handleOperations} from './operations.mjs';

const ACTIVE_BOOKING=new Set(['BOOKED','CHECKED_IN','START_REQUESTED','CHARGING','STOP_REQUESTED','STOPPED']);
const CURRENT_PASS=new Set(['APPROVED','CHECKED_IN']);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(Object.fromEntries(Object.entries(value).filter(([k])=>k!=='requestId').sort(([a],[b])=>a.localeCompare(b))));
const plate=value=>{const p=String(value||'').replace(/\s/g,'').toUpperCase();if(!/^[A-Z0-9]{2,12}$/.test(p)||!/[A-Z]/.test(p)||!/[0-9]/.test(p))fail(400,'Use a plate with 2-12 letters and numbers');return p;};
const iso=value=>new Date(value).toISOString();
const uid=prefix=>prefix+'-'+randomUUID().slice(0,12);

function seed(){
  const now=Date.now();
  const properties=[
    {id:'RES-001',name:'Concordia Residences',type:'residential',location:'Demo residential property',normalTotal:120,normalVacant:34,access:'Resident or host-approved visitor'},
    {id:'MALL-001',name:'LARP Retail Centre',type:'retail',location:'Demo shopping destination',normalTotal:400,normalVacant:146,access:'Public parking'},
    {id:'OFF-001',name:'LARP Business Park',type:'office',location:'Demo office destination',normalTotal:180,normalVacant:57,access:'Public parking'},
  ];
  const users=[
    {id:'public-visitor',name:'Maya Tan',email:'maya@example.test',role:'user',accountStatus:'ACTIVE',homes:[]},
    {id:'resident-alicia',name:'Alicia Rahman',email:'alicia@example.test',role:'user',accountStatus:'ACTIVE',homes:[{siteId:'RES-001',unit:'10-02',bayId:'R-102'}]},
    {id:'resident-daniel',name:'Daniel Lim',email:'daniel@example.test',role:'user',accountStatus:'ACTIVE',homes:[{siteId:'RES-001',unit:'11-03',bayId:'R-103'}]},
    {id:'security-res',name:'Residential duty team',role:'security',accountStatus:'ACTIVE',sites:['RES-001'],homes:[]},
    {id:'security-mall',name:'Retail / office duty team',role:'security',accountStatus:'ACTIVE',sites:['MALL-001','OFF-001'],homes:[]},
    {id:'developer',name:'Software diagnostics',role:'developer',accountStatus:'ACTIVE',homes:[]},
  ];
  const bays=properties.flatMap(p=>[0,1].map(i=>({id:p.id.split('-')[0]+'-EV-0'+(i+1),siteId:p.id,label:'EV '+String(i+1).padStart(2,'0'),connector:i===0?'CCS2':'Type 2',powerKw:i===0?(p.type==='retail'?120:60):22,supportsSoc:i===0,health:p.id==='OFF-001'&&i===1?'OFFLINE':'ONLINE',occupied:false,connected:false,charging:false,currentA:0,locked:false,soc:null,observedAt:now,sequence:1})));
  const occupied=bays.find(b=>b.id==='RES-EV-01');Object.assign(occupied,{occupied:true,connected:true,charging:true,currentA:16,locked:true,soc:42});
  const bookings=[{id:'seed-charge-alicia',userId:'resident-alicia',siteId:'RES-001',bayId:'RES-EV-01',plate:'VAB8899',startAt:iso(now-900000),endAt:iso(now+2700000),status:'CHARGING',createdAt:iso(now-900000),pending:null,overstay:false}];
  return {version:1,properties,users,bays,bookings,passes:[],tasks:[],notifications:[],events:[],requests:{},handovers:{},offset:0,lastTick:now};
}

export class PublicParking{
  constructor({file=':memory:',handoverKey=randomUUID(),creatorKey=randomUUID()}={}){
    this.db=new DatabaseSync(file);this.key=handoverKey;this.creatorKey=hash(creatorKey);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS public_parking_state(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)');
    if(!this.db.prepare('SELECT id FROM public_parking_state WHERE id=1').get())this.db.prepare('INSERT INTO public_parking_state VALUES(1,?)').run(JSON.stringify(seed()));
    this.central=new CentralRegistry(this.db);this.alerts=new EventEmitter();this.alerts.setMaxListeners(0);
  }
  transact(fn){
    this.db.exec('BEGIN IMMEDIATE');
    try{const s=JSON.parse(this.db.prepare('SELECT data FROM public_parking_state WHERE id=1').get().data),now=Date.now()+s.offset,prior=new Set(s.notifications.map(n=>n.id));this.expire(s,now);const value=fn(s,now);this.db.prepare('UPDATE public_parking_state SET data=? WHERE id=1').run(JSON.stringify(s));this.db.exec('COMMIT');for(const n of s.notifications)if(!prior.has(n.id))queueMicrotask(()=>this.alerts.emit('notice',n));return value;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  event(s,now,title,siteId){s.events.unshift({id:uid('event'),at:iso(now),title,siteId});s.events=s.events.slice(0,150);}
  notify(s,now,to,kind,reference,message,siteId){
    if(s.notifications.some(n=>n.to===to&&n.kind===kind&&n.reference===reference))return;
    s.notifications.unshift({id:uid('notice'),to,kind,reference,message,siteId,at:iso(now),read:false});s.notifications=s.notifications.slice(0,500);
  }
  notifySecurity(s,now,siteId,kind,reference,message){for(const u of s.users.filter(u=>u.role==='security'&&u.sites.includes(siteId)))this.notify(s,now,u.id,kind,reference,message,siteId);}
  account(s,id){return s.users.find(u=>u.id===id)||fail(401,'Unknown demo identity');}
  user(s,id){const u=this.account(s,id);if(u.role!=='user')fail(403,'User account required');if(u.accountStatus!=='ACTIVE')fail(403,'Activate the verified homeowner invitation first');return u;}
  developer(s,id){if(this.account(s,id).role!=='developer')fail(403,'Developer diagnostics role required');}
  security(s,id,siteId){const u=this.account(s,id);if(u.role!=='security'||!u.sites.includes(siteId))fail(403,'Security may act only at its assigned property');}
  fresh(bay,now){return bay.health==='ONLINE'&&now-bay.observedAt<=30000&&now>=bay.observedAt;}
  canAccess(s,userId,siteId,registration,start,end){
    const u=this.account(s,userId),site=s.properties.find(p=>p.id===siteId);
    return u.role==='user'&&u.accountStatus==='ACTIVE'&&(site.type!=='residential'||u.homes.some(h=>h.siteId===siteId)||s.passes.some(p=>p.userId===userId&&p.siteId===siteId&&p.plate===registration&&CURRENT_PASS.has(p.status)&&Date.parse(p.startAt)<=start&&Date.parse(p.endAt)>=end));
  }
  retry(s,id,kind,input,fn){
    if(typeof input.requestId!=='string'||!/^[\w-]{1,100}$/.test(input.requestId))fail(400,'A valid request ID is required');
    const key=id+':'+kind+':'+input.requestId,fingerprint=hash(canonical(input));
    if(s.requests[key]){if(s.requests[key].fingerprint!==fingerprint)fail(409,'Request ID was already used with different details');const result=s.requests[key].result;return [...s.bookings,...s.passes,...(s.operations?.complaints||[])].find(x=>x.id===result.id)||result;}
    const result=fn();s.requests[key]={fingerprint,result};return result;
  }
  expire(s,now){
    for(const p of s.passes)if(['PENDING','APPROVED'].includes(p.status)&&Date.parse(p.endAt)<=now){p.status='EXPIRED';this.notify(s,now,p.userId,'PASS_EXPIRED',p.id,'Your visitor pass expired.',p.siteId);}
    for(const b of s.bookings.filter(b=>ACTIVE_BOOKING.has(b.status))){
      const bay=s.bays.find(x=>x.id===b.bayId);
      if(['BOOKED','CHECKED_IN'].includes(b.status)&&now>=Date.parse(b.startAt)+600000&&!bay.occupied&&!bay.connected){
        b.status='EXPIRED';this.account(s,b.userId).cooldownUntil=now+900000;this.notify(s,now,b.userId,'NO_SHOW',b.id,'EV reservation expired after the ten-minute arrival grace. Booking cooldown: 15 minutes.',b.siteId);
      }else if(now>=Date.parse(b.endAt)&&!b.overstay&&bay.occupied){
        b.overstay=true;this.notify(s,now,b.userId,'EV_OVERSTAY',b.id,'Your EV slot ended. Stop charging and arrange a safe departure; the occupied bay remains blocked.',b.siteId);
        this.notifySecurity(s,now,b.siteId,'EV_OVERSTAY',b.id,'EV slot ended while the bay remains occupied. Do not force disconnection.');
      }
    }
  }
  model(s,now){
    const elapsed=Math.max(0,now-s.lastTick);s.lastTick=now;
    for(const bay of s.bays){
      if(bay.health!=='ONLINE')continue;
      bay.observedAt=now;bay.sequence++;
      const booking=s.bookings.find(b=>b.bayId===bay.id&&ACTIVE_BOOKING.has(b.status)&&b.status!=='BOOKED');
      if(booking?.pending&&now>=booking.pending.due){
        const kind=booking.pending.kind;
        if(now>booking.pending.expires){booking.status=bay.charging?'CHARGING':kind==='RELEASE'?'STOPPED':'CHECKED_IN';this.notify(s,now,booking.userId,'COMMAND_TIMEOUT',booking.id+kind,'The simulated command expired; check observed state and retry.',bay.siteId);booking.pending=null;}
        else if(kind==='START'&&(now>=Date.parse(booking.endAt)||!this.canAccess(s,booking.userId,booking.siteId,booking.plate,now,Date.parse(booking.endAt)))){booking.status='CHECKED_IN';booking.pending=null;this.notify(s,now,booking.userId,'ACCESS_CHANGED',booking.id,'Access or slot validity changed before start confirmation. Charging was not started; safe stop/departure remains available.',booking.siteId);}
        else if(kind==='START'&&bay.connected&&bay.occupied){bay.charging=true;bay.currentA=16;bay.locked=true;bay.soc=bay.supportsSoc?(bay.soc??40):null;booking.status='CHARGING';booking.pending=null;}
        else if(kind==='STOP'){bay.charging=false;bay.currentA=0;booking.status='STOPPED';booking.pending=null;}
        else if(kind==='RELEASE'&&!bay.charging&&bay.currentA===0&&bay.connected&&booking.status==='STOPPED'){bay.locked=false;booking.pending=null;this.event(s,now,'Owner-requested charger-side release observed',bay.siteId);}
      }
      if(bay.charging&&bay.supportsSoc){bay.soc=Math.min(100,(bay.soc??40)+elapsed/60000*3);if(bay.soc>=100){bay.charging=false;bay.currentA=0;if(booking){booking.status='STOPPED';this.notify(s,now,booking.userId,'CHARGE_COMPLETE',booking.id,'Charging completed in the model. The bay is still occupied until the vehicle leaves.',bay.siteId);}}}
      const task=s.tasks.find(t=>t.bayId===bay.id&&t.status==='REQUESTED'&&t.consentUntil>=now);
      // Charger-side model release is a separate observation. Vehicle-side
      // locks and the driver's presence are not inferred by the application.
      if(task&&!bay.charging&&bay.currentA===0&&bay.connected&&booking?.status==='STOPPED')bay.locked=false;
    }
    this.expire(s,now);
  }
  tick(){this.transact((s,now)=>{if(now-s.lastTick>=1000)this.model(s,now);});}
  state(s,now,id){
    const u=this.account(s,id),sites=u.role==='security'?u.sites:null;
    const passes=u.role==='developer'?[]:s.passes.filter(p=>u.role==='security'?sites.includes(p.siteId):p.userId===id||p.hostId===id);
    const bookings=u.role==='developer'?[]:s.bookings.filter(b=>u.role==='security'?sites.includes(b.siteId):b.userId===id);
    const tasks=u.role==='developer'?[]:s.tasks.filter(t=>u.role==='security'?sites.includes(t.siteId):t.userId===id);
    const bays=s.bays.filter(b=>!sites||sites.includes(b.siteId)).map(b=>{
      const own=s.bookings.find(x=>x.bayId===b.id&&x.userId===id&&ACTIVE_BOOKING.has(x.status));
      const fresh=this.fresh(b,now),reserved=s.bookings.some(x=>x.bayId===b.id&&ACTIVE_BOOKING.has(x.status)&&Date.parse(x.startAt)<=now&&Date.parse(x.endAt)>now);
      const soc=own&&fresh&&b.supportsSoc&&b.soc!==null?Math.round(b.soc):null;
      return {...b,soc,socReason:!fresh?'Telemetry unavailable or stale':!b.supportsSoc?'Not reported by this charger / vehicle':!own?'Private to the active session owner':b.soc===null?'Waiting for a reported value':'Simulated vehicle report',fresh,availability:!fresh?'UNAVAILABLE':b.occupied?'OCCUPIED':reserved?'RESERVED':'AVAILABLE',bookingId:own?.id};
    });
    const residential=this.operations?.state(s,now,id)||null;
    const operational=operationsState(this,s,now,id);
    const properties=s.properties.map(p=>p.id==='RES-001'&&residential?{...p,normalTotal:residential.inventory.total,normalVacant:residential.inventory.vacant,normalSource:residential.source,normalObservedAt:residential.observedAt}:p);
    return {operations:operational,residential,central:u.role==='developer'?this.central.state(s,now,residential):null,now:iso(now),profile:{id:u.id,name:u.name,role:u.role,email:u.email,accountStatus:u.accountStatus,homes:u.homes,sites:u.sites||[],cooldownUntil:u.cooldownUntil?iso(u.cooldownUntil):null},properties:properties.filter(p=>!sites||sites.includes(p.id)).map(p=>({...p,name:p.name.replace(/BayPilot/g,'LARP')})),bays,passes,bookings:bookings.map(b=>({...b,pending:b.pending?{kind:b.pending.kind}:null})),tasks,notifications:s.notifications.filter(n=>n.to===id),diagnostics:u.role==='developer'?{accounts:s.users.filter(u=>u.role==='user').length,activeReservations:s.bookings.filter(b=>ACTIVE_BOOKING.has(b.status)).length,pendingPasses:s.passes.filter(p=>p.status==='PENDING').length,openAssistance:s.tasks.filter(t=>t.status==='REQUESTED').length,events:s.events,model:'PUBLIC_EV_SOFTWARE_MODEL',authentication:'DEMO_IDENTITY_SWITCHER',physicalIntegration:false}:null,identity:'SYNTHETIC DEMO ACCOUNTS',charging:'SOFTWARE MODEL - NOT OCPP CONNECTED'};
  }
  handover(s,now,input){
    const {eventId,buyerId,siteId,unit,bayId}=input;
    if(!/^[\w-]{1,100}$/.test(eventId||'')||!/^[\w-]{1,100}$/.test(buyerId||'')||!s.properties.some(p=>p.id===siteId&&p.type==='residential')||!/^\d{1,3}-\d{1,3}$/.test(unit||'')||!/^R-\d{3}$/.test(bayId||''))fail(400,'A verified handover needs an event, buyer, residential property, unit and assigned bay');
    const name=String(input.name||'').trim(),email=String(input.email||'').trim().toLowerCase();
    if(!name||name.length>80||email.length>150||!/^\S+@\S+\.\S+$/.test(email))fail(400,'Valid buyer name and email required');
    const fingerprint=hash(canonical(input));
    if(s.handovers[eventId]){const old=s.handovers[eventId];if(old.fingerprint!==fingerprint)fail(409,'Handover event cannot be altered on replay');return {...old.result,replayed:true};}
    if(s.users.some(u=>u.homes.some(h=>h.siteId===siteId&&(h.unit===unit||h.bayId===bayId))))fail(409,'Unit or bay already has an owner; ownership transfer needs reconciliation');
    if(s.users.some(u=>u.email===email||u.buyerId===buyerId))fail(409,'Buyer already exists; reconcile the verified identity before adding another home');
    const code=randomBytes(12).toString('hex'),userId=uid('homeowner');
    s.users.push({id:userId,name,email,buyerId,role:'user',accountStatus:'INVITED',homes:[{siteId,unit,bayId}],invitationHash:hash(code),invitationExpires:now+86400000});
    const result={userId,accountStatus:'INVITED',siteId,unit,bayId};s.handovers[eventId]={fingerprint,result};
    this.event(s,now,'Trusted handover provisioned an invited account',siteId);
    // Only the trusted integration response/outbox receives the one-time code.
    return {...result,activationCode:code};
  }
  requestPass(s,now,id,input){
    const u=this.user(s,id);if(input.userId&&input.userId!==id)fail(403,'Cannot request a pass for another identity');
    return this.retry(s,id,'pass',input,()=>{
      const property=s.properties.find(p=>p.id===input.siteId)||fail(400,'Unknown property'),registration=plate(input.plate);
      if(s.passes.filter(p=>p.userId===id&&['PENDING','APPROVED','CHECKED_IN','EXIT_ONLY'].includes(p.status)).length>=3)fail(429,'Finish or cancel existing passes before requesting more');
      const host=property.type==='residential'?s.users.find(x=>x.role==='user'&&x.accountStatus==='ACTIVE'&&x.homes.some(h=>h.siteId===property.id&&h.unit===input.hostUnit)):null;
      if(property.type==='residential'&&!host)fail(400,'No activated homeowner found for this unit');
      if(host?.id===id)fail(400,'Use your resident entitlement instead of approving your own visitor request');
      const pass={id:uid('pass'),userId:id,visitorName:u.name,siteId:property.id,hostId:host?.id||null,hostUnit:host?input.hostUnit:null,plate:registration,status:host?'PENDING':'APPROVED',startAt:iso(now),endAt:iso(now+2*3600000),createdAt:iso(now),code:randomBytes(4).toString('hex').toUpperCase()};
      s.passes.unshift(pass);
      if(host)this.notify(s,now,host.id,'HOST_APPROVAL',pass.id,`${u.name} requested a visitor pass for your home.`,property.id);
      else this.notifySecurity(s,now,property.id,'PASS_APPROVED',pass.id,'A public parking pass is ready for current-state verification.');
      this.notify(s,now,id,host?'PASS_PENDING':'PASS_APPROVED',pass.id,host?'Request sent to the homeowner.':'Public parking pass approved. Capacity is checked separately.',property.id);
      this.event(s,now,host?'Visitor requested host approval':'Public parking pass issued',property.id);return pass;
    });
  }
  decision(s,now,id,input){
    this.user(s,id);const p=s.passes.find(p=>p.id===input.id)||fail(404,'Pass not found');if(p.hostId!==id)fail(403,'Only the actual homeowner can approve this request');
    if(!this.account(s,id).homes.some(h=>h.siteId===p.siteId&&h.unit===p.hostUnit))fail(403,'Host ownership is no longer valid');
    if(input.decision==='approve'&&p.status==='APPROVED')return p;
    if(input.decision==='approve'||input.decision==='deny'){
      if(p.status!=='PENDING')fail(409,'This request is no longer awaiting a decision');if(input.decision==='approve'&&p.siteId==='RES-001'&&this.operations)this.operations.allocate(s,now,id,p,input.parkingBayId);p.status=input.decision==='approve'?'APPROVED':'DENIED';
    }else if(input.decision==='revoke'){
      if(!['PENDING','APPROVED','CHECKED_IN'].includes(p.status))fail(409,'This pass can no longer be revoked');p.status=p.status==='CHECKED_IN'?'EXIT_ONLY':'REVOKED';
      if(this.operations)this.operations.revokePass(s,now,p);
    }else fail(400,'Unknown approval decision');
    this.notify(s,now,p.userId,'PASS_'+p.status,p.id,'Visitor pass: '+p.status.replaceAll('_',' ').toLowerCase(),p.siteId);
    this.notifySecurity(s,now,p.siteId,'PASS_'+p.status,p.id,'Host decision recorded. Verify the current pass state before entry.');
    this.event(s,now,'Host decision: '+p.status,p.siteId);return p;
  }
  book(s,now,id,input){
    const u=this.user(s,id);if(input.userId&&input.userId!==id)fail(403,'Booking identity cannot be overridden');
    return this.retry(s,id,'booking',input,()=>{
      if(u.cooldownUntil>now)fail(429,'Booking cooldown after a no-show; try again later');
      const bay=s.bays.find(b=>b.id===input.bayId)||fail(400,'Unknown EV bay'),registration=plate(input.plate);
      let start=Date.parse(input.startAt),end=Date.parse(input.endAt);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<now-5000||start>now+7*86400000||end-start<30*60000||end-start>120*60000)fail(400,'Book 30-120 minutes within seven days; past slots are not allowed');
      start=Math.max(start,now);
      if(input.connector&&input.connector!==bay.connector)fail(400,'Vehicle connector does not match this charging bay');
      if(!this.fresh(bay,now)||bay.occupied||bay.connected)fail(409,'Fresh, healthy and vacant bay observations are required');
      const site=s.properties.find(p=>p.id===bay.siteId);
      if(!this.canAccess(s,id,site.id,registration,start,end))fail(403,'Residential EV parking needs a resident entitlement or a host-approved pass covering the slot and plate');
      const active=s.bookings.filter(b=>ACTIVE_BOOKING.has(b.status));
      if(active.some(b=>b.userId===id||b.plate===registration))fail(409,'One active EV reservation per account and vehicle; finish or cancel it first');
      if(active.some(b=>b.bayId===bay.id&&Date.parse(b.startAt)<end&&Date.parse(b.endAt)>start))fail(409,'This charging slot is already reserved');
      const b={id:uid('booking'),userId:id,siteId:bay.siteId,bayId:bay.id,plate:registration,startAt:iso(start),endAt:iso(end),status:'BOOKED',createdAt:iso(now),pending:null,overstay:false};s.bookings.unshift(b);
      this.notify(s,now,id,'EV_BOOKED',b.id,'EV slot reserved. Check in within ten minutes; availability is rechecked on arrival.',bay.siteId);this.event(s,now,'EV reservation created',bay.siteId);return b;
    });
  }
  evAction(s,now,id,input){
    this.user(s,id);const b=s.bookings.find(b=>b.id===input.id)||fail(404,'Booking not found');if(b.userId!==id)fail(403,'Only the booking owner can control this session');
    const bay=s.bays.find(x=>x.id===b.bayId);
    if(['check-in','start'].includes(input.action)&&!this.canAccess(s,id,b.siteId,b.plate,now,Date.parse(b.endAt)))fail(403,'Residential access was revoked or no longer covers this reservation');
    if(input.action==='cancel'){
      if(!['BOOKED','CHECKED_IN'].includes(b.status)||bay.occupied||bay.connected)fail(409,'An occupied or connected session cannot be freed by cancelling a reservation');b.status='CANCELLED';return b;
    }
    if(input.action==='check-in'){
      if(b.status!=='BOOKED'||now<Date.parse(b.startAt)||now>=Date.parse(b.startAt)+600000)fail(409,'Check in during the first ten minutes of your reserved slot');
      if(!this.fresh(bay,now)||bay.occupied||bay.connected)fail(409,'Bay observations are unavailable or another vehicle is present');b.status='CHECKED_IN';return b;
    }
    if(!ACTIVE_BOOKING.has(b.status)||b.status==='BOOKED')fail(409,'Check in to an active reservation first');
    if(!this.fresh(bay,now))fail(409,'Fresh charger observations are required; request local inspection instead');
    if(input.action==='start'){
      if(now>=Date.parse(b.endAt))fail(409,'The reserved slot ended; new charging cannot start. Safe stop and departure remain available.');
      if(b.status!=='CHECKED_IN'||!bay.connected||!bay.occupied)fail(409,'Wait for an observed connected vehicle before starting');
      b.status='START_REQUESTED';b.pending={kind:'START',due:now+1500,expires:now+8000};return b;
    }
    if(input.action==='release'){
      if(b.status!=='STOPPED'||bay.charging||bay.currentA!==0||!bay.connected||b.pending)fail(409,'Wait for fresh stopped, zero-current and connected observations before requesting charger-side release');
      if(!bay.locked)return b;
      b.pending={kind:'RELEASE',due:now+1500,expires:now+8000};return b;
    }
    if(input.action==='stop'||input.action==='assist'){
      if(!bay.connected)fail(409,'No connected vehicle is observed');
      if(bay.charging||b.pending?.kind==='START'){b.status='STOP_REQUESTED';b.pending={kind:'STOP',due:now+1500,expires:now+8000};}
      else b.status='STOPPED';
      if(input.action==='stop')return b;
      const existing=s.tasks.find(t=>t.bookingId===b.id&&t.status==='REQUESTED');
      if(existing){existing.consentUntil=now+600000;return existing;}
      const task={id:uid('assist'),bookingId:b.id,bayId:bay.id,siteId:bay.siteId,userId:id,plate:b.plate,status:'REQUESTED',consentUntil:now+600000,createdAt:iso(now)};s.tasks.unshift(task);
      this.notifySecurity(s,now,b.siteId,'EV_ASSISTANCE',task.id,'Owner requested unplug assistance. Wait for stopped/released observations and the owner; never force a connector.');return task;
    }
    fail(400,'Unknown charging action');
  }
  devEv(s,now,id,input){
    this.developer(s,id);const bay=s.bays.find(b=>b.id===input.bayId)||fail(400,'Unknown EV bay');
    const booking=s.bookings.find(b=>b.bayId===bay.id&&ACTIVE_BOOKING.has(b.status));
    if(input.action==='connect'){
      if(booking?.status!=='CHECKED_IN'||bay.occupied||bay.connected||!this.fresh(bay,now))fail(409,'Check in a reservation and use an observed vacant online bay first');
      Object.assign(bay,{occupied:true,connected:true,charging:false,currentA:0,locked:true,soc:bay.supportsSoc?40:null});
    }else if(input.action==='depart'){
      if(bay.charging||bay.currentA!==0||bay.locked)fail(409,'Stop and obtain connector release before simulating departure');
      Object.assign(bay,{occupied:false,connected:false,soc:null});
      if(booking&&booking.status!=='BOOKED'){booking.status='COMPLETE';booking.pending=null;}
    }else if(input.action==='offline')bay.health='OFFLINE';
    else if(input.action==='restore')bay.health='ONLINE';
    else if(input.action==='obstruct'){
      if(bay.connected||bay.charging)fail(409,'Cannot replace an active vehicle with an obstruction');bay.occupied=true;
    }else if(input.action==='heartbeat'){}
    else fail(400,'Unknown model input');
    if(bay.health==='ONLINE'){bay.observedAt=now;bay.sequence++;}this.event(s,now,'EV model observation: '+input.action,bay.siteId);return {ok:true};
  }
  creatorAuthorized(req){return timingSafeEqual(Buffer.from(hash(String(req.headers['x-creator-key']||''))),Buffer.from(this.creatorKey));}
  async handle(req,route){
    const action=route.pathname.slice('/api/public/'.length);
    if(req.method==='GET'&&action==='demo-profiles')return this.transact(s=>({warning:'Synthetic identities and public demo credentials only; not production authentication',profiles:s.users.filter(u=>u.role!=='developer'||this.creatorAuthorized(req)).map(u=>({id:u.id,name:u.name,role:u.role,accountStatus:u.accountStatus,token:'demo:'+u.id}))}));
    let input={};
    if(req.method==='POST'){let content='';for await(const chunk of req){content+=chunk;if(content.length>16384)fail(413,'Request too large');}try{input=JSON.parse(content||'{}');}catch{fail(400,'Invalid JSON');}if(!input||Array.isArray(input)||typeof input!=='object')fail(400,'Object request required');}
    if(req.method==='POST'&&action==='integrations/handover'){
      if(!timingSafeEqual(Buffer.from(hash(String(req.headers['x-handover-key']||''))),Buffer.from(hash(this.key))))fail(403,'Trusted handover integration credential required');
      return this.transact((s,now)=>this.handover(s,now,input));
    }
    const auth=req.headers.authorization;if(typeof auth!=='string'||!auth.startsWith('Bearer demo:'))fail(401,'Select a synthetic demo identity; legacy role headers do not authorize this API');
    const id=auth.slice('Bearer demo:'.length);
    if(id==='developer'&&!this.creatorAuthorized(req))fail(403,'Creator key required. Unlock the private console using the local creator key file.');
    if(action.startsWith('central/')){
      const target=action.slice('central/'.length);
      if(req.method==='POST'&&target==='arrive'){
        const match=this.transact((s,now)=>{this.developer(s,id);if(!this.operations)fail(503,'Residential adapter unavailable');return this.central.resolvePlate(s,now,input);});
        return this.operations.handle(match.userId,'arrive',{...match,requestId:input.requestId});
      }
      if(req.method==='GET'&&['state','export'].includes(target))return this.transact((s,now)=>{this.developer(s,id);const residential=this.operations?.state(s,now,id)||null;return target==='state'?this.central.state(s,now,residential):this.central.export(s,now,residential);});
      fail(404,'Central application route not found');
    }
    if(req.method==='POST'&&action.startsWith('residential/')){if(!this.operations)fail(503,'Residential adapter unavailable');return this.operations.handle(id,action.slice('residential/'.length),input);}
    if(req.method==='POST'&&action==='developer/residential'){if(!this.operations)fail(503,'Residential adapter unavailable');return this.operations.handle(id,'developer-fault',input);}
    return this.transact((s,now)=>{
      this.account(s,id);
      if(req.method==='GET'&&action==='state')return this.state(s,now,id);
      if(req.method==='GET'&&action==='operations/state')return operationsState(this,s,now,id);
      if(req.method==='POST'&&(['complaints/create','complaints/update','patrol/record','developer/component'].includes(action)))return handleOperations(this,s,now,id,action,input);
      if(req.method!=='POST')fail(404,'Public parking route not found');
      if(action==='passes/request')return this.requestPass(s,now,id,input);
      if(action==='passes/decision')return this.decision(s,now,id,input);
      if(action==='passes/cancel'){
        this.user(s,id);const p=s.passes.find(p=>p.id===input.id)||fail(404,'Pass not found');if(p.userId!==id)fail(403,'Only the requester can cancel this pass');
        if(this.operations?.hasJourney(s,p))fail(409,'An active connected arrival needs host withdrawal or inspected departure');
        if(!['PENDING','APPROVED'].includes(p.status))fail(409,'Checked-in visitors must record departure instead');p.status='CANCELLED';return p;
      }
      if(action==='passes/check-in'||action==='passes/check-out'){
        const p=s.passes.find(p=>p.id===input.id)||fail(404,'Pass not found');this.security(s,id,p.siteId);
        if(this.operations?.hasJourney(s,p))fail(409,'Connected arrivals use observed journey entry and departure; manual ledger changes cannot release this allocation');
        if(action.endsWith('check-in')){if(p.status!=='APPROVED'||Date.parse(p.startAt)>now||Date.parse(p.endAt)<=now)fail(409,'Pass is not currently approved for entry');p.status='CHECKED_IN';}
        else{if(!['CHECKED_IN','EXIT_ONLY'].includes(p.status))fail(409,'This visitor has not checked in');p.status='COMPLETE';}this.event(s,now,'Security recorded visitor '+p.status,p.siteId);return p;
      }
      if(action==='ev/book')return this.book(s,now,id,input);
      if(action==='ev/action')return this.evAction(s,now,id,input);
      if(action==='assistance/complete'){
        const t=s.tasks.find(t=>t.id===input.id)||fail(404,'Assistance request not found');this.security(s,id,t.siteId);const bay=s.bays.find(b=>b.id===t.bayId);
        if(t.status!=='REQUESTED'||t.consentUntil<now||input.ownerPresent!==true||!this.fresh(bay,now)||bay.charging||bay.currentA!==0||bay.locked||!bay.connected)fail(409,'Need current owner consent, owner present, fresh stopped observations and connector release. Never force unplugging.');
        t.status='ASSISTED';t.completedBy=id;t.completedAt=iso(now);this.event(s,now,'Security assistance recorded; occupancy remains independently observed',t.siteId);return t;
      }
      if(action==='accounts/activate'){
        const u=this.account(s,id);if(u.role!=='user'||!u.invitationHash)fail(u.accountStatus==='ACTIVE'&&u.buyerId?409:403,'No pending invitation for this identity');
        if(u.invitationExpires<now||hash(String(input.code||''))!==u.invitationHash)fail(403,'Invitation is invalid or expired');
        u.accountStatus='ACTIVE';delete u.invitationHash;delete u.invitationExpires;this.notify(s,now,id,'HOME_ACTIVATED',id,'Verified homeowner entitlement activated.',u.homes[0].siteId);return {ok:true};
      }
      if(action==='notifications/read'){
        const n=s.notifications.find(n=>n.id===input.id&&n.to===id)||fail(404,'Notification not found');n.read=true;return {ok:true};
      }
      if(action==='developer/ev')return this.devEv(s,now,id,input);
      if(action==='developer/advance'){
        this.developer(s,id);if(!Number.isInteger(input.milliseconds)||input.milliseconds<0||input.milliseconds>86400000)fail(400,'Advance the public model by 0-86400000 ms');s.offset+=input.milliseconds;this.model(s,now+input.milliseconds);return {ok:true};
      }
      if(action==='developer/handover-fixture'){
        this.developer(s,id);return this.handover(s,now,{eventId:'DEMO-HANDOVER-001',buyerId:'DEMO-BUYER-001',name:'Samir Latif',email:'samir@example.test',siteId:'RES-001',unit:'12-01',bayId:'R-201'});
      }
      fail(404,'Public parking route not found');
    });
  }
  stream(req,res){const auth=req.headers.authorization;if(typeof auth!=='string'||!auth.startsWith('Bearer demo:'))fail(401,'Demo identity required');const id=auth.slice(12);this.transact(s=>{const u=this.account(s,id);if(u.role!=='security')fail(403,'Assigned guard identity required');});res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','x-accel-buffering':'no'});res.write('event: ready\ndata: {}\n\n');const listener=n=>{if(n.to===id)res.write('event: notice\ndata: '+JSON.stringify(n)+'\n\n');};this.alerts.on('notice',listener);const timer=setInterval(()=>res.write(': keepalive\n\n'),15000);res.on('close',()=>{clearInterval(timer);this.alerts.off('notice',listener);});}
  close(){this.alerts.emit('shutdown');this.alerts.removeAllListeners();this.db.close();}
}
