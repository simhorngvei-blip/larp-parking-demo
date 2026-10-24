import {createServer} from 'node:http';
import {FRAME_MS} from './state.mjs';
export function createRuntimeServer(benches,{now=Date.now,onView=()=>{}}={}){
 return createServer((req,res)=>{
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
  const send=(code,data)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(data));};
  if(req.method!=='GET'){res.setHeader('allow','GET');send(405,{error:'Read-only controller viewer'});return;}
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/status'||pathname==='/health'){
   const states=Object.fromEntries(Object.entries(benches).map(([role,b])=>[role,b.snapshot(now())])),ready=Object.values(states).length>0&&Object.values(states).every(s=>s.status==='LIVE'&&s.frameAgeMs!==null&&s.frameAgeMs<=FRAME_MS);
   const available=Object.values(states).every(s=>!['ERROR','STALE'].includes(s.status));send(pathname==='/health'&&!available?503:200,{ready,available,benches:states});return;
  }
  const match=pathname.match(/^\/(flow|bay|bollard)\/(status|frame\.jpg)$/),bench=match&&benches[match[1]];
  if(!bench){send(404,{error:'Unknown controller bench resource'});return;}
  onView(match[1]);
  const state=bench.snapshot(now());if(match[2]==='status'){send(200,state);return;}
  if(!bench.frame||state.frameAgeMs>FRAME_MS||state.status!=='LIVE'){send(503,{error:'No fresh running circuit image',status:state.status});return;}
  res.writeHead(200,{'content-type':'image/jpeg'});res.end(bench.frame);
 });
}
