type VisibilityDocument=Pick<Document,'hidden'|'addEventListener'|'removeEventListener'>
export function startVisiblePolling(task:()=>unknown|Promise<unknown>,{intervalMs,document:doc=globalThis.document,onError=()=>{}}:{intervalMs:number;document?:VisibilityDocument;onError?:(error:unknown)=>void}){
 let stopped=false,running=false,again=false,timer:ReturnType<typeof setTimeout>|undefined
 const refresh=()=>{clearTimeout(timer);if(stopped||doc.hidden)return;if(running){again=true;return}running=true
  void Promise.resolve().then(task).catch(onError).finally(()=>{running=false;if(stopped||doc.hidden)return;const delay=again?0:intervalMs;again=false;timer=setTimeout(refresh,delay)})
 }
 const visibility=()=>{clearTimeout(timer);again=false;if(!doc.hidden)refresh()}
 doc.addEventListener('visibilitychange',visibility);refresh()
 return {refresh,stop(){stopped=true;clearTimeout(timer);doc.removeEventListener('visibilitychange',visibility)}}
}
