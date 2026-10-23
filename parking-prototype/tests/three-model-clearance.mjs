// Audit the actual exported model, including world transforms and ramp rotation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Box3,Vector3,Matrix4,Quaternion,Euler} from 'three';
import {OBB} from 'three/addons/math/OBB.js';
import {pathsForBay,pathLength,sampleVehiclePath} from '../src/three/journey.ts';

const file=new URL('../artifacts/three/BayPilot-parking-building.glb',import.meta.url);
const buffer=readFileSync(file),model=JSON.parse(buffer.toString('utf8',20,20+buffer.readUInt32LE(12)));
const obstacles=[],gates=[];
function localMatrix(node){return node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...node.translation||[0,0,0]),new Quaternion(...node.rotation||[0,0,0,1]),new Vector3(...node.scale||[1,1,1]));}
function primitives(node,world,label){
 return (model.meshes[node.mesh]?.primitives||[]).map(p=>{
  const a=model.accessors[p.attributes.POSITION];assert.ok(a.min&&a.max,'Export includes vertex bounds');
  const box=new Box3(new Vector3(...a.min),new Vector3(...a.max));
  return {label,obb:new OBB().fromBox3(box).applyMatrix4(world),bounds:box.clone().applyMatrix4(world)};
 });
}
function walk(index,parent,excluded=false){
 const node=model.nodes[index],name=node.name||'mesh',world=parent.clone().multiply(localMatrix(node));
 if(name==='Entrance_barrier'||name==='Exit_barrier')gates.push({node,world});
 excluded=excluded||name==='Tenant_car'||name.startsWith('Bay_')||name==='Entrance_barrier'||name==='Exit_barrier';
 if(!excluded&&node.mesh!==undefined)obstacles.push(...primitives(node,world,name));
 for(const child of node.children||[])walk(child,world,excluded);
}
for(const index of model.scenes[model.scene||0].nodes)walk(index,new Matrix4());
const body=new Box3(new Vector3(-.84,.435,-1.86),new Vector3(.84,1.74,1.86)),failures=[];
let samples=0;
for(const id of ['R-102','V-01','V-04']){
 const paths=pathsForBay(id);
 for(const route of ['approach','front','crossing','bay','leave','exit','exitFront','exitCross','outside']){
  const length=pathLength(paths[route]);
  for(let distance=0;distance<=length;distance+=.2){
   const pose=sampleVehiclePath(paths[route],distance),transform=new Matrix4().makeRotationFromEuler(new Euler(pose.pitch||0,pose.yaw+(route==='leave'?Math.PI:0),0,'YXZ')).setPosition(pose.x,pose.y||0,pose.z);
   const bounds=body.clone().applyMatrix4(transform),obb=new OBB().fromBox3(body).applyMatrix4(transform);samples++;
   for(const obstacle of obstacles)if(bounds.intersectsBox(obstacle.bounds)&&obb.intersectsOBB(obstacle.obb)){
    failures.push({id,route,distance:Number(distance.toFixed(2)),obstacle:obstacle.label,position:pose});break;
   }
  }
 }
}
// Raise both actual exported arms and test them against the model structure.
for(const gate of gates){
 const pivotIndex=gate.node.children.find(i=>model.nodes[i].children?.length),pivot=model.nodes[pivotIndex];assert.ok(pivot);
 const opened=gate.world.clone().multiply(new Matrix4().makeTranslation(...pivot.translation||[0,1.5,0])).multiply(new Matrix4().makeRotationX(-Math.PI/2));
 for(const child of pivot.children){const node=model.nodes[child],world=opened.clone().multiply(localMatrix(node));if(node.mesh===undefined)continue;
  for(const arm of primitives(node,world,gate.node.name))for(const obstacle of obstacles)if(arm.bounds.intersectsBox(obstacle.bounds)&&arm.obb.intersectsOBB(obstacle.obb))failures.push({gate:gate.node.name,obstacle:obstacle.label,centre:obstacle.bounds.getCenter(new Vector3()).toArray(),size:obstacle.bounds.getSize(new Vector3()).toArray()});
 }
}
const result={passed:failures.length===0,samples,obstacles:obstacles.length,raisedGates:gates.length,failures};
writeFileSync(new URL('../artifacts/three/model-clearance-results.json',import.meta.url),JSON.stringify(result,null,2));
assert.deepEqual(failures,[],'Car body or open gate clips the exported model; see model-clearance-results.json');
console.log(`MODEL CLEARANCE PASS: ${samples} vehicle samples across three levels, ${obstacles.length} model primitives and both raised booms.`);
