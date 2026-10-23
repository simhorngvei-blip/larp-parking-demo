import * as T from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import type {ScaleState} from '../ScaleDemo'
import {fitLevelCamera} from './layout'

export class ScaleBuilding {
 private scene=new T.Scene();private camera=new T.PerspectiveCamera(42,1,.1,2500);private renderer=new T.WebGLRenderer({antialias:true});private controls:OrbitControls;private resize:ResizeObserver;private objects=new Map<string,{bollard:T.Mesh;car:T.Group;pad:T.Mesh;x:number;z:number}>();private cars=new Map<string,T.Group>();private ray=new T.Raycaster();private start={x:0,y:0};private width:number;private count:number;private current:ScaleState;private selected='';private click:(event:PointerEvent)=>void;private down:(event:PointerEvent)=>void
 constructor(private host:HTMLElement,state:ScaleState,onSelect:(id:string)=>void){
  this.current=state;this.count=Math.ceil(state.bays.length/2);this.width=Math.max(20,this.count*3.2+4)
  this.scene.background=new T.Color('#e9f1ef');this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=T.SRGBColorSpace;host.appendChild(this.renderer.domElement)
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.maxPolarAngle=Math.PI*.48;this.controls.minDistance=8;this.controls.maxDistance=this.width*3;this.controls.target.set(0,0,0)
  this.camera.position.set(this.width*.24,this.width*.64,Math.max(24,this.width*.45));this.controls.update()
  this.scene.add(new T.HemisphereLight(0xffffff,0x9aaea2,2.8));const light=new T.DirectionalLight(0xffffff,2.2);light.position.set(20,35,18);this.scene.add(light)
  this.box(this.width,.24,21,0,-.12,0,0x7f9392)
  this.box(this.width-2,.025,6,0,.014,0,0x4c6261)
  for(let x=-this.width/2+3;x<this.width/2-2;x+=5)this.box(2,.025,.12,x,.035,0,0xe1e7d7)
  for(const b of state.bays){const index=state.bays.indexOf(b),row=Math.floor(index/this.count),x=(index%this.count-(this.count-1)/2)*3.2,z=row===0?-6:6;
   const pad=this.box(2.95,.025,5.8,x,.025,z,0xd3e1da);pad.userData.bayId=b.id
   for(const sign of [-1,1])this.box(.06,.03,5.8,x+sign*1.52,.05,z,0xf6f3de)
   const bollard=this.box(.5,.8,.22,x,.45,row===0?-3.4:3.4,0x197958);bollard.userData.bayId=b.id
   const car=this.vehicle(0x507e98);car.position.set(x,0,z);car.rotation.y=row===0?0:Math.PI;this.scene.add(car);car.userData.bayId=b.id;car.traverse(o=>o.userData.bayId=b.id)
   this.objects.set(b.id,{bollard,car,pad,x,z})
  }
  for(let x=-this.width/2;x<=this.width/2;x+=12){this.box(.28,3,.28,x,1.5,-10,0xa8b9b0);this.box(.28,3,.28,x,1.5,10,0xa8b9b0)}
  this.box(this.width,.3,.25,0,3,-10,0xb4c4bb);this.box(this.width,.3,.25,0,3,10,0xb4c4bb)
  this.down=e=>{this.start={x:e.clientX,y:e.clientY}}
  this.click=e=>{if(Math.hypot(e.clientX-this.start.x,e.clientY-this.start.y)>5)return;const r=this.renderer.domElement.getBoundingClientRect();this.ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);const hit=this.ray.intersectObjects(this.scene.children,true).find(h=>h.object.userData.bayId);if(hit)onSelect(hit.object.userData.bayId)}
  this.renderer.domElement.addEventListener('pointerdown',this.down);this.renderer.domElement.addEventListener('pointerup',this.click)
  this.renderer.domElement.setAttribute('aria-label','Live virtual parking level. Drag to orbit; select bays to inspect.');this.renderer.domElement.setAttribute('role','img')
  this.resize=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);fitLevelCamera(this.camera,this.width,w/h);this.controls.target.set(0,0,0);this.controls.update()});this.resize.observe(host)
  this.update(state,'');this.renderer.setAnimationLoop(()=>{this.controls.update();this.renderer.render(this.scene,this.camera)})
 }
 private box(w:number,h:number,d:number,x:number,y:number,z:number,color:number){const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.75}));m.position.set(x,y,z);this.scene.add(m);return m}
 private vehicle(color:number){const g=new T.Group();const body=new T.Mesh(new T.BoxGeometry(1.7,.7,3.8),new T.MeshStandardMaterial({color,roughness:.5}));body.position.y=.65;g.add(body);const roof=new T.Mesh(new T.BoxGeometry(1.4,.45,1.9),new T.MeshStandardMaterial({color:0x263f46}));roof.position.set(0,1.22,.15);g.add(roof);const geo=new T.CylinderGeometry(.29,.29,.2,10),mat=new T.MeshStandardMaterial({color:0x263337});for(const x of [-.85,.85])for(const z of [-1.2,1.2]){const wheel=new T.Mesh(geo,mat);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.29,z);g.add(wheel)}return g}
 update(state:ScaleState,selected:string){
  this.current=state;this.selected=selected
  for(const b of state.bays){const o=this.objects.get(b.id);if(!o)continue;const moving=b.position.startsWith('MOVING'),fraction=Math.max(0,Math.min(1,1-(b.moveAt-state.clock)/2000)),height=b.position==='DOWN'?.08:moving?(b.position==='MOVING_DOWN'?.8-fraction*.72:.08+fraction*.72):.8;o.bollard.scale.y=height/.8;o.bollard.position.y=.05+height/2;(o.bollard.material as T.MeshStandardMaterial).color.set(b.health!=='HEALTHY'?0xd48b3a:b.position==='DOWN'?0x209976:0xc9524b);(o.pad.material as T.MeshStandardMaterial).color.set(b.id===selected?0x8bbaa9:b.health!=='HEALTHY'?0xebd2af:b.occupancy==='PRESENT'?0x9ab9c5:0xd3e1da);o.car.visible=b.occupancy==='PRESENT'}
  const visible=new Set<string>()
  for(const j of state.journeys){const b=this.objects.get(j.bayId);if(!b||!['ENTERING','ADMITTED','DEPARTED','EXITING'].includes(j.phase))continue;visible.add(j.id);let car=this.cars.get(j.id);if(!car){car=this.vehicle(0x2b9475);this.cars.set(j.id,car);this.scene.add(car)}const t=Math.min(1,Math.max(0,(state.clock-j.changed)/2000));if(j.phase==='ADMITTED'){car.position.set(b.x,0,b.z*t);car.rotation.y=b.z<0?0:Math.PI}else if(j.phase==='ENTERING'){car.position.set(-this.width/2+(b.x+this.width/2)*t,0,0);car.rotation.y=Math.PI/2}else{car.position.set(b.x+(this.width/2-b.x)*t,0,b.z*(1-t));car.rotation.y=-Math.PI/2}}
  for(const [id,car]of this.cars)car.visible=visible.has(id)
 }
 dispose(){this.resize.disconnect();this.renderer.setAnimationLoop(null);this.controls.dispose();this.renderer.domElement.removeEventListener('pointerdown',this.down);this.renderer.domElement.removeEventListener('pointerup',this.click);const geos=new Set<T.BufferGeometry>(),mats=new Set<T.Material>();this.scene.traverse(o=>{if(o instanceof T.Mesh){geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m)}});for(const g of geos)g.dispose();for(const m of mats)m.dispose();this.renderer.dispose();this.renderer.domElement.remove()}
}
