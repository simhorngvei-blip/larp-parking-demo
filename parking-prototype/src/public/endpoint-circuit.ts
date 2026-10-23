export function endpointCircuit(node:{id:string;kind:string}){
 if(node.kind==='bay'){const project='https://wokwi.com/projects/478667707556941825';return {target:node.id,scope:'ISOLATED_SINGLE_BAY_BENCH' as const,project,embed:project+'/embed',source:'/controller-labs/bollard/source.zip'}}
 return node.kind==='gate'?{target:node.id,image:'/circuit.jpg',status:'/circuit/status',scope:'SHARED_LOT' as const}:null
}
