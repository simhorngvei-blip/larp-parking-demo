import * as T from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js'
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js'
import {CAR_RIDE_HEIGHT,createTenantBodyGeometry,createRampDeckGeometry,followCarCamera} from './model-geometry'
import {scaleColumnXs,scaleBayLayout,scaleBuildingLayout,type BuildingConfig,type ScalePose} from './route'
import type {ScaleState} from '../ScaleDemo'
export type ScaleCamera='Overview'|'Entrance'|'My bay'|'Exit'|'Follow car'
type Level={group:T.Group;bays:ReturnType<typeof scaleBayLayout>[];pads:T.InstancedMesh;bollards:T.InstancedMesh;bodies:T.InstancedMesh;roofs:T.InstancedMesh;wheels:T.InstancedMesh}

export class ScaleLiveScene{
 readonly scene=new T.Scene();readonly camera=new T.PerspectiveCamera(43,1,.1,1800);readonly car=new T.Group();onFrame:(dt:number)=>void=()=>{};cameraPreset:ScaleCamera='Overview';cutaway=true
 private environment:T.WebGLRenderTarget;private wheelPivots:{pivot:T.Group;roll:T.Group;front:boolean}[]=[];private brakeMaterial=new T.MeshStandardMaterial({color:0x8f121b,emissive:0xff1725,emissiveIntensity:.4});private reverseMaterial=new T.MeshStandardMaterial({color:0xdce3e5,emissive:0xffffff,emissiveIntensity:0});private slowFrames=0;private fastFrames=0;private previousSpeed=0;private renderer:T.WebGLRenderer;private controls:OrbitControls;private resize:ResizeObserver;private clock=new T.Clock();private geo=new Map<string,T.BufferGeometry>();private mats=new Map<string,T.MeshStandardMaterial>();private textures=new Set<T.Texture>();private levels:Level[]=[];private rampGroups:{group:T.Group;level:number}[]=[];private roof=new T.Group();private booms=new Map<string,T.Group>();private l:ReturnType<typeof scaleBuildingLayout>;private pose:ScalePose={x:0,y:0,z:0,yaw:0};private selected:string;private plate='';private tag:T.Object3D|null=null;private plateGroup=new T.Group();private goal=new T.Vector3();private target=new T.Vector3();private overviewTarget=new T.Vector3();private manual=false;private state:ScaleState|null=null;private selectedStage='idle';private pointer={x:0,y:0};private down:(e:PointerEvent)=>void;private up:(e:PointerEvent)=>void
 constructor(private host:HTMLElement,private config:BuildingConfig,bayId:string,private onSelect:(id:string)=>void){
  this.selected=bayId;this.l=scaleBuildingLayout(config);this.renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.scene.background=new T.Color('#dce5eb');this.scene.fog=new T.Fog('#dce5eb',250,650);host.appendChild(this.renderer.domElement)
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.maxPolarAngle=Math.PI*.48;this.controls.minDistance=5;this.controls.maxDistance=500;this.controls.addEventListener('start',()=>{this.manual=true})
  this.scene.add(new T.HemisphereLight(0xe8f3ff,0x748071,1.45));const sun=new T.DirectionalLight(0xfff0dc,2.3);sun.position.set(-25,70,30);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-85,right:85,top:70,bottom:-70,near:1,far:160});sun.shadow.normalBias=.04;this.scene.add(sun)
  const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.45;room.dispose();pmrem.dispose()
  this.build();this.buildCar();this.scene.add(this.car);this.car.name='Selected_tenant_car';this.car.rotation.order='YXZ'
  this.down=e=>{this.pointer={x:e.clientX,y:e.clientY}};this.up=e=>{if(Math.hypot(e.clientX-this.pointer.x,e.clientY-this.pointer.y)>5)return;const rect=this.renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),this.camera);for(const h of ray.intersectObjects(this.scene.children,true)){const ids=h.object.userData.bays;if(ids&&h.instanceId!==undefined){onSelect(ids[h.instanceId]);break}}}
  this.renderer.domElement.addEventListener('pointerdown',this.down);this.renderer.domElement.addEventListener('pointerup',this.up);this.renderer.domElement.setAttribute('role','img');this.renderer.domElement.setAttribute('aria-label','Live 3D multi-level parking building and controlled tenant vehicle')
  this.resize=new ResizeObserver(()=>{if(!host.clientWidth||!host.clientHeight)return;this.renderer.setSize(host.clientWidth,host.clientHeight);this.camera.aspect=host.clientWidth/host.clientHeight;this.camera.updateProjectionMatrix();this.setCamera(this.cameraPreset,true)});this.resize.observe(host);this.setCamera('Overview',true)
  this.renderer.setAnimationLoop(()=>this.frame())
 }
 private material(color:number,rough=.75){const key=color+'/'+rough;if(!this.mats.has(key))this.mats.set(key,new T.MeshStandardMaterial({color,roughness:rough}));return this.mats.get(key)!}
 private surface(kind:'concrete'|'asphalt'|'epoxy',w:number,d:number){
  const key=`surface/${kind}/${w}/${d}`;if(this.mats.has(key))return this.mats.get(key)!
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!,data=ctx.createImageData(256,256);let seed=7351
  const base=kind==='asphalt'?[69,76,79]:kind==='epoxy'?[104,119,116]:[174,177,169],grain=kind==='asphalt'?23:kind==='epoxy'?8:15
  for(let i=0;i<data.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=((seed>>>8)/16777216-.5)*grain;for(let k=0;k<3;k++)data.data[i+k]=base[k]+v;data.data[i+3]=255}ctx.putImageData(data,0,0)
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(w/4,d/4);map.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());this.textures.add(map)
  const bump=map.clone();bump.colorSpace=T.NoColorSpace;bump.needsUpdate=true;this.textures.add(bump)
  const mat=new T.MeshStandardMaterial({map,bumpMap:bump,bumpScale:kind==='asphalt'?.025:.009,roughness:kind==='epoxy'?.64:.93});this.mats.set(key,mat);return mat
 }
 private bayLabels(group:T.Group,bays:ReturnType<typeof scaleBayLayout>[]){
  const c=document.createElement('canvas');c.width=1024;const cols=8,rows=Math.max(1,Math.ceil(bays.length/cols));c.height=rows*32;const ctx=c.getContext('2d')!,positions:number[]=[],uvs:number[]=[]
  ctx.fillStyle='#eee9cd';ctx.font='bold 27px Arial';ctx.textAlign='center';ctx.textBaseline='middle'
  bays.forEach((b,i)=>{const col=i%cols,row=Math.floor(i/cols);ctx.fillText(b.id,col*128+64,row*32+16,120);const y=b.y+.012,z=Math.sign(b.z)*2.75,w=1.35,h=.35,flip=b.z<0?-1:1
   const corners=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];for(const j of [0,2,1,0,3,2]){positions.push(b.x+corners[j][0]*flip,y,z+corners[j][1]*flip);uvs.push((col+(j===1||j===2?1:0))/cols,1-(row+(j>=2?0:1))/rows)}
  });const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;this.textures.add(tex);const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.computeVertexNormals();const labels=new T.Mesh(geo,new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:T.DoubleSide}));labels.name='Bay_number_markings';group.add(labels)
 }
 private geometry(w:number,h:number,d:number,round=false){const k=[w,h,d,round].join('/');if(!this.geo.has(k))this.geo.set(k,round?new RoundedBoxGeometry(w,h,d,2,.1):new T.BoxGeometry(w,h,d));return this.geo.get(k)!}
 private box(parent:T.Object3D,w:number,h:number,d:number,x:number,y:number,z:number,color:number,round=false){const mesh=new T.Mesh(this.geometry(w,h,d,round),this.material(color));mesh.position.set(x,y,z);mesh.receiveShadow=true;parent.add(mesh);return mesh}
 private sign(text:string,w:number,h:number,bg='#205b46',ink='#ffffff'){
  const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d')!;ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);ctx.fillStyle=ink;ctx.font='bold 46px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,66,490);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;this.textures.add(tex);const front=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,side:T.FrontSide})),back=new T.Mesh(front.geometry,front.material);back.rotation.y=Math.PI;back.position.z=-.003;back.name='Readable_reverse_face';front.add(back);return front
 }
 private instance(group:T.Group,w:number,h:number,d:number,count:number,color:number,round=false){const mesh=new T.InstancedMesh(this.geometry(w,h,d,round),this.material(color),Math.max(1,count));mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.receiveShadow=true;group.add(mesh);return mesh}
 private matrix(x:number,y:number,z:number,sx=1,sy=1,sz=1,yaw=0){return new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw),new T.Vector3(sx,sy,sz))}
 private build(){
  const {width,half,portalX,rampX,height}=this.l,s=this.scene
  const roadLeft=this.l.exit.x-28,roadRight=half+22,siteLeft=roadLeft-2,siteRight=roadRight+3
  this.box(s,siteRight-siteLeft+4,.4,85,(siteLeft+siteRight)/2,-.45,4,0x9eae8e)
  this.box(s,siteRight-siteLeft,.15,70,(siteLeft+siteRight)/2,-.2,5,0xc4cec0)
  const exitRoad=this.box(s,roadRight-roadLeft,.12,12,(roadLeft+roadRight)/2,-.06,30,0x566761);exitRoad.material=this.surface('asphalt',roadRight-roadLeft,12);exitRoad.name='Exit_road_surface'
  const entryLeft=this.l.entry.x-24,entryRight=-half,entryRoad=this.box(s,entryRight-entryLeft,.12,11.5,(entryLeft+entryRight)/2,-.06,this.l.entry.z+2.25,0x566761);entryRoad.material=this.surface('asphalt',entryRight-entryLeft,11.5);entryRoad.name='Entrance_road_surface'
  for(let x=roadLeft+3;x<roadRight-2;x+=6)this.box(s,2,.006,.15,x,.005,29.25,0xe5dfc5)
  for(let x=entryLeft+3;x<entryRight-2;x+=6)this.box(s,2,.006,.15,x,.005,this.l.entry.z+2.25,0xe5dfc5)
  for(let n=0;n<this.config.levels;n++){
   const g=new T.Group();g.name='Level_'+n;const y=n*4;s.add(g);this.box(g,width,.28,22,0,y-.14,0,0xc9d4cc).material=this.surface('concrete',width,22)
   this.box(g,width-2,.004,5.8,0,y+.002,.1,0x60726a).material=this.surface('epoxy',width-2,5.8)
   for(let x=-half+3;x<half-2;x+=5)this.box(g,2,.006,.12,x,y+.007,.8,0xe6dfc5)
   for(const z of [-11,11]){const lo=-half,hi=portalX-3;this.box(g,hi-lo,.65,.15,(lo+hi)/2,y+.4,z,0xa4b8a7);this.box(g,1,.65,.15,half-.5,y+.4,z,0xa4b8a7);this.box(g,6,.28,5,portalX,y-.14,Math.sign(z)*13.5,0xc3d1c5)}
   const landingStart=portalX-3,landingEnd=half+19
   for(const z of [-20,20]){this.box(g,landingEnd-landingStart,.28,8,(landingStart+landingEnd)/2,y-.14,z,0xb6c8b8);const railStart=n===0&&z>0?portalX+3:landingStart;this.box(g,landingEnd-railStart,.65,.15,(railStart+landingEnd)/2,y+.4,z+Math.sign(z)*4,0x9db49f)}
   for(const x of scaleColumnXs(this.config))for(const z of [-10.5,10.5])this.box(g,.3,3.3,.3,x,y+1.65,z,0x9eafa1)
   const levelSign=this.sign(n===0?'GROUND FLOOR':'LEVEL '+n,5.5,.9);levelSign.position.set(-half+5,y+1.65,11.1);g.add(levelSign)
   const bays=Array.from({length:this.config.baysPerSite},(_,i)=>scaleBayLayout(this.config,'B-'+String(i+1).padStart(4,'0'))).filter(b=>b.level===n)
   this.bayLabels(g,bays)
   const pads=this.instance(g,2.9,.004,5.8,bays.length,0xdde5db),stripes=this.instance(g,.055,.006,5.8,bays.length*2,0xf7f3de),bollards=this.instance(g,.48,.8,.2,bays.length,0xc86751),bodies=this.instance(g,1.8,.7,3.9,bays.length,0x527f93,true),roofs=this.instance(g,1.45,.48,1.95,bays.length,0x294b52,true),wheels=this.instance(g,.18,.5,.6,bays.length*4,0x253b36,true)
   pads.material=this.surface('concrete',2.9,5.8)
   pads.userData.bays=bays.map(b=>b.id);bollards.userData.bays=bays.map(b=>b.id)
   bays.forEach((b,i)=>{pads.setMatrixAt(i,this.matrix(b.x,y+.002,b.z));stripes.setMatrixAt(i*2,this.matrix(b.x-1.51,y+.007,b.z));stripes.setMatrixAt(i*2+1,this.matrix(b.x+1.51,y+.007,b.z));bollards.setMatrixAt(i,this.matrix(b.x,y+.404,Math.sign(b.z)*3.4));pads.setColorAt(i,new T.Color('#dbe5da'));bollards.setColorAt(i,new T.Color('#bd6253'))})
   bodies.count=roofs.count=wheels.count=0;this.levels.push({group:g,bays,pads,bollards,bodies,roofs,wheels})
  }
  for(let i=0;i<this.config.levels-1;i++){
   const g=new T.Group();g.name='Ramp_'+i;const x=rampX[i%2],z0=i%2===0?14:-14,z1=-z0,y0=i*4,y1=(i+1)*4,len=Math.hypot(28,4),rise=4*Math.sign(z0)
   const deckGeometry=createRampDeckGeometry(5,28,rise,.18);this.geo.set('ramp-deck-'+i,deckGeometry);const ramp=new T.Mesh(deckGeometry,this.surface('epoxy',5,len));ramp.position.set(x,(y0+y1)/2,0);ramp.name='Flush_ramp_deck_'+i;ramp.receiveShadow=true;g.add(ramp)
   const railGeometry=createRampDeckGeometry(.13,28,rise,.65);this.geo.set('ramp-rail-'+i,railGeometry)
   for(const dx of [-2.435,2.435]){const rail=new T.Mesh(railGeometry,this.material(0x9bb5a0));rail.position.set(x+dx,(y0+y1)/2+.65,0);rail.name='Deck_supported_rail_'+i;rail.receiveShadow=true;g.add(rail)}
   this.box(g,5,.28,2,x,y0-.14,Math.sign(z0)*15,0xb6c8b8);this.box(g,5,.28,2,x,y1-.14,Math.sign(z1)*15,0xb6c8b8);s.add(g);this.rampGroups.push({group:g,level:i})
  }
  this.roof.name='Roof';this.box(this.roof,width+1,.4,23,0,height+3.7,0,0x8ea797);s.add(this.roof)
  for(const kind of ['ENTRY','EXIT'])for(let lane=1;lane<=2;lane++){
   const gate=kind==='ENTRY'?this.l.entry:this.l.exit,z=gate.z+(lane-1)*4.5,pivot=new T.Group();pivot.position.set(gate.x,1,z-1.9);pivot.name=kind+'-0'+lane;s.add(pivot);this.box(s,.6,1,.6,gate.x,.5,z-1.9,0x356e55);this.box(pivot,.13,.13,4.1,0,0,2.05,0xf1eee0)
   for(let k=0;k<5;k++)this.box(pivot,.14,.14,.35,0,0,.4+k*.8,0xd27362);this.booms.set(kind+'-0'+lane,pivot)
  }
  this.box(s,4,2.7,3.8,this.l.entry.x-1,1.35,-6,0x678779,true);this.box(s,3.6,1.1,.04,this.l.entry.x-1,1.8,-3.99,0x315a55)
  for(const [word,gate]of [['ENTRY',this.l.entry],['EXIT',this.l.exit]] as const){const sign=this.sign('LARP / '+word,4,.9);sign.position.set(gate.x-4.5,2.2,gate.z-3.4);sign.rotation.y=Math.PI/2;s.add(sign);this.box(s,.12,2.2,.12,gate.x-4.5,1.1,gate.z-3.4,0x587662)}
  const facade=this.sign('LARP RESIDENCES',Math.min(width-8,22),2.3);facade.position.set(0,height+1.8,11.2);this.roof.add(facade)
 }
 private buildCar(){
  const c=this.car,paint=new T.MeshPhysicalMaterial({color:0x197b6d,metalness:.55,roughness:.25,clearcoat:1,clearcoatRoughness:.16}),glass=new T.MeshPhysicalMaterial({color:0x172d37,metalness:.18,roughness:.12,clearcoat:1}),metal=new T.MeshStandardMaterial({color:0xbfc9ce,metalness:.9,roughness:.24}),rubber=this.material(0x161b1e,.98)
  const bodyGeometry=createTenantBodyGeometry();this.geo.set('tenant-arched-body',bodyGeometry);const body=new T.Mesh(bodyGeometry,paint);body.name='Tenant_body_with_wheel_arches';body.castShadow=true;body.receiveShadow=true;c.add(body)
  const cabin=this.box(c,1.55,.5,2.05,0,1.2,-.05,0x172d37,true);cabin.material=glass;cabin.castShadow=true
  this.box(c,1.53,.07,1.15,0,1.48,-.1,0x197b6d,true).material=paint
  for(const x of [-.79,.79]){this.box(c,.045,.5,.11,x,1.2,-.1,0x1d2428);this.box(c,.12,.16,.3,x*1.17,1.08,.65,0x197b6d,true).material=paint;for(const z of [-.5,.7])this.box(c,.025,.04,.19,x*1.12,.98,z,0xbfc9ce).material=metal}
  for(const z of [-2.02,2.02]){this.box(c,1.42,.09,.04,0,.43,z,0x252d32);this.box(c,.65,.13,.04,0,.68,z,0x252d32)}
  for(const x of [-.63,.63]){const head=this.box(c,.34,.13,.08,x,.77,2.03,0xfff4df);head.material=new T.MeshStandardMaterial({color:0xfff5db,emissive:0xfff0cc,emissiveIntensity:.5});this.box(c,.34,.12,.08,x,.77,-2.03,0x8f121b).material=this.brakeMaterial;this.box(c,.12,.05,.085,x*.7,.63,-2.03,0xdce3e5).material=this.reverseMaterial}
  const tyre=new T.CylinderGeometry(.34,.34,.21,28),rim=new T.CylinderGeometry(.235,.235,.218,24);this.geo.set('selected-tyres',tyre);this.geo.set('selected-rims',rim)
  for(const x of [-.88,.88])for(const z of [-1.28,1.28]){const pivot=new T.Group(),roll=new T.Group();pivot.position.set(x,.34,z);pivot.add(roll);const wheel=new T.Mesh(tyre,rubber);wheel.rotation.z=Math.PI/2;wheel.castShadow=true;roll.add(wheel);const hub=new T.Mesh(rim,metal);hub.rotation.z=Math.PI/2;roll.add(hub);for(let k=0;k<5;k++){const spoke=this.box(roll,.225,.055,.38,0,0,0,0x303a40);spoke.rotation.x=k*Math.PI/5}c.add(pivot);this.wheelPivots.push({pivot,roll,front:z>0})}c.add(this.plateGroup)
 }
 setSelection(id:string,plate:string){
  this.selected=id
  if(plate!==this.plate){this.plate=plate;while(this.plateGroup.children.length){const old=this.plateGroup.children[0] as T.Mesh;old.geometry.dispose();const mat=old.material as T.MeshBasicMaterial;if(mat.map){mat.map.dispose();this.textures.delete(mat.map)}mat.dispose();old.removeFromParent()}
   for(const sign of [1,-1]){const p=this.sign(plate,.9,.23,'#f5f6e9','#243c32');p.position.set(0,.58,sign*2.075);if(sign<0)p.rotation.y=Math.PI;this.plateGroup.add(p)}
  }
  const b=scaleBayLayout(this.config,id)
  if(this.tag){const m=this.tag as T.Mesh;m.geometry.dispose();const mat=m.material as T.MeshBasicMaterial;if(mat.map){mat.map.dispose();this.textures.delete(mat.map)}mat.dispose();this.tag.removeFromParent()}
  this.tag=this.sign(id+' / '+(b.level?'L'+b.level:'G'),2.7,.65);this.tag.position.set(b.x,b.y+.012,Math.sign(b.z)*8.5);this.tag.rotation.x=-Math.PI/2;this.scene.add(this.tag)
 }
 setState(state:ScaleState){this.state=state;this.updateDevices()}
 private updateDevices(){if(!this.state)return;const nodes=new Map(this.state.bays.map(b=>[b.id,b]))
  for(const level of this.levels){let parked=0;level.bays.forEach((b,i)=>{const node=nodes.get(b.id);if(!node)return;const h=node.position==='DOWN'?.08:node.position==='MOVING_DOWN'||node.position==='MOVING_UP'?.4:.8;level.bollards.setMatrixAt(i,this.matrix(b.x,b.y+.004+h/2,Math.sign(b.z)*3.4,1,h/.8,1));level.bollards.setColorAt(i,new T.Color(node.health!=='HEALTHY'?0xd5a15b:node.position==='DOWN'?0x368d63:0xbf6553));level.pads.setColorAt(i,new T.Color(b.id===this.selected?0x9ac6a6:node.health!=='HEALTHY'?0xe6d1a7:node.occupancy==='PRESENT'?0xb3cad0:0xdbe5da))
   if(node.occupancy==='PRESENT'&&!(b.id===this.selected&&this.selectedStage!=='idle')){level.bodies.setMatrixAt(parked,this.matrix(b.x,b.y+.68,b.z));level.roofs.setMatrixAt(parked,this.matrix(b.x,b.y+1.28,b.z));for(let w=0;w<4;w++)level.wheels.setMatrixAt(parked*4+w,this.matrix(b.x+(w%2?-.87:.87),b.y+.34,b.z+(w<2?-1.25:1.25)));parked++}
  });level.bodies.count=level.roofs.count=parked;level.wheels.count=parked*4;for(const m of [level.bollards,level.pads,level.bodies,level.roofs,level.wheels]){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere()}}
 }
 setPose(pose:ScalePose,stage:string){
  for(const wheel of this.wheelPivots){wheel.pivot.rotation.y=wheel.front?(pose.steering||0):0;wheel.roll.rotation.x=(pose.odometer||0)/.34}
  const speed=Math.abs(pose.velocity||0);this.brakeMaterial.emissiveIntensity=speed<.1||speed<this.previousSpeed-.015?1.4:.25;this.reverseMaterial.emissiveIntensity=pose.reverse?.85:0;this.previousSpeed=speed;this.pose=pose;this.car.position.set(pose.x,(pose.y||0)+CAR_RIDE_HEIGHT,pose.z);this.car.rotation.set(pose.pitch||0,pose.yaw,0,'YXZ');if(stage!==this.selectedStage){this.selectedStage=stage;this.updateDevices()}const floor=Math.min(this.config.levels-1,Math.max(0,Math.ceil(((pose.y||0)-.1)/4)));const bayFloor=scaleBayLayout(this.config,this.selected).level;const visible=this.cameraPreset==='My bay'?bayFloor:stage==='idle'?bayFloor:floor;for(let i=0;i<this.levels.length;i++)this.levels[i].group.visible=!this.cutaway||i<=visible;for(const r of this.rampGroups)r.group.visible=!this.cutaway||r.level<=visible;this.roof.visible=!this.cutaway
  this.host.dataset.poseY=String(pose.y||0);this.host.dataset.posePitch=String(pose.pitch||0);this.host.dataset.stage=stage
 }
 setCutaway(value:boolean){this.cutaway=value;this.setPose(this.pose,this.selectedStage)}
 setCamera(value:ScaleCamera,immediate=false){this.cameraPreset=value;this.manual=false;const b=scaleBayLayout(this.config,this.selected),l=this.l
  if(value==='Overview'){
   this.target.set(0,l.height*.4,3);const dir=new T.Vector3(.9,.75,1.05).normalize();let d=Math.max(70,l.width*1.1,l.height*2)
   for(let n=0;n<15;n++){this.goal.copy(this.target).addScaledVector(dir,d);this.camera.position.copy(this.goal);this.camera.lookAt(this.target);this.camera.updateMatrixWorld();let bound=0;for(const x of [-l.half-29,l.half+22])for(const y of [0,l.height+5])for(const z of [-26,36]){const p=new T.Vector3(x,y,z).project(this.camera);bound=Math.max(bound,Math.abs(p.x),Math.abs(p.y))}if(bound<.9)break;d*=Math.max(1.05,bound/.9)}
  }else if(value==='Entrance'){this.goal.set(l.entry.x-13,7,l.entry.z+14);this.target.set(l.entry.x,1,l.entry.z)}
  else if(value==='Exit'){this.goal.set(l.exit.x-10,8,40);this.target.set(l.exit.x,1,27)}
  else if(value==='My bay'){this.goal.set(b.x+8,b.y+7,b.z+(b.z<0?12:-12));this.target.set(b.x,b.y+.7,b.z);this.cutaway=true}
  if(immediate&&value!=='Follow car'){this.camera.position.copy(this.goal);this.controls.target.copy(this.target);this.controls.update()}this.setPose(this.pose,this.selectedStage)
 }
 private frame(){const raw=this.clock.getDelta(),elapsed=Math.min(.5,raw),dt=Math.min(.1,elapsed);
  this.slowFrames=raw>.09?this.slowFrames+1:0;this.fastFrames=raw<.028?this.fastFrames+1:0;const ratio=this.renderer.getPixelRatio(),maximum=Math.min(devicePixelRatio,1.5);if(this.slowFrames>=12&&ratio>.65){this.renderer.setPixelRatio(Math.max(.65,ratio*.8));this.slowFrames=0}else if(this.fastFrames>=180&&ratio<maximum){this.renderer.setPixelRatio(Math.min(maximum,ratio*1.1));this.fastFrames=0}this.host.dataset.resolutionScale=String(this.renderer.getPixelRatio());this.host.dataset.frameMs=String(Math.round(elapsed*1000));for(let remaining=elapsed;remaining>.00001;remaining-=.05)this.onFrame(Math.min(.05,remaining))
  for(const [id,pivot]of this.booms){const lane=this.state?.lanes.find(l=>l.id===id),angle=lane&&['OPENING','OPEN'].includes(lane.position)?-Math.PI/2:0;pivot.rotation.x=T.MathUtils.damp(pivot.rotation.x,angle,8,dt);if(id==='ENTRY-01')this.host.dataset.entryAngle=String(pivot.rotation.x);if(id==='EXIT-01')this.host.dataset.exitAngle=String(pivot.rotation.x)}
  if(!this.manual){if(this.cameraPreset==='Follow car'){const yaw=this.pose.yaw,camera=followCarCamera(this.pose,this.cutaway);this.goal.set(camera.x,camera.y,camera.z);this.target.set(this.pose.x+Math.sin(yaw)*2,(this.pose.y||0)+1.1,this.pose.z+Math.cos(yaw)*2)}this.camera.position.lerp(this.goal,1-Math.exp(-dt*4));this.controls.target.lerp(this.target,1-Math.exp(-dt*6))}
  this.controls.update();this.renderer.render(this.scene,this.camera)
 }
 barrierReady(id:string){const arm=this.booms.get(id);return !!arm&&Math.abs(arm.rotation.x+Math.PI/2)<.02}
 capture(){return this.renderer.domElement.toDataURL('image/png')}
 async exportModel(){this.scene.updateMatrixWorld(true);const snapshot=this.scene.clone(true),empty:T.Object3D[]=[];snapshot.traverse(o=>{if(o instanceof T.InstancedMesh&&o.count===0)empty.push(o)});for(const o of empty)o.removeFromParent();snapshot.updateMatrixWorld(true);return new GLTFExporter().parseAsync(snapshot,{binary:true,onlyVisible:false}) as Promise<ArrayBuffer>}
 dispose(){this.resize.disconnect();this.renderer.setAnimationLoop(null);this.controls.dispose();this.renderer.domElement.removeEventListener('pointerdown',this.down);this.renderer.domElement.removeEventListener('pointerup',this.up);const materials=new Set<T.Material>(),geometries=new Set<T.BufferGeometry>();this.scene.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of this.textures)t.dispose();this.environment.dispose();this.renderer.dispose();this.renderer.domElement.remove()}
}
