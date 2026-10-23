// UI controls run serially, independently of the telemetry poll loop.
// An uncertain UI operation is never replayed by the bridge.
export function createCommandDispatcher(apply,onError){
 const seen=new Set(),queue=[];let running=null,closed=false;
 function enqueue(commands){
  if(closed)return;
  for(const command of commands)if(!seen.has(command.id)){seen.add(command.id);queue.push(command);}
  if(running||!queue.length)return;
  running=(async()=>{while(queue.length){try{await apply(queue.shift());}catch(error){queue.length=0;onError(error);break;}}})().finally(()=>{running=null;});
 }
 return {enqueue,async close(){closed=true;await running;}};
}
