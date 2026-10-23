import test from 'node:test';import assert from 'node:assert/strict';import {WokwiSession} from '../server/wokwi-session.mjs';
test('ESP32 wireless observations link the app to the actual ESP32 circuit',()=>{
 const session=new WokwiSession('test'),ids=['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'];
 const frame={kind:'telemetry',seq:1,ms:1500,bay:'UP',entry:'CLOSED',exit:'CLOSED',occupancy:'CLEAR',distance:250,health:'HEALTHY',emergency:0,entryBeam:0,exitBeam:0,transport:'SIMULATED_WIRELESS',controller:'ESP32',bays:ids.map(id=>({id,bay:'UP',occupancy:'CLEAR',distance:250,health:'HEALTHY',clearanceMs:0}))};
 session.poll('test',{frame});const result=session.snapshot();assert.equal(result.projectUrl,'https://wokwi.com/projects/478492669342702593');assert.equal(result.telemetry.controller,'ESP32');assert.equal(result.telemetry.bays.length,9);
});
