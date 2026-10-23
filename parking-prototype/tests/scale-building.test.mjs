import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import * as building from '../src/scale/layout.ts';
test('the complete scalable floor fits a narrow or wide viewport without clipping its end bays',()=>{
 assert.equal(typeof building.fitLevelCamera,'function','The scalable floor camera needs a complete-level framing policy');
 for(const aspect of [.8,1.7,2.5])for(const width of [20,84,804]){
  const camera=new T.PerspectiveCamera(42,aspect,.1,2500);building.fitLevelCamera(camera,width,aspect);
  for(const x of [-width/2,width/2])for(const y of [0,3.2])for(const z of [-10.5,10.5]){
   const p=new T.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<=.93&&Math.abs(p.y)<=.93&&p.z<1,`End bay clipped for width ${width} and aspect ${aspect}`);
  }
 }
});
