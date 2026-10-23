import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {fileURLToPath} from 'node:url'
export default defineConfig({publicDir:false,resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},plugins:[react(),tailwindcss()],define:{'import.meta.env.VITE_LARP_DEMO_ORIGIN':JSON.stringify('http://localhost:8080')},build:{outDir:'artifacts/saas-site',rolldownOptions:{input:'website/index.html'}}})
