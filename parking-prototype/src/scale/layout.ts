import * as T from 'three'
export function fitLevelCamera(camera:T.PerspectiveCamera,width:number,aspect:number){
 camera.aspect=aspect;camera.updateProjectionMatrix()
 const direction=new T.Vector3(.24,.64,.45).normalize();let distance=Math.max(26,width*.85)
 for(let n=0;n<20;n++){
  camera.position.copy(direction).multiplyScalar(distance);camera.lookAt(0,0,0);camera.updateMatrixWorld(true)
  let extent=0
  for(const x of [-width/2,width/2])for(const y of [0,3.2])for(const z of [-10.5,10.5]){const p=new T.Vector3(x,y,z).project(camera);extent=Math.max(extent,Math.abs(p.x),Math.abs(p.y))}
  if(extent<=.9)break
  distance*=Math.max(1.05,extent/.9)
 }
}
