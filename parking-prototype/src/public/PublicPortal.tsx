import {useEffect,useRef,useState} from 'react'
import {lazy} from 'react'
import {Bell,Building2,Code2,Leaf,ShieldCheck,Smartphone} from 'lucide-react'
import UserApp from './UserApp'
import SecurityApp from './SecurityApp'
const DeveloperConsole=lazy(()=>import('./DeveloperConsole'))
import CentralConsole from './CentralConsole'
import {GuardApp,SystemFlow} from './OperationsViews'
import type {Portal,Profile,PublicState,Run} from './types'
import './public.css'
import '@fontsource-variable/manrope'
import '../design.css'
import './design-polish.css'
import './server-room.css'
export default function PublicPortal({portal,centralOnly=false,guardOnly=false}:{portal:Portal;centralOnly?:boolean;guardOnly?:boolean}){
 const nativeUser=['user','security'].includes(portal)&&['user','guard'].includes(new URLSearchParams(location.search).get('native')||'')
 const initial=new URLSearchParams(location.search).get('identity')||(portal==='security'?'security-res':portal==='developer'?'developer':'public-visitor')
 const [identity,setIdentity]=useState(initial),[profiles,setProfiles]=useState<Profile[]>([]),[state,setState]=useState<PublicState|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[connectionError,setConnectionError]=useState(''),[online,setOnline]=useState(false),[lastSuccess,setLastSuccess]=useState(0)
 const [creatorKey,setCreatorKey]=useState(()=>sessionStorage.getItem('baypilot-creator-key')||''),[draftKey,setDraftKey]=useState('')
 const currentIdentity=useRef(identity);currentIdentity.current=identity
 const headers=(who=identity)=>({authorization:'Bearer demo:'+who,...(creatorKey?{'x-creator-key':creatorKey}:{})})
 const loadProfiles=async()=>{const r=await fetch('/api/public/demo-profiles',{headers:headers()});if(!r.ok)throw Error('Demo profile service unavailable');const data=await r.json();setProfiles(data.profiles)}
 useEffect(()=>{
  if(portal==='developer'&&!creatorKey)return
  let active=true;setState(null);setOnline(false);setError('')
  const refresh=async()=>{try{
   const r=await fetch('/api/public/state',{headers:headers()}),data=await r.json();if(!r.ok){if(r.status===403&&portal==='developer'){sessionStorage.removeItem('baypilot-creator-key');setCreatorKey('')}throw Error(data.error||'Parking service unavailable')}
   if(active){setState(data);setOnline(true);setLastSuccess(Date.now());setConnectionError('')}
  }catch(e){if(active){setOnline(false);setConnectionError(e instanceof Error?e.message:'Parking service unavailable')}}}
  void refresh();const timer=setInterval(()=>void refresh(),1200);window.addEventListener('larp-alert',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('larp-alert',refresh)}
 },[identity,creatorKey,portal])
 useEffect(()=>{if(portal!=='developer'||creatorKey)void loadProfiles().catch(e=>setError(String(e)))},[creatorKey,portal])
 useEffect(()=>{const candidate=profiles.find(p=>p.role===portal);if(candidate&&!profiles.some(p=>p.id===identity&&p.role===portal))setIdentity(candidate.id)},[profiles,identity,portal])
 const run:Run=async(route,body,success='')=>{
  if(!online){setError('Connection is unavailable. Wait for a fresh server observation before acting.');return null}
  const actor=identity;setBusy(true);setError('');setMessage('');try{
   const response=await fetch('/api/public/'+route,{method:'POST',headers:{'content-type':'application/json',...headers(actor)},body:JSON.stringify(body)}),result=await response.json();if(!response.ok)throw Error(result.error||'Request rejected')
   const fresh=await fetch('/api/public/state',{headers:headers(actor)});if(!fresh.ok)throw Error('Could not refresh current parking state');const updated=await fresh.json()
   if(currentIdentity.current===actor){setState(updated);setLastSuccess(Date.now());setOnline(true);if(route==='developer/handover-fixture')await loadProfiles();setMessage(success)}return result
  }catch(e){if(currentIdentity.current===actor)setError(e instanceof Error?e.message:'Request failed');return null}finally{setBusy(false)}
 }
 function changeIdentity(value:string){setIdentity(value);setMessage('');setError('');const url=new URL(location.href);url.searchParams.set('identity',value);history.replaceState({},'',url)}
 if(portal==='developer'&&!creatorKey)return <div className="p-shell"><main className="p-main"><section className="p-hero"><div><span className="p-eyebrow">CREATOR ACCESS</span><h1>Private test console.</h1><p>Fault injection, scenario evidence and model controls require your separate local creator key.</p></div></section><section className="p-panel p-creator-unlock"><h2>Unlock your workspace</h2>{(connectionError||error)&&<p role="alert" className="p-warning">{connectionError||error}</p>}<form onSubmit={e=>{e.preventDefault();sessionStorage.setItem('baypilot-creator-key',draftKey.trim());setCreatorKey(draftKey.trim());setDraftKey('')}}><label>Creator key<input aria-label="Creator key" type="password" autoComplete="off" value={draftKey} onChange={e=>setDraftKey(e.target.value)} required/></label><button className="p-button">Unlock creator console</button></form><p>The API writes <code>creator-console-key</code> in its local data directory. This key is separate from selectable demo users and is kept out of URLs.</p><details><summary>Docker key location</summary><p>Read the local file using PowerShell from the product folder:</p><code>docker compose exec -T api cat /workspace/parking-prototype/data/creator-console-key</code></details><a href="/app" className="p-text-button">Return to user app</a></section></main></div>
 return <div className={'p-shell larp-design p-portal-'+portal+(portal==='security'&&!guardOnly?' p-server-room':'')} data-public-ready={state?.profile.role===portal?'true':'false'}>
  <header className="p-topbar"><a className="p-brand" href="/app"><span><Building2 size={25}/></span><div>LARP<small>PARKING, CONNECTED</small></div></a>{!nativeUser&&portal==='security'&&<nav aria-label="Security applications"><a href="/guard" className={guardOnly?'active':''}>Guard duty</a><a href="/server-room" className={!guardOnly?'active':''}>Server room</a></nav>}{portal==='developer'&&<span className="p-eyebrow">PRIVATE DEVELOPER APP</span>}<div className="p-profile"><span>{state?.profile.name||'Connectingâ€¦'}</span><Bell size={18}/>{state&&<b>{state.notifications.filter(n=>!n.read).length}</b>}</div></header>
  <div className="p-demo-bar"><div><span className="p-demo-dot"/>DEMO PORTFOLIO <span>Â· Synthetic identities Â· Residential circuit + EV software model</span></div><label>Demo identity<select aria-label="Demo identity" value={identity} disabled={busy} onChange={e=>changeIdentity(e.target.value)}>{profiles.filter(p=>p.role===portal).map(p=><option value={p.id} key={p.id}>{p.name}{p.accountStatus==='INVITED'?' Â· invitation pending':''}</option>)}</select></label></div>
  <div className={'p-connection-strip '+(!online?'offline':'')} role="status">{online?'Connected':'Offline / unconfirmed'}{lastSuccess?' Â· Last successful update '+new Date(lastSuccess).toLocaleTimeString():''}{!online&&' Â· Controls paused until the server responds'}</div>
  <main className="p-main">{connectionError&&<div className="p-banner p-error" role="alert">{connectionError}</div>}{error&&<div className="p-banner p-error" role="alert">{error}</div>}{message&&<div className="p-banner p-success" role="status">{message}</div>}{state?.profile.role===portal?(portal==='user'?<UserApp state={state} run={run} busy={busy||!online} online={online}/>:portal==='security'?(guardOnly?<GuardApp state={state} run={run} busy={busy||!online}/>:<><SystemFlow state={state} online={online}/><SecurityApp state={state} run={run} busy={busy||!online}/></>):centralOnly?<CentralConsole state={state} run={run} busy={busy||!online}/>:<DeveloperConsole state={state} run={run} busy={busy||!online}/>):<div className="p-loading">Connecting to your parking workspaceâ€¦</div>}</main>
  <footer className="p-footer"><span><Leaf size={16}/>Access, a dependable space, charging and help.</span><span>Synthetic accounts Â· No production login, payment or physical charger integration.</span></footer>
 </div>
}
