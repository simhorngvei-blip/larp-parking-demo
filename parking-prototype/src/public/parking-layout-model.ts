import type {MapSlot} from './types'
export function bayAppearance(bay:Pick<MapSlot,'status'|'source'>,online=true){
 const status=!online||bay.source==='ILLUSTRATIVE_LAYOUT'?'UNKNOWN':bay.status
 const colors:Record<string,string>={VACANT:'#42a88b',OCCUPIED:'#dc795e',RESERVED:'#d2a247',UNAVAILABLE:'#aa6173',UNKNOWN:'#80939f'}
 return {status,color:colors[status]||colors.UNKNOWN,car:status==='OCCUPIED'}
}
export function layoutFloor(layout:{width:number;height:number;slots:MapSlot[]},floor:string){
 return layout.slots.filter(b=>b.level===floor).map(b=>({...b,x:(b.x+b.w/2-layout.width/2)/25,z:(b.y+b.h/2-layout.height/2)/25,width:b.w/25,depth:b.h/25}))
}
