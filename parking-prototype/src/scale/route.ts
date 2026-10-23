import {pathLength,type Point,type Pose} from '../three/journey.ts'
export type BuildingConfig={baysPerSite:number;levels:number}
export type ScaleFeedback={clock:number;bay:{position:string;occupancy:string;health:string};journey:{phase:string}|null;entry:{position:string;journeyId:string|null};exit:{position:string;journeyId:string|null}}
export function scaleBuildingLayout(config:BuildingConfig){
 const perLevel=Math.ceil(config.baysPerSite/config.levels),columns=Math.ceil(perLevel/2),width=Math.max(28,columns*3.2+20),half=width/2
 return {perLevel,columns,width,half,height:(config.levels-1)*4,portalX:half-4,rampX:[half+8,half+16],entry:{x:-half-8,z:.8},exit:{x:-half-8,z:27}}
}
export function scaleColumnXs(config:BuildingConfig){const {half,portalX}=scaleBuildingLayout(config),xs:number[]=[];for(let x=-half;x<=half;x+=12)xs.push(Math.abs(x-portalX)<3.2?portalX-4:x);return xs}
export function scaleBayLayout(config:BuildingConfig,id:string){
 const index=Number(id.replace('B-',''))-1;if(!/^B-\d{4}$/.test(id)||index<0||index>=config.baysPerSite)throw Error('Unknown building bay')
 const b=scaleBuildingLayout(config),level=Math.floor(index/b.perLevel),local=index%b.perLevel
 return {id,level,x:(local%b.columns-(b.columns-1)/2)*3.2,y:level*4,z:Math.floor(local/b.columns)===0?-6:6}
}
const distinct=(points:Point[])=>points.filter((p,i)=>!i||Math.hypot(p.x-points[i-1].x,(p.y||0)-(points[i-1].y||0),p.z-points[i-1].z)>.0001)
export function roundedScaleRoute(input:Point[],radius=3.2):Point[]{
 const points=distinct(input),out:Point[]=[]
 const isCorner=(i:number)=>{if(i<1||i>=points.length-1)return false;const a=points[i-1],b=points[i],c=points[i+1];if(Math.abs((a.y||0)-(b.y||0))>.001||Math.abs((c.y||0)-(b.y||0))>.001)return false;const u=Math.hypot(b.x-a.x,b.z-a.z),v=Math.hypot(c.x-b.x,c.z-b.z);return u>0&&v>0&&Math.abs(((b.x-a.x)*(c.x-b.x)+(b.z-a.z)*(c.z-b.z))/(u*v))<.999}
 out.push(points[0])
 for(let i=1;i<points.length-1;i++){
  const a=points[i-1],b=points[i],c=points[i+1];if(!isCorner(i)){out.push(b);continue}
  const lenA=Math.hypot(b.x-a.x,b.z-a.z),lenB=Math.hypot(c.x-b.x,c.z-b.z),u={x:(b.x-a.x)/lenA,z:(b.z-a.z)/lenA},v={x:(c.x-b.x)/lenB,z:(c.z-b.z)/lenB},theta=Math.acos(Math.max(-1,Math.min(1,u.x*v.x+u.z*v.z))),trim=Math.min(radius*Math.tan(theta/2),lenA*(isCorner(i-1)?.48:.9),lenB*(isCorner(i+1)?.48:.9)),r=trim/Math.tan(theta/2),sign=Math.sign(u.x*v.z-u.z*v.x),start={x:b.x-u.x*trim,y:b.y||0,z:b.z-u.z*trim},center={x:start.x-u.z*sign*r,z:start.z+u.x*sign*r},angle=Math.atan2(start.z-center.z,start.x-center.x),steps=Math.max(8,Math.ceil(theta*r/.06))
  out.push(start);for(let n=1;n<=steps;n++){const t=angle+sign*theta*n/steps;out.push({x:center.x+Math.cos(t)*r,y:b.y||0,z:center.z+Math.sin(t)*r})}
 }
 out.push(points.at(-1)!);return distinct(out)
}
function splitScaleRoute(points:Point[],at:number){const a:Point[]=[points[0]],b:Point[]=[];let distance=0;for(let i=1;i<points.length;i++){const p=points[i-1],q=points[i],length=Math.hypot(q.x-p.x,(q.y||0)-(p.y||0),q.z-p.z);if(!b.length&&distance+length>=at){const t=Math.max(0,Math.min(1,(at-distance)/length)),joint={x:p.x+(q.x-p.x)*t,y:(p.y||0)+((q.y||0)-(p.y||0))*t,z:p.z+(q.z-p.z)*t};a.push(joint);b.push(joint,q)}else if(b.length)b.push(q);else a.push(q);distance+=length}return [distinct(a),distinct(b)]}
export type ScalePose=Pose&{steering?:number;odometer?:number;velocity?:number}
// Routes are immutable after construction. Cache arc lengths for per-frame steering lookahead.
const metrics=new WeakMap<Point[],number[]>()
function distances(points:Point[]){let sums=metrics.get(points);if(!sums){sums=[0];for(let i=1;i<points.length;i++)sums.push(sums[i-1]+Math.hypot(points[i].x-points[i-1].x,(points[i].y||0)-(points[i-1].y||0),points[i].z-points[i-1].z));metrics.set(points,sums)}return sums}
function routeLength(points:Point[]){return distances(points).at(-1)!}
function routePoint(points:Point[],distance:number){const sums=distances(points);let lo=1,hi=points.length-1;distance=Math.max(0,Math.min(sums.at(-1)!,distance));while(lo<hi){const mid=(lo+hi)>>1;if(sums[mid]<distance)lo=mid+1;else hi=mid}const a=points[lo-1],b=points[lo],t=(distance-sums[lo-1])/(sums[lo]-sums[lo-1]||1);return {x:a.x+(b.x-a.x)*t,y:(a.y||0)+((b.y||0)-(a.y||0))*t,z:a.z+(b.z-a.z)*t}}
export function sampleScaleVehiclePath(points:Point[],distance:number):ScalePose{
 const length=routeLength(points),center=routePoint(points,distance),front=routePoint(points,Math.min(length,distance+1.28)),rear=routePoint(points,Math.max(0,distance-1.28)),a=routePoint(points,Math.max(0,distance-.16)),b=routePoint(points,Math.min(length,distance+.16)),yaw=Math.atan2(b.x-a.x,b.z-a.z),horizontal=Math.hypot(front.x-rear.x,front.z-rear.z)
 return {...center,velocity:0,odometer:0,steering:0,y:((front.y||0)+(rear.y||0))/2,yaw,pitch:horizontal>0?-Math.atan2((front.y||0)-(rear.y||0),horizontal):0}
}
export function scalePathCurvature(points:Point[],distance:number){const length=routeLength(points),lo=Math.max(0,distance-.25),hi=Math.min(length,distance+.25);if(hi-lo<.001)return 0;const a=sampleScaleVehiclePath(points,lo),b=sampleScaleVehiclePath(points,hi);return Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw))/(hi-lo)}
export function routesForScaleBay(config:BuildingConfig,id:string){
 const l=scaleBuildingLayout(config),bay=scaleBayLayout(config,id),ramps=[] as {x:number;y0:number;y1:number;z0:number;z1:number;run:number}[]
 const climbs:Point[]=[{x:l.portalX,y:0,z:.8}]
 for(let i=0;i<bay.level;i++){
  const south=i%2===0,x=l.rampX[i%2],start=south?14:-14,end=-start,landing=south?20:-20
  climbs.push({x:i?l.rampX[(i-1)%2]:l.portalX,y:i*4,z:landing},{x,y:i*4,z:landing},{x,y:i*4,z:start},{x,y:(i+1)*4,z:end},{x,y:(i+1)*4,z:-landing})
  ramps.push({x,y0:i*4,y1:(i+1)*4,z0:start,z1:end,run:28})
 }
 if(bay.level)climbs.push({x:l.portalX,y:bay.y,z:bay.level%2?-20:20},{x:l.portalX,y:bay.y,z:.8})
 const aisle={x:bay.x,y:bay.y,z:.8}
 const arrival=roundedScaleRoute([{x:l.entry.x+5,y:0,z:l.entry.z},...(bay.level?climbs:[]),aisle,{x:bay.x,y:bay.y,z:bay.z}])
 const [drive,park]=splitScaleRoute(arrival,pathLength(arrival)-1.6)
 const reverse=roundedScaleRoute([{x:bay.x,y:bay.y,z:bay.z},aisle,{x:bay.x-6.4,y:bay.y,z:.8}])
 const departure=roundedScaleRoute([reverse.at(-1)!,aisle,...(bay.level?climbs.slice(1).reverse():climbs),{x:l.portalX,y:0,z:27},{x:l.exit.x+4,y:0,z:27}])
 return {layout:l,bay,ramps,
  approach:[{x:l.entry.x-20,y:0,z:l.entry.z},{x:l.entry.x-4,y:0,z:l.entry.z}],
  crossing:[{x:l.entry.x-4,y:0,z:l.entry.z},{x:l.entry.x+5,y:0,z:l.entry.z}],
  drive,park,reverse,departure,
  exitCross:[{x:l.exit.x+4,y:0,z:27},{x:l.exit.x-5,y:0,z:27}],
  outside:[{x:l.exit.x-5,y:0,z:27},{x:l.exit.x-23,y:0,z:27}]
 }
}
export class ScaleJourneyDirector{
 routes:ReturnType<typeof routesForScaleBay>;pose:ScalePose;stage='idle';running=false;paused=false;automatic=false;speed=1;journeyId:string|null=null;waitReason='';error='';travelled=0;parkedFor=0;private pending:{action:string;next:string}|null=null;private lastClock=0;private velocity=0;private odometer=0
 constructor(config:BuildingConfig,id:string){this.routes=routesForScaleBay(config,id);this.pose=sampleScaleVehiclePath(this.routes.approach,0)}
 checkpoint(){return {version:1,bayId:this.routes.bay.id,geometry:this.routes.layout.width+'/'+this.routes.layout.height,stage:this.stage,pose:{...this.pose},running:this.running,paused:this.paused,automatic:this.automatic,speed:this.speed,journeyId:this.journeyId,travelled:this.travelled,parkedFor:this.parkedFor,pending:this.pending?{...this.pending}:null,lastClock:this.lastClock,velocity:this.velocity,odometer:this.odometer}}
 restore(saved:unknown,phase:string){
  if(!saved||typeof saved!=='object')return false;const c=saved as ReturnType<ScaleJourneyDirector['checkpoint']>;
  const stages=['idle','approach','preparing','entry','entry-open','crossing','drive','park','park-confirm','parked','reverse','departure','exit','exit-open','exit-cross','outside','complete','command'];
  if(c.version!==1||c.bayId!==this.routes.bay.id||c.geometry!==this.routes.layout.width+'/'+this.routes.layout.height||!stages.includes(c.stage)||!c.pose||![c.pose.x,c.pose.y,c.pose.z,c.pose.yaw,c.travelled,c.lastClock,c.velocity,c.odometer,c.parkedFor,c.speed].every(Number.isFinite)||c.travelled<0||['FAULT','RECOVERY_REQUIRED'].includes(phase))return false;
  Object.assign(this,{stage:c.stage,pose:{...c.pose},running:!!c.running,paused:!!c.paused,automatic:!!c.automatic,speed:Math.max(1,Math.min(8,c.speed)),journeyId:c.journeyId,travelled:c.travelled,parkedFor:c.parkedFor,lastClock:c.lastClock,velocity:c.velocity,odometer:c.odometer});this.error='';this.pending=null;
  if(c.pending){
   const recorded:Record<string,string[]>={arrive:['PREPARING','READY'],enter:['ENTERING'],'clear-entry':['ADMITTED'],park:['PARKED'],leave:['DEPARTED'],exit:['EXITING'],'clear-exit':['COMPLETE']};
   const retry:Record<string,string>={arrive:'approach',enter:'entry','clear-entry':'crossing',park:'park',leave:'reverse',exit:'exit','clear-exit':'exit-cross'};
   if(!Object.hasOwn(recorded,c.pending.action))return false;
   this.stage=recorded[c.pending.action].includes(phase)?c.pending.next:retry[c.pending.action];
   if(recorded[c.pending.action].includes(phase))this.travelled=0;
  }
  return true;
 }
 get label(){const labels:Record<string,string>={idle:'Ready for an arrival',approach:'Approaching the entrance camera',preparing:'Waiting for assigned bay DOWN',entry:'Waiting for an entrance lane','entry-open':'Waiting for entrance OPEN',crossing:'Passing the entrance','drive':'Driving to '+this.routes.bay.id,park:'Parking in '+this.routes.bay.id,'park-confirm':'Confirming bay presence',parked:'Parked in your reserved bay',reverse:'Reversing clear of the bollard',departure:'Driving down to the exit',exit:'Waiting at the exit','exit-open':'Waiting for exit OPEN','exit-cross':'Passing the exit',outside:'Leaving the building',complete:'Journey complete',command:'Sending vehicle observation'};return this.error||this.waitReason||labels[this.stage]||this.stage}
 start(automatic:boolean){this.automatic=automatic;this.running=true;this.paused=false;this.pending=null;this.error='';this.journeyId=null;this.lastClock=0;this.travelled=0;this.velocity=0;this.odometer=0;this.stage='approach';this.pose=sampleScaleVehiclePath(this.routes.approach,0)}
 resumeParked(id:string){this.journeyId=id;this.running=false;this.stage='parked';this.pose=sampleScaleVehiclePath(this.routes.park,pathLength(this.routes.park));this.pending=null}
 depart(){if(this.stage!=='parked')return;this.stage='reverse';this.running=true;this.travelled=0;this.pose.reverse=true}
 acknowledge(action:string,id?:string){if(this.pending?.action!==action)return;if(id)this.journeyId=id;this.stage=this.pending.next;this.travelled=0;this.pending=null}
 fail(message:string){this.error=message;this.running=false;this.pending=null}
 private emit(action:string,next:string){this.pending={action,next};this.stage='command';return {action}}
 private move(key:'approach'|'crossing'|'drive'|'park'|'reverse'|'departure'|'exitCross'|'outside',dt:number){
  const points=this.routes[key],length=routeLength(points),remaining=length-this.travelled,time=Math.min(.1,Math.max(0,dt))*this.speed,reverse=key==='reverse',stop=key!=='drive';let target=reverse?1.5:key==='park'?1.8:6
  for(let ahead=0;ahead<=10;ahead+=1){const at=Math.min(length,this.travelled+ahead),curvature=Math.abs(scalePathCurvature(points,at)),corner=curvature>.01?Math.sqrt(1.6/curvature):6;const grade=Math.abs(sampleScaleVehiclePath(points,at).pitch||0)>.03?3.3:6;target=Math.min(target,Math.sqrt(Math.min(corner,grade)**2+2*2.4*ahead))}
  if(stop)target=Math.min(target,Math.sqrt(Math.max(0,2*2.4*remaining)));else target=Math.min(target,Math.sqrt(1.8**2+2*2.4*remaining))
  const before=this.velocity,change=(target>before?2.2:2.4)*time;this.velocity=before+Math.max(-change,Math.min(change,target-before));const step=Math.min(remaining,(before+this.velocity)/2*time);this.travelled=Math.min(length,this.travelled+step);if(length-this.travelled<.008)this.travelled=length
  this.odometer+=(reverse?-1:1)*step;this.pose=sampleScaleVehiclePath(points,this.travelled);this.pose.steering=Math.atan(2.56*scalePathCurvature(points,this.travelled))*(reverse?-1:1);this.pose.odometer=this.odometer;this.pose.velocity=this.velocity*(reverse?-1:1)
  if(reverse){this.pose.yaw+=Math.PI;this.pose.reverse=true}const done=this.travelled>=length-.001;if(done&&stop){this.velocity=0;this.pose.velocity=0}return done
 }
 tick(dt:number,feedback:ScaleFeedback|null):{action:string}|null{
  this.waitReason='';if(!this.running||this.paused||this.pending){this.velocity=0;this.pose.velocity=0;return null}
  if(!feedback){this.velocity=0;this.pose.velocity=0;this.waitReason='Paused: waiting for fresh simulation feedback';return null}
  if(feedback.clock<this.lastClock){this.fail('Simulation restarted. Return to the Scale lab and review the active journey.');return null}this.lastClock=feedback.clock
  const b=feedback.bay,j=feedback.journey
  if(j&&['FAULT','RECOVERY_REQUIRED'].includes(j.phase)){this.waitReason='Journey needs review in the Scale lab';return null}
  const ready=b.position==='DOWN'&&b.health==='HEALTHY'&&b.occupancy==='CLEAR'
  switch(this.stage){
   case'approach':if(this.move('approach',dt))return this.emit('arrive','preparing');break
   case'preparing':if(j?.phase==='READY'&&ready){this.stage='entry';return this.tick(0,feedback)}break
   case'entry':if(j?.phase==='READY'&&ready&&feedback.entry.position==='CLOSED'&&!feedback.entry.journeyId)return this.emit('enter','entry-open');break
   case'entry-open':if(feedback.entry.position==='OPEN'&&feedback.entry.journeyId===this.journeyId){this.stage='crossing';this.travelled=0}break
   case'crossing':if(feedback.entry.position!=='OPEN'||feedback.entry.journeyId!==this.journeyId){this.waitReason='Waiting for this vehicle\'s entrance permission';break}if(this.move('crossing',dt))return this.emit('clear-entry','drive');break
   case'drive':if(!ready){this.waitReason='Waiting for healthy assigned-bay DOWN feedback';break}if(this.move('drive',dt)){this.stage='park';this.travelled=0}break
   case'park':if(!ready){this.waitReason='Waiting for bay readiness before parking';break}if(this.move('park',dt))return this.emit('park','park-confirm');break
   case'park-confirm':if(j?.phase==='PARKED'&&b.occupancy==='PRESENT'){this.stage='parked';this.parkedFor=0;if(!this.automatic)this.running=false}break
   case'parked':if(this.automatic){this.parkedFor+=Math.min(.1,dt)*this.speed;if(this.parkedFor>=4)this.depart()}break
   case'reverse':if(b.position!=='DOWN'){this.waitReason='Cannot reverse across an unconfirmed bollard';break}if(this.move('reverse',dt))return this.emit('leave','departure');break
   case'departure':if(this.move('departure',dt)){this.stage='exit';this.travelled=0}break
   case'exit':if(j?.phase==='DEPARTED'&&feedback.exit.position==='CLOSED'&&!feedback.exit.journeyId)return this.emit('exit','exit-open');break
   case'exit-open':if(feedback.exit.position==='OPEN'&&feedback.exit.journeyId===this.journeyId){this.stage='exit-cross';this.travelled=0}break
   case'exit-cross':if(feedback.exit.position!=='OPEN'||feedback.exit.journeyId!==this.journeyId){this.waitReason='Waiting for this vehicle\'s exit permission';break}if(this.move('exitCross',dt))return this.emit('clear-exit','outside');break
   case'outside':if(this.move('outside',dt)&&j?.phase==='COMPLETE'){this.stage='complete';this.running=false}break
  }
  return null
 }
}
