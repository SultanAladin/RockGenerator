import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FractureSettings, LightningParams } from '../types';
import { RNG, generateLightningPath, fractureByLightning, fractureBySeeds } from './lightningFracture';
import { Evaluator, Brush, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';

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

export function performSecondaryFracture(
    pieceGeo: THREE.BufferGeometry, 
    globalInnerCoreGeo: THREE.BufferGeometry, 
    settings: FractureSettings
): { coreGeos: THREE.BufferGeometry[], shellGeos: THREE.BufferGeometry[] } {
    const pieceBrush = new Brush(pieceGeo);
    pieceBrush.updateMatrixWorld();

    const coreBrush = new Brush(globalInnerCoreGeo);
    coreBrush.updateMatrixWorld();

    const evaluator = new Evaluator();
    evaluator.useGroups = false;
    evaluator.attributes = ['position', 'normal'];

    let pieceCoreBrush = new Brush(new THREE.BufferGeometry());
    let pieceShellBrush = new Brush(new THREE.BufferGeometry());
    let csgFailed = false;

    try {
        pieceCoreBrush = evaluator.evaluate(pieceBrush, coreBrush, INTERSECTION);
        pieceShellBrush = evaluator.evaluate(pieceBrush, coreBrush, SUBTRACTION);
    } catch(e) {
        csgFailed = true;
    }

    const coreGeos: THREE.BufferGeometry[] = [];
    const shellGeos: THREE.BufferGeometry[] = [];

    // Check if the CSG result actually has substantive geometry
    const hasGeometry = (b: Brush) => b.geometry && b.geometry.attributes.position && b.geometry.attributes.position.count > 0;

    if (!csgFailed && hasGeometry(pieceCoreBrush)) {
        coreGeos.push(pieceCoreBrush.geometry);
    }

    if (!csgFailed && hasGeometry(pieceShellBrush)) {
        if (settings.secondaryAlgorithm === 'lightning') {
             const shellFractured = performLightningFracture(pieceShellBrush.geometry, settings.secondaryLightning);
             shellGeos.push(...shellFractured);
        } else if (settings.secondaryAlgorithm === 'voronoi') {
             const shellFractured = performVoronoiFracture(pieceShellBrush.geometry, settings.chunks);
             shellGeos.push(...shellFractured);
        } else if (settings.secondaryAlgorithm === 'crush') {
             const shellFractured = performCrushFracture(pieceShellBrush.geometry, settings.chunks);
             shellGeos.push(...shellFractured);
        } else {
             shellGeos.push(pieceShellBrush.geometry);
        }
    } else {
        // If CSG subtraction yielded nothing, it might be entirely inside the core (which is handled),
        // or CSG failed. If CSG failed but we need a fallback:
        if (csgFailed || !hasGeometry(pieceCoreBrush)) {
             coreGeos.push(pieceGeo);
        }
    }

    return { coreGeos, shellGeos };
}

export function performVoronoiFracture(geo: THREE.BufferGeometry, numChunks: number): THREE.BufferGeometry[] {
    const pos = geo.attributes.position;
    if (!pos || pos.count === 0) return [geo];
    
    const numTriangles = Math.floor(pos.count / 3);
    const actualChunks = Math.min(numChunks, Math.max(1, numTriangles));
    const seeds: THREE.Vector3[] = [];
    
    for (let i = 0; i < actualChunks; i++) {
        const idx = Math.floor(Math.random() * numTriangles) * 3;
        seeds.push(new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx)));
    }
    
    const cells = fractureBySeeds(geo, seeds, 0.1, Math.random() * 1000);
    return cells.map((c: any) => c.geometry);
}

export function performCrushFracture(geo: THREE.BufferGeometry, numSlices: number): THREE.BufferGeometry[] {
    const evaluator = new Evaluator();
    evaluator.useGroups = false;
    evaluator.attributes = ['position', 'normal'];

    let fragments: Brush[] = [];
    const initialBrush = new Brush(geo);
    initialBrush.updateMatrixWorld();
    fragments.push(initialBrush);
    
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    if (!box) return [geo];
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) * 2;

    const baseCGeo = new THREE.BoxGeometry(maxDim, maxDim, maxDim);
    baseCGeo.translate(0, 0, -maxDim / 2); // So the face is at Z=0 and it cuts half-space

    for(let i = 0; i < numSlices; i++) {
        if (fragments.length === 0) break;
        
        // Pick the largest fragment to slice, to ensure an even distribution
        let largestIdx = 0;
        let largestSize = 0;
        for (let j = 0; j < fragments.length; j++) {
            if (!fragments[j].geometry.boundingBox) fragments[j].geometry.computeBoundingBox();
            const bbox = fragments[j].geometry.boundingBox!;
            const diag = bbox.min.distanceToSquared(bbox.max);
            if (diag > largestSize) {
                largestSize = diag;
                largestIdx = j;
            }
        }
        
        const idx = largestIdx;
        const target = fragments[idx];
        const tBox = target.geometry.boundingBox!;

        const center = new THREE.Vector3();
        tBox.getCenter(center);
        
        // Random offset from center to create varying depths
        center.x += (Math.random() - 0.5) * (tBox.max.x - tBox.min.x) * 0.8;
        center.y += (Math.random() - 0.5) * (tBox.max.y - tBox.min.y) * 0.8;
        center.z += (Math.random() - 0.5) * (tBox.max.z - tBox.min.z) * 0.8;

        // Random normal
        const normal = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();

        const cutterGeo = baseCGeo.clone();
        // Perturb the cut plane slightly to make it less perfectly flat? Could do, but maybe clean cut is fine for "crush" layers.
        const cutter = new Brush(cutterGeo);
        cutter.position.copy(center);
        const targetPoint = center.clone().add(normal);
        cutter.lookAt(targetPoint);
        cutter.updateMatrixWorld();

        try {
            const sideA = evaluator.evaluate(target, cutter, SUBTRACTION);
            const sideB = evaluator.evaluate(target, cutter, INTERSECTION);

            const hasVol = (b: Brush) => b.geometry && b.geometry.attributes.position && b.geometry.attributes.position.count > 0;
            
            const newFragments: Brush[] = [];
            let sliced = false;
            // Only add sides if they actually resulted in some geometry
            if (hasVol(sideA) && hasVol(sideB)) {
                newFragments.push(sideA, sideB);
                sliced = true;
            } else if (hasVol(sideA)) { // The slice might miss, so just keep the piece
                // This means B was empty, slice was outside
            } else if (hasVol(sideB)) {
                // A was empty
            }

            if (sliced) {
                fragments.splice(idx, 1, ...newFragments);
            }
        } catch(e) {
            // CSG failed, keep target intact
        }
    }
    
    return fragments.map(f => f.geometry);
}


function generateInnerShellGeoForCSG(baseGeo: THREE.BufferGeometry, thickness: number): THREE.BufferGeometry {
    // We already have generateInnerGeometry which generates the core.
    // If we want a solid volumetric shell, we could technically CSG subtract the core from the baseGeo.
    // Since we are fracture slicing, using evaluator.evaluate(baseRockBrush, cellBrush, INTERSECTION) will work best if baseRockBrush is actually the hollowed shell!
    const outerGeo = baseGeo.clone();
    outerGeo.computeVertexNormals();
    
    const innerGeo = outerGeo.clone();
    const pos = innerGeo.attributes.position;
    const norm = innerGeo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(
            i, 
            pos.getX(i) - norm.getX(i) * thickness,
            pos.getY(i) - norm.getY(i) * thickness,
            pos.getZ(i) - norm.getZ(i) * thickness
        );
    }
    innerGeo.computeVertexNormals();

    const outerBrush = new Brush(outerGeo);
    outerBrush.updateMatrixWorld();
    
    const innerBrush = new Brush(innerGeo);
    innerBrush.updateMatrixWorld();

    const evaluator = new Evaluator();
    evaluator.useGroups = false;
    evaluator.attributes = ['position', 'normal'];

    const shellBrush = evaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
    return shellBrush.geometry || outerGeo;
}
