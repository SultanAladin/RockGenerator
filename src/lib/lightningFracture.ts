import * as THREE from 'three';
import { Evaluator, Brush, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';

// ============================================================
// RNG (mulberry32)
// ============================================================
export class RNG {
  s: number;
  constructor(seed: number) { this.s = seed >>> 0; if (this.s === 0) this.s = 1; }
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number) { return min + this.next() * (max - min); }
}

const _rcExit = new THREE.Raycaster();
const _rcInside = new THREE.Raycaster();
const _SELF_HIT_EPS = 0.02;

function findSurfaceExit(start: THREE.Vector3, dir: THREE.Vector3, mesh: THREE.Mesh | null, maxDist: number) {
  if (!mesh) return null;
  _rcExit.set(start, dir.clone().normalize());
  _rcExit.far = maxDist || 1000;
  const hits = _rcExit.intersectObject(mesh, false);
  for (let i = 0; i < hits.length; i++) {
    if (hits[i].distance > _SELF_HIT_EPS) return hits[i].point.clone();
  }
  return null;
}

function pointInsideMesh(p: THREE.Vector3, mesh: THREE.Mesh | null) {
  if (!mesh) return true;
  _rcInside.set(p, new THREE.Vector3(1, 0, 0));
  _rcInside.far = 1e6;
  const hits = _rcInside.intersectObject(mesh, false);
  let count = 0;
  for (const h of hits) if (h.distance > _SELF_HIT_EPS) count++;
  return (count % 2) === 1;
}

function pullInside(p: THREE.Vector3, mesh: THREE.Mesh | null) {
  if (!mesh || pointInsideMesh(p, mesh)) return p;
  const dir = p.clone().multiplyScalar(-1);
  if (dir.lengthSq() < 1e-8) return p;
  dir.normalize();
  _rcInside.set(p, dir);
  _rcInside.far = 1e6;
  const hits = _rcInside.intersectObject(mesh, false);
  if (hits.length === 0) return p;
  const surface = hits[0].point;
  return surface.clone().addScaledVector(dir, 0.04);
}

const _NSD_DIRS = [
  new THREE.Vector3( 1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3( 0, 1, 0), new THREE.Vector3( 0,-1, 0),
  new THREE.Vector3( 0, 0, 1), new THREE.Vector3( 0, 0,-1),
];

function nearestSurfaceDistance(p: THREE.Vector3, mesh: THREE.Mesh | null) {
  if (!mesh) return Infinity;
  let best = Infinity;
  for (const d of _NSD_DIRS) {
    _rcInside.set(p, d);
    _rcInside.far = 1e6;
    const hits = _rcInside.intersectObject(mesh, false);
    for (const h of hits) {
      if (h.distance > _SELF_HIT_EPS) { if (h.distance < best) best = h.distance; break; }
    }
  }
  return best;
}

export interface LightningParams {
  seed: number;
  fractureBranches: number;
  fractureJitter: number;
  fractureSegments: number;
}

export function generateLightningPath(
    A: THREE.Vector3, 
    B: THREE.Vector3, 
    p: LightningParams, 
    rng: RNG, 
    mesh: THREE.Mesh | null, 
    branchSurfacePts: (THREE.Vector3 | null)[]
) {
  function subdivide(start: THREE.Vector3, end: THREE.Vector3, depth: number, jitterScale: number): THREE.Vector3[] {
    if (depth <= 0) return [start.clone(), end.clone()];
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dir = end.clone().sub(start);
    const len = dir.length();
    if (len < 1e-4) return [start.clone(), end.clone()];
    dir.normalize();
    const up = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
    const perp1 = new THREE.Vector3().crossVectors(dir, up).normalize();
    const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();
    const a = (rng.next() - 0.5) * 2;
    const b = (rng.next() - 0.5) * 2;
    mid.addScaledVector(perp1, a * jitterScale * len * 0.5);
    mid.addScaledVector(perp2, b * jitterScale * len * 0.5);

    const left = subdivide(start, mid, depth - 1, jitterScale * 0.7);
    const right = subdivide(mid, end, depth - 1, jitterScale * 0.7);
    left.pop();
    return left.concat(right);
  }

  function containInside(poly: THREE.Vector3[]) {
    if (!mesh) return poly;
    for (let i = 1; i < poly.length - 1; i++) poly[i] = pullInside(poly[i], mesh);
    return poly;
  }

  function segSegDist(p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, p4: THREE.Vector3) {
    const u = p2.clone().sub(p1);
    const v = p4.clone().sub(p3);
    const w = p1.clone().sub(p3);
    const a = u.dot(u), b = u.dot(v), c = v.dot(v), d = u.dot(w), e = v.dot(w);
    const D = a * c - b * b;
    let sc, tc;
    if (D < 1e-8) { sc = 0; tc = (b > c ? d / b : e / c); }
    else { sc = (b * e - c * d) / D; tc = (a * e - b * d) / D; }
    sc = Math.max(0, Math.min(1, sc));
    tc = Math.max(0, Math.min(1, tc));
    const dP = w.clone().add(u.multiplyScalar(sc)).sub(v.multiplyScalar(tc));
    return dP.length();
  }

  function minDistToPolylines(p1: THREE.Vector3, p2: THREE.Vector3, polys: THREE.Vector3[][], ignoreEnd1: THREE.Vector3 | null, ignoreEnd2: THREE.Vector3 | null, skipPolys?: THREE.Vector3[][]) {
    let best = Infinity;
    for (const poly of polys) {
      if (skipPolys && skipPolys.indexOf(poly) !== -1) continue;
      for (let k = 0; k < poly.length - 1; k++) {
        const q1 = poly[k], q2 = poly[k + 1];
        if (ignoreEnd1 && (q1.distanceToSquared(ignoreEnd1) < 1e-6 || q2.distanceToSquared(ignoreEnd1) < 1e-6)) continue;
        if (ignoreEnd2 && (q1.distanceToSquared(ignoreEnd2) < 1e-6 || q2.distanceToSquared(ignoreEnd2) < 1e-6)) continue;
        const d = segSegDist(p1, p2, q1, q2);
        if (d < best) best = d;
      }
    }
    return best;
  }

  const depth = Math.max(2, Math.min(7, Math.round(Math.log2(Math.max(2, p.fractureSegments)))));
  const main = containInside(subdivide(A, B, depth, p.fractureJitter * 0.6));
  const polylines = [main];
  const surfacePoints: (THREE.Vector3 | null)[] = [];

  const N = p.fractureBranches;
  const minSpineDist = (() => {
    let s = 0, c = 0;
    for (let k = 0; k < main.length - 1; k++) { s += main[k].distanceTo(main[k+1]); c++; }
    return c > 0 ? s / c : 0.2;
  })();
  const crossingEps = Math.max(0.05, 0.4 * minSpineDist);

  function spineFrameAt(idx: number) {
    const i0 = Math.max(0, idx - 1), i1 = Math.min(main.length - 1, idx + 1);
    const tan = main[i1].clone().sub(main[i0]).normalize();
    const ref = Math.abs(tan.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(tan, ref).normalize();
    const v = new THREE.Vector3().crossVectors(tan, u).normalize();
    return { tan, u, v };
  }

  for (let i = 0; i < N; i++) {
    if (main.length < 3) { surfacePoints.push(null); continue; }

    const spineFrac = (i + 1) / (N + 1) + (rng.next() - 0.5) * (0.5 / Math.max(1, N + 1));
    const idx = Math.max(1, Math.min(main.length - 2, Math.round(spineFrac * (main.length - 1))));
    let start = main[idx].clone();
    if (mesh && !pointInsideMesh(start, mesh)) start = pullInside(start, mesh);

    let surfaceExit = (branchSurfacePts && branchSurfacePts[i]) ? branchSurfacePts[i]!.clone() : null;

    if (!surfaceExit) {
      const { tan, u, v } = spineFrameAt(idx);
      const baseAngle = (i / Math.max(1, N)) * Math.PI * 2 + rng.range(-0.4, 0.4);

      let bestExit = null, bestScore = -Infinity;
      const trials = 6;
      for (let t = 0; t < trials; t++) {
        const ang = baseAngle + (t - (trials - 1) / 2) * (Math.PI * 2 / (N * 3 + 1));
        const tilt = rng.range(0.55, 0.95);
        const along = (rng.next() - 0.5) * 0.4;
        const dir = u.clone().multiplyScalar(Math.cos(ang) * tilt)
          .add(v.clone().multiplyScalar(Math.sin(ang) * tilt))
          .add(tan.clone().multiplyScalar(along))
          .normalize();
        const exit = findSurfaceExit(start, dir, mesh, 100);
        if (!exit) continue;
        const clearance = minDistToPolylines(start, exit, polylines, start, null);
        const length = start.distanceTo(exit);
        const score = clearance + 0.05 * length;
        if (clearance >= crossingEps && score > bestScore) { bestScore = score; bestExit = exit; }
      }
      if (!bestExit) {
        for (let t = 0; t < trials; t++) {
          const ang = baseAngle + rng.range(-Math.PI, Math.PI);
          const dir = u.clone().multiplyScalar(Math.cos(ang))
            .add(v.clone().multiplyScalar(Math.sin(ang)))
            .normalize();
          const exit = findSurfaceExit(start, dir, mesh, 100);
          if (exit) { bestExit = exit; break; }
        }
      }
      surfaceExit = bestExit;
    }

    if (!surfaceExit) { surfacePoints.push(null); continue; }
    surfacePoints.push(surfaceExit.clone());

    const branchPoly = containInside(subdivide(start, surfaceExit, Math.max(2, depth - 1), p.fractureJitter * 0.5));
    polylines.push(branchPoly);

    const subCount = Math.floor(rng.next() * 3);
    if (subCount > 0 && branchPoly.length >= 3) {
      const branchTan = surfaceExit.clone().sub(start).normalize();
      const refS = Math.abs(branchTan.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const uS = new THREE.Vector3().crossVectors(branchTan, refS).normalize();
      const vS = new THREE.Vector3().crossVectors(branchTan, uS).normalize();
      const minSplitDepth = Math.max(0.08, 0.25 * minSpineDist);
      const candIdx = [];
      const lastUsable = Math.max(1, Math.floor((branchPoly.length - 1) * 0.75));
      for (let k = 1; k <= lastUsable; k++) {
        const depthFromSurf = nearestSurfaceDistance(branchPoly[k], mesh);
        if (depthFromSurf >= minSplitDepth) candIdx.push({ k, d: depthFromSurf });
      }
      candIdx.sort((a, b) => b.d - a.d);
      for (let s = 0; s < subCount; s++) {
        let sStart = null;
        if (candIdx.length > 0) {
          const pickFrom = candIdx.slice(0, Math.min(candIdx.length, Math.max(2, Math.ceil(candIdx.length / 2))));
          const choice = pickFrom[Math.floor(rng.next() * pickFrom.length)];
          sStart = branchPoly[choice.k].clone();
        } else {
          const baseIdx = Math.max(1, Math.min(branchPoly.length - 2, Math.floor(branchPoly.length * 0.35)));
          let probe = branchPoly[baseIdx].clone();
          const inward = probe.clone().multiplyScalar(-1);
          if (inward.lengthSq() < 1e-6) inward.set(0, -1, 0); else inward.normalize();
          for (let step = 0; step < 12; step++) {
            if (pointInsideMesh(probe, mesh) && nearestSurfaceDistance(probe, mesh) >= minSplitDepth) break;
            probe.addScaledVector(inward, minSplitDepth * 0.6);
          }
          if (!pointInsideMesh(probe, mesh)) probe = pullInside(probe, mesh);
          sStart = probe;
        }

        let bestSubExit = null, bestSubScore = -Infinity;
        const subTrials = 4;
        const subBase = rng.range(0, Math.PI * 2);
        for (let t = 0; t < subTrials; t++) {
          const ang = subBase + t * (Math.PI * 2 / subTrials) + rng.range(-0.3, 0.3);
          const dir = uS.clone().multiplyScalar(Math.cos(ang) * 0.85)
            .add(vS.clone().multiplyScalar(Math.sin(ang) * 0.85))
            .add(branchTan.clone().multiplyScalar(rng.range(-0.2, 0.2)))
            .normalize();
          const exit = findSurfaceExit(sStart, dir, mesh, 100);
          if (!exit) continue;
          const parentLen = start.distanceTo(surfaceExit);
          const subLen = sStart.distanceTo(exit);
          if (subLen > parentLen * 0.7) continue;
          const clearance = minDistToPolylines(sStart, exit, polylines, sStart, null, [branchPoly]);
          const score = clearance + 0.05 * subLen;
          if (clearance >= crossingEps * 0.6 && score > bestSubScore) { bestSubScore = score; bestSubExit = exit; }
        }
        if (!bestSubExit) {
          const fallbackBase = rng.range(0, Math.PI * 2);
          for (let t = 0; t < 8 && !bestSubExit; t++) {
            const ang = fallbackBase + t * (Math.PI * 2 / 8);
            const dir = uS.clone().multiplyScalar(Math.cos(ang))
              .add(vS.clone().multiplyScalar(Math.sin(ang)))
              .normalize();
            const exit = findSurfaceExit(sStart, dir, mesh, 100);
            if (!exit) continue;
            const parentLen = start.distanceTo(surfaceExit);
            if (sStart.distanceTo(exit) > parentLen * 0.85) continue;
            bestSubExit = exit;
          }
        }
        if (bestSubExit) {
          const subPoly = containInside(subdivide(sStart, bestSubExit, Math.max(2, depth - 2), p.fractureJitter * 0.45));
          polylines.push(subPoly);
        }
      }
    }
  }

  return { polylines, surfacePoints };
}

function computeVolume(geom: THREE.BufferGeometry) {
  const pos = geom.attributes.position;
  if (!pos) return 0;
  let v = 0;
  if (geom.index) {
      const idx = geom.index;
      for (let i = 0; i < idx.count; i += 3) {
          const a = idx.getX(i), b = idx.getX(i+1), c = idx.getX(i+2);
          const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
          const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
          const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);
          v += (ax * (by*cz - bz*cy) - ay * (bx*cz - bz*cx) + az * (bx*cy - by*cx)) / 6;
      }
  } else {
      for (let i = 0; i < pos.count; i += 3) {
        const ax = pos.getX(i),   ay = pos.getY(i),   az = pos.getZ(i);
        const bx = pos.getX(i+1), by = pos.getY(i+1), bz = pos.getZ(i+1);
        const cx = pos.getX(i+2), cy = pos.getY(i+2), cz = pos.getZ(i+2);
        v += (ax * (by*cz - bz*cy) - ay * (bx*cz - bz*cx) + az * (bx*cy - by*cx)) / 6;
      }
  }
  return Math.abs(v);
}

function computeCentroid(geom: THREE.BufferGeometry) {
  const pos = geom.attributes.position;
  const c = new THREE.Vector3();
  if (!pos) return c;
  
  if (geom.index) {
      const idx = geom.index;
      for (let i = 0; i < idx.count; i++) {
          const a = idx.getX(i);
          c.x += pos.getX(a); c.y += pos.getY(a); c.z += pos.getZ(a);
      }
      c.multiplyScalar(1 / Math.max(1, idx.count));
  } else {
      for (let i = 0; i < pos.count; i++) { c.x += pos.getX(i); c.y += pos.getY(i); c.z += pos.getZ(i); }
      c.multiplyScalar(1 / Math.max(1, pos.count));
  }
  return c;
}

function sampleSeedsAlongPolylines(polylines: THREE.Vector3[][], p: LightningParams, rng: RNG) {
  const seeds: THREE.Vector3[] = [];
  const totalSeeds = Math.max(2, Math.min(40, Math.round(p.fractureSegments * 0.7)));
  let totalLen = 0;
  const lineLengths = polylines.map((line) => {
    let L = 0;
    for (let i = 0; i < line.length - 1; i++) L += line[i].distanceTo(line[i+1]);
    totalLen += L;
    return L;
  });
  if (totalLen < 1e-6) return seeds;

  for (let li = 0; li < polylines.length; li++) {
    const line = polylines[li];
    const share = lineLengths[li] / totalLen;
    const n = Math.max(1, Math.round(totalSeeds * share));
    for (let k = 0; k < n; k++) {
      const target = (k + 0.5) / n * lineLengths[li];
      let acc = 0;
      for (let i = 0; i < line.length - 1; i++) {
        const segLen = line[i].distanceTo(line[i+1]);
        if (acc + segLen >= target) {
          const t = (target - acc) / Math.max(1e-6, segLen);
          const onLine = line[i].clone().lerp(line[i+1], t);
          const dir = line[i+1].clone().sub(line[i]);
          if (dir.lengthSq() > 1e-8) {
            dir.normalize();
            const up = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
            const perp1 = new THREE.Vector3().crossVectors(dir, up).normalize();
            const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();
            const r = 0.08 + rng.next() * 0.18;
            const a = perp1.clone().multiplyScalar(r * (0.6 + rng.next() * 0.8))
                    .add(perp2.clone().multiplyScalar((rng.next()-0.5) * r * 0.6));
            seeds.push(onLine.clone().add(a));
            seeds.push(onLine.clone().sub(a));
          } else {
            seeds.push(onLine);
          }
          break;
        }
        acc += segLen;
      }
    }
  }
  return seeds;
}

export function fractureBySeeds(geom: THREE.BufferGeometry, inSeeds: THREE.Vector3[], jitter: number, seed: number) {
  const seeds: THREE.Vector3[] = [];
  for (const s of inSeeds) {
      let tooClose = false;
      for (const fs of seeds) {
          if (s.distanceToSquared(fs) < 0.002) { tooClose = true; break; }
      }
      if (!tooClose) seeds.push(s);
  }

  if (seeds.length < 2) {
    return [{ geometry: geom, volume: computeVolume(geom), centroid: computeCentroid(geom), colorHsl: null }];
  }
  geom.computeBoundingBox();
  const box = geom.boundingBox;
  if (!box) {
    return [{ geometry: geom, volume: computeVolume(geom), centroid: computeCentroid(geom), colorHsl: null }];
  }

  const cells = [];
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  evaluator.attributes = ['position', 'normal'];

  const baseRockBrush = new Brush(geom);
  if (baseRockBrush.geometry) {
      baseRockBrush.geometry.deleteAttribute('uv');
      baseRockBrush.geometry.deleteAttribute('color');
  }
  baseRockBrush.updateMatrixWorld();

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) * 2;

  const cellBaseGeo = new THREE.BoxGeometry(maxDim, maxDim, maxDim);
  cellBaseGeo.translate(center.x, center.y, center.z);
  cellBaseGeo.deleteAttribute('uv');
  cellBaseGeo.deleteAttribute('color');

  const cutterRes = Math.max(1, Math.round(18 * jitter));
  const cutterGeo = new THREE.BoxGeometry(maxDim * 2, maxDim * 2, maxDim, cutterRes, cutterRes, 1);
  cutterGeo.translate(0, 0, -maxDim / 2);
  cutterGeo.deleteAttribute('uv');
  cutterGeo.deleteAttribute('color');

  const cutterCache = new Map();

  for (let i = 0; i < seeds.length; i++) {
    let cellBrush = new Brush(cellBaseGeo);
    cellBrush.updateMatrixWorld();

    let degenerate = false;
    for (let j = 0; j < seeds.length; j++) {
      if (i === j) continue;
      const isReversed = i > j;
      const minIdx = isReversed ? j : i;
      const maxIdx = isReversed ? i : j;
      const seedA = seeds[minIdx];
      const seedB = seeds[maxIdx];
      const dir = seedB.clone().sub(seedA);
      const len = dir.length();
      if (len < 1e-6) continue;
      const pairKey = `${minIdx}-${maxIdx}`;
      let cutterBrush = cutterCache.get(pairKey);

      if (!cutterBrush) {
        const mid = seedA.clone().add(seedB).multiplyScalar(0.5);
        const dummy = new THREE.Object3D();
        dummy.position.copy(mid);
        dummy.lookAt(seedB);
        dummy.updateMatrixWorld();

        const uniqueCutterGeo = cutterGeo.clone();
        const pos = uniqueCutterGeo.attributes.position;
        const vWorld = new THREE.Vector3();
        const ns = 3.0;
        const phase = seed * 0.1;
        for (let k = 0; k < pos.count; k++) {
          if (Math.abs(pos.getZ(k)) < 0.1) {
            vWorld.fromBufferAttribute(pos, k);
            vWorld.applyMatrix4(dummy.matrixWorld);
            let n = Math.sin(vWorld.x*ns + phase)*Math.cos(vWorld.y*ns + phase)*Math.sin(vWorld.z*ns + phase);
            n += 0.5 * Math.sin(vWorld.x*ns*2.5 + phase)*Math.cos(vWorld.y*ns*2.5 + phase)*Math.sin(vWorld.z*ns*2.5 + phase);
            pos.setZ(k, pos.getZ(k) + n * jitter * 0.5);
          }
        }
        uniqueCutterGeo.computeVertexNormals();
        uniqueCutterGeo.computeBoundingBox();
        uniqueCutterGeo.computeBoundingSphere();

        cutterBrush = new Brush(uniqueCutterGeo);
        cutterBrush.position.copy(mid);
        cutterBrush.lookAt(seedB);
        cutterBrush.updateMatrixWorld();
        cutterCache.set(pairKey, cutterBrush);
      }

      try {
        if (!isReversed) cellBrush = evaluator.evaluate(cellBrush, cutterBrush, SUBTRACTION);
        else             cellBrush = evaluator.evaluate(cellBrush, cutterBrush, INTERSECTION);
      } catch (e) { 
          try {
             // Fallback to simple unjittered cutter
             let simpleCutterBrush = cutterCache.get(pairKey + '_simple');
             if (!simpleCutterBrush) {
                const mid = seedA.clone().add(seedB).multiplyScalar(0.5);
                const baseCGeo = new THREE.BoxGeometry(maxDim * 2, maxDim * 2, maxDim);
                baseCGeo.translate(0, 0, -maxDim / 2);
                simpleCutterBrush = new Brush(baseCGeo);
                simpleCutterBrush.position.copy(mid);
                simpleCutterBrush.lookAt(seedB);
                simpleCutterBrush.updateMatrixWorld();
                cutterCache.set(pairKey + '_simple', simpleCutterBrush);
             }
             if (!isReversed) cellBrush = evaluator.evaluate(cellBrush, simpleCutterBrush, SUBTRACTION);
             else             cellBrush = evaluator.evaluate(cellBrush, simpleCutterBrush, INTERSECTION);
          } catch (e2) {
              degenerate = true; break; 
          }
      }
      if (!cellBrush.geometry || !cellBrush.geometry.attributes.position || cellBrush.geometry.attributes.position.count === 0) {
        degenerate = true; break;
      }
    }
    if (degenerate) continue;

    let pieceBrush;
    try {
       pieceBrush = evaluator.evaluate(baseRockBrush, cellBrush, INTERSECTION);
    } catch (e) {
       continue;
    }
    
    if (pieceBrush && pieceBrush.geometry && pieceBrush.geometry.attributes.position && pieceBrush.geometry.attributes.position.count > 0) {
      cells.push({
        geometry: pieceBrush.geometry,
        volume: computeVolume(pieceBrush.geometry),
        centroid: computeCentroid(pieceBrush.geometry),
        seed: seeds[i],
        colorHsl: null as string | null
      });
    }
  }

  if (cells.length === 0) {
    return [{ geometry: geom, volume: computeVolume(geom), centroid: computeCentroid(geom), colorHsl: null }];
  }
  cells.sort((a, b) => b.volume - a.volume);
  for (let i = 0; i < cells.length; i++) {
    const hue = (i * 137.508) % 360;
    cells[i].colorHsl = `hsl(${hue.toFixed(0)}, 55%, 55%)`;
  }
  return cells;
}

export function fractureByLightning(geom: THREE.BufferGeometry, polylines: THREE.Vector3[][], p: LightningParams) {
  const triCount = geom.attributes.position ? geom.attributes.position.count / 3 : 0;
  if (triCount === 0 || polylines.length === 0) {
    return [{ geometry: geom, volume: computeVolume(geom), centroid: computeCentroid(geom), colorHsl: null }];
  }
  const seedRng = new RNG(p.seed ^ 0xDEADBEEF);
  const seeds = sampleSeedsAlongPolylines(polylines, p, seedRng);
  
  return fractureBySeeds(geom, seeds, p.fractureJitter, p.seed);
}
