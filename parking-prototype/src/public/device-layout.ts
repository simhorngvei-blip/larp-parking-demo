type RoutedDevice={id:string;kind:string;parent:string|null}
export function layoutDevices<T extends RoutedDevice>(devices:T[],selected:string):(T&{position:{x:number;y:number}})[]{
 const chosen=devices.find(n=>n.id===selected),group=chosen?.kind==='bay'?chosen.parent:chosen?.kind==='controller'?chosen.id:null
 const visible=devices.filter(n=>n.kind!=='bay'||n.parent===group),positions=new Map<string,{x:number;y:number}>(),controllers=visible.filter(n=>n.kind==='controller'),gap=245,center=(Math.max(1,controllers.length)-1)*gap/2
 visible.filter(n=>n.kind==='server').forEach((n,i)=>positions.set(n.id,{x:center+i*gap,y:0}))
 visible.filter(n=>n.kind==='flow').forEach((n,i)=>positions.set(n.id,{x:center+i*gap,y:210}))
 visible.filter(n=>n.kind==='gate').forEach((n,i)=>positions.set(n.id,{x:center+(i%2===0?-1:1)*(330+Math.floor(i/2)*gap),y:210}))
 controllers.forEach((n,i)=>positions.set(n.id,{x:i*gap,y:420}))
 const bays=visible.filter(n=>n.kind==='bay'),anchor=center
 bays.forEach((n,i)=>positions.set(n.id,{x:anchor+(i-(bays.length-1)/2)*gap,y:630}))
 const offset=Math.min(0,...[...positions.values()].map(p=>p.x))
 return visible.map(n=>({...n,position:{x:(positions.get(n.id)?.x??0)-offset,y:positions.get(n.id)?.y??840}}))
}
