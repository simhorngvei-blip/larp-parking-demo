export const LEVELS=[{id:0,name:'Ground floor',short:'G',y:0},{id:1,name:'Level 1',short:'L1',y:4},{id:2,name:'Level 2',short:'L2',y:8}]
export const BAY_LAYOUT=['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'].map((id,index)=>({id,x:-10+(index%3)*3.2,y:Math.floor(index/3)*4,z:-5.6,level:Math.floor(index/3)}))
export function bayLayout(id:string){const bay=BAY_LAYOUT.find(b=>b.id===id);if(!bay)throw new Error('Unknown parking bay');return bay}
// Gate arms must rise outside both the podium and the external ramp structures.
export const GATES={entry:{x:-17,z:.5},exit:{x:29,z:-3.5}}
export const RAMPS=[{level:1,x:19,fromY:0,toY:4,fromZ:7,toZ:-7},{level:2,x:24,fromY:4,toY:8,fromZ:-7,toZ:7}]
export const LANDINGS=[{level:0,x:14.5,z:11,width:15,depth:8},{level:1,x:17,z:-11,width:20,depth:8},{level:2,x:17,z:11,width:20,depth:8}]
export const PORTAL={x:10,halfWidth:2.6}
