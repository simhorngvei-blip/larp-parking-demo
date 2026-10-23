import ReactDOM from 'react-dom/client'
import {Suspense} from 'react'
import PublicPortal from './public/PublicPortal'
import './style.css'
ReactDOM.createRoot(document.getElementById('root')!).render(<Suspense fallback={<p>Loading the private LARP workbench...</p>}><PublicPortal portal="developer"/></Suspense>)
