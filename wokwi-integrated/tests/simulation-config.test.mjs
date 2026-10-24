import test from 'node:test';
import assert from 'node:assert/strict';
import {setSimulationCpuLimit,prepareSimulationCpuLimit,readSerialPackets,setSimulationTelemetryInterval,setReferenceSimulationPaused} from '../simulation-config.mjs';

function editor(diagram){let value=JSON.stringify(diagram);globalThis.monaco={editor:{getModels:()=>[{uri:{toString:()=> 'vfs:diagram.json'},getValue:()=>value,setValue:next=>{value=next;}}]}};return ()=>JSON.parse(value);}
test('simulation CPU limit preserves wiring, peripheral attributes and firmware references',()=>{
 const original={version:1,parts:[{type:'board-esp32-devkit-c-v4',id:'esp32',attrs:{flashSize:'4'}},{type:'wokwi-servo',id:'gate',attrs:{horn:'single'}}],connections:[['esp32:18','gate:PWM','green']],serialMonitor:{display:'always'},firmware:'unchanged.bin'};
 const read=editor(original);try{const result=setSimulationCpuLimit(4);const expected=structuredClone(original);expected.parts[0].attrs.cpuFrequency='4';assert.deepEqual(read(),expected);assert.equal(result.boards,1);}finally{delete globalThis.monaco;}
});
test('paused reference pages release browser CPU and resume before accepting UI controls',async()=>{
 const calls=[],session={page:{getByRole:(_,{name})=>({click:async()=>calls.push(name)})},cdp:{send:async(method,args)=>calls.push([method,args.state])}};
 await setReferenceSimulationPaused(session,true);
 await setReferenceSimulationPaused(session,false);
 assert.deepEqual(calls,['Pause',['Page.setWebLifecycleState','frozen'],['Page.setWebLifecycleState','active'],'Resume']);
 const failed={page:{getByRole:()=>({click:async()=>{throw Error('pause failed');}})},cdp:{send:async()=>{throw Error('must not freeze a running simulation');}}};
 await assert.rejects(setReferenceSimulationPaused(failed,true),/pause failed/);
});
test('invalid limits are rejected before changing the circuit',()=>{const original={parts:[{type:'board-esp32-devkit-c-v4',attrs:{}}]};const read=editor(original);try{for(const value of [0,-1,NaN,Infinity,16,'max'])assert.throws(()=>setSimulationCpuLimit(value));assert.deepEqual(read(),original);}finally{delete globalThis.monaco;}});
test('missing diagram or processor fails explicitly instead of claiming configuration succeeded',()=>{globalThis.monaco={editor:{getModels:()=>[]}};try{assert.throws(()=>setSimulationCpuLimit(2),/diagram/);editor({parts:[{type:'wokwi-servo',attrs:{}}]});assert.throws(()=>setSimulationCpuLimit(2),/ESP32/);}finally{delete globalThis.monaco;}});
test('a lazy-loaded Wokwi diagram is opened before applying the limit',async()=>{
 let read;globalThis.monaco={editor:{getModels:()=>[]}};
 const page={getByText:(name,options)=>{assert.equal(name,'diagram.json');assert.equal(options.exact,true);return {click:async()=>{read=editor({parts:[{type:'board-esp32-devkit-c-v4',attrs:{}}]});}};},waitForFunction:async fn=>{assert.ok(fn());},evaluate:async(fn,arg)=>fn(arg)};
 try{await prepareSimulationCpuLimit(page,2);assert.equal(read().parts[0].attrs.cpuFrequency,'2');}finally{delete globalThis.monaco;}
});
test('UART collection reads only serial text without forcing page layout or accepting editor text',()=>{
 globalThis.document={querySelector:()=>({textContent:'boot\r\n{"kind":"telemetry","seq":1}\r\n{"role":"FLOW_BENCH","seq":2}\r\n{"kind":"telemetry","seq":'}),body:{get innerText(){throw Error('Full page layout must not be read');}}};
 try{assert.deepEqual(readSerialPackets('kind'),[{kind:'telemetry',seq:1}]);assert.deepEqual(readSerialPackets('role'),[{role:'FLOW_BENCH',seq:2}]);}finally{delete globalThis.document;}
});
test('UART parsing remains bounded while retaining the newest sequence and acknowledgement',()=>{
 const lines=Array.from({length:2000},(_,seq)=>JSON.stringify({kind:'telemetry',seq}));lines.push('{"kind":"ack","id":"latest"}');
 globalThis.document={querySelector:()=>({textContent:lines.join('\n')})};
 try{const packets=readSerialPackets('kind');assert.ok(packets.length<=250);assert.equal(packets.at(-2).seq,1999);assert.equal(packets.at(-1).id,'latest');}finally{delete globalThis.document;}
});
test('hosted heartbeat tuning changes only the master output interval and fails on unknown source',()=>{
 let source='void output(){if(nowMs-lastOutput<1000||usb.queued()>128)return;}\nvoid safety(){unchanged();}';
 globalThis.monaco={editor:{getModels:()=>[{uri:{toString:()=> 'vfs:sketch.ino'},getValue:()=>source,setValue:s=>{source=s;}}]}};
 try{setSimulationTelemetryInterval(250);assert.equal(source,'void output(){if(nowMs-lastOutput<250||usb.queued()>128)return;}\nvoid safety(){unchanged();}');assert.throws(()=>setSimulationTelemetryInterval(0));source='unexpected';assert.throws(()=>setSimulationTelemetryInterval(250),/heartbeat/);}finally{delete globalThis.monaco;}
});
