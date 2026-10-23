import * as T from 'three'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import type {Snapshot} from '../types'
import type {Pose} from './journey'

import {BAY_LAYOUT,bayLayout,GATES,RAMPS,LANDINGS,PORTAL} from './layout'
export {BAY_LAYOUT} from './layout'
export type CameraPreset='Overview'|'Entrance'|'My bay'|'Exit'|'Follow car'
const C={white:0xf0eee3,concrete:0xcbd1c7,green:0x176452,asphalt:0x465853,glass:0x729d9a,grass:0x9caf91,copper:0xe6a176,red:0xc66150,ink:0x263f39}

export class ParkingScene{
 readonly scene=new T.Scene();readonly camera=new T.PerspectiveCamera(42,1,.1,220);readonly renderer:T.WebGLRenderer;readonly controls:OrbitControls
 readonly car=new T.Group();readonly upper=new T.Group()
 private levels:T.Group[]=[];private externals:{level:number;group:T.Group}[]=[];private highlights=new Map<string,T.Mesh>();private manualCamera=false;private cutaway=true;private selectedBay='R-102';private plateText='';private plateMesh:T.Mesh|null=null
 private bays=new Map<string,{pivot:T.Group;led:T.Mesh;car:T.Group}>();private gates:Record<string,T.Group>={};private wheelMeshes:T.Object3D[]=[]
 private geometries=new Map<string,T.BufferGeometry>();private materials=new Map<string,T.MeshStandardMaterial>();private textures:T.Texture[]=[]
 private snapshot:Snapshot|null=null;private pose:Pose={x:-24,z:.5,yaw:Math.PI/2};private frame=0;private lastTime=0;private disposed=false;private connectionFresh=true;private resizeObserver:ResizeObserver
 private preset:CameraPreset='Overview';private cameraGoal:T.Vector3|null=null;private targetGoal=new T.Vector3(0,1,0);private animated=false
 onFrame:(dt:number)=>void=()=>{};onReady:()=>void=()=>{}
 constructor(private host:HTMLElement){
  this.scene.background=new T.Color(0xe5ede8);this.scene.fog=new T.Fog(0xe5ede8,85,190)
  this.renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.3
  this.renderer.domElement.setAttribute('aria-label','Interactive 3D parking building');this.renderer.domElement.setAttribute('role','img');this.host.appendChild(this.renderer.domElement)
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.08;this.controls.maxPolarAngle=Math.PI*.47;this.controls.minDistance=6;this.controls.maxDistance=150;this.controls.target.set(0,4,0);this.controls.addEventListener('start',()=>{this.cameraGoal=null;this.manualCamera=true;this.preset='Overview'})
  this.scene.add(new T.HemisphereLight(0xeaf8f5,0x8a9b7e,2));const sun=new T.DirectionalLight(0xffedd0,3.1);sun.position.set(-22,38,26);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-42,right:42,top:36,bottom:-36,near:1,far:100});sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;this.scene.add(sun)
  this.build();this.camera.position.set(42,36,46);this.controls.update();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();this.setCamera('Overview');if(this.cameraGoal){this.camera.position.copy(this.cameraGoal);this.controls.target.copy(this.targetGoal);this.controls.update()}
  this.renderer.setAnimationLoop(t=>this.animate(t))
 }
 private material(color:number,roughness=.8,metalness=0){const key=`${color}/${roughness}/${metalness}`;if(!this.materials.has(key))this.materials.set(key,new T.MeshStandardMaterial({color,roughness,metalness}));return this.materials.get(key)!}
 private geo(w:number,h:number,d:number){const key=`${w}/${h}/${d}`;if(!this.geometries.has(key))this.geometries.set(key,new T.BoxGeometry(w,h,d));return this.geometries.get(key)!}
 private box(parent:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,color:number,shadow=true){const m=new T.Mesh(this.geo(w,h,d),this.material(color));m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m}
 private roundedBox(parent:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,color:number,radius=.08){const key=`rounded/${w}/${h}/${d}/${radius}`;if(!this.geometries.has(key))this.geometries.set(key,new RoundedBoxGeometry(w,h,d,2,radius));const mesh=new T.Mesh(this.geometries.get(key),this.material(color,.4,.18));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh}
 private cylinder(parent:T.Object3D,r:number,h:number,x:number,y:number,z:number,color:number){const g=new T.CylinderGeometry(r,r,h,12);const m=new T.Mesh(g,this.material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
 private sign(text:string,w:number,h:number,color='#164d3e',ink='#ffffff'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,512,128);ctx.fillStyle=ink;ctx.font='bold 45px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,67,490);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;this.textures.push(texture);const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,side:T.FrontSide}));const reverse=new T.Mesh(mesh.geometry,mesh.material);reverse.rotation.y=Math.PI;reverse.position.z=-.003;reverse.name='Readable_reverse_face';mesh.add(reverse);return mesh
 }
 private floorSign(text:string,x:number,z:number,color='#255d4c',width=2.6,y=0,parent:T.Object3D=this.scene){const mesh=this.sign(text,width,.65,color);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y+.022,z);parent.add(mesh)}
 private build(){
  const s=this.scene
  this.box(s,88,.6,66,0,-.65,0,0xd8e2d6);this.box(s,82,.15,54,0,-.28,0,C.grass)
  // Separate road sections avoid coplanar faces beneath the podium.
  this.box(s,24,.12,5.2,-27,-.06,GATES.entry.z,C.asphalt);this.box(s,24,.12,10,27,-.06,-1.5,C.asphalt)
  for(const [x,z]of [[-27,GATES.entry.z],[31,GATES.exit.z]])for(let i=0;i<4;i++)this.box(s,1.1,.008,.08,x-4+i*2.8,.012,z,0xd8e4d5,false)
  for(const z of [11.4,-10.7])this.box(s,22,.18,2.1,-6,-.03,z,0xe8e4d3)
  for(let x=-13;x<14;x+=2.5)this.box(s,.75,.008,.08,x,.012,.5,0xb7c8b8,false)
  // Every road surface has top Y = its deck height.
  for(let level=0;level<3;level++){
   const group=new T.Group();group.name='Parking_level_'+level;s.add(group);this.levels.push(group);const y=level*4
   this.box(group,30,.24,19,0,y-.16,0,C.concrete).name='Deck_structure_'+level
   this.box(group,30,.04,19,0,y-.02,0,C.asphalt).name='Deck_surface_'+level
   for(const x of [-14,6,14])for(const z of [-8.8,8.8])this.box(group,.4,3.76,.4,x,y+1.88,z,C.white)
   // Leave two real openings for the north/south access bridges.
   for(const z of [-9.35,9.35])for(const [left,right]of [[-15,PORTAL.x-PORTAL.halfWidth],[PORTAL.x+PORTAL.halfWidth,15]]){
    const width=right-left,x=(left+right)/2
    this.box(group,width,.42,.13,x,y+.3,z,0xb8c5b9);this.box(group,width,.07,.18,x,y+.59,z,C.white)
   }
   if(level)for(const x of [-14.85,14.85]){this.box(group,.12,.42,18.7,x,y+.3,0,0xb8c5b9);this.box(group,.18,.07,18.7,x,y+.59,0,C.white)}
   this.floorSign(level?'LEVEL '+level:'GROUND',4.5,4,'#365c50',4,y,group)
   const wayfinding=this.sign(level?'L'+level:'G',1.2,.8);wayfinding.position.set(13.5,y+1.7,8.88);group.add(wayfinding)
  }
  for(const b of BAY_LAYOUT){
   const group=this.levels[b.level],y=b.y
   const highlight=this.box(group,2.87,.006,5.65,b.x,y+.004,b.z,0x647c62,false);highlight.visible=b.id===this.selectedBay;this.highlights.set(b.id,highlight)
   for(const side of [-1,1])this.box(group,.055,.008,5.8,b.x+side*1.48,y+.012,b.z,0xdce5d8,false)
   this.box(group,3.02,.008,.055,b.x,y+.012,-8.45,0xdce5d8,false)
   this.floorSign(b.id,b.x,-3.7,'#365c50',2.6,y,group)
   const root=new T.Group();root.name='Bay_'+b.id.replace('-','');root.position.set(b.x,y,-2.7);group.add(root)
   this.roundedBox(root,1.7,.12,.42,0,.06,0,0x344b43,.035).name='Bollard_base_'+b.id
   const pivot=new T.Group();pivot.position.y=.1;root.add(pivot)
   this.cylinder(pivot,.065,.78,-.64,.39,0,C.red);this.cylinder(pivot,.065,.78,.64,.39,0,C.red);const cross=this.cylinder(pivot,.065,1.28,0,.78,0,C.red);cross.rotation.z=Math.PI/2
   for(const x of [-.35,.35])this.box(pivot,.19,.12,.14,x,.78,0,0xf5eee0)
   const led=this.box(root,.15,.04,.12,.65,.13,.12,0xd58154,false);led.material=new T.MeshStandardMaterial({color:0xd58154,emissive:0xd58154,emissiveIntensity:.5})
   const parked=this.makeCar(b.id.startsWith('R')?0x768d8d:0xb7aa91);parked.position.set(b.x,y,b.z);parked.rotation.y=Math.PI;parked.visible=false;group.add(parked);this.bays.set(b.id,{pivot,led,car:parked})
  }
  // Ramps are independent of cutaway decks so the driven road stays visible.
  for(const r of RAMPS){
   const rotation=r.toZ<r.fromZ?Math.atan2(4,14):-Math.atan2(4,14)
   const length=Math.hypot(14,4),y=(r.fromY+r.toY)/2,group=new T.Group();group.name='Ramp_zone_'+r.level;s.add(group);this.externals.push({level:r.level,group})
   const ramp=this.box(group,4.2,.16,length,r.x,y-.08*Math.cos(rotation),-.08*Math.sin(rotation),C.asphalt);ramp.rotation.x=rotation;ramp.name='Ramp_'+(r.level-1)+'_'+r.level
   for(const side of [-1,1]){
    const rail=this.box(group,.12,.6,length,r.x+side*2.16,y+.38*Math.cos(rotation),.38*Math.sin(rotation),C.white);rail.rotation.x=rotation
    const stripe=this.box(group,.055,.008,length,r.x+side*1.9,y+.012*Math.cos(rotation),.012*Math.sin(rotation),0xdce5d8,false);stripe.rotation.x=rotation
   }
   for(const z of [-5.5,5.5])for(const side of [-1,1]){const h=r.fromY+(z-r.fromZ)/(r.toZ-r.fromZ)*4-.14;if(h>0)this.box(group,.28,h,.28,r.x+side*1.98,h/2,z,C.concrete)}
  }
  // Flat pads lie wholly past the ramp ends; their pieces do not overlap decks.
  for(const l of LANDINGS){
   const group=new T.Group();group.name='Landing_zone_'+l.level;s.add(group);this.externals.push({level:l.level,group});const y=l.level*4,side=Math.sign(l.z),minX=l.x-l.width/2,maxX=l.x+l.width/2
   const pieces=[{x:l.x,z:side*12.25,width:l.width,depth:5.5},{x:(15+maxX)/2,z:side*8.25,width:maxX-15,depth:2.5}]
   for(const [i,p]of pieces.entries()){
    this.box(group,p.width,.24,p.depth,p.x,y-.16,p.z,C.concrete).name='Landing_structure_'+l.level+'_'+i
    this.box(group,p.width,.04,p.depth,p.x,y-.02,p.z,C.asphalt).name='Landing_surface_'+l.level+'_'+i
   }
   // Guard only the outside perimeter; ramp mouths and deck portals stay open.
   this.box(group,l.width,.55,.12,l.x,y+.35,side*15,0xb8c5b9)
   this.box(group,.12,.55,8,maxX,y+.35,l.z,0xb8c5b9)
   this.box(group,.12,.55,5.5,minX,y+.35,side*12.25,0xb8c5b9)
   if(l.level)for(const x of [minX+.7,maxX-.7])this.box(group,.4,y-.2,.4,x,(y-.2)/2,side*14.3,C.concrete)
   this.floorSign(l.level===2?'L2 PARKING':l.level===1?'L1 / L2':'UP TO L1',l.level===2?18:14,l.z,'#365c50',3.1,y,group)
  }
  this.upper.name='Architectural_roof';this.box(this.upper,30,.22,19,0,12,0,C.white);s.add(this.upper);this.upper.visible=false
  // Residential tower behind the parking podium.
  this.box(s,12,23,6.4,6,11.5,-22,C.white);this.box(s,12.5,.45,7,6,23.2,-22,0xc6cfc3)
  for(let floor=0;floor<7;floor++){
   const y=1.7+floor*3.1;this.box(s,12.35,.16,6.65,6,y-1.1,-22,0xbbbfb2)
   for(let col=0;col<5;col++){const x=1.4+col*2.3;this.box(s,1.6,1.75,.08,x,y,-18.74,(floor+col)%4===0?0xb9bc99:0x718e87,false);this.box(s,1.6,.08,.1,x,y-.2,-18.66,0xd4d7c8,false)}
   for(let side=0;side<2;side++)for(let col=0;col<2;col++)this.box(s,.08,1.75,1.7,side===0?-.05:12.05,y,-20.4-col*3.1,0x718e87,false)
  }
  const towerSign=this.sign('CONCORDIA',8,1.35);towerSign.position.set(6,21.1,-18.68);s.add(towerSign)
  this.box(s,5.5,2.8,5,-5.5,1.4,-14.5,0xb7c6b9);for(let x=-7.4;x<-3;x+=1.4)this.box(s,.9,1.5,.1,x,1.6,-11.95,C.glass,false)
  this.gates.entry=this.makeGate(GATES.entry.x,GATES.entry.z,C.green);this.gates.exit=this.makeGate(GATES.exit.x,GATES.exit.z,0xc38658)
  for(const [text,x,z]of [['ENTRY',GATES.entry.x,GATES.entry.z],['EXIT',GATES.exit.x,GATES.exit.z]] as const){const sign=this.sign(text,2.6,.65);sign.position.set(x-2,2.5,z-2.9);sign.rotation.y=Math.PI/2;sign.name=text+'_wayfinding';s.add(sign);this.cylinder(s,.055,2.2,x-2,1.1,z-2.9,C.ink);this.box(s,.6,.24,.6,x-2,-.12,z-2.9,C.concrete)}
  // Guardhouse and plate-recognition stand-in.
  this.box(s,3,2.7,3,-18.5,1.35,5.7,C.white);this.box(s,3.3,.2,3.3,-18.5,2.8,5.7,C.green);this.box(s,2.2,1.25,.08,-18.5,1.75,7.24,C.glass);this.box(s,.08,1.25,1.8,-16.96,1.75,5.7,C.glass)
  const security=this.sign('SECURITY',2.2,.5);security.position.set(-18.5,2.55,7.28);s.add(security)
  this.cylinder(s,.08,1.8,-20.1,.9,-2.4,0x42574d);this.box(s,.3,.23,.36,-20.1,1.85,-2.35,0x243c34)
  for(const gate of Object.values(GATES))for(const z of [gate.z-2.9,gate.z+2.85])this.cylinder(s,.13,.9,gate.x-1.1,.45,z,0xc8b387)
  for(const x of [-33,-24,31,38])for(const z of [-21,21])this.tree(x,z,1+(Math.abs(x)%3)*.15)
  for(const x of [-22,23]){this.cylinder(s,.065,4.6,x,2.3,8.5,0x506459);this.box(s,1.05,.1,.35,x+.4,4.6,8.5,0xd8e3cf)}
  for(let i=0;i<4;i++)this.box(s,1.6,.08,.22,-12+i*.5,.12,13.8,0xbeb6a0)
  this.car.name='Tenant_car';this.car.rotation.order='YXZ';this.populateTenant(this.car);s.add(this.car)
 }
 private populateTenant(group:T.Group){const car=this.makeCar(C.copper,true);group.add(car);return group}
 private makeCar(color:number,tenant=false){
  const car=new T.Group();this.roundedBox(car,1.68,.57,3.6,0,.72,0,color,.15);this.roundedBox(car,1.55,.18,3.35,0,1.04,0,color,.07)
  this.roundedBox(car,1.35,.65,1.75,0,1.32,-.16,0x263f42,.14);this.roundedBox(car,1.4,.12,1.72,0,1.68,-.16,color,.055)
  const frontGlass=this.box(car,1.25,.49,.04,0,1.33,.74,0x89b0b1);frontGlass.rotation.x=.18
  this.box(car,1.25,.42,.05,0,1.33,-1.05,0x6b999b)
  for(const side of [-1,1]){this.box(car,.035,.4,1.48,.69*side,1.34,-.17,0x668e90);this.box(car,.12,.22,.28,.9*side,1.1,.55,color);for(const z of [-1.1,1.1]){const wheel=this.cylinder(car,.36,.23,.82*side,.36,z,0x26322e);wheel.rotation.z=Math.PI/2;this.cylinder(wheel,.18,.25,0,0,0,0xabb8ae);if(tenant)this.wheelMeshes.push(wheel)}}
  for(const x of [-.59,.59]){this.box(car,.4,.16,.06,x,.88,1.82,0xf5edc9);this.box(car,.38,.14,.06,x,.88,-1.82,0xbd5144)}
  this.box(car,1.22,.15,.06,0,.52,1.82,0x3d4c44);this.box(car,1.22,.15,.06,0,.52,-1.82,0x3d4c44)
  if(tenant){const plate=this.sign('VAB 8899',.75,.2,'#273d34');plate.position.set(0,.7,1.86);car.add(plate);const back=plate.clone();back.position.set(0,.7,-1.86);back.rotation.y=Math.PI;car.add(back);this.plateMesh=plate}
  return car
 }
 private makeGate(x:number,z:number,color:number){const root=new T.Group();root.name=x<0?'Entrance_barrier':'Exit_barrier';root.position.set(x,0,z-2.3);this.scene.add(root);this.box(root,.55,1.65,.55,0,.825,0,color);const pivot=new T.Group();pivot.position.y=1.5;root.add(pivot);this.box(pivot,.14,.15,4.65,0,0,2.18,0xf4eee2);for(let z=.35;z<4.4;z+=.6)this.box(pivot,.155,.16,.28,0,0,z,0xcd6958);this.cylinder(root,.08,.1,0,1.73,0,0x8dbf88);return pivot}
 private tree(x:number,z:number,scale:number){this.box(this.scene,3.5,.3,3.5,x,.05,z,0xb5c0a1);this.cylinder(this.scene,.17,2.1*scale,x,1*scale,z,0x8d8466);for(let i=0;i<3;i++){const crown=new T.Mesh(new T.IcosahedronGeometry((1.15-i*.15)*scale,1),this.material(i===1?0x839b78:0x6d896a));crown.position.set(x+(i-1)*.35,2.1*scale+i*.48,z+(i%2)*.25);crown.castShadow=true;this.scene.add(crown)}}
 setTelemetry(snapshot:Snapshot|null){this.snapshot=snapshot;const config=snapshot?.wokwi.configuration;if(config){const changed=this.selectedBay!==config.bayId;this.selectedBay=config.bayId;if(changed&&this.preset==='My bay')this.setCamera('My bay');if(config.plate!==this.plateText&&this.plateMesh){this.plateText=config.plate;const canvas=(this.plateMesh.material as T.MeshBasicMaterial).map?.image as HTMLCanvasElement;const ctx=canvas?.getContext('2d');if(ctx){ctx.fillStyle='#273d34';ctx.fillRect(0,0,512,128);ctx.fillStyle='#fff';ctx.font='bold 45px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(config.plate,256,67,490);(this.plateMesh.material as T.MeshBasicMaterial).map!.needsUpdate=true}}}for(const [id,mesh]of this.highlights)mesh.visible=id===this.selectedBay;this.setCutaway(this.cutaway)}
 setConnectionFresh(value:boolean){this.connectionFresh=value}
 setPose(pose:Pose){this.pose=pose}
 setCutaway(value:boolean){this.cutaway=value;this.upper.visible=!value;const level=bayLayout(this.selectedBay).level;this.levels.forEach((group,index)=>{group.visible=!value||index<=level});for(const item of this.externals)item.group.visible=!value||item.level<=level}
 setCamera(preset:CameraPreset){
  this.preset=preset;this.manualCamera=false;const bay=bayLayout(this.selectedBay)
  if(preset==='Overview'){
   this.targetGoal.set(3,7,-2);const halfFov=T.MathUtils.degToRad(this.camera.fov/2),distance=32/Math.sin(Math.min(halfFov,Math.atan(Math.tan(halfFov)*this.camera.aspect)))
   this.cameraGoal=new T.Vector3(.68,.57,.72).normalize().multiplyScalar(distance*1.08).add(this.targetGoal)
  }else{const goals:Record<string,number[]>={Entrance:[-29,8,13],'My bay':[bay.x-8,bay.y+7.5,bay.z+11],Exit:[36,8,9]};if(goals[preset]){this.cameraGoal=new T.Vector3(...goals[preset] as [number,number,number]);this.targetGoal.set(preset==='Entrance'?GATES.entry.x:preset==='Exit'?GATES.exit.x:bay.x,preset==='My bay'?bay.y+.8:1,preset==='My bay'?bay.z:preset==='Exit'?GATES.exit.z:GATES.entry.z)}}
 }
 private resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);if(this.preset==='Overview'&&!this.manualCamera)this.setCamera('Overview')}
 private animate(time:number){
  if(this.disposed||time-this.lastTime<32)return;const dt=Math.min(.1,(time-this.lastTime)/1000||.016);this.lastTime=time;this.onFrame(dt)
  const distance=Math.hypot(this.pose.x-this.car.position.x,this.pose.z-this.car.position.z);for(const wheel of this.wheelMeshes)wheel.rotateY(distance*(this.pose.reverse?-1:1)/.36)
  this.car.position.set(this.pose.x,this.pose.y||0,this.pose.z);const delta=Math.atan2(Math.sin(this.pose.yaw-this.car.rotation.y),Math.cos(this.pose.yaw-this.car.rotation.y));this.car.rotation.y+=delta*Math.min(1,dt*9);this.car.rotation.x=this.pose.pitch||0
  const t=this.snapshot?.wokwi.telemetry,connected=this.snapshot?.wokwi.connected&&this.connectionFresh
  for(const b of this.snapshot?.bays||[]){const model=this.bays.get(b.id);if(!model)continue;const target=b.position==='UP'?0:b.position==='DOWN'?-Math.PI/2:b.position.startsWith('MOVING')?-Math.PI/4:null;if(target!==null)model.pivot.rotation.x=T.MathUtils.damp(model.pivot.rotation.x,target,6,dt)
   const color=!connected||b.health!=='HEALTHY'?0xc49352:b.position==='DOWN'?0x6cae7a:0xc66d5c;const m=model.led.material as T.MeshStandardMaterial;m.color.setHex(color);m.emissive.setHex(color);model.car.visible=b.id!==this.selectedBay&&['PRESENT','DETECTING'].includes(b.occupancy)
  }
  for(const [name,gate]of Object.entries(this.gates)){const value=name==='entry'?t?.entry:t?.exit;const angle=value==='OPEN'?-Math.PI/2:value==='CLOSED'?0:value==='OPENING'||value==='CLOSING'?-Math.PI/4:null;if(angle!==null)gate.rotation.x=T.MathUtils.damp(gate.rotation.x,angle,8,dt)}
  if(this.preset==='Follow car'){const behind=new T.Vector3(-Math.sin(this.pose.yaw)*6,2.6,-Math.cos(this.pose.yaw)*6);behind.add(this.car.position);this.camera.position.lerp(behind,.06);this.controls.target.lerp(this.car.position.clone().add(new T.Vector3(0,.95,0)),.08)}
  else if(this.cameraGoal){this.camera.position.lerp(this.cameraGoal,.065);this.controls.target.lerp(this.targetGoal,.065);if(this.camera.position.distanceTo(this.cameraGoal)<.07)this.cameraGoal=null}
  this.controls.update();this.renderer.render(this.scene,this.camera);this.frame++
  if(!this.animated){this.animated=true;this.onReady()}
 }
 capture(){return this.renderer.domElement.toDataURL('image/png')}
 async exportModel(){const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');return await new GLTFExporter().parseAsync(this.scene,{binary:true,onlyVisible:true}) as ArrayBuffer}
 dispose(){this.disposed=true;this.renderer.setAnimationLoop(null);this.resizeObserver.disconnect();this.controls.dispose();const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();this.scene.traverse(obj=>{if(obj instanceof T.Mesh){geometries.add(obj.geometry);for(const material of Array.isArray(obj.material)?obj.material:[obj.material])materials.add(material)}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of this.textures)t.dispose();this.renderer.dispose();this.renderer.domElement.remove()}
}
