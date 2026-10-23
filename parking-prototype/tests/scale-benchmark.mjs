import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {ScaleDemo} from '../server/scale.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'baypilot-scale-bench-'));const engine=new ScaleDemo({file:path.join(dir,'fleet.sqlite')});
const artifacts=fileURLToPath(new URL('../artifacts/scale/',import.meta.url));await mkdir(artifacts,{recursive:true});
try{
 let start=performance.now();engine.configure({sites:100,baysPerSite:500,levels:10});const configureMs=performance.now()-start;
 start=performance.now();for(let i=1;i<=100;i++)engine.traffic({siteId:`SITE-${String(i).padStart(3,'0')}`,count:20});const arrivalMs=performance.now()-start;
 const ticks=[];for(let i=0;i<240;i++){start=performance.now();engine.advance(500);ticks.push(performance.now()-start);}
 const completed=engine.db.prepare("SELECT COUNT(*) n FROM journeys WHERE phase='COMPLETE'").get().n;
 const confirmed=engine.db.prepare("SELECT COUNT(*) n FROM commands WHERE status='CONFIRMED'").get().n;
 const raised=engine.db.prepare("SELECT COUNT(*) n FROM bays WHERE position='UP'").get().n;
 const heldLanes=engine.db.prepare('SELECT COUNT(*) n FROM lanes WHERE journeyId IS NOT NULL').get().n;
 assert.equal(completed,2000);assert.equal(confirmed,2000);assert.equal(raised,50000);assert.equal(heldLanes,0);
 const reads=[];let bytes=0;for(let i=0;i<100;i++){start=performance.now();const s=engine.state({siteId:`SITE-${String(i+1).padStart(3,'0')}`,level:0});bytes=Buffer.byteLength(JSON.stringify(s));reads.push(performance.now()-start);assert.equal(s.bays.length,50);assert.equal(s.summary.completed,20);}
 const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
 const result={passed:true,date:new Date().toISOString(),environment:{platform:process.platform,node:process.version,transport:'IN_PROCESS_IDEAL_VIRTUAL_DEVICES',storage:'temporary file-backed SQLite WAL'},inventory:{sites:100,bays:50000,gateways:10000},workload:{concurrentJourneys:2000,vehiclesPerSite:20,virtualSeconds:120,completed,confirmed,raised,heldLanes},measurements:{configureMs,arrivalMs,tickP95Ms:percentile(ticks,.95),tickMaxMs:Math.max(...ticks),snapshotP95Ms:percentile(reads,.95),lastSnapshotBytes:bytes},limits:'Single-process virtual-time exercise, not an MQTT, RF, camera, network-client, hardware or production throughput benchmark.'};
 await writeFile(path.join(artifacts,'benchmark-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{engine.close();assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));await rm(dir,{recursive:true,force:true});}
