import {randomUUID} from 'node:crypto';
export const FRESH_MS=8000,FRAME_MS=5000;
export class BenchState {
 constructor(role,url){if(!['flow','bay','bollard'].includes(role))throw Error('Unknown bench role');this.role=role;this.url=url;this.startedAt=null;this.restarts=-1;this.events=[];this.latest=new Map();this.seen=new Set();this.sequence=null;this.lastSeenAt=null;this.frame=null;this.capturedAt=null;this.error='';this.instance=null;}
 begin(now=Date.now()){this.instance=randomUUID();this.startedAt=now;this.restarts++;this.events=[];this.latest.clear();this.seen.clear();this.sequence=null;this.lastSeenAt=null;this.frame=null;this.capturedAt=null;this.error='';this.paused=false;}
 setPaused(value){this.paused=value===true;}
 observe(packets,now=Date.now()){
  for(const packet of packets){
   if(packet.role!==(this.role==='flow'?'FLOW_BENCH':this.role==='bay'?'BAY_BENCH':'BOLLARD_BENCH')||!Number.isSafeInteger(packet.seq)||packet.seq<0||!Number.isInteger(packet.address)||packet.address<0||packet.address>(this.role==='flow'?8:this.role==='bay'?6:1)||!['PASS','FAIL','INFO','NOT_MEASURED'].includes(packet.result)||typeof packet.check!=='string'||packet.check.length>80||this.sequence!==null&&packet.seq<this.sequence)continue;
   const key=[packet.seq,packet.address,packet.check,packet.result].join(':');if(this.seen.has(key))continue;
   if(this.sequence===null||packet.seq>this.sequence){this.sequence=packet.seq;this.lastSeenAt=now;}
   this.seen.add(key);const event={...packet,detail:String(packet.detail||'').slice(0,500),id:this.instance+':'+key,at:new Date(now).toISOString()};
   this.events.push(event);if(this.events.length>200){const old=this.events.shift();this.seen.delete([old.seq,old.address,old.check,old.result].join(':'));}
   if(['PEER_REPLY','PEER_TIMEOUT','SENSOR_SAMPLE','TELEMETRY'].includes(packet.check))this.latest.set(packet.address,{...event,observedAt:now});
  }
 }
 capture(buffer,now=Date.now()){this.frame=buffer;this.capturedAt=now;}
 fail(message){this.error=String(message).slice(0,500);}
 snapshot(now=Date.now()){
  const age=this.lastSeenAt===null?null:Math.max(0,now-this.lastSeenAt),status=this.error?'ERROR':this.paused?'PAUSED':!this.sequence?'STARTING':age>FRESH_MS?'STALE':'LIVE';
  return {role:this.role,url:this.url,scope:'ISOLATED_CONTROLLER_BENCH',sharedApi:false,instance:this.instance,status,error:this.error,restarts:Math.max(0,this.restarts),startedAt:this.startedAt===null?null:new Date(this.startedAt).toISOString(),uptimeMs:this.startedAt===null?0:Math.max(0,now-this.startedAt),sequence:this.sequence,telemetryAgeMs:age,frameAgeMs:this.capturedAt===null?null:Math.max(0,now-this.capturedAt),events:this.events.slice(),channels:Array.from({length:this.role==='flow'?8:this.role==='bay'?6:1},(_,i)=>{const e=this.latest.get(i+1),fresh=status==='LIVE'&&e&&now-e.observedAt<=FRESH_MS;return {address:i+1,result:fresh?e.result:e?'STALE':'NOT_MEASURED',check:e?.check||'',sequence:e?.seq??null,cm:fresh?e.cm:null,occupancy:fresh?e.occupancy:null,position:fresh?e.position??null:null,upLimit:fresh?e.upLimit??null:null,downLimit:fresh?e.downLimit??null:null,motorEnabled:fresh?e.motorEnabled??null:null,detail:e?.detail||'',at:e?.at||null};})};
 }
}
