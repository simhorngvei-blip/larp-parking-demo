import {Shape,ExtrudeGeometry,BoxGeometry} from 'three'

// The open lower profile leaves real clearance for rotating/steering tyres.
export function createTenantBodyGeometry(){
 const shape=new Shape(),bottom=.31,radius=.42,centreY=.34,dx=Math.sqrt(radius**2-(bottom-centreY)**2)
 shape.moveTo(-2.025,bottom)
 for(const z of [-1.28,1.28]){
  shape.lineTo(z-dx,bottom)
  shape.absarc(z,centreY,radius,Math.atan2(bottom-centreY,-dx),Math.atan2(bottom-centreY,dx),true)
 }
 shape.lineTo(2.025,bottom);shape.lineTo(2.025,.90);shape.quadraticCurveTo(2.025,.99,1.94,.99);shape.lineTo(-1.94,.99);shape.quadraticCurveTo(-2.025,.99,-2.025,.9);shape.closePath()
 const geometry=new ExtrudeGeometry(shape,{depth:1.72,steps:1,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:2,curveSegments:24})
 geometry.rotateY(Math.PI/2);geometry.translate(-.86,0,0);geometry.computeVertexNormals();return geometry
}

export const CAR_RIDE_HEIGHT=.006

// Keep the full-building chase camera below the next deck. On ramps, the road
// behind the car is higher/lower than the contact plane at the vehicle itself.
export function followCarCamera(pose:{x:number;y?:number;z:number;yaw:number;pitch?:number},cutaway:boolean){
 const distance=cutaway?9:5.5,height=cutaway?4.5:2.1
 return {x:pose.x-Math.sin(pose.yaw)*distance,y:(pose.y||0)+height+(cutaway?0:Math.tan(pose.pitch||0)*distance),z:pose.z-Math.cos(pose.yaw)*distance}
}

// Vertical end faces meet the flat collars exactly; rotating a thick box cannot.
export function createRampDeckGeometry(width:number,run:number,rise:number,thickness:number){
 const geometry=new BoxGeometry(width,thickness,run),positions=geometry.getAttribute('position')
 for(let i=0;i<positions.count;i++)positions.setY(i,-rise*positions.getZ(i)/run+(positions.getY(i)>0?0:-thickness))
 positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry
}
