import {useEffect,useRef,useState} from 'react'
import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import type {ParkingLayout,MapSlot} from './types'
import {bayAppearance,layoutFloor} from './parking-layout-model'
import './parking-layout.css'

type Engine={update:(slots:MapSlot[],selected:string,online:boolean)=>void;reset:()=>void;dispose:()=>void}
function buildScene(host:HTMLDivElement,layout:ParkingLayout,floor:string,select:(id:string)=>void):Engine{
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor('#e8eeeb');renderer.outputColorSpace=THREE.SRGBColorSpace
 renderer.domElement.setAttribute('aria-label','Interactive 3D parking layout. Use the bay buttons below for keyboard selection.');host.appendChild(renderer.domElement)
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-24,24,18,-18,.1,200),controls=new OrbitControls(camera,renderer.domElement),meshes=new Map<string,{base:THREE.Mesh;car:THREE.Group;ring:THREE.LineSegments;lock:THREE.Mesh}>(),pick:THREE.Object3D[]=[]
 scene.add(new THREE.HemisphereLight(0xffffff,0x71867b,2.5));const sun=new THREE.DirectionalLight(0xfff4dd,3);sun.position.set(-15,35,20);scene.add(sun)
 controls.enableDamping=false;controls.minPolarAngle=.18;controls.maxPolarAngle=Math.PI/2.15;controls.minZoom=.6;controls.maxZoom=3;controls.enablePan=true
 const render=()=>renderer.render(scene,camera)
 function box(w:number,h:number,d:number,color:string,x:number,y:number,z:number){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.75}));m.position.set(x,y,z);scene.add(m);return m}
 function label(text:string,x:number,y:number,z:number,width=3,color='#334a43',background='rgba(255,255,255,0)'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle=background;ctx.fillRect(0,0,512,128);ctx.fillStyle=color;ctx.font='bold 42px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64)
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(width,width/4),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);scene.add(m);return m
 }
 box(40,.55,25,'#cbd4ce',0,-.32,0);box(39,.08,24,'#e0e6e1',0,0,0)
 // Open cutaway: no roof or front wall obscures the bays.
 box(40,.55,.25,'#b1c0b9',0,.22,-12);box(.25,.55,24,'#b1c0b9',-19.7,.22,0)
 box(36,.015,3.9,'#647570',0,.06,.5)
 for(let x=-17;x<18;x+=3)box(1.4,.025,.08,'#e8ebe1',x,.09,.5)
 label('ENTRY  →',-15,.13,.5,4,'#ffffff');label('→  EXIT',15,.13,.5,4,'#ffffff')
 label('LEVEL '+floor,-13,.08,-10.7,5,'#566c62');label('LIFT / WALKWAY',10.5,.11,10.5,6,'#44645d')
 box(3.2,2.4,1.8,'#aebfb6',16.5,1.2,10);box(1.2,1.8,.08,'#6a8177',16.5,.95,9.05);label('LIFT',16.5,2.44,10,2,'#ffffff')
 for(const x of [-18,18])for(const z of [-10.7,8.6]){box(.55,2.5,.55,'#9caaa1',x,1.25,z);box(.58,.35,.58,'#d5af57',x,.5,z)}
 for(const b of layoutFloor(layout,floor)){
  const base=box(b.width,.035,b.depth,'#80939f',b.x,.09,b.z);base.userData.bayId=b.id;pick.push(base)
  for(const dx of [-b.width/2,b.width/2])box(.065,.02,b.depth,'#fafbf2',b.x+dx,.13,b.z)
  box(b.width,.02,.065,'#fafbf2',b.x,.13,b.z-b.depth/2)
  const car=new THREE.Group();car.position.set(b.x,.14,b.z);scene.add(car)
  const part=(w:number,h:number,d:number,color:string,x:number,y:number,z:number)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,metalness:.2,roughness:.4}));m.position.set(x,y,z);m.userData.bayId=b.id;car.add(m);pick.push(m);return m}
  const paint=b.kind==='EV'?'#477da1':b.mine?'#d5e4e9':'#e2dbcc'
  part(1.65,.55,3.4,paint,0,.65,0);part(1.4,.52,1.8,'#334b55',0,1.16,.05);part(1.47,.08,1.65,paint,0,1.46,.05)
  for(const x of [-.78,.78])for(const z of [-1.08,1.08]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.31,.31,.18,12),new THREE.MeshStandardMaterial({color:'#263530'}));wheel.rotation.z=Math.PI/2;wheel.position.set(x,.32,z);car.add(wheel)}
  for(const x of [-.53,.53])part(.32,.13,.06,'#fff3bd',x,.72,-1.72)
  label(b.id,b.x,.17,b.z+b.depth/2-.5,Math.min(b.width-.15,3.7),'#ffffff')
  if(b.kind==='EV'){box(.45,1.35,.35,'#204d45',b.x,.8,b.z-b.depth/2-.3);label('EV',b.x,.16,b.z-b.depth/2+.55,1.7,'#ffffff')}
  if(b.mine)label('YOUR BAY',b.x,.16,b.z-b.depth/2+.55,2.8,'#ffffff')
  const lock=box(.17,.7,.17,'#f4bf47',b.x,.5,b.z+b.depth/2-1.25);lock.visible=b.position==='UP'
  const edges=new THREE.EdgesGeometry(new THREE.BoxGeometry(b.width+.2,.15,b.depth+.2)),ring=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:'#132d53'}));ring.position.set(b.x,.2,b.z);ring.visible=false;scene.add(ring);meshes.set(b.id,{base,car,ring,lock})
 }
 const reset=()=>{camera.position.set(30,37,36);controls.target.set(0,0,0);camera.zoom=1;camera.updateProjectionMatrix();controls.update();render()}
 const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);const aspect=w/h,halfHeight=Math.max(16,26/aspect);camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();render()}
 const observer=new ResizeObserver(resize);observer.observe(host);controls.addEventListener('change',render)
 let start={x:0,y:0};const down=(e:PointerEvent)=>{start={x:e.clientX,y:e.clientY}}
 const up=(e:PointerEvent)=>{if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>6)return;const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(pick,false).find(i=>i.object.visible&&i.object.parent?.visible);if(hit?.object.userData.bayId)select(hit.object.userData.bayId)}
 renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);reset();resize()
 return {reset,update(slots,selected,online){for(const b of slots){const m=meshes.get(b.id);if(!m)continue;const appearance=bayAppearance(b,online);(m.base.material as THREE.MeshStandardMaterial).color.set(appearance.color);m.car.visible=appearance.car;m.ring.visible=b.id===selected;m.lock.visible=online&&b.position==='UP'}render()},dispose(){observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material]){const texture=(material as THREE.MeshBasicMaterial).map;texture?.dispose();material.dispose()}}});renderer.dispose();renderer.domElement.remove()}}
}
export default function ParkingLayout3D({layout,floor,selected,onSelect,online=true}:{layout:ParkingLayout;floor:string;selected:string;onSelect:(id:string)=>void;online?:boolean}){
 const host=useRef<HTMLDivElement>(null),engine=useRef<Engine|null>(null),select=useRef(onSelect),[error,setError]=useState('');select.current=onSelect
 useEffect(()=>{setError('');try{engine.current=buildScene(host.current!,layout,floor,id=>select.current(id));engine.current.update(layout.slots,selected,online)}catch{setError('3D is unavailable on this device. Use the 2D map or the bay list below.');host.current?.replaceChildren()}return()=>{engine.current?.dispose();engine.current=null}},[layout.siteId,floor])
 useEffect(()=>{engine.current?.update(layout.slots,selected,online)},[layout.slots,selected,online])
 return <div className="p-lot-3d"><div className="p-lot-viewport" ref={host} data-testid="parking-3d"/><div className="p-lot-caption"><span>{error||'Drag to orbit · Scroll or pinch to zoom · Tap a bay to inspect'}</span><button type="button" onClick={()=>engine.current?.reset()}>Reset view</button></div>{!online&&<p role="status">Offline — bay occupancy is unknown until the next successful update.</p>}</div>
}
