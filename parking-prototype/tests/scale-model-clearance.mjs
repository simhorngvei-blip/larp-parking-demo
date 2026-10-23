// Check the exported meshes, including GPU instances, against the guided car body.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Box3,Vector3,Matrix4,Quaternion,Euler,Triangle} from 'three';
import {intersectsMeshTriangles} from './helpers/mesh-collision.mjs';
import {OBB} from 'three/addons/math/OBB.js';
import {CAR_RIDE_HEIGHT} from '../src/scale/model-geometry.ts';
import {sampleScaleVehiclePath,routesForScaleBay} from '../src/scale/route.ts';
import {pathLength} from '../src/three/journey.ts';
const bytes=readFileSync(new URL('../artifacts/scale-live/scaled-building-parked.glb',import.meta.url)),jsonLength=bytes.readUInt32LE(12),model=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),binStart=28+jsonLength;
const obstacles=[],failures=[];
function matrix(n){return n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...n.translation||[0,0,0]),new Quaternion(...n.rotation||[0,0,0,1]),new Vector3(...n.scale||[1,1,1]));}
function attribute(index,i){const a=model.accessors[index],v=model.bufferViews[a.bufferView],size={VEC3:3,VEC4:4}[a.type];assert.equal(a.componentType,5126);const start=binStart+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||size*4);return Array.from({length:size},(_,j)=>bytes.readFloatLE(start+j*4));}
function indexAt(index,i){const a=model.accessors[index],v=model.bufferViews[a.bufferView],width={5121:1,5123:2,5125:4}[a.componentType],start=binStart+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||width);return width===1?bytes.readUInt8(start):width===2?bytes.readUInt16LE(start):bytes.readUInt32LE(start);}
function add(n,world,bayId=null){for(const p of model.meshes[n.mesh].primitives){const a=model.accessors[p.attributes.POSITION],box=new Box3(new Vector3(...a.min),new Vector3(...a.max));const size=box.getSize(new Vector3()),triangles=[];
if(/^(Flush_ramp_deck_|Deck_supported_rail_)/.test(n.name||'')){const count=p.indices===undefined?a.count:model.accessors[p.indices].count;for(let i=0;i<count;i+=3){const points=[0,1,2].map(k=>new Vector3(...attribute(p.attributes.POSITION,p.indices===undefined?i+k:indexAt(p.indices,i+k))).applyMatrix4(world));triangles.push(new Triangle(...points));}}
obstacles.push({triangles,label:n.name||'mesh',bayId,bollard:!!bayId&&size.y>.5&&size.x<1,obb:new OBB().fromBox3(box).applyMatrix4(world),bounds:box.clone().applyMatrix4(world)});}}
function walk(index,parent,excluded=false){const n=model.nodes[index];let local=matrix(n);if(['ENTRY-01','EXIT-01'].includes(n.name))local=new Matrix4().makeTranslation(...new Vector3().setFromMatrixPosition(local).toArray()).multiply(new Matrix4().makeRotationX(-Math.PI/2));const world=parent.clone().multiply(local);excluded=excluded||n.name==='Selected_tenant_car';if(!excluded&&n.mesh!==undefined){const ext=n.extensions?.EXT_mesh_gpu_instancing;if(ext){const a=ext.attributes;for(const key of ['TRANSLATION','ROTATION','SCALE'])assert.ok(Number.isInteger(a[key]),'Instanced transform accessor must exist');for(let i=0;i<model.accessors[a.TRANSLATION].count;i++){const inst=new Matrix4().compose(new Vector3(...attribute(a.TRANSLATION,i)),new Quaternion(...attribute(a.ROTATION,i)),new Vector3(...attribute(a.SCALE,i)));add(n,world.clone().multiply(inst),n.extras?.bays?.[i]||null);}}else add(n,world);}for(const c of n.children||[])walk(c,world,excluded);}
for(const root of model.scenes[model.scene||0].nodes)walk(root,new Matrix4());
const body=new Box3(new Vector3(-1.0,.28,-2.1),new Vector3(1.0,1.53,2.1));let samples=0;
const auditedBays=Array.from({length:10},(_,level)=>[1,25,26,50].map(local=>'B-'+String(level*50+local).padStart(4,'0'))).flat();
for(const id of auditedBays){
 const routes=routesForScaleBay({baysPerSite:500,levels:10},id);
 for(const key of ['approach','crossing','drive','park','reverse','departure','exitCross','outside']){
  for(let distance=0;distance<=pathLength(routes[key]);distance+=.3){const p=sampleScaleVehiclePath(routes[key],distance),world=new Matrix4().makeRotationFromEuler(new Euler(p.pitch||0,p.yaw+(key==='reverse'?Math.PI:0),0,'YXZ')).setPosition(p.x,(p.y||0)+CAR_RIDE_HEIGHT,p.z),obb=new OBB().fromBox3(body).applyMatrix4(world),bounds=body.clone().applyMatrix4(world);samples++;
   for(const o of obstacles){if(o.bollard&&o.bayId===id)continue; // That journey's own bollard must be DOWN before this route is permitted.
    if(bounds.intersectsBox(o.bounds)&&obb.intersectsOBB(o.obb)&&(!o.triangles.length||intersectsMeshTriangles(obb,o.triangles))){failures.push({bayId:id,route:key,distance:Number(distance.toFixed(2)),obstacle:o.label,obstacleBay:o.bayId,centre:o.bounds.getCenter(new Vector3()).toArray()});break;}}
  }
 }
}
const pads=new Map(obstacles.filter(o=>o.bayId&&!o.bollard).map(o=>[o.bayId,o]));
const floatingLocks=obstacles.filter(o=>o.bollard&&pads.has(o.bayId)).map(o=>({bayId:o.bayId,gap:o.bounds.min.y-pads.get(o.bayId).bounds.max.y})).filter(o=>Math.abs(o.gap)>.003);
const result={floatingLocks,auditedBays,passed:failures.length===0&&floatingLocks.length===0,samples,exportedPrimitives:obstacles.length,selectedGateArms:'audited raised',assumptions:'Assigned bollard lowered; other exported bay locks unchanged. Car body only; not a physical safety or multi-vehicle collision certification.',failures};writeFileSync(new URL('../artifacts/scale-live/clearance-results.json',import.meta.url),JSON.stringify(result,null,2));assert.equal(floatingLocks.length,0,'Bay barriers must sit on their bay surface, first mismatches: '+JSON.stringify(floatingLocks.slice(0,3)));assert.equal(failures.length,0,'Guided car body clips the exported model; first mismatches: '+JSON.stringify(failures.slice(0,3)));console.log(`PASS: ${samples} car-body samples against ${obstacles.length} exported primitives across both rows and both aisle ends on every level.`);
