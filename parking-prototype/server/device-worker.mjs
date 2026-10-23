import { Controller } from './controller.mjs';
const ids=['R-101','R-102','R-103','R-104','V-01','V-02','V-03','V-04','T-01'];
let devices=new Map(); let sequence=0;
function reset() {
  devices=new Map(ids.map(id=>[id,new Controller(id)]));
  for (const id of ['R-101','R-103']) { const device=devices.get(id); device.position='DOWN'; device.distance=30; device.occupancy='PRESENT'; device.presentFor=3000; device.wasOccupied=true; device.holdUntil=0; }
}
function publish(replyId=null,value=null) { process.send?.({replyId,value,sequence:++sequence,bays:[...devices.values()].map(device=>device.snapshot())}); }
reset();
process.on('message', message=>{
  try {
    const device=devices.get(message.bayId);
    let value={ok:true};
    if (message.type==='unlock') value=device.unlock(message.commandId,message.duration);
    if (message.type==='presence') device.observe(message.distance);
    if (message.type==='fault') device.setFault(message.fault);
    if (message.type==='advance') for (const item of devices.values()) item.tick(message.milliseconds);
    if (message.type==='emergency') for (const item of devices.values()) item.emergency(message.active);
    if (message.type==='reset') reset();
    publish(message.id,value);
  } catch(error) { publish(message.id,{error:error.message}); }
});
if (process.env.PARKING_AUTO_TICK!=='0') setInterval(()=>{for(const device of devices.values())device.tick(250);publish();},250);
process.on('disconnect',()=>process.exit(0));
