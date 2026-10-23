import {bayLayout,GATES,LANDINGS} from './layout.ts'
import type {WokwiState} from '../types'
export type Point={x:number;y?:number;z:number}
export type Pose=Point&{yaw:number;pitch?:number;reverse?:boolean}
export type SceneEvent={action:string}
const entry=GATES.entry,exitGate=GATES.exit
export const PATHS:Record<string,Point[]>={
 approach:[{x:-27,z:entry.z},{x:entry.x-3.2,z:entry.z}],
 front:[{x:entry.x-3.2,z:entry.z},{x:entry.x-1.7,z:entry.z}],
 crossing:[{x:entry.x-1.7,z:entry.z},{x:entry.x+2.4,z:entry.z}],
 bay:[{x:entry.x+2.4,y:0,z:entry.z},{x:-9.1,y:0,z:.5},{x:-7.5,y:0,z:.1},{x:-6.8,y:0,z:-1.5},{x:-6.8,y:0,z:-5.6}],
 leave:[{x:-6.8,y:0,z:-5.6},{x:-6.8,y:0,z:.8}],
 exit:[{x:-6.8,y:0,z:.8},{x:10,y:0,z:.8},{x:10,y:0,z:exitGate.z},{x:exitGate.x-3.2,y:0,z:exitGate.z}],
 exitFront:[{x:exitGate.x-3.2,z:exitGate.z},{x:exitGate.x-1.7,z:exitGate.z}],
 exitCross:[{x:exitGate.x-1.7,z:exitGate.z},{x:exitGate.x+3,z:exitGate.z}],
 outside:[{x:exitGate.x+3,z:exitGate.z},{x:36,z:exitGate.z}]
}
export function pathsForBay(id:string){
 const b=bayLayout(id),y=b.y
 if(id==='R-102')return PATHS
 const south=LANDINGS[0].z,north=LANDINGS[1].z
 const climbs:Point[]=b.level===0?[]:[{x:10,y:0,z:.5},{x:10,y:0,z:south},{x:19,y:0,z:south},{x:19,y:0,z:7},{x:19,y:4,z:-7},{x:19,y:4,z:north},...(b.level===2?[{x:24,y:4,z:north},{x:24,y:4,z:-7},{x:24,y:8,z:7},{x:24,y:8,z:south},{x:10,y:8,z:south}]:[{x:10,y:4,z:north}]),{x:10,y,z:.5}]
 const aisle:Point={x:b.x,y,z:.8}
 const bay=[{x:entry.x+2.4,y:0,z:entry.z},...climbs,{x:b.x,y,z:.5},{x:b.x,y,z:-5.6}]
 const exit=[aisle,...(climbs.length?[{x:10,y,z:.5},...climbs.slice(0,-1).reverse()]:[]),{x:10,y:0,z:.8},{x:10,y:0,z:exitGate.z},{x:exitGate.x-3.2,y:0,z:exitGate.z}]
 return {...PATHS,bay,leave:[{x:b.x,y,z:b.z},aisle],exit}
}
export function pathLength(points:Point[]){return points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,(p.y||0)-(points[i].y||0),p.z-points[i].z),0)}
export function samplePath(points:Point[],distance:number):Pose{
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,(b.y||0)-(a.y||0),b.z-a.z);if(distance<=length||i===points.length-1){const t=Math.max(0,Math.min(1,distance/length));return{pitch:-Math.atan2((b.y||0)-(a.y||0),Math.hypot(b.x-a.x,b.z-a.z)),y:(a.y||0)+((b.y||0)-(a.y||0))*t,x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(b.x-a.x,b.z-a.z)}}distance-=length}
 return {...points[0],yaw:Math.PI/2}
}
// Sample both axles so the body starts tilting before its centre reaches a joint.
export function sampleVehiclePath(points:Point[],distance:number):Pose{
 const pose=samplePath(points,distance),front=samplePath(points,Math.min(pathLength(points),distance+1.1)),rear=samplePath(points,Math.max(0,distance-1.1))
 const horizontal=Math.hypot(front.x-rear.x,front.z-rear.z)
 return {...pose,y:((front.y||0)+(rear.y||0))/2,pitch:horizontal>0?-Math.atan2((front.y||0)-(rear.y||0),horizontal):0}
}
const labels:Record<string,string>={idle:'Ready for an arrival',approach:'Approaching the plate camera','entry-wait':'Waiting for entrance + bay feedback',front:'Entering the beam zone','beam-wait':'Waiting for entry beam feedback',crossing:'Passing the entrance','entry-clear-wait':'Waiting for the lane beam to clear',bay:'Driving to R-102','park-wait':'Confirming vehicle presence',parked:'Parked in your reserved bay',leave:'Reversing out of the bay','bay-clear-wait':'Waiting for a clear bay sensor',exit:'Approaching the exit','exit-wait':'Waiting for the exit boom','exit-front':'Entering the exit beam zone','exit-beam-wait':'Waiting for exit beam feedback','exit-cross':'Clearing the exit lane',outside:'Leaving the building','complete-wait':'Waiting for final barrier feedback',complete:'Journey complete',command:'Sending a vehicle event'}
export class JourneyDirector{
 checkpoint(){return {version:1,bayId:this.bayId,stage:this.stage,pose:{...this.pose},running:this.running,paused:this.paused,automatic:this.automatic,travelled:this.travelled,parkedFor:this.parkedFor,pending:this.pending?{...this.pending}:null,lastTelemetryMs:this.lastTelemetryMs}}
 restore(saved:unknown,phase:string){
  if(!saved||typeof saved!=='object')return false;const c=saved as ReturnType<JourneyDirector['checkpoint']>;
  if(c.version!==1||c.bayId!==this.bayId||!Object.hasOwn(labels,c.stage)||!c.pose||![c.pose.x,c.pose.z,c.pose.yaw,c.travelled,c.parkedFor,c.lastTelemetryMs].every(Number.isFinite)||c.travelled<0||phase==='RECOVERY_REQUIRED')return false;
  Object.assign(this,{stage:c.stage,pose:{...c.pose},running:!!c.running,paused:!!c.paused,automatic:!!c.automatic,travelled:c.travelled,parkedFor:c.parkedFor,lastTelemetryMs:c.lastTelemetryMs});this.pending=null;this.error='';
  if(c.pending){const observed:Record<string,string[]>={arrive:['ARRIVAL_REQUESTED'],enter:['ENTERING'],'clear-entry':['ENTERING'],park:['PARKED'],leave:['LEFT_BAY'],exit:['EXIT_REQUESTED'],'pass-exit':['EXITING'],'clear-exit':['EXIT_LANE_CLEARED','COMPLETE'],'reopen-entry':['ARRIVAL_REQUESTED'],'reopen-exit':['EXIT_REQUESTED']};if(observed[c.pending.action]?.includes(phase)){this.stage=c.pending.next;this.travelled=0;}else this.resumeObserved({phase});}
  return true;
 }
 resumeObserved({phase,entryPassed=false}:{phase:string;entryPassed?:boolean}){
  this.pending=null;this.error='';this.travelled=0;this.running=true;
  if(phase==='PARKED'){this.resumeParked();return}if(phase==='COMPLETE'){this.resumeComplete();return}
  const stage:Record<string,string>={ARRIVAL_REQUESTED:'entry-wait',ENTERING:entryPassed?'bay':'beam-wait',LEFT_BAY:'exit',EXIT_REQUESTED:'exit-wait',EXITING:'exit-beam-wait',EXIT_LANE_CLEARED:'outside'};
  this.stage=stage[phase]||'idle';if(this.stage==='idle'){this.running=false;return}
  const path=this.stage==='entry-wait'?this.paths.approach:this.stage==='beam-wait'?this.paths.front:this.stage==='bay'?this.paths.bay:this.stage==='exit'?this.paths.exit:this.stage==='exit-wait'?this.paths.exit:this.stage==='exit-beam-wait'?this.paths.exitFront:this.paths.outside;
  this.pose=sampleVehiclePath(path,['entry-wait','beam-wait','exit-wait','exit-beam-wait'].includes(this.stage)?pathLength(path):0);
 }
 paths=PATHS;bayId='R-102'
 configure(id:string){if(this.running)throw new Error('Stop the current journey before changing bays');this.bayId=id;this.paths=pathsForBay(id)}
 pose:Pose=samplePath(PATHS.approach,0)
 stage='idle';running=false;paused=false;automatic=false;waitReason='';error='';travelled=0;parkedFor=0
 private pending:{action:string;next:string}|null=null
 private lastTelemetryMs=0
 get label(){return this.error||this.waitReason||(this.stage==='bay'?'Driving to '+this.bayId:labels[this.stage])||this.stage}
 start(automatic:boolean){this.pose=samplePath(PATHS.approach,0);this.stage='approach';this.running=true;this.automatic=automatic;this.paused=false;this.pending=null;this.error='';this.travelled=0;this.lastTelemetryMs=0}
 resumeParked(){this.pose={...bayLayout(this.bayId),yaw:Math.PI};this.stage='parked';this.running=false;this.pending=null;this.error=''}
 resumeComplete(){this.pose={x:36,y:0,z:exitGate.z,yaw:Math.PI/2,pitch:0};this.stage='complete';this.running=false}
 depart(){if(this.stage!=='parked')return;this.running=true;this.stage='leave';this.travelled=0;this.pose.reverse=true}
 acknowledge(action:string){if(this.pending?.action!==action)return;this.stage=this.pending.next;this.pending=null;if(!action.startsWith('reopen-'))this.travelled=0}
 fail(message:string){this.error=message;this.running=false;this.pending=null}
 private emit(action:string,next:string):SceneEvent{this.pending={action,next};this.stage='command';return{action}}
 private move(route:string,dt:number,throttle:number){const points=this.paths[route];this.travelled=Math.min(pathLength(points),this.travelled+Math.min(.1,dt)*2.8*Math.max(0,Math.min(1,throttle)));this.pose=sampleVehiclePath(points,this.travelled);if(route==='leave'){this.pose.yaw+=Math.PI;this.pose.reverse=true}return this.travelled>=pathLength(points)-.001}
 tick(dt:number,w:WokwiState|null,throttle=1):SceneEvent|null{
  this.waitReason='';if(!this.running||this.paused||this.pending)return null
  const root=w?.telemetry,selected=root?.bays?.find(b=>b.id===this.bayId)
  const t=root?{...root,...selected}:null
  if(!w?.connected||!t){this.waitReason='Paused · circuit feedback is offline';return null}
  if(w.phase==='RECOVERY_REQUIRED'){this.waitReason='Paused · staff inspection required';return null}
  if(t.ms<this.lastTelemetryMs){this.fail('Circuit restarted. Reload the scene before a new journey.');return null}this.lastTelemetryMs=t.ms
  if(w.error){this.waitReason='Paused · controller request needs review';return null}
  if((root?.bays&&!selected)||t.emergency||t.health!=='HEALTHY'||root?.health==='GATE_FAULT'){this.waitReason=t.emergency?'Paused · emergency latch active':'Paused · controller needs attention';return null}
  switch(this.stage){
   case'approach':if(this.move('approach',dt,throttle))return this.emit('arrive','entry-wait');break
   case'entry-wait':if(t.entry==='OPEN'&&t.bay==='DOWN'){this.stage='front';this.travelled=0}else if(t.entry==='CLOSED'&&t.bay==='DOWN'&&w.phase==='ARRIVAL_REQUESTED')return this.emit('reopen-entry','entry-reopen-wait');break
   case'entry-reopen-wait':if(t.entry==='OPEN')this.stage='front';break
   case'front':if(t.entry==='CLOSED'&&t.bay==='DOWN')return this.emit('reopen-entry','entry-reopen-wait');if(t.entry!=='OPEN'||t.bay!=='DOWN'){this.waitReason='Waiting for confirmed entrance OPEN and bay DOWN';break}if(this.move('front',dt,throttle))return this.emit('enter','beam-wait');break
   case'beam-wait':if(t.entryBeam===1){this.stage='crossing';this.travelled=0}break
   case'crossing':if(t.entry!=='OPEN'){this.waitReason='Waiting for the entrance boom to reopen';break}if(this.move('crossing',dt,throttle))return this.emit('clear-entry','entry-clear-wait');break
   case'entry-clear-wait':if(t.entryBeam===0){this.stage='bay';this.travelled=0}break
   case'bay':if(t.bay!=='DOWN'){this.waitReason='Waiting for the parking barrier to lower';break}if(this.move('bay',dt,throttle))return this.emit('park','park-wait');break
   case'park-wait':if(t.occupancy==='PRESENT'){this.stage='parked';this.parkedFor=0;if(!this.automatic)this.running=false}break
   case'parked':if(this.automatic){this.parkedFor+=Math.min(dt,.1);if(this.parkedFor>4)this.depart()}break
   case'leave':if(t.bay!=='DOWN'){this.waitReason='The car cannot leave across a raised bay barrier';break}if(this.move('leave',dt,throttle))return this.emit('leave','bay-clear-wait');break
   case'bay-clear-wait':if(t.occupancy==='CLEAR'){this.stage='exit';this.travelled=0}break
   case'exit':if(this.move('exit',dt,throttle))return this.emit('exit','exit-wait');break
   case'exit-wait':if(t.exit==='OPEN'){this.stage='exit-front';this.travelled=0}else if(t.exit==='CLOSED'&&w.phase==='EXIT_REQUESTED')return this.emit('reopen-exit','exit-reopen-wait');break
   case'exit-reopen-wait':if(t.exit==='OPEN')this.stage='exit-front';break
   case'exit-front':if(t.exit==='CLOSED')return this.emit('reopen-exit','exit-reopen-wait');if(t.exit!=='OPEN')break;if(this.move('exitFront',dt,throttle))return this.emit('pass-exit','exit-beam-wait');break
   case'exit-beam-wait':if(t.exitBeam===1){this.stage='exit-cross';this.travelled=0}break
   case'exit-cross':if(t.exit!=='OPEN')break;if(this.move('exitCross',dt,throttle))return this.emit('clear-exit','outside');break
   case'outside':if(this.move('outside',dt,throttle))this.stage='complete-wait';break
   case'complete-wait':if(w.phase==='COMPLETE'&&t.bay==='UP'&&t.entry==='CLOSED'&&t.exit==='CLOSED'){this.stage='complete';this.running=false}break
  }
  return null
 }
}
