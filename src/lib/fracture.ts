import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FractureSettings, LightningParams } from '../types';
import { RNG, generateLightningPath, fractureByLightning } from './lightningFracture';

export function generateInnerGeometry(baseGeo: THREE.BufferGeometry, thickness: number): THREE.BufferGeometry {
    const geo = baseGeo.clone();
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    const merged = BufferGeometryUtils.mergeVertices(geo, 1e-4);
    merged.computeVertexNormals();

    const pos = merged.attributes.position;
    const norm = merged.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(
            i, 
            pos.getX(i) - norm.getX(i) * thickness,
            pos.getY(i) - norm.getY(i) * thickness,
            pos.getZ(i) - norm.getZ(i) * thickness
        );
    }
    merged.computeVertexNormals();
    return merged.toNonIndexed();
}

function tessellate(geo: THREE.BufferGeometry, levels: number): THREE.BufferGeometry {
    let currentGeo = geo.toNonIndexed();
    for (let l = 0; l < levels; l++) {
        const pos = currentGeo.attributes.position;
        const newPos = [];
        for (let i = 0; i < pos.count; i += 3) {
            const v1 = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
            const v2 = new THREE.Vector3(pos.getX(i+1), pos.getY(i+1), pos.getZ(i+1));
            const v3 = new THREE.Vector3(pos.getX(i+2), pos.getY(i+2), pos.getZ(i+2));

            const m12 = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
            const m23 = new THREE.Vector3().addVectors(v2, v3).multiplyScalar(0.5);
            const m31 = new THREE.Vector3().addVectors(v3, v1).multiplyScalar(0.5);
            
            newPos.push(v1.x, v1.y, v1.z, m12.x, m12.y, m12.z, m31.x, m31.y, m31.z);
            newPos.push(v2.x, v2.y, v2.z, m23.x, m23.y, m23.z, m12.x, m12.y, m12.z);
            newPos.push(v3.x, v3.y, v3.z, m31.x, m31.y, m31.z, m23.x, m23.y, m23.z);
            newPos.push(m12.x, m12.y, m12.z, m23.x, m23.y, m23.z, m31.x, m31.y, m31.z);
        }
        currentGeo = new THREE.BufferGeometry();
        currentGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
    }
    return BufferGeometryUtils.mergeVertices(currentGeo, 1e-4);
}

export function performLightningFracture(baseGeo: THREE.BufferGeometry, settings: LightningParams): THREE.BufferGeometry[] {
    const geo = baseGeo.clone();
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    
    // Create a mesh for findSurfaceExit raycasts
    const mat = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.updateMatrixWorld();
    
    const rng = new RNG(settings.seed);
    const polylines: THREE.Vector3[][] = [];
    
    for (const cut of settings.cuts) {
        const start = new THREE.Vector3(...cut.startPoint);
        const end = new THREE.Vector3(...cut.endPoint);
        const branchPts: (THREE.Vector3 | null)[] = [];
        for (let i = 0; i < settings.fractureBranches; i++) branchPts.push(null);
        
        const out = generateLightningPath(start, end, settings, rng, mesh, branchPts);
        polylines.push(...out.polylines);
    }
    
    const cells = fractureByLightning(geo, polylines, settings);
    return cells.map(c => c.geometry);
}

export function performSurfaceFracture(baseGeo: THREE.BufferGeometry, settings: FractureSettings): THREE.BufferGeometry[] {
    const geo = baseGeo.clone();
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    const mergedGeo = BufferGeometryUtils.mergeVertices(geo, 1e-4);
    
    // Tessellate the geometry to create more organic, highly-detailed sub-cracks
    const denseGeo = tessellate(mergedGeo, 3); // 3 levels (64x more triangles)
    denseGeo.computeVertexNormals();

    const pos = denseGeo.attributes.position;
    const norm = denseGeo.attributes.normal;
    const index = denseGeo.index;
    
    if (!index) return [];

    const numTriangles = index.count / 3;
    const centroids: THREE.Vector3[] = [];
    
    for (let i = 0; i < numTriangles; i++) {
        const a = index.getX(i * 3);
        const b = index.getX(i * 3 + 1);
        const c = index.getX(i * 3 + 2);
        const vA = new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a));
        const vB = new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b));
        const vC = new THREE.Vector3(pos.getX(c), pos.getY(c), pos.getZ(c));
        centroids.push(vA.add(vB).add(vC).divideScalar(3));
    }

    const numChunks = Math.min(settings.chunks, Math.max(1, Math.floor(numTriangles / 2)));
    const seeds: THREE.Vector3[] = [];
    for (let i = 0; i < numChunks; i++) {
        seeds.push(centroids[Math.floor(Math.random() * numTriangles)]);
    }

    const chunkAssignments = new Int32Array(numTriangles);
    for (let i = 0; i < numTriangles; i++) {
        let minDist = Infinity;
        let bestChunk = 0;
        
        const p = centroids[i].clone();
        p.x += Math.sin(p.y * 15) * 0.15;
        p.y += Math.sin(p.z * 15) * 0.15;
        p.z += Math.sin(p.x * 15) * 0.15;

        for (let c = 0; c < numChunks; c++) {
            const d = p.distanceToSquared(seeds[c]);
            if (d < minDist) {
                minDist = d;
                bestChunk = c;
            }
        }
        chunkAssignments[i] = bestChunk;
    }

    const chunkGeometries: THREE.BufferGeometry[] = [];
    
    const getEdgeKey = (i1: number, i2: number) => {
        return i1 < i2 ? `${i1}-${i2}` : `${i2}-${i1}`;
    };

    const getVertex = (idx: number, isInner: boolean) => {
        const p = new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
        if (isInner) {
            const n = new THREE.Vector3(norm.getX(idx), norm.getY(idx), norm.getZ(idx));
            p.addScaledVector(n, -settings.thickness);
        }
        return p;
    };

    for (let c = 0; c < numChunks; c++) {
        const positions: number[] = [];
        const edges = new Map<string, {a: number, b: number, count: number}>();
        
        for (let i = 0; i < numTriangles; i++) {
            if (chunkAssignments[i] === c) {
                const iA = index.getX(i * 3);
                const iB = index.getX(i * 3 + 1);
                const iC = index.getX(i * 3 + 2);

                const addTri = (idxA: number, idxB: number, idxC: number, isInner: boolean) => {
                     const vA = getVertex(idxA, isInner);
                     const vB = getVertex(idxB, isInner);
                     const vC = getVertex(idxC, isInner);
                     if (isInner) {
                         positions.push(vA.x, vA.y, vA.z);
                         positions.push(vC.x, vC.y, vC.z);
                         positions.push(vB.x, vB.y, vB.z);
                     } else {
                         positions.push(vA.x, vA.y, vA.z);
                         positions.push(vB.x, vB.y, vB.z);
                         positions.push(vC.x, vC.y, vC.z);
                     }
                };

                addTri(iA, iB, iC, false);
                addTri(iA, iB, iC, true);

                const addEdge = (a: number, b: number) => {
                    const key = getEdgeKey(a, b);
                    if (!edges.has(key)) {
                        edges.set(key, {a, b, count: 1});
                    } else {
                        edges.get(key)!.count++;
                    }
                };
                addEdge(iA, iB);
                addEdge(iB, iC);
                addEdge(iC, iA);
            }
        }
        
        if (positions.length === 0) continue;

        for (const [key, edge] of edges.entries()) {
            if (edge.count === 1) {
                const vA_out = getVertex(edge.a, false);
                const vB_out = getVertex(edge.b, false);
                const vA_in = getVertex(edge.a, true);
                const vB_in = getVertex(edge.b, true);

                positions.push(vA_out.x, vA_out.y, vA_out.z);
                positions.push(vB_out.x, vB_out.y, vB_out.z);
                positions.push(vB_in.x, vB_in.y, vB_in.z);

                positions.push(vA_out.x, vA_out.y, vA_out.z);
                positions.push(vB_in.x, vB_in.y, vB_in.z);
                positions.push(vA_in.x, vA_in.y, vA_in.z);
            }
        }

        const chunkGeo = new THREE.BufferGeometry();
        chunkGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        chunkGeo.computeVertexNormals(); 
        chunkGeometries.push(chunkGeo);
    }

    return chunkGeometries;
}
