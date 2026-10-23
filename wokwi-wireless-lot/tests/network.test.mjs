import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');let output;
test('compiled local controllers route one addressed unlock and preserve independent bay feedback',()=>{
 const command='gcc -std=c11 -I/src/tests -Dchip_init=node_init -c /src/node.chip.c -o /tmp/node.o && gcc -std=c11 -I/src/tests -Dchip_init=gateway_init -c /src/gateway.chip.c -o /tmp/gateway.o && gcc -std=c11 -I/src/tests /src/tests/network.c /tmp/node.o /tmp/gateway.o -o /tmp/network && /tmp/network';
 const result=process.env.WIRELESS_NATIVE==='1'?spawnSync('sh',['-c',command],{encoding:'utf8',timeout:60000}):spawnSync('docker',['run','--rm','--mount',`type=bind,source=${root},target=/src,readonly`,'--entrypoint','sh','baypilot-bridge','-c',command],{encoding:'utf8',timeout:60000});
 assert.equal(result.status,0,result.stderr);output=result.stdout;
 assert.match(output,/target 0 100 0 0 0/);assert.match(output,/duplicate 0/);assert.match(output,/reject 0 0/);
 assert.match(output,/occupied 100/);assert.match(output,/relock 0/);assert.match(output,/offline 0/);assert.match(output,/jam 0 0/);assert.match(output,/zoneB 100 0/);
 assert.match(output,/A a 1 1/,'acknowledgement must travel back through gateway');assert.match(output,/MOTOR_FAULT/,'jam must report fault rather than DOWN');
});
