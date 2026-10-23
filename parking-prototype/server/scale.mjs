import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';

// Independent synthetic fleet. Never supplies observations to the Wokwi session.
export class ScaleDemo {
 constructor({file=':memory:'}={}) {
  this.db=new DatabaseSync(file);this.statements=new Map();this.inTransaction=false;this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
   CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,config TEXT,clock INTEGER);
   CREATE TABLE IF NOT EXISTS sites(id TEXT PRIMARY KEY,wan INTEGER NOT NULL DEFAULT 1);
   CREATE TABLE IF NOT EXISTS gateways(siteId TEXT,id TEXT,online INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(siteId,id));
   CREATE TABLE IF NOT EXISTS bays(siteId TEXT,id TEXT,zoneId TEXT,level INTEGER,position TEXT,occupancy TEXT,health TEXT,moveAt INTEGER DEFAULT 0,clearAt INTEGER,PRIMARY KEY(siteId,id));
   CREATE TABLE IF NOT EXISTS journeys(id TEXT PRIMARY KEY,siteId TEXT,bayId TEXT,plate TEXT,phase TEXT,automatic INTEGER,changed INTEGER,requestId TEXT UNIQUE,payload TEXT,cinematic INTEGER NOT NULL DEFAULT 0);
   CREATE UNIQUE INDEX IF NOT EXISTS active_bay ON journeys(siteId,bayId) WHERE phase!='COMPLETE';
   CREATE UNIQUE INDEX IF NOT EXISTS active_plate ON journeys(siteId,plate) WHERE phase!='COMPLETE';
   CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,siteId TEXT,bayId TEXT,journeyId TEXT,status TEXT,created INTEGER,expires INTEGER);
   CREATE TABLE IF NOT EXISTS outbox(commandId TEXT PRIMARY KEY,published INTEGER DEFAULT 0);
   CREATE TABLE IF NOT EXISTS lanes(siteId TEXT,id TEXT,kind TEXT,position TEXT,journeyId TEXT,untilMs INTEGER DEFAULT 0,PRIMARY KEY(siteId,id));
   CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,siteId TEXT,time INTEGER,title TEXT,detail TEXT);
   CREATE INDEX IF NOT EXISTS bay_level ON bays(siteId,level);
   CREATE INDEX IF NOT EXISTS bay_movement ON bays(moveAt) WHERE moveAt>0;
   CREATE INDEX IF NOT EXISTS bay_clearance ON bays(clearAt) WHERE clearAt IS NOT NULL;
   CREATE INDEX IF NOT EXISTS journey_site ON journeys(siteId,changed);
   CREATE INDEX IF NOT EXISTS command_site ON commands(siteId,created);
   CREATE INDEX IF NOT EXISTS event_site ON events(siteId,id);`);
  if(!this.prepare('PRAGMA table_info(journeys)').all().some(c=>c.name==='cinematic'))this.db.exec('ALTER TABLE journeys ADD COLUMN cinematic INTEGER NOT NULL DEFAULT 0');
  const saved=this.prepare('SELECT * FROM settings WHERE id=1').get();
  if(!saved){this.now=0;this.configure({sites:1,baysPerSite:50,levels:2});}
  else {
   this.now=saved.clock;this.config=JSON.parse(saved.config);
   this.transaction(()=>{
    const interrupted=this.prepare("SELECT * FROM bays WHERE moveAt>0 OR EXISTS(SELECT 1 FROM commands c WHERE c.siteId=bays.siteId AND c.bayId=bays.id AND c.status IN ('CREATED','EXECUTING','OUTCOME_UNKNOWN'))").all();
    for(const b of interrupted){this.prepare("UPDATE bays SET position='UNKNOWN',health='RECOVERY_REQUIRED',moveAt=0,clearAt=NULL WHERE siteId=? AND id=?").run(b.siteId,b.id);this.event(b.siteId,'Recovery required',b.id+': interrupted command; inspect the virtual device before reset.');}
    this.prepare("UPDATE commands SET status='OUTCOME_UNKNOWN' WHERE status IN ('CREATED','EXECUTING')").run();
    this.prepare('UPDATE outbox SET published=1').run();
    this.prepare("UPDATE journeys SET phase='RECOVERY_REQUIRED' WHERE phase IN ('PREPARING','READY','ENTERING','EXITING')").run();
    this.prepare("UPDATE lanes SET position='UNKNOWN',untilMs=0 WHERE journeyId IS NOT NULL").run();
   });
  }
 }
 prepare(sql){if(!this.statements.has(sql))this.statements.set(sql,this.db.prepare(sql));return this.statements.get(sql);}
 transaction(fn){if(this.inTransaction)return fn();this.db.exec('BEGIN IMMEDIATE');this.inTransaction=true;try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}finally{this.inTransaction=false;}}
 event(siteId,title,detail){this.prepare('INSERT INTO events(siteId,time,title,detail) VALUES(?,?,?,?)').run(siteId,this.now,title,detail);}
 site(id){const s=this.prepare('SELECT * FROM sites WHERE id=?').get(id);if(!s)throw new Error('Unknown site');return s;}
 bay(siteId,id){this.site(siteId);const b=this.prepare('SELECT b.*,g.online FROM bays b JOIN gateways g ON g.siteId=b.siteId AND g.id=b.zoneId WHERE b.siteId=? AND b.id=?').get(siteId,id);if(!b)throw new Error('Unknown bay');return b;}
 configure({sites,baysPerSite,levels,reset=false}){
  if(!Number.isInteger(sites)||sites<1||sites>100||!Number.isInteger(baysPerSite)||baysPerSite<5||baysPerSite>500||!Number.isInteger(levels)||levels<1||levels>20||levels>baysPerSite)throw new Error('Inventory range: 1-100 sites, 5-500 bays per site, 1-20 levels');
  if(!reset&&this.prepare("SELECT id FROM journeys WHERE phase!='COMPLETE' LIMIT 1").get())throw new Error('Finish active journeys or explicitly reset the synthetic fleet first');
  return this.transaction(()=>{
   this.db.exec('DELETE FROM outbox;DELETE FROM commands;DELETE FROM journeys;DELETE FROM lanes;DELETE FROM bays;DELETE FROM gateways;DELETE FROM sites;DELETE FROM events;');
   this.now=0;this.config={sites,baysPerSite,levels,nodesPerGateway:5};
   const site=this.prepare('INSERT INTO sites VALUES(?,1)'),gateway=this.prepare('INSERT INTO gateways VALUES(?,?,1)'),bay=this.prepare("INSERT INTO bays(siteId,id,zoneId,level,position,occupancy,health) VALUES(?,?,?,?,'UP','CLEAR','HEALTHY')"),lane=this.prepare("INSERT INTO lanes(siteId,id,kind,position) VALUES(?,?,?,'CLOSED')");
   for(let n=1;n<=sites;n++){
    const id=`SITE-${String(n).padStart(3,'0')}`;site.run(id);
    for(let g=1;g<=Math.ceil(baysPerSite/5);g++)gateway.run(id,`ZONE-${String(g).padStart(3,'0')}`);
    for(let b=0;b<baysPerSite;b++)bay.run(id,`B-${String(b+1).padStart(4,'0')}`,`ZONE-${String(Math.floor(b/5)+1).padStart(3,'0')}`,Math.floor(b/Math.ceil(baysPerSite/levels)));
    for(const kind of ['ENTRY','EXIT'])for(let l=1;l<=2;l++)lane.run(id,`${kind}-0${l}`,kind);
    this.event(id,'Site commissioned',`${baysPerSite} virtual bays / ${Math.ceil(baysPerSite/5)} gateways / ${levels} levels`);
   }
   this.prepare('INSERT OR REPLACE INTO settings VALUES(1,?,?)').run(JSON.stringify(this.config),this.now);
   return this.config;
  });
 }
 arrive({siteId,bayId,plate,requestId=randomUUID(),automatic=false,cinematic=false}){
  plate=String(plate||'').replace(/\s/g,'').toUpperCase();
  if(!/^[A-Z0-9]{2,12}$/.test(plate)||!/[A-Z]/.test(plate)||!/[0-9]/.test(plate))throw new Error('Plate must contain letters and numbers, 2-12 characters');
  if(typeof requestId!=='string'||requestId.length<1||requestId.length>100)throw new Error('Invalid request ID');
  if(typeof cinematic!=='boolean'||(cinematic&&automatic))throw new Error('Cinematic journeys require explicit vehicle passage control');
  const payload=JSON.stringify([siteId,bayId,plate,Boolean(automatic),cinematic]);
  const existing=this.prepare('SELECT * FROM journeys WHERE requestId=?').get(requestId);
  if(existing){if(existing.payload!==payload)throw new Error('Request ID has a different payload');return existing;}
  return this.transaction(()=>{
   const site=this.site(siteId),b=this.bay(siteId,bayId);
   if(!site.wan)throw new Error('WAN offline: new admissions denied; local protection and exit remain active');
   if(this.prepare("SELECT id FROM journeys WHERE siteId=? AND plate=? AND phase!='COMPLETE'").get(siteId,plate))throw new Error('Vehicle already has an active journey');
   if(this.prepare("SELECT id FROM journeys WHERE siteId=? AND bayId=? AND phase!='COMPLETE'").get(siteId,bayId))throw new Error('Bay is already reserved');
   if(!b.online||b.health!=='HEALTHY'||b.position!=='UP'||b.occupancy!=='CLEAR')throw new Error('Bay is not available with fresh healthy UP feedback');
   const id=randomUUID(),cmd=randomUUID();
   this.prepare("INSERT INTO journeys(id,siteId,bayId,plate,phase,automatic,changed,requestId,payload,cinematic) VALUES(?,?,?,?,'PREPARING',?,?,?,?,?)").run(id,siteId,bayId,plate,automatic?1:0,this.now,requestId,payload,cinematic?1:0);
   this.prepare("INSERT INTO commands VALUES(?,?,?,?,'CREATED',?,?)").run(cmd,siteId,bayId,id,this.now,this.now+8000);
   this.prepare('INSERT INTO outbox VALUES(?,0)').run(cmd);
   this.event(siteId,'Arrival authorized',`${plate} -> ${bayId}; addressed command committed to outbox`);
   return this.prepare('SELECT * FROM journeys WHERE id=?').get(id);
  });
 }
 phase(j,phase){this.prepare('UPDATE journeys SET phase=?,changed=? WHERE id=?').run(phase,this.now,j.id);this.event(j.siteId,'Journey '+phase,`${j.plate} / ${j.bayId}`);}
 action({siteId,journeyId,action,laneId}){
  this.site(siteId);const j=this.prepare('SELECT * FROM journeys WHERE id=? AND siteId=?').get(journeyId,siteId);if(!j)throw new Error('Unknown journey in this site');
  const b=this.bay(siteId,j.bayId);
  if(action==='enter'||action==='exit'){
   const entering=action==='enter';
   if(entering&&(j.phase!=='READY'||!b.online||b.health!=='HEALTHY'||b.position!=='DOWN'||b.occupancy!=='CLEAR'))throw new Error('Wait for READY with healthy DOWN feedback');
   if(!entering&&j.phase!=='DEPARTED')throw new Error('Vehicle must leave the bay before exit');
   const kind=entering?'ENTRY':'EXIT';
   const lane=laneId?this.prepare('SELECT * FROM lanes WHERE siteId=? AND id=? AND kind=?').get(siteId,laneId,kind):this.prepare("SELECT * FROM lanes WHERE siteId=? AND kind=? AND journeyId IS NULL AND position='CLOSED' ORDER BY id LIMIT 1").get(siteId,kind);
   if(!lane||lane.journeyId||lane.position!=='CLOSED')throw new Error('Lane is busy or unavailable');
   this.transaction(()=>{this.prepare("UPDATE lanes SET position=?,journeyId=?,untilMs=? WHERE siteId=? AND id=?").run(j.cinematic?'OPENING':'OPEN',j.id,j.cinematic?this.now+750:this.now+2000,siteId,lane.id);this.phase(j,entering?'ENTERING':'EXITING');});
  } else if(action==='clear-entry'||action==='clear-exit'){
   const entry=action==='clear-entry';const lane=this.prepare("SELECT * FROM lanes WHERE siteId=? AND journeyId=? AND kind=? AND position='OPEN'").get(siteId,j.id,entry?'ENTRY':'EXIT');
   if(!j.cinematic||j.phase!==(entry?'ENTERING':'EXITING')||!lane)throw new Error('No matching cinematic lane passage to clear');
   this.transaction(()=>{this.prepare("UPDATE lanes SET position='CLOSED',journeyId=NULL,untilMs=0 WHERE siteId=? AND id=?").run(siteId,lane.id);this.phase(j,entry?'ADMITTED':'COMPLETE');});
  } else if(action==='park'){
   if(j.phase!=='ADMITTED'||!b.online||b.health!=='HEALTHY'||b.position!=='DOWN')throw new Error('Vehicle must be admitted and bay confirmed DOWN');
   this.transaction(()=>{this.presence({siteId,bayId:j.bayId,present:true});this.phase(j,'PARKED');});
  } else if(action==='leave'){
   if(j.phase!=='PARKED')throw new Error('Vehicle is not parked');
   this.transaction(()=>{this.presence({siteId,bayId:j.bayId,present:false});this.phase(j,'DEPARTED');});
  } else throw new Error('Unknown journey action');
  return this.prepare('SELECT * FROM journeys WHERE id=?').get(j.id);
 }
 presence({siteId,bayId,present}){
  const b=this.bay(siteId,bayId);if(typeof present!=='boolean')throw new Error('Presence must be boolean');
  if(present&&!['DOWN','MOVING_UP'].includes(b.position))throw new Error('Cannot place vehicle over an unconfirmed lowered bollard');
  this.prepare('UPDATE bays SET occupancy=?,clearAt=?,position=?,moveAt=? WHERE siteId=? AND id=?').run(present?'PRESENT':'CLEAR',present?null:this.now,b.position==='MOVING_UP'?'DOWN':b.position,b.position==='MOVING_UP'?0:b.moveAt,siteId,bayId);
 }
 fault({siteId,kind,id,active}){
  this.site(siteId);if(typeof active!=='boolean')throw new Error('Fault state must be boolean');
  if(kind==='wan')this.prepare('UPDATE sites SET wan=? WHERE id=?').run(active?0:1,siteId);
  else if(kind==='gateway'){if(!this.prepare('SELECT id FROM gateways WHERE siteId=? AND id=?').get(siteId,id))throw new Error('Unknown gateway');this.prepare('UPDATE gateways SET online=? WHERE siteId=? AND id=?').run(active?0:1,siteId,id);}
  else if(kind==='bay'){
   const b=this.bay(siteId,id);
   if(!active&&b.health==='RECOVERY_REQUIRED')throw new Error('Interrupted motion requires a synthetic fleet reset and inspection');
   this.prepare('UPDATE bays SET health=? WHERE siteId=? AND id=?').run(active?'MOTOR_FAULT':'HEALTHY',siteId,id);
  }else throw new Error('Unknown fault kind');
  this.event(siteId,active?'Fault injected':'Link / fault restored',`${kind} ${id||siteId}`);return {ok:true};
 }
 traffic({siteId,count}){
  this.site(siteId);if(!Number.isInteger(count)||count<1||count>50)throw new Error('Traffic count must be 1-50');
  const bays=this.prepare("SELECT b.id FROM bays b JOIN gateways g ON g.siteId=b.siteId AND g.id=b.zoneId WHERE b.siteId=? AND b.position='UP' AND b.occupancy='CLEAR' AND b.health='HEALTHY' AND g.online=1 AND NOT EXISTS(SELECT 1 FROM journeys j WHERE j.siteId=b.siteId AND j.bayId=b.id AND j.phase!='COMPLETE') ORDER BY b.id LIMIT ?").all(siteId,count);
  if(bays.length<count)throw new Error('Not enough available bays for this traffic batch');
  if(!this.site(siteId).wan)throw new Error('WAN offline');
  return this.transaction(()=>bays.map(b=>this.arrive({siteId,bayId:b.id,plate:'S1'+randomUUID().replaceAll('-','').slice(0,10).toUpperCase(),automatic:true})));
 }
 advance(milliseconds){
  if(!Number.isFinite(milliseconds)||milliseconds<0||milliseconds>120000)throw new Error('Time step must be 0-120000 ms');
  // Dispatch at the start: a single time step includes already queued device work.
  const queued=this.prepare('SELECT c.* FROM commands c JOIN outbox o ON o.commandId=c.id WHERE o.published=0').all();
  if(queued.length)this.transaction(()=>{for(const c of queued){
   const b=this.bay(c.siteId,c.bayId);
   if(c.expires<this.now){this.prepare("UPDATE commands SET status='EXPIRED' WHERE id=?").run(c.id);this.prepare('UPDATE outbox SET published=1 WHERE commandId=?').run(c.id);const j=this.prepare('SELECT * FROM journeys WHERE id=?').get(c.journeyId);if(j)this.phase(j,'FAULT');this.event(c.siteId,'Command expired',c.bayId+': undelivered; no movement assumed');continue;}
   if(!b.online)continue;
   if(b.health!=='HEALTHY'||b.position!=='UP'||b.occupancy!=='CLEAR'){
    this.prepare("UPDATE commands SET status='REJECTED' WHERE id=?").run(c.id);this.prepare('UPDATE outbox SET published=1 WHERE commandId=?').run(c.id);const j=this.prepare('SELECT * FROM journeys WHERE id=?').get(c.journeyId);if(j)this.phase(j,'FAULT');continue;
   }
   this.prepare("UPDATE commands SET status='EXECUTING' WHERE id=?").run(c.id);this.prepare('UPDATE outbox SET published=1 WHERE commandId=?').run(c.id);
   this.prepare("UPDATE bays SET position='MOVING_DOWN',moveAt=? WHERE siteId=? AND id=?").run(this.now+2000,c.siteId,c.bayId);
   this.event(c.siteId,'Receiver accepted',`${c.bayId}: local simulated motor started; not yet DOWN`);
  }});
  this.now+=milliseconds;
  this.transaction(()=>{
   for(const b of this.prepare('SELECT * FROM bays WHERE moveAt>0 AND moveAt<=?').all(this.now)){
    const position=b.health==='HEALTHY'?(b.position==='MOVING_DOWN'?'DOWN':'UP'):(b.position==='MOVING_DOWN'?'UP':'DOWN');
    this.prepare('UPDATE bays SET position=?,moveAt=0,clearAt=NULL WHERE siteId=? AND id=?').run(position,b.siteId,b.id);
   }
   for(const b of this.prepare("SELECT * FROM bays WHERE clearAt IS NOT NULL AND clearAt<=? AND occupancy='CLEAR' AND position='DOWN' AND health='HEALTHY'").all(this.now-10000))this.prepare("UPDATE bays SET position='MOVING_UP',moveAt=?,clearAt=NULL WHERE siteId=? AND id=?").run(this.now+2000,b.siteId,b.id);
   for(const c of this.prepare("SELECT * FROM commands WHERE status IN ('EXECUTING','OUTCOME_UNKNOWN')").all()){
    const b=this.bay(c.siteId,c.bayId);
    if(!b.online){this.prepare("UPDATE commands SET status='OUTCOME_UNKNOWN' WHERE id=?").run(c.id);continue;}
    if(b.health==='HEALTHY'&&b.position==='DOWN'){
     this.prepare("UPDATE commands SET status='CONFIRMED' WHERE id=?").run(c.id);
     const j=this.prepare("SELECT * FROM journeys WHERE id=? AND phase='PREPARING'").get(c.journeyId);if(j)this.phase(j,'READY');
     this.event(c.siteId,'DOWN confirmed',`${c.bayId}: fresh virtual end-position feedback`);
    }else if(b.health!=='HEALTHY'&&b.health!=='RECOVERY_REQUIRED'){
     this.prepare("UPDATE commands SET status='FAULT' WHERE id=?").run(c.id);const j=this.prepare("SELECT * FROM journeys WHERE id=? AND phase='PREPARING'").get(c.journeyId);if(j)this.phase(j,'FAULT');
    }
   }
   for(const lane of this.prepare('SELECT * FROM lanes WHERE untilMs>0 AND untilMs<=?').all(this.now)){
    if(lane.position==='OPENING'){this.prepare("UPDATE lanes SET position='OPEN',untilMs=0 WHERE siteId=? AND id=?").run(lane.siteId,lane.id);continue;}
    const j=this.prepare('SELECT * FROM journeys WHERE id=?').get(lane.journeyId);
    this.prepare("UPDATE lanes SET position='CLOSED',journeyId=NULL,untilMs=0 WHERE siteId=? AND id=?").run(lane.siteId,lane.id);
    if(j)this.phase(j,lane.kind==='ENTRY'?'ADMITTED':'COMPLETE');
   }
   this.prepare('UPDATE settings SET clock=? WHERE id=1').run(this.now);
  });
  this.transaction(()=>{for(const j of this.prepare("SELECT * FROM journeys WHERE automatic=1 AND phase IN ('READY','ADMITTED','PARKED','DEPARTED') ORDER BY changed,id").all()){
   const action=j.phase==='READY'?'enter':j.phase==='ADMITTED'&&this.now-j.changed>=2000?'park':j.phase==='PARKED'&&this.now-j.changed>=3000?'leave':j.phase==='DEPARTED'?'exit':null;
   if(action){try{this.action({siteId:j.siteId,journeyId:j.id,action});}catch(error){if(!/busy|READY|DOWN/.test(error.message))throw error;}}
  }});
 }
 state({siteId='SITE-001',level=0,building=false,journeyId=null}={}){
  this.site(siteId);level=Number(level);if(!Number.isInteger(level)||level<0||level>=this.config.levels)throw new Error('Invalid level');
  const sites=this.prepare('SELECT * FROM sites ORDER BY id').all();
  const bays=this.prepare('SELECT b.*,g.online FROM bays b JOIN gateways g ON g.siteId=b.siteId AND g.id=b.zoneId WHERE b.siteId=?'+(building?'':' AND b.level=?')+' ORDER BY b.id').all(...(building?[siteId]:[siteId,level])).map(b=>({...b,health:b.online?b.health:'GATEWAY_OFFLINE',position:b.online?b.position:'UNKNOWN',occupancy:b.online?b.occupancy:'UNCERTAIN',clearanceMs:b.clearAt===null?0:Math.max(0,this.now-b.clearAt)}));
  const summary=this.prepare("SELECT COUNT(*) bays,SUM(CASE WHEN b.health!='HEALTHY' OR g.online=0 THEN 1 ELSE 0 END) unavailable,SUM(CASE WHEN b.occupancy='PRESENT' THEN 1 ELSE 0 END) occupied FROM bays b JOIN gateways g ON g.siteId=b.siteId AND g.id=b.zoneId WHERE b.siteId=?").get(siteId);
  summary.reserved=this.prepare("SELECT COUNT(*) n FROM journeys WHERE siteId=? AND phase!='COMPLETE'").get(siteId).n;
  summary.completed=this.prepare("SELECT COUNT(*) n FROM journeys WHERE siteId=? AND phase='COMPLETE'").get(siteId).n;
  const journeys=this.prepare("SELECT * FROM journeys WHERE siteId=? ORDER BY (phase='COMPLETE'),changed DESC,id LIMIT 100").all(siteId);
  if(journeyId&&!journeys.some(j=>j.id===journeyId)){const selected=this.prepare('SELECT * FROM journeys WHERE siteId=? AND id=?').get(siteId,journeyId);if(selected)journeys.push(selected);}
  return {mode:'VIRTUAL_FLEET_NOT_WOKWI_OR_REAL_RF',config:this.config,clock:this.now,total:{sites:this.config.sites,bays:this.config.sites*this.config.baysPerSite,gateways:this.config.sites*Math.ceil(this.config.baysPerSite/5)},sites,siteId,level,summary,bays,gateways:this.prepare('SELECT * FROM gateways WHERE siteId=? ORDER BY id').all(siteId),lanes:this.prepare('SELECT * FROM lanes WHERE siteId=? ORDER BY id').all(siteId),journeys,commands:this.prepare('SELECT * FROM commands WHERE siteId=? ORDER BY created DESC,rowid DESC LIMIT 30').all(siteId),events:this.prepare('SELECT * FROM events WHERE siteId=? ORDER BY id DESC LIMIT 30').all(siteId)};
 }
 close(){this.db.close();}
}
