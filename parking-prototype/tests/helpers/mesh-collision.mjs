import {Box3,Triangle} from 'three';
// Broad-phase OBBs overestimate sloped prisms. Test their actual exported faces.
export function intersectsMeshTriangles(obb,triangles){
 const inverse=obb.rotation.clone().transpose(),box=new Box3(obb.halfSize.clone().negate(),obb.halfSize.clone()),local=new Triangle();
 for(const triangle of triangles){local.a.copy(triangle.a).sub(obb.center).applyMatrix3(inverse);local.b.copy(triangle.b).sub(obb.center).applyMatrix3(inverse);local.c.copy(triangle.c).sub(obb.center).applyMatrix3(inverse);if(box.intersectsTriangle(local))return true;}
 return false;
}
