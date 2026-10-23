import ReactDOM from 'react-dom/client'
import App from './App'
import {lazy,Suspense} from 'react'
const ScaleDemo=lazy(()=>import('./ScaleDemo'))
const ScaleJourney3D=lazy(()=>import('./ScaleJourney3D'))
const PublicPortal=lazy(()=>import('./public/PublicPortal'))
const view=new URLSearchParams(window.location.search).get('view')
const selectedApp=new URLSearchParams(window.location.search).get('app')||window.location.pathname.slice(1)
const portal=['security','guard','server-room'].includes(selectedApp)?'security':['developer','central'].includes(selectedApp)?'developer':'user'
if(selectedApp==='developer')window.location.replace(location.protocol+'//'+location.hostname+':8081/')
if(!view&&(['saas'].includes(selectedApp)||!selectedApp))window.location.replace('/website/index.html')
ReactDOM.createRoot(document.getElementById('root')!).render(selectedApp==='developer'?<p>Opening the standalone developer app...</p>:view==='scale-three'?<Suspense fallback={<div>Loading the live building journey…</div>}><ScaleJourney3D/></Suspense>:view==='scale'?<Suspense fallback={<div>Loading the Scale lab…</div>}><ScaleDemo/></Suspense>:view?<App/>:<Suspense fallback={<div>Loading LARP…</div>}><PublicPortal portal={portal} centralOnly={selectedApp==='central'} guardOnly={selectedApp==='guard'}/></Suspense>)
