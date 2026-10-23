// Opt-in: ten sequential owner/visitor journeys through the actual running ESP32
// simulation. Vehicle inputs use the same public API as the app controls.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
if(process.env.RUN_RESIDENTIAL_LIVE!=='1')throw Error('Set RUN_RESIDENTIAL_LIVE=1 to operate the synthetic local circuit.');
const base=process.env.LIVE_DEMO_URL||'http://localhost:8080',out=new URL('../artifacts/residential/acceptance/',import.meta.url);await mkdir(out,{recursive:true});
const key=process.env.PARKING_CREATOR_KEY||execFileSync('docker',['compose','-f','compose.yaml','exec','-T','api','cat','data/creator-console-key'],{cwd:new URL('../../',import.meta.url),encoding:'utf8'}).trim();
async function api(route,body,id='resident-alicia'){
 const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',authorization:'Bearer demo:'+id,...(id==='developer'?{'x-creator-key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await r.json();assert.ok(r.ok,route+': '+JSON.stringify(result));return result;
}
const state=()=>api('/api/state'),view=id=>api('/api/public/state',undefined,id),selected=s=>s.wokwi.telemetry.bays.find(b=>b.id===s.wokwi.configuration.bayId);
async function until(check,label,timeout=75000){const end=Date.now()+timeout;while(Date.now()<end){await view();const s=await state();assert.notEqual(s.wokwi.phase,'RECOVERY_REQUIRED','Unexpected inspection hold during '+label+': '+s.wokwi.error);if(check(s))return s;await new Promise(r=>setTimeout(r,400));}throw Error('Timed out: '+label);}
const results={passed:false,startedAt:new Date().toISOString(),mode:'LIVE_ESP32_PUBLIC_API_VEHICLE_INPUTS',journeys:[],checks:[]},save=()=>writeFile(new URL('results.json',out),JSON.stringify(results,null,2));
try{
 const first=await state();assert.ok(first.wokwi.connected);assert.ok(['OUTSIDE','COMPLETE'].includes(first.wokwi.phase),'Finish the current trip first');
 const baseline=first.bays.filter(b=>!['R-102','V-01','R-104'].includes(b.id)).map(b=>[b.id,b.position,b.occupancy]);
 for(let n=1;n<=10;n++){
  const start=Date.now(),visitor=n%2===0,id=visitor?'public-visitor':'resident-alicia';let pass=null;
  if(visitor)pass=await api('/api/public/residential/invite',{siteId:'RES-001',unit:'10-02',guestId:id,plate:'REP'+n+'2026',parkingBayId:'V-01',requestId:crypto.randomUUID()});
  const j=await api('/api/public/residential/arrive',{...(pass?{passId:pass.id}:{}),requestId:crypto.randomUUID()},id),act=action=>api('/api/public/residential/action',{journeyId:j.id,action},id);
  await until(s=>selected(s).bay==='DOWN'&&s.wokwi.telemetry.entry==='OPEN','entrance and selected bollard open');
  await act('enter');await until(s=>s.wokwi.telemetry.entryBeam===1,'observed entrance passage');
  await act('clear-entry');await until(s=>s.wokwi.telemetry.entryBeam===0,'cleared entrance beam');
  if(n===6)await api('/api/public/passes/decision',{id:pass.id,decision:'revoke'});
  await act('park');await until(s=>selected(s).occupancy==='PRESENT'&&s.wokwi.telemetry.entry==='CLOSED','parked vehicle and closed entrance');
  const staff=await view('security-res'),user=await view(id),same=staff.residential.journeys.find(v=>v.id===j.id);
  assert.equal(same.bayId,j.bayId);assert.equal(same.plate,j.plate);assert.equal(user.residential.journeys.find(v=>v.id===j.id).phase,'PARKED');
  assert.equal(staff.residential.bays.find(b=>b.id===j.bayId).compliance,'OCCUPIED_UNVERIFIED','No camera/patrol plate evidence was generated');
  if(n===4||n===8)await api('/api/public/passes/decision',{id:pass.id,decision:'revoke'});
  if([4,6,8].includes(n)){
   for(let k=0;k<3;k++)assert.equal((await view(id)).passes.find(p=>p.id===pass.id).status,'EXIT_ONLY');
   assert.equal((await view('security-res')).residential.availableVisitorBays.includes(j.bayId),false);
  }
  await act('leave');await until(s=>selected(s).occupancy==='CLEAR','observed clear bay');
  await act('exit');await until(s=>s.wokwi.telemetry.exit==='OPEN','exit confirmed open');
  await act('pass-exit');await until(s=>s.wokwi.telemetry.exitBeam===1,'exit beam passage');
  await act('clear-exit');await until(s=>s.wokwi.phase==='COMPLETE'&&selected(s).bay==='UP'&&s.wokwi.telemetry.entry==='CLOSED'&&s.wokwi.telemetry.exit==='CLOSED','complete departure and relock');
  const final=await view(id);assert.equal(final.residential.journeys.find(v=>v.id===j.id).phase,'COMPLETE');if(pass)assert.equal(final.passes.find(p=>p.id===pass.id).status,'COMPLETE');
  assert.deepEqual((await state()).bays.filter(b=>!['R-102','V-01','R-104'].includes(b.id)).map(b=>[b.id,b.position,b.occupancy]),baseline);
  results.journeys.push({number:n,kind:visitor?'visitor':'owner',journeyId:j.id,plate:j.plate,bayId:j.bayId,revokedDuring:n===6?'ENTRANCE_PASSAGE':[4,8].includes(n)?'PARKED':null,completed:true,durationMs:Date.now()-start});await save();console.log('PASS journey '+n+'/10: '+(visitor?'visitor':'owner')+' '+j.bayId+'; all other bays retained');
 }
 const before=(await state()).bays.filter(b=>b.id!=='R-104').map(b=>[b.id,b.position,b.occupancy]);
 await api('/api/public/developer/residential',{bayId:'R-104',fault:'sensor'},'developer');await until(s=>s.bays.find(b=>b.id==='R-104').health==='SENSOR_FAULT','observed fault');
 const d=(await view('security-res')).residential.bays.find(b=>b.id==='R-104').diagnosis;assert.match(d.cause,/unconfirmed/i);
 await api('/api/public/developer/residential',{bayId:'R-104',fault:'clear'},'developer');await until(s=>s.bays.find(b=>b.id==='R-104').health==='HEALTHY','targeted recovery');
 assert.deepEqual((await state()).bays.filter(b=>b.id!=='R-104').map(b=>[b.id,b.position,b.occupancy]),before);
 results.checks=['10 consecutive completed live journeys: 5 owners and 5 visitors','revocation while parked and after entrance passage preserved exit-only departure','same journey, vehicle and bay in user, security and circuit state','occupied bay identity remained unverified without patrol evidence','closed barriers and raised empty bollard before next journey','unrelated occupied bays retained without fleet resets','observed sensor fault and targeted recovery'];
 results.passed=true;results.completedAt=new Date().toISOString();await save();console.log('ACCEPTANCE PASS: 10/10 live journeys and targeted fault recovery');
}catch(error){results.error=error.message;results.failedAt=new Date().toISOString();results.state=await state().catch(()=>null);await save();throw error;}
