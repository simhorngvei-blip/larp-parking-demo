import test from 'node:test';
import assert from 'node:assert/strict';
import {bayAppearance,layoutFloor} from '../src/public/parking-layout-model.ts';
const slot=(id,x=100,extra={})=>({id,x,y:130,w:105,h:155,level:'G',kind:'PARKING',status:'VACANT',position:'UP',mine:false,source:'WOKWI_ENDPOINT',...extra});
test('3D bays use the same floor, identifiers and nonoverlapping footprint as the parking map',()=>{
 const layout={width:1000,height:650,slots:[slot('R-101'),slot('R-102',250),slot('V-01',100,{level:'L1'})]};
 const floor=layoutFloor(layout,'G');assert.deepEqual(floor.map(b=>b.id),['R-101','R-102']);
 assert.ok(floor[0].x+floor[0].width/2<floor[1].x-floor[1].width/2);
 assert.equal(layoutFloor(layout,'L1')[0].id,'V-01');
});
test('unknown, illustrative and offline bays never appear vacant or spawn an occupied car',()=>{
 for(const bay of [slot('unknown',100,{status:'UNKNOWN'}),slot('illustrative',100,{source:'ILLUSTRATIVE_LAYOUT'})])assert.equal(bayAppearance(bay,true).status,'UNKNOWN');
 assert.equal(bayAppearance(slot('occupied',100,{status:'OCCUPIED'}),false).status,'UNKNOWN');
 assert.equal(bayAppearance(slot('occupied',100,{status:'OCCUPIED'}),true).car,true);
 assert.equal(bayAppearance(slot('reserved',100,{status:'RESERVED'}),true).car,false);
 assert.notEqual(bayAppearance(slot('held',100,{status:'UNAVAILABLE'}),true).color,bayAppearance(slot('free'),true).color);
});
