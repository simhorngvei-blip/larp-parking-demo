import test from 'node:test';import assert from 'node:assert/strict';
import * as geometry from '../src/scale/model-geometry.ts';
test('full-building follow camera remains between adjacent floor slabs, including ramp pitch',()=>{
 assert.equal(typeof geometry.followCarCamera,'function','A floor-aware camera placement is required');
 for(const y of [0,4,16,36])for(const pitch of [-.15,0,.15])for(const yaw of [0,Math.PI/2,Math.PI]){
  const pose={x:8,y,z:3,yaw,pitch},c=geometry.followCarCamera(pose,false);
  // On a ramp the chase camera must rise/fall with the road behind the vehicle.
  const roadBehind=y+Math.tan(pitch)*5.5;
  assert.ok(c.y-roadBehind>1.5&&c.y-roadBehind<3,'Camera clears the road and the next slab');
  assert.ok(Math.abs(Math.hypot(c.x-pose.x,c.z-pose.z)-5.5)<1e-8);
 }
});
test('cutaway mode retains the wider elevated chase view',()=>{
 assert.equal(typeof geometry.followCarCamera,'function');const c=geometry.followCarCamera({x:0,y:4,z:0,yaw:0,pitch:0},true);assert.equal(c.y,8.5);assert.equal(c.z,-9);
});
