import { createServer } from 'node:http';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdirSync,writeFileSync,readFileSync,existsSync } from 'node:fs';
import path from 'node:path';
import { Store, BAY_IDS } from './store.mjs';
import { WokwiSession } from './wokwi-session.mjs';
import { ScaleDemo } from './scale.mjs';
import { PublicParking } from './public-parking.mjs';
import { ResidentialOperations } from './residential.mjs';

export async function createApplication({file=':memory:',autoTick=true,bridgeKey=randomUUID(),scaleFile=':memory:',publicFile=':memory:',handoverKey=randomUUID(),creatorKey=randomUUID()}={}) {
  const store=new Store(file), pending=new Map();
  const scale=new ScaleDemo({file:scaleFile});
  const publicParking=new PublicParking({file:publicFile,handoverKey,creatorKey});
  let scaleLastTick=Date.now();
  const scaleTimer=autoTick?setInterval(()=>{const now=Date.now();try{scale.advance(Math.min(now-scaleLastTick,2000));publicParking.tick();}catch(error){console.error('Simulation tick:',error.message);}scaleLastTick=now;},250):null;
  const wokwi=new WokwiSession(bridgeKey);
  store.db.exec('CREATE TABLE IF NOT EXISTS demo_settings (id INTEGER PRIMARY KEY, config TEXT NOT NULL)');
  const savedDemo=store.db.prepare('SELECT config FROM demo_settings WHERE id=1').get();if(savedDemo){const saved=JSON.parse(savedDemo.config);wokwi.configure(saved);wokwi.configuration={...wokwi.configuration,...saved};}
  let devices=[], lastSeen=0, connected=true, sequence=0;
  const worker=fork(new URL('./device-worker.mjs',import.meta.url),[],{env:{...process.env,PARKING_AUTO_TICK:autoTick?'1':'0'},stdio:['ignore','ignore','inherit','ipc']});
  function incident(bayId,reason) {
    if (!store.db.prepare("SELECT id FROM incidents WHERE bayId=? AND status!='CLOSED'").get(bayId)) {
      store.db.prepare('INSERT INTO incidents VALUES(?,?,?,?,?,?)').run(randomUUID(),bayId,reason,'OPEN',new Date().toISOString(),'');
      store.db.prepare('INSERT OR IGNORE INTO isolated VALUES(?)').run(bayId);
      store.event('Device incident',reason,bayId);
    }
  }
  function reconcile(bays) {
    if(wokwi.enabled)bays=bays.map(device=>wokwi.hasBay(device.id)?wokwi.baySnapshot(device.id):device);
    const old=new Map(devices.map(device=>[device.id,device])); devices=bays; lastSeen=Date.now(); store.setDevices(devices);
    for (const device of devices) {
      const before=old.get(device.id);
      if (before && before.state!==device.state) store.event(device.state.replaceAll('_',' ').toLowerCase(),`${device.id} · ${device.position} · ${device.occupancy}`,device.id);
      if (device.health!=='HEALTHY') incident(device.id,`${device.id}: ${device.health.replaceAll('_',' ').toLowerCase()}`);
      const visit=store.db.prepare("SELECT * FROM visits WHERE bayId=? AND status!='COMPLETE'").get(device.id);
      if (visit) {
        let status=visit.status;
        if (device.health!=='HEALTHY') status='FAULT';
        else if (device.position==='MOVING_DOWN') status='PREPARING';
        else if (device.occupancy==='PRESENT') status='OCCUPIED';
        else if (device.state==='DEPARTURE_DELAY' || device.position==='MOVING_UP') status='DEPARTING';
        else if (device.position==='DOWN' && device.mode==='NORMAL') status='READY';
        else if (device.position==='UP' && ['DEPARTING','READY'].includes(visit.status)) status='COMPLETE';
        if(device.occupancy==='PRESENT' && visit.kind==='visitor') {
          store.db.prepare('INSERT OR IGNORE INTO parking_times VALUES(?,?)').run(visit.id,device.now);
          const parked=store.db.prepare('SELECT started FROM parking_times WHERE visitId=?').get(visit.id);
          if(device.now-parked.started>=JSON.parse(visit.config).visitMinutes*60000) {status='OVERSTAY';incident(device.id,`${device.id}: visitor exceeded the permitted parking window`);}
        }
        if(status!==visit.status) store.db.prepare('UPDATE visits SET status=? WHERE id=?').run(status,visit.id);
      }
    }
  }
  worker.on('message', message=>{
    if(message.sequence>sequence && connected) {sequence=message.sequence;reconcile(message.bays);}
    if(message.replyId && pending.has(message.replyId)) { const request=pending.get(message.replyId); pending.delete(message.replyId);clearTimeout(request.timer);message.value?.error?request.reject(new Error(message.value.error)):request.resolve(message.value); }
  });
  function send(type,body={}) {
    if(!connected && ['unlock','emergency'].includes(type)) throw new Error('Gateway disconnected: command cannot be delivered');
    if(type==='unlock'&&wokwi.fullLot())return Promise.resolve(wokwi.unlockBay(body.bayId,body.duration,body.commandId));
    return new Promise((resolve,reject)=>{const id=randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Device acknowledgement timed out'));},5000);pending.set(id,{resolve,reject,timer});worker.send({id,type,...body});});
  }
  worker.on('exit',()=>{connected=false;for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('Device process stopped'));}pending.clear();});
  await send('snapshot');
  function snapshot() {
    const visits=store.listVisits();const stale=!connected || Date.now()-lastSeen>6000;
    const bays=devices.map(device=>({...device,health:stale?'OFFLINE':wokwi.hasBay(device.id)&&!wokwi.fresh()?'OFFLINE':device.health,category:device.id.startsWith('R')?'resident':device.id.startsWith('V')?'visitor':'temporary',visit:visits.find(visit=>visit.bayId===device.id && visit.status!=='COMPLETE') || null,isolated:Boolean(store.db.prepare('SELECT bayId FROM isolated WHERE bayId=?').get(device.id)),identity:'UNVERIFIED'}));
    return {bays,visits,policy:store.policy(),events:store.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 50').all(),incidents:store.db.prepare('SELECT * FROM incidents ORDER BY created DESC').all(),connected:!stale,simulatedMs:devices[0]?.now || 0,wokwi:wokwi.snapshot(),stages:{app:'PROTOTYPE',devices:wokwi.fullLot()?'ALL 9 BAYS LIVE WOKWI':wokwi.enabled?'R-102 LIVE WOKWI / OTHER BAYS BEHAVIORAL':'BEHAVIORAL SIMULATION',circuit:'SOFTWARE VERIFIED',threeD:'GATED'}};
  }
  publicParking.operations=new ResidentialOperations(publicParking,{
    state:snapshot,
    hold:reason=>{wokwi.phase='RECOVERY_REQUIRED';wokwi.error=reason;wokwi.queue=[];},
    resume:j=>{wokwi.phase='PARKED';wokwi.error='';wokwi.entryPassed=true;store.event('Staff resumed inspected parked vehicle',j.plate+' / '+j.bayId,j.bayId);},
    reconcile:j=>{wokwi.phase='COMPLETE';wokwi.error='';store.db.prepare("UPDATE visits SET status='COMPLETE' WHERE id=?").run(j.id);store.event('Staff reconciled interrupted journey','Inspected clear bay and closed lanes; no device reset',j.bayId);},
    resolveRepair:bayId=>{const b=snapshot().bays.find(b=>b.id===bayId);if(!wokwi.fresh()||!b||b.health!=='HEALTHY'||!['UP','DOWN'].includes(b.position)||b.occupancy==='UNCERTAIN')throw Error('Repair feedback became unavailable; keep isolation');store.db.prepare("UPDATE incidents SET status='CLOSED',outcome='Staff inspection confirmed healthy feedback' WHERE bayId=? AND status!='CLOSED'").run(bayId);store.db.prepare('DELETE FROM isolated WHERE bayId=?').run(bayId);store.event('Inspected repair released','Healthy feedback checked; no actuator command issued',bayId);},
    fault:async input=>{
      if(wokwi.fullLot()){
        if(input.fault==='sensor')wokwi.enqueue('distance',{bayId:input.bayId,value:100});
        else if(input.fault==='jam')wokwi.enqueue('jam',{bayId:input.bayId,value:1});
        else{wokwi.enqueue('distance',{bayId:input.bayId,value:250});wokwi.enqueue('jam',{bayId:input.bayId,value:0});wokwi.enqueue('command',{verb:'RESET',bayId:input.bayId});}
      }else {if(input.fault==='clear')await send('presence',{bayId:input.bayId,distance:250});await send('fault',input);}
    },
    command:async c=>{
      if(c.action==='lower'){const result=await send('unlock',{bayId:c.bayId,commandId:c.id,duration:60000});if(!result.accepted)throw new Error(result.reason||'Controller rejected lowering');}
      else {if(!wokwi.fullLot()||!wokwi.fresh())throw new Error('Safe relock requires the connected full-lot firmware');wokwi.enqueue('command',{verb:'RESET',bayId:c.bayId});}
      store.event('Authorized residential device request',c.action+' / '+c.reason,c.bayId);
    },
    arrive:j=>{
      if(store.listVisits().some(v=>v.status!=='COMPLETE'&&v.bayId===j.bayId))throw new Error('The engineering registry already holds this bay; review its existing journey');
      wokwi.configure({plate:j.plate,bayId:j.bayId},{allowPrepared:true});
      wokwi.configuration={...wokwi.configuration,journeyId:j.id,actorName:j.actorName,unit:j.unit,kind:j.passId?'visitor':'resident'};
      const result=wokwi.arrive(j.plate);store.db.prepare('INSERT OR REPLACE INTO demo_settings VALUES(1,?)').run(JSON.stringify(wokwi.configuration));
      const policy=store.policy();store.db.prepare('INSERT INTO visits VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(j.id,j.actorName,j.plate,j.unit,j.passId?'visitor':'resident','RESERVED',j.bayId,1,policy.version,JSON.stringify(policy),new Date().toISOString());
      store.event('Public app arrival authorized',j.plate+' / '+j.bayId,j.bayId);return result;
    },
    action:action=>{const result=wokwi.action(action);store.event('Shared residential vehicle observation',action,wokwi.configuration.bayId);return result;}
  });
  const server=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    try {
      const publicRoute=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&publicRoute.pathname==='/api/public/alerts/stream'){publicParking.stream(req,res);return;}
      if(publicRoute.pathname.startsWith('/api/public/')){res.end(JSON.stringify(await publicParking.handle(req,publicRoute)));return;}
      const actor=req.headers['x-demo-actor'] || 'guard';
      if(!['guard','resident','management'].includes(actor)) {res.statusCode=403;throw new Error('Unknown demo role');}
      const route=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&route.pathname==='/api/scale/state'){res.end(JSON.stringify(scale.state({siteId:route.searchParams.get('siteId')||'SITE-001',level:route.searchParams.get('level')||0,building:route.searchParams.get('building')==='1',journeyId:route.searchParams.get('journeyId')})));return;}
      if(req.method==='GET' && req.url==='/api/state') {res.end(JSON.stringify(snapshot()));return;}
      if(req.method!=='POST') {res.statusCode=404;throw new Error('Route not found');}
      if(['/api/simulation/fault','/api/simulation/connection','/api/simulation/advance','/api/reset','/api/policy','/api/demo/configure','/api/lot/unlock','/api/scale/configure','/api/scale/fault','/api/scale/advance','/api/scale/traffic'].includes(route.pathname)&&!publicParking.creatorAuthorized(req))throw Object.assign(new Error('Unlock the creator console before using engineering fixture controls'),{status:403});
      let content='';for await(const chunk of req){content+=chunk;if(content.length>16384){res.statusCode=413;throw new Error('Request too large');}}
      const body=JSON.parse(content || '{}');let result={ok:true};
      if(route.pathname.startsWith('/api/scale/')){
        store.requireRole(actor,'management');
        const action=route.pathname.slice('/api/scale/'.length);
        if(action==='configure')result=scale.configure(body);
        else if(action==='arrive')result=scale.arrive(body);
        else if(action==='action')result=scale.action(body);
        else if(action==='fault')result=scale.fault(body);
        else if(action==='traffic')result=scale.traffic(body);
        else if(action==='presence'){scale.presence(body);result={ok:true};}
        else if(action==='advance'){scale.advance(body.milliseconds);result={ok:true};}
        else {res.statusCode=404;throw new Error('Unknown scale route');}
      }
      else if(req.url==='/api/wokwi/poll') {result=wokwi.poll(req.headers['x-bridge-key'],body);reconcile(devices);}
      else if(req.url==='/api/demo/configure') {
        store.requireRole(actor,'management');
        if(store.listVisits().some(v=>v.status!=='COMPLETE'&&(v.bayId===body.bayId||v.kind==='resident')))throw new Error('Finish the existing reservation or journey before changing the demo allocation.');
        const bay=snapshot().bays.find(b=>b.id===body.bayId);if(bay?.isolated)throw new Error('This bay is isolated for repair');
        if(!wokwi.enabled&&(!bay||bay.position!=='UP'||bay.occupancy!=='CLEAR'||bay.health!=='HEALTHY'))throw new Error('Select a healthy vacant bay');
        result=wokwi.configure(body);store.db.prepare('INSERT OR REPLACE INTO demo_settings VALUES(1,?)').run(JSON.stringify(result));
        store.event('Demo allocation updated',result.plate+' / '+result.bayId,result.bayId);
      }
      else if(req.url==='/api/journey/arrive') {
        store.requireRole(actor,'resident');if(store.listVisits().some(v=>v.bayId===wokwi.configuration.bayId&&v.status!=='COMPLETE'&&v.kind!=='resident'))throw new Error('Your demo bay has an active reservation');result=wokwi.arrive(String(body.plate||''));
        if(!store.listVisits().some(visit=>visit.kind==='resident'&&visit.status!=='COMPLETE')){const id=randomUUID(),policy=store.policy();store.db.prepare('INSERT INTO visits VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,'Alicia Rahman',wokwi.configuration.plate,'10-02','resident','RESERVED',wokwi.configuration.bayId,1,policy.version,JSON.stringify(policy),new Date().toISOString());}
        store.event('Entrance plate authorized','Simulated '+wokwi.configuration.plate+' match; firmware command queued',wokwi.configuration.bayId);
      }
      else if(req.url==='/api/journey/action') {store.requireRole(actor,'resident','management');publicParking.operations.assertCircuitAction(body.action);result=wokwi.action(body.action);store.event('Live car action',body.action,wokwi.configuration.bayId);}
      else if(req.url==='/api/lot/unlock') {store.requireRole(actor,'management');if(!wokwi.fullLot())throw new Error('Start the full-lot circuit first');result=wokwi.unlockBay(body.bayId,600000,randomUUID());store.event('Management bay preparation','Full-lot demo unlock requested',body.bayId);}
      else if(req.url==='/api/visits') result=store.register(actor,body);
      else if(req.url==='/api/visits/approve') {store.approve(actor,body.id);}
      else if(req.url==='/api/visits/assign') {
        store.setDevices(snapshot().bays);result=store.assign(actor,body.id);
        const response=await send('unlock',{bayId:result.bayId,commandId:result.id,duration:result.config.arrivalMinutes*60000});
        if(!response.accepted) {incident(result.bayId,response.reason);throw new Error(response.reason);}
      }
      else if(req.url==='/api/resident/arrive') {
        store.requireRole(actor,'resident');store.setDevices(snapshot().bays);
        let visit=store.listVisits().find(visit=>visit.kind==='resident' && visit.status!=='COMPLETE');
        if(!visit) {
          if(!store.available(wokwi.configuration.bayId)) throw new Error('Your bay is occupied or unavailable. Contact the guard.');
          const id=randomUUID(),policy=store.policy();store.db.prepare('INSERT INTO visits VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,'Alicia Rahman',wokwi.configuration.plate,'10-02','resident','RESERVED',wokwi.configuration.bayId,1,policy.version,JSON.stringify(policy),new Date().toISOString());visit=store.getVisit(id);
          store.event('Resident plate authorized',wokwi.configuration.plate+' / Unit 10-02 / Prepare '+wokwi.configuration.bayId,wokwi.configuration.bayId);
        }
        result=wokwi.enabled?{accepted:true,command:wokwi.arrive(wokwi.configuration.plate)}:await send('unlock',{bayId:wokwi.configuration.bayId,commandId:visit.id,duration:600000});if(!result.accepted)throw new Error(result.reason);
      }
      else if(req.url==='/api/visits/fallback') {
        store.requireRole(actor,'guard');store.setDevices(snapshot().bays);const visit=store.getVisit(body.id);
        if(visit.kind!=='visitor'||visit.status!=='FAULT')throw new Error('Fallback requires a visitor access failure');
        store.db.exec('BEGIN IMMEDIATE');
        try {
          if(!store.available('T-01'))throw new Error('Temporary bay unavailable. Give approved waiting or exit directions.');
          store.db.prepare('INSERT OR IGNORE INTO isolated VALUES(?)').run(visit.bayId);
          store.db.prepare("UPDATE visits SET bayId='T-01',status='RESERVED' WHERE id=?").run(visit.id);store.db.exec('COMMIT');
        }catch(error){store.db.exec('ROLLBACK');throw error;}
        result=await send('unlock',{bayId:'T-01',commandId:visit.id+'-fallback',duration:visit.config.arrivalMinutes*60000});
        if(!result.accepted){incident('T-01',result.reason);throw new Error(result.reason);}
        store.event('Temporary bay assigned',`${visit.plate}: T-01 reserved; arrival directions await DOWN feedback`, 'T-01');
      }
      else if(req.url==='/api/policy') result=store.publish(actor,body);
      else if(req.url==='/api/simulation/presence') {
        if(wokwi.fullLot()&&body.bayId!==wokwi.configuration.bayId){if(actor==='resident'){res.statusCode=403;throw new Error('Resident may simulate their own bay only');}if(!BAY_IDS.includes(body.bayId)||!(body.distance===null||typeof body.distance==='number'&&body.distance>=0&&body.distance<=500))throw new Error('Invalid sensor input');result=wokwi.presence(body.bayId,body.distance);store.event('Live presence input','Sensor observation queued for Wokwi',body.bayId);res.end(JSON.stringify(result));return;}
        if(wokwi.enabled&&body.bayId===wokwi.configuration.bayId){store.requireRole(actor,'resident','management');result=wokwi.action(body.distance===30?'park':body.distance===250?'leave':'unsupported');res.end(JSON.stringify(result));return;}
        if(actor==='resident' && body.bayId!==wokwi.configuration.bayId) {res.statusCode=403;throw new Error('Resident may simulate their own bay only');}
        if(!BAY_IDS.includes(body.bayId) || !(body.distance===null || typeof body.distance==='number' && body.distance>=0 && body.distance<=500)) throw new Error('Invalid sensor input');
        if(body.distance!==null && body.distance<50 && !['DOWN','MOVING_UP'].includes(devices.find(device=>device.id===body.bayId)?.position)) throw new Error('Wait for the bollard to confirm DOWN before parking');
        await send('presence',body);store.event(body.distance===250?'Vehicle departed':'Presence observation',`${body.bayId} · ${body.distance===null?'uncertain':body.distance+' cm'}`,body.bayId);
      }
      else if(req.url==='/api/simulation/advance') {
        store.requireRole(actor,'management');if(!Number.isInteger(body.milliseconds) || body.milliseconds<0 || body.milliseconds>600000)throw new Error('Time advance must be 0-600000 ms');await send('advance',body);
      }
      else if(req.url==='/api/simulation/fault') {store.requireRole(actor,'management');if(wokwi.fullLot()){if(!BAY_IDS.includes(body.bayId)||!['jam','sensor','clear'].includes(body.fault))throw new Error('Invalid fault');if(body.fault==='sensor')wokwi.enqueue('distance',{bayId:body.bayId,value:100});else{wokwi.enqueue('jam',{bayId:body.bayId,value:body.fault==='jam'?1:0});if(body.fault==='clear')wokwi.enqueue('command',{verb:'RESET',bayId:body.bayId});}store.event('Circuit fault input',body.fault,body.bayId);res.end(JSON.stringify({ok:true}));return;}if(wokwi.enabled&&body.bayId===wokwi.configuration.bayId)throw new Error('Use the Wokwi circuit controls for this live device.');if(!BAY_IDS.includes(body.bayId) || !['jam','sensor','clear'].includes(body.fault))throw new Error('Invalid fault');await send('fault',body);}
      else if(req.url==='/api/simulation/connection') {store.requireRole(actor,'management');if(typeof body.connected!=='boolean')throw new Error('Invalid connection state');connected=body.connected;if(connected)await send('snapshot');store.event(connected?'Gateway reconnected':'Gateway disconnected','Local controller time continues independently');}
      else if(req.url==='/api/emergency') {store.requireRole(actor,'guard','management');if(typeof body.active!=='boolean')throw new Error('Invalid emergency state');if(wokwi.enabled){wokwi.enqueue('emergency',{active:body.active});if(!body.active)wokwi.enqueue('command',{verb:'RESET'});}await send('emergency',body);store.event(body.active?'Emergency activated':'Emergency reset requested','All bays report their own result; recovery is required after reset');}
      else if(req.url==='/api/incidents/acknowledge') {store.requireRole(actor,'guard','management');store.db.prepare("UPDATE incidents SET status='ACKNOWLEDGED' WHERE id=? AND status='OPEN'").run(body.id);store.event('Incident acknowledged','Duty guard accepted ownership');}
      else if(req.url==='/api/incidents/resolve') {
        store.requireRole(actor,'management');const item=store.db.prepare('SELECT * FROM incidents WHERE id=?').get(body.id);if(!item)throw new Error('Incident not found');
        const device=devices.find(device=>device.id===item.bayId);if(!connected || device?.health!=='HEALTHY' || !['UP','DOWN'].includes(device.position) || device.occupancy==='UNCERTAIN')throw new Error('Fresh healthy device feedback is required before closing the repair');
        store.db.prepare("UPDATE incidents SET status='CLOSED',outcome='Recovery checked by management' WHERE id=?").run(item.id);store.db.prepare('DELETE FROM isolated WHERE bayId=?').run(item.bayId);store.event('Repair closed','Confirmed device recovery recorded',item.bayId);
      }
      else if(req.url==='/api/reset') {
        store.requireRole(actor,'management');connected=true;store.db.exec('DELETE FROM visits;DELETE FROM events;DELETE FROM incidents;DELETE FROM isolated;DELETE FROM policies;DELETE FROM parking_times');store.db.prepare('INSERT INTO policies VALUES(1,?)').run(JSON.stringify({requireHost:false,eligible:['V-01','V-02','V-03','V-04'],arrivalMinutes:10,visitMinutes:120}));await send('reset');store.event('Simulation reset','Synthetic demo data restored');
      }
      else {res.statusCode=404;throw new Error('Route not found');}
      res.end(JSON.stringify(result));
    } catch(error) {if(!res.statusCode || res.statusCode===200)res.statusCode=error.status||(/role required|Resident may|Unknown demo/.test(error.message)?403:400);res.end(JSON.stringify({error:error.message}));}
  });
  let closing;
  return {server,bridgeKey,creatorKey,close:()=>closing??=(async()=>{
    if(scaleTimer)clearInterval(scaleTimer);
    await new Promise(resolve=>server.close(resolve));
    connected=false;
    if(worker.exitCode===null&&worker.signalCode===null){const exited=new Promise(resolve=>worker.once('exit',resolve));worker.kill();await exited;}
    scale.close();publicParking.close();store.close();
  })()};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const folder=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data');mkdirSync(folder,{recursive:true});
  const creatorFile=path.join(folder,process.env.PARKING_PORT&&process.env.PARKING_PORT!=='4176'?'creator-console-key-'+process.env.PARKING_PORT:'creator-console-key'),creatorKey=process.env.PARKING_CREATOR_KEY||(existsSync(creatorFile)?readFileSync(creatorFile,'utf8').trim():randomUUID());
  writeFileSync(creatorFile,creatorKey,{mode:0o600});
  const application=await createApplication({creatorKey,file:process.env.PARKING_DB || path.join(folder,'parking.sqlite'),scaleFile:process.env.PARKING_SCALE_DB || path.join(folder,'scaled.sqlite'),publicFile:process.env.PARKING_PUBLIC_DB || path.join(folder,'public.sqlite'),handoverKey:process.env.PARKING_HANDOVER_KEY||randomUUID(),autoTick:process.env.PARKING_AUTO_TICK!=='0'});
  const port=Number(process.env.PARKING_PORT || 4176),host=process.env.PARKING_HOST || '127.0.0.1';application.server.listen(port,host,()=>{
    writeFileSync(path.join(folder,port===4176?'wokwi-bridge-key':`wokwi-bridge-key-${port}`),application.bridgeKey);
    console.log(`BayPilot API http://${host}:${port}`);
  });
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await application.close();process.exit(0);});
}
