import * as THREE from 'three';
import { Evaluator, Brush, ADDITION } from 'three-bvh-csg';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { GrowthSettings, SelectedFace } from '../types';

export function createInitialGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  // Small random core
  for (let i = 0; i < 16; i++) {
    points.push(new THREE.Vector3(
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 3
    ));
  }
  
  const geom = new ConvexGeometry(points);
  geom.computeVertexNormals();
  return geom;
}

export function growRock(
  baseGeometry: THREE.BufferGeometry,
  faces: SelectedFace[],
  targetPos: THREE.Vector3,
  settings: GrowthSettings
): THREE.BufferGeometry {
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  evaluator.attributes = ['position', 'normal'];

  const baseBrush = new Brush(baseGeometry);
  baseBrush.updateMatrixWorld(true);

  // Collect all unique vertices from selected faces
  const uniquePoints: THREE.Vector3[] = [];
  for (const face of faces) {
     for (const v of face.vertices) {
         if (!uniquePoints.some(up => up.distanceTo(v) < 0.001)) {
             uniquePoints.push(v);
         }
     }
  }

  const points = [...uniquePoints];

  // Compute aggregate centroid
  const centroid = new THREE.Vector3();
  for(const pt of uniquePoints) { centroid.add(pt); }
  if (uniquePoints.length > 0) {
      centroid.divideScalar(uniquePoints.length);
  }

  const dir = targetPos.clone().sub(centroid);
  const dist = dir.length();
  
  if (dist > 0.001) {
    dir.normalize();
  }

  // Generate orthogonal tangents for spread
  const tangent1 = new THREE.Vector3(1, 0, 0);
  if (Math.abs(dir.x) > 0.9) tangent1.set(0, 1, 0);
  const tangent2 = new THREE.Vector3().crossVectors(dir, tangent1).normalize();
  tangent1.crossVectors(tangent2, dir).normalize();

  // Scatter points in the frustum/cylinder towards the target
  for (let i = 0; i < settings.pointsCount; i++) {
    const t = Math.random(); // 0 to 1 along the path
    
    // Vary spread based on how far along the path we are (optional taper)
    // Tapering slightly towards the end makes it look more organic, like a spike or formation
    const currentSpread = settings.spread * (1 - t * 0.3); 
    
    const radius = Math.random() * currentSpread;
    const angle = Math.random() * Math.PI * 2;

    const offset = new THREE.Vector3()
      .addScaledVector(tangent1, Math.cos(angle) * radius)
      .addScaledVector(tangent2, Math.sin(angle) * radius);

    const pt = centroid.clone()
      .addScaledVector(dir, t * dist)
      .add(offset);
    
    points.push(pt);
  }

  // Add some jittered points near the target to ensure the tip forms well
  for (let i = 0; i < 4; i++) {
      points.push(new THREE.Vector3(
          targetPos.x + (Math.random() - 0.5) * settings.spread * 0.2,
          targetPos.y + (Math.random() - 0.5) * settings.spread * 0.2,
          targetPos.z + (Math.random() - 0.5) * settings.spread * 0.2,
      ));
  }
  points.push(targetPos.clone());

  let newChunkGeo: THREE.BufferGeometry;
  try {
    newChunkGeo = new ConvexGeometry(points);
  } catch (e) {
    console.warn("Failed to generate convex hull for growth step, skipping.");
    return baseGeometry.clone();
  }

  const newChunkBrush = new Brush(newChunkGeo);
  newChunkBrush.updateMatrixWorld(true);

  let resultBrush: Brush;
  try {
      resultBrush = evaluator.evaluate(baseBrush, newChunkBrush, ADDITION) as Brush;
  } catch(e) {
      console.warn("CSG Evaluation failed, returning old geometry.");
      return baseGeometry.clone();
  }

  const finalGeom = resultBrush.geometry.clone();
  finalGeom.computeVertexNormals();
  return finalGeom;
}
