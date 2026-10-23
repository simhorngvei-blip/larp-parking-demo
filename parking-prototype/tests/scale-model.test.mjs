import test from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3} from 'three';
import {createTenantBodyGeometry,createRampDeckGeometry} from '../src/scale/model-geometry.ts';
test('the chassis leaves space around both tyres on both sides while retaining door panels',()=>{
 const g=createTenantBodyGeometry(),material=new MeshBasicMaterial({side:DoubleSide}),body=new Mesh(g,material);body.updateMatrixWorld(true);
 for(const side of [-1,1])for(const axle of [-1.28,1.28])for(let i=0;i<=24;i++){
  const t=Math.PI*i/24,y=.34+.34*Math.sin(t),z=axle+.34*Math.cos(t),ray=new Raycaster(new Vector3(side*3,y,z),new Vector3(-side,0,0));
  assert.equal(ray.intersectObject(body).length,0,'The tyre tread must not pass through the chassis');
 }
 assert.ok(new Raycaster(new Vector3(3,.6,0),new Vector3(-1,0,0)).intersectObject(body).length>0,'The body between wheel arches must remain solid');g.dispose();material.dispose();
});

test('ascending and descending ramp end faces meet floor planes without protruding across the join',()=>{
 for(const rise of [-4,4]){
  const geometry=createRampDeckGeometry(5,28,rise,.18),mat=new MeshBasicMaterial({side:DoubleSide}),deck=new Mesh(geometry,mat);deck.updateMatrixWorld(true);
  assert.equal(geometry.boundingBox.min.z,-14);assert.equal(geometry.boundingBox.max.z,14);
  for(const z of [-13.999,0,13.999]){const hit=new Raycaster(new Vector3(0,10,z),new Vector3(0,-1,0)).intersectObject(deck)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y+rise*z/28)<.00001,'The road top must meet its specified slope and floor heights');}
  geometry.dispose();mat.dispose();
 }
});
