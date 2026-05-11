import * as THREE from 'three';

export interface SelectedFace {
  vertices: THREE.Vector3[];
  centroid: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface GrowthSettings {
  pointsCount: number;
  spread: number;
  color: string;
  flatShading: boolean;
}

export type Phase = 'Modeling' | 'Process' | 'Secondary' | 'Fracture' | 'View';

export interface LightningCut {
  id: string;
  startPoint: [number, number, number];
  endPoint: [number, number, number];
}

export interface LightningParams {
  seed: number;
  fractureBranches: number;
  fractureJitter: number;
  fractureSegments: number;
  cuts: LightningCut[];
}

export interface FractureSettings {
  thickness: number;
  chunks: number;
  activeTab: 'main' | 'secondary';
  mainLightning: LightningParams;
  secondaryLightning: LightningParams;
  mainAlgorithm: 'lightning' | 'none';
  secondaryAlgorithm: 'voronoi' | 'lightning' | 'crush' | 'none';
}

export interface FracturePiece {
  id: string;
  geometry: THREE.BufferGeometry;
  visible: boolean;
  centroid: THREE.Vector3;
  color?: string;
  isShell?: boolean;
}

