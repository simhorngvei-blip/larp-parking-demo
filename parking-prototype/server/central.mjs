import {BAY_IDS} from './store.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const CENTRAL_SCHEMA=`
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS central_sites(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS central_flows(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES central_sites(id),controller_capacity INTEGER NOT NULL CHECK(controller_capacity=8));
CREATE TABLE IF NOT EXISTS central_controllers(id TEXT PRIMARY KEY,flow_id TEXT NOT NULL REFERENCES central_flows(id),bus_address INTEGER NOT NULL CHECK(bus_address BETWEEN 1 AND 8),UNIQUE(flow_id,bus_address));
CREATE TABLE IF NOT EXISTS central_bays(id TEXT PRIMARY KEY,controller_id TEXT NOT NULL REFERENCES central_controllers(id),node_address INTEGER NOT NULL CHECK(node_address BETWEEN 1 AND 6),ordinal INTEGER NOT NULL UNIQUE,mapping TEXT NOT NULL CHECK(mapping IN ('CURRENT_DEMO','UNCOMMISSIONED')),UNIQUE(controller_id,node_address));
CREATE TABLE IF NOT EXISTS central_commands(id TEXT PRIMARY KEY,bay_id TEXT NOT NULL REFERENCES central_bays(id),kind TEXT NOT NULL,route TEXT NOT NULL,status TEXT NOT NULL,requested_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS central_observations(bay_id TEXT PRIMARY KEY REFERENCES central_bays(id),instance TEXT NOT NULL,sequence INTEGER NOT NULL,received_at TEXT NOT NULL,position TEXT NOT NULL,occupancy TEXT NOT NULL,health TEXT NOT NULL,source TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS central_command_bay ON central_commands(bay_id,requested_at);
CREATE VIEW IF NOT EXISTS central_accounts AS SELECT json_extract(u.value,'$.id') AS id,json_extract(u.value,'$.name') AS name,json_extract(u.value,'$.role') AS role,json_extract(u.value,'$.accountStatus') AS accountStatus FROM public_parking_state p,json_each(p.data,'$.users') u;
CREATE VIEW IF NOT EXISTS central_homes AS SELECT json_extract(u.value,'$.id') AS userId,json_extract(h.value,'$.siteId') AS siteId,json_extract(h.value,'$.unit') AS unit,json_extract(h.value,'$.bayId') AS bayId FROM public_parking_state p,json_each(p.data,'$.users') u,json_each(u.value,'$.homes') h;
CREATE VIEW IF NOT EXISTS central_vehicles AS SELECT v.key AS userId,v.value AS plate FROM public_parking_state p,json_each(p.data,'$.residential.vehicles') v;
CREATE VIEW IF NOT EXISTS central_visits AS SELECT json_extract(v.value,'$.id') AS id,json_extract(v.value,'$.userId') AS userId,json_extract(v.value,'$.plate') AS plate,json_extract(v.value,'$.parkingBayId') AS bayId,json_extract(v.value,'$.status') AS status FROM public_parking_state p,json_each(p.data,'$.passes') v;
`;
export class CentralRegistry{
 constructor(db){this.db=db;db.exec(CENTRAL_SCHEMA);db.exec('BEGIN IMMEDIATE');try{
  db.prepare('INSERT OR IGNORE INTO central_sites VALUES(?,?)').run('RES-001','Concordia Residences');
  db.prepare('INSERT OR IGNORE INTO central_flows VALUES(?,?,8)').run('FC-001','RES-001');
  const controller=db.prepare('INSERT OR IGNORE INTO central_controllers VALUES(?,?,?)'),bay=db.prepare('INSERT OR IGNORE INTO central_bays VALUES(?,?,?,?,?)');
  for(let c=1;c<=8;c++){const id='BC-'+String(c).padStart(3,'0');controller.run(id,'FC-001',c);for(let n=1;n<=6;n++){const ordinal=(c-1)*6+n,current=BAY_IDS[ordinal-1];bay.run(current||'P-'+String(ordinal).padStart(3,'0'),id,n,ordinal,current?'CURRENT_DEMO':'UNCOMMISSIONED');}}
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}}
 route(bayId){const r=this.db.prepare('SELECT b.id AS bayId,b.node_address AS nodeAddress,b.mapping,c.id AS controllerId,c.bus_address AS controllerAddress,f.id AS flowId,f.site_id AS siteId FROM central_bays b JOIN central_controllers c ON c.id=b.controller_id JOIN central_flows f ON f.id=c.flow_id WHERE b.id=?').get(bayId);
  if(!r||r.mapping!=='CURRENT_DEMO')fail(409,'Bay is not commissioned in the current demo adapter');
  return {...r,design:'PLANNED_6_BY_8',physicalAdapter:'EXISTING_NINE_BAY',legacyGateway:BAY_IDS.indexOf(bayId)<5?'A':'B'};
 }
 record(item,kind,now){const route=item.route||this.route(item.bayId);this.db.prepare('INSERT INTO central_commands VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at').run(item.id,item.bayId,kind,JSON.stringify(route),item.status||item.phase,item.issuedAt||item.createdAt||new Date(now).toISOString(),new Date(now).toISOString());return route;}
 resolvePlate(s,now,input){const plate=String(input.plate||'').replace(/\s/g,'').toUpperCase();if(!/^[A-Z0-9]{2,12}$/.test(plate)||!/[A-Z]/.test(plate)||!/[0-9]/.test(plate))fail(400,'Enter a valid synthetic plate');
  const matches=[];
  for(const [id,p] of Object.entries(s.residential?.vehicles||{})){const u=s.users.find(u=>u.id===id);if(p===plate&&u?.accountStatus==='ACTIVE'&&u.homes.some(h=>h.siteId==='RES-001'))matches.push({userId:id});}
  for(const p of s.passes)if(p.plate===plate&&p.siteId==='RES-001'&&p.status==='APPROVED'&&p.parkingBayId&&!p.entryRevokedAt&&Date.parse(p.startAt)<=now&&Date.parse(p.endAt)>now)matches.push({userId:p.userId,passId:p.id});
  if(!matches.length)fail(403,'No current resident vehicle or approved allocated visitor pass matches this plate');if(matches.length!==1)fail(409,'Ambiguous plate entitlement; staff must review before admission');return matches[0];
 }
 state(s,now,residential){
  for(const c of s.residential?.commands||[])this.record(c,c.action.toUpperCase(),now);
  for(const j of s.residential?.journeys||[])this.record(j,'ARRIVE',now);
  const w=residential?.simulation;
  if(w?.connected&&Number.isInteger(w.telemetry?.seq))for(const b of residential.bays){this.db.prepare(`INSERT INTO central_observations VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(bay_id) DO UPDATE SET instance=excluded.instance,sequence=excluded.sequence,received_at=excluded.received_at,position=excluded.position,occupancy=excluded.occupancy,health=excluded.health,source=excluded.source WHERE central_observations.instance!=excluded.instance OR excluded.sequence>central_observations.sequence`).run(b.id,w.instance||'default',w.telemetry.seq,new Date().toISOString(),b.position,b.occupancy,b.health,residential.source);}
  const flows=this.db.prepare('SELECT id,site_id AS siteId,controller_capacity AS controllerCapacity FROM central_flows').all(),controllers=this.db.prepare('SELECT id,flow_id AS flowId,bus_address AS busAddress FROM central_controllers ORDER BY bus_address').all();
  const bays=this.db.prepare('SELECT id,controller_id AS controllerId,node_address AS nodeAddress,ordinal,mapping FROM central_bays ORDER BY ordinal').all().map(b=>{const actual=residential?.bays.find(v=>v.id===b.id),fresh=b.mapping==='CURRENT_DEMO'&&!!actual?.fresh;return {...b,flowId:'FC-001',fresh,position:fresh?actual.position:'UNKNOWN',occupancy:fresh?actual.occupancy:'UNKNOWN',health:fresh?actual.health:'UNKNOWN',source:b.mapping==='UNCOMMISSIONED'?'NOT_COMMISSIONED':residential?.source||'UNAVAILABLE',legacyGateway:b.mapping==='CURRENT_DEMO'?(BAY_IDS.indexOf(b.id)<5?'A':'B'):null};});
  const commands=this.db.prepare('SELECT * FROM central_commands ORDER BY requested_at DESC LIMIT 60').all().map(c=>({id:c.id,bayId:c.bay_id,kind:c.kind,status:c.status,requestedAt:c.requested_at,...JSON.parse(c.route)}));
  return {siteId:'RES-001',design:'PLANNED_6_BY_8',database:'public.sqlite',accounts:s.users.map(u=>({id:u.id,name:u.name,role:u.role,accountStatus:u.accountStatus})),homes:s.users.flatMap(u=>u.homes.map(h=>({...h,userId:u.id}))),vehicles:Object.entries(s.residential?.vehicles||{}).map(([userId,plate])=>({userId,plate})),visits:s.passes.map(p=>({id:p.id,userId:p.userId,plate:p.plate,bayId:p.parkingBayId||null,status:p.status})),journeys:(s.residential?.journeys||[]).slice(0,20),flows,controllers,bays,commands,observations:this.db.prepare('SELECT * FROM central_observations').all(),scope:'Logical six-bay/eight-controller registry. Existing Wokwi adapter retains its two legacy five-node gateways. Hardware flow/bay-controller heartbeats are not implemented.',now:new Date(now).toISOString()};
 }
 export(s,now,residential){const all=this.state(s,now,residential);return {schemaVersion:1,generatedAt:all.now,topology:{flows:all.flows,controllers:all.controllers,bays:all.bays},accounts:all.accounts,homes:all.homes,vehicles:all.vehicles,visits:all.visits,journeys:all.journeys,commands:all.commands,observations:all.observations,scope:all.scope,schema:this.db.prepare("SELECT name,type,sql FROM sqlite_master WHERE name LIKE 'central_%' AND type IN ('table','view') ORDER BY name").all()};}
}
