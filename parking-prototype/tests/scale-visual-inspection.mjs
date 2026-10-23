import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url)),{chromium}=require('playwright');
const out=new URL('../artifacts/scale-inspection/',import.meta.url);await mkdir(out,{recursive:true});
const root=fileURLToPath(new URL('../',import.meta.url)),vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5201','--strictPort'],{cwd:root,stdio:'pipe'});let viteLog='';vite.stdout.on('data',d=>viteLog+=d);vite.stderr.on('data',d=>viteLog+=d);
let browser;

try{
 for(let n=0;n<80;n++){try{if((await fetch('http://127.0.0.1:5201')).ok)break;}catch{}if(n===79)throw Error(viteLog);await new Promise(r=>setTimeout(r,150));}
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1400,height:900}});
 await page.route('**/inspection',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><div id="host" style="width:100vw;height:100vh"></div></body></html>'}));await page.goto('http://127.0.0.1:5201/inspection');
 await page.evaluate(async()=>{
  const {ScaleLiveScene}=await import('/src/scale/live-scene.ts'),r=await import('/src/scale/route.ts'),T=await import('/node_modules/three/build/three.module.js');
  const config={baysPerSite:500,levels:10},scene=new ScaleLiveScene(document.querySelector('#host'),config,'B-0500',()=>{});scene.setSelection('B-0500','GEOMETRY');window.inspection={scene,r,T,config};
 });
 const checks=await page.evaluate(async()=>{
  const {scene:s,r,T,config}=window.inspection,bay=r.scaleBayLayout(config,'B-0500');
  s.setPose({x:bay.x,y:bay.y,z:bay.z,yaw:0},'parked');s.setCutaway(true);s.setCamera('My bay',true);s.controls.dispatchEvent({type:'start'});s.camera.position.set(bay.x+5,bay.y+1.3,bay.z+3);s.controls.target.set(bay.x,bay.y+.7,bay.z);s.controls.update();s.scene.updateMatrixWorld(true);
  const body=s.car.children.find(o=>o.isMesh),localRay=new T.Raycaster(new T.Vector3(3,.6,1.28),new T.Vector3(-1,0,0));const bodyInverse=s.car.matrixWorld.clone().invert();const probe=localRay.ray.clone().applyMatrix4(s.car.matrixWorld);const archRay=new T.Raycaster(probe.origin,probe.direction);
  const wheelArchClear=archRay.intersectObject(body).length===0;
  const centre=new T.Vector3(.88,.34,1.28).applyMatrix4(s.car.matrixWorld),down=new T.Raycaster(centre,new T.Vector3(0,-1,0));const hits=down.intersectObject(s.levels[9].pads);const wheelContactError=hits.length?hits[0].distance-.34:null;
  const sign=s.sign('TEST',2,1);sign.updateMatrixWorld(true);const frontSign=new T.Raycaster(new T.Vector3(.5,0,2),new T.Vector3(0,0,-1)).intersectObject(sign,true)[0],backSign=new T.Raycaster(new T.Vector3(-.5,0,-2),new T.Vector3(0,0,1)).intersectObject(sign,true)[0];
  const signReadableBothSides=frontSign?.uv?.x>.5&&backSign?.uv?.x>.5;
  return {wheelArchClear,wheelContactError,signReadableBothSides};
 });await page.waitForTimeout(500);await page.screenshot({path:fileURLToPath(new URL('wheel-detail.png',out))});
 const cutaway=await page.evaluate(()=>{const {scene:s,r,config}=window.inspection,l=r.scaleBuildingLayout(config);s.setPose({x:l.rampX[0],y:.04,z:13.72,yaw:Math.PI,pitch:Math.atan(4/28)},'drive');s.setCutaway(true);s.setCamera('Follow car');return {activeRampVisible:s.rampGroups[0].group.visible};});await page.waitForTimeout(700);await page.screenshot({path:fileURLToPath(new URL('ramp-start.png',out))});
 const road=await page.evaluate(()=>{const {scene:s,r,config,T}=window.inspection,l=r.scaleBuildingLayout(config),x=l.exit.x-23; s.setPose({x,y:0,z:27,yaw:-Math.PI/2},'complete');s.setCutaway(true);s.setCamera('Exit',true);s.controls.dispatchEvent({type:'start'});s.camera.position.set(x-8,7,36);s.controls.target.set(x,0,27);s.controls.update();const ray=new T.Raycaster(new T.Vector3(x-2.1,2,27),new T.Vector3(0,-1,0));s.scene.updateMatrixWorld(true);return {departureRoadSupported:ray.intersectObjects(s.scene.children,true).some(h=>h.object.material?.map&&h.point.y>-.15)};});await page.waitForTimeout(500);await page.screenshot({path:fileURLToPath(new URL('exit-road.png',out))});
 const rampJoins=await page.evaluate(()=>{const {scene:s,T}=window.inspection,g=s.rampGroups[0].group,deck=g.children[0];s.scene.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(deck),hit=new T.Raycaster(new T.Vector3(58,10,13.99999),new T.Vector3(0,-1,0)).intersectObject(deck)[0];const rails=g.children.slice(1,3).map(o=>new T.Box3().setFromObject(o));return {rampEndFacesFlush:bounds.min.z>=-14.00001&&bounds.max.z<=14.00001,rampJoinHeightError:hit?hit.point.y-(14-13.99999)/7:null,railsSupportedByDeck:rails.every(b=>b.min.x>=55.49999&&b.max.x<=60.50001)};});
 await page.evaluate(()=>{const {scene:s}=window.inspection;s.setPose({x:50,y:0,z:0,yaw:0},'drive');s.setCutaway(true);s.setCamera('Follow car');s.controls.dispatchEvent({type:'start'});s.camera.position.set(63,1.3,18);s.controls.target.set(58,.5,14);s.controls.update();});await page.waitForTimeout(400);await page.screenshot({path:fileURLToPath(new URL('ramp-floor-join.png',out))});
 const result={...checks,...cutaway,...road,...rampJoins};await writeFile(new URL('results.json',out),JSON.stringify(result,null,2));console.log(result);
 assert.equal(result.rampEndFacesFlush,true,'Ramp geometry must stop exactly at its vertical floor join');assert.ok(Math.abs(result.rampJoinHeightError)<.00001,'Ramp top must meet the landing height without a step');assert.equal(result.railsSupportedByDeck,true,'Ramp side rails must stand on the deck instead of floating beside it');assert.equal(result.wheelArchClear,true,'The car body must leave an actual opening around the tyres');assert.ok(Math.abs(result.wheelContactError)<.006,'Tyres must contact the bay surface rather than sink or float');assert.equal(result.activeRampVisible,true,'Cutaway must preserve the ramp under the car at the start of a climb');assert.equal(result.departureRoadSupported,true,'The departing car must remain on the paved road');assert.equal(result.signReadableBothSides,true,'Signs need readable front and back faces rather than mirrored back-face text');
}finally{await browser?.close();vite.kill();}
