import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3,Triangle} from 'three';
import {OBB} from 'three/addons/math/OBB.js';
import {createRampDeckGeometry} from '../src/scale/model-geometry.ts';
import {intersectsMeshTriangles} from './helpers/mesh-collision.mjs';
function ramp(){const g=createRampDeckGeometry(5,28,4,.18),p=g.getAttribute('position'),triangles=[];for(let i=0;i<g.index.count;i+=3){const points=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,g.index.getX(i+k)).add(new Vector3(0,2,0)));triangles.push(new Triangle(...points));}g.dispose();return triangles;}
test('a body above the low end of a ramp is clear even inside its overall bounding box',()=>{
 const body=new OBB(new Vector3(0,1,13),new Vector3(.5,.2,.5));assert.equal(intersectsMeshTriangles(body,ramp()),false);
});
test('a body intersecting the actual sloped ramp surface is detected',()=>{
 const body=new OBB(new Vector3(0,.14,13),new Vector3(.5,.2,.5));assert.equal(intersectsMeshTriangles(body,ramp()),true);
});
