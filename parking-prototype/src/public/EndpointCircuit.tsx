import {startVisiblePolling} from '../visible-polling'
import {useEffect,useState} from 'react'
import type {DeviceNode} from './types'
import {endpointCircuit} from './endpoint-circuit'
type Frame={frameAgeMs:number|null;wokwi?:{connected:boolean;projectUrl?:string;telemetryAgeMs:number|null}}
export default function EndpointCircuit({node}:{node:DeviceNode}){
 const candidate=endpointCircuit(node),circuit=candidate?.scope==='SHARED_LOT'?candidate:null,[frame,setFrame]=useState<Frame|null>(null),[image,setImage]=useState(''),[error,setError]=useState('')
 useEffect(()=>{if(!circuit)return;let stopped=false,objectUrl='';const abort=new AbortController()
  async function poll(){try{
   const response=await fetch(circuit!.status,{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});if(!response.ok)throw Error('Live circuit status unavailable')
   const status:Frame=await response.json();if(!status.wokwi?.connected||status.frameAgeMs===null||status.frameAgeMs>8000)throw Error('No fresh Wokwi capture. Retained telemetry is not a live circuit image.')
   const capture=await fetch(circuit!.image+'?t='+Date.now(),{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});if(!capture.ok||!capture.headers.get('content-type')?.includes('image/'))throw Error('Live circuit image unavailable')
   const blob=await capture.blob();if(stopped)return;const next=URL.createObjectURL(blob);if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=next;setImage(next);setFrame(status);setError('')
  }catch(e){if(!stopped){setImage('');setError(e instanceof Error?e.message:'Circuit unavailable')}}}
  const polling=startVisiblePolling(poll,{intervalMs:3000});return()=>{stopped=true;abort.abort();polling.stop();if(objectUrl)URL.revokeObjectURL(objectUrl)}
 },[node.id])
 const endpoint=node.runtime?.positions.find(p=>p.id===node.id)
 return <section className="r-circuit" aria-label={'Live Wokwi circuit for '+node.id}><h2>Live Wokwi / {node.id}</h2><p>This is the same running ESP32 parking-lot simulation used by the apps. Locate <strong>{node.id}</strong> in the circuit; its scoped readings and console follow below. Viewing it sends no commands.</p><div className="r-endpoint-readings"><span>Selected endpoint <strong>{node.id}</strong></span><span>Position <strong>{node.runtime?.observed?(endpoint?.position||node.activity):'UNKNOWN'}</strong></span><span>Occupancy <strong>{node.runtime?.observed?endpoint?.occupancy||'Not a bay':'UNKNOWN'}</strong></span><span>Telemetry age <strong>{node.runtime?.telemetryAgeMs??'Unknown'} ms</strong></span></div>{error?<p role="status" className="r-failure">{error}</p>:image?<figure className="r-bench-preview"><img src={image} alt={'Live shared Wokwi parking circuit containing '+node.id}/><figcaption>Shared nine-bay firmware circuit / capture age {frame?.frameAgeMs} ms at retrieval. This is a live view, not a separate bollard simulation.</figcaption></figure>:<p role="status">Loading the running Wokwi circuit…</p>}<div className="r-circuit-links"><a href="/circuit/" target="_blank" rel="noreferrer">Open app and live circuit</a>{frame?.wokwi?.projectUrl?.startsWith('https://wokwi.com/projects/')&&<a href={frame.wokwi.projectUrl} target="_blank" rel="noreferrer">Open independent Wokwi editor</a>}</div></section>
}
