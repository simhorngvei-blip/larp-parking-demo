import test from 'node:test';import assert from 'node:assert/strict';
import {endpointCircuit} from '../src/public/endpoint-circuit.ts';
test('a bollard opens a new single-bay workbench while gates retain the shared circuit',()=>{
 const c=endpointCircuit({id:'R-102',kind:'bay'});assert.equal(c?.target,'R-102');assert.equal(c?.scope,'ISOLATED_SINGLE_BAY_BENCH');assert.equal(c?.project,'https://wokwi.com/projects/478667707556941825');assert.match(c?.embed,/478667707556941825\/embed$/);assert.equal(c?.image,undefined);
 assert.equal(endpointCircuit({id:'ENTRY',kind:'gate'})?.target,'ENTRY');assert.equal(endpointCircuit({id:'BC-001',kind:'controller'}),null);
});
