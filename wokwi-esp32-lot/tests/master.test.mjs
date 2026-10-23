import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('the ESP32 master preserves command interlocks and observed feedback across the migration',()=>{
 const command='g++ -std=c++17 -I/src/tests /src/tests/master.cpp -o /tmp/esp32-master && /tmp/esp32-master && /tmp/esp32-master pwm-fail';
 const result=process.env.WIRELESS_NATIVE==='1'?spawnSync('sh',['-c',command],{encoding:'utf8',timeout:60000}):spawnSync('docker',['run','--rm','--mount',`type=bind,source=${root},target=/src,readonly`,'--entrypoint','sh','baypilot-bridge','-c',command],{encoding:'utf8',timeout:60000});
 assert.equal(result.status,0,result.stderr||result.stdout);assert.match(result.stdout,/PASS ESP32 master routing/);assert.match(result.stdout,/PASS PWM startup failure/);
});
