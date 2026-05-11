/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { GrowthSettings, SelectedFace, Phase, FracturePiece, FractureSettings } from './types';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { RockCanvas } from './components/RockCanvas';
import { createInitialGeometry, growRock } from './lib/builder';
import { performSurfaceFracture, performLightningFracture, generateInnerGeometry } from './lib/fracture';
import * as THREE from 'three';

const initialSettings: GrowthSettings = {
  pointsCount: 32,
  spread: 1.5,
  flatShading: true,
  color: '#6a6f73',
};

export default function App() {
  const [phase, setPhase] = useState<Phase>('Modeling');
  const [settings, setSettings] = useState<GrowthSettings>(initialSettings);
  
  // History stack for undo
  const [history, setHistory] = useState<THREE.BufferGeometry[]>([]);
  
  // Modeling state
  const [selectedFaces, setSelectedFaces] = useState<SelectedFace[]>([]);
  const [targetPos, setTargetPos] = useState<THREE.Vector3 | null>(null);

  // Process state
  const [fractureSettings, setFractureSettings] = useState<FractureSettings>({
    thickness: 0.2,
    chunks: 10,
    target: 'main',
    showShell: false,
    mainAlgorithm: 'lightning',
    shellAlgorithm: 'none',
    mainLightning: {
      seed: 123,
      fractureBranches: 3,
      fractureJitter: 0.35,
      fractureSegments: 24,
      cuts: [{ id: '1', startPoint: [-0.9, 0.9, 0], endPoint: [0.9, -0.9, 0] }],
    },
    shellLightning: {
      seed: 456,
      fractureBranches: 2,
      fractureJitter: 0.2,
      fractureSegments: 16,
      cuts: [{ id: '1', startPoint: [-0.6, 0.6, 0], endPoint: [0.6, -0.6, 0] }],
    }
  });
  
  // Fracture state
  const [fracturePieces, setFracturePieces] = useState<FracturePiece[]>([]);

  useEffect(() => {
    // Generate initial low-poly rock core on mount
    const initialGeom = createInitialGeometry();
    setHistory([initialGeom]);
  }, []);

  const currentGeometry = history.length > 0 ? history[history.length - 1] : null;

  const updateTargetPos = (faces: SelectedFace[]) => {
    if (faces.length === 0) {
      setTargetPos(null);
      return;
    }
    const avgCentroid = new THREE.Vector3();
    const avgNormal = new THREE.Vector3();
    faces.forEach((f) => {
      avgCentroid.add(f.centroid);
      avgNormal.add(f.normal);
    });
    avgCentroid.divideScalar(faces.length);
    avgNormal.normalize();
    setTargetPos(avgCentroid.clone().add(avgNormal.multiplyScalar(3)));
  };

  const handleSelectFace = (face: SelectedFace | null, isShift: boolean) => {
    if (phase !== 'Modeling') return;
    if (!face) {
      if (!isShift) {
        setSelectedFaces([]);
        setTargetPos(null);
      }
      return;
    }

    if (isShift && selectedFaces.length > 0) {
      // Check adjacency
      let isAdjacent = false;
      for (const v1 of face.vertices) {
        for (const sf of selectedFaces) {
          for (const v2 of sf.vertices) {
            if (v1.distanceTo(v2) < 0.001) {
              isAdjacent = true;
              break;
            }
          }
          if (isAdjacent) break;
        }
        if (isAdjacent) break;
      }

      if (isAdjacent) {
        // Toggle if already exists
        const exists = selectedFaces.find((sf) => sf.centroid.distanceTo(face.centroid) < 0.001);
        let newSelection;
        if (exists) {
          newSelection = selectedFaces.filter((sf) => sf.centroid.distanceTo(face.centroid) >= 0.001);
        } else {
          newSelection = [...selectedFaces, face];
        }
        setSelectedFaces(newSelection);
        updateTargetPos(newSelection);
      } // If not adjacent, we ignore the shift-click by design
    } else {
      setSelectedFaces([face]);
      updateTargetPos([face]);
    }
  };

  const handleTargetChange = (pos: THREE.Vector3) => {
    setTargetPos(pos);
  };

  const handleGrow = () => {
    if (!currentGeometry || selectedFaces.length === 0 || !targetPos) return;

    const newGeom = growRock(currentGeometry, selectedFaces, targetPos, settings);
    
    setHistory([...history, newGeom]);
    
    // Reset selection after growth
    setSelectedFaces([]);
    setTargetPos(null);
  };

  const handleUndo = () => {
    if (history.length > 1) {
      // Dispose the popped geometry to avoid memory leaks
      history[history.length - 1].dispose();
      
      setHistory(history.slice(0, history.length - 1));
      setSelectedFaces([]);
      setTargetPos(null);
      setFracturePieces([]);
      if (phase === 'Fracture') setPhase('Modeling');
    }
  };

  const handleReset = () => {
    // Cleanup old geometries
    history.forEach(g => g.dispose());
    fracturePieces.forEach(p => p.geometry.dispose());
    
    const initialGeom = createInitialGeometry();
    setHistory([initialGeom]);
    setSelectedFaces([]);
    setTargetPos(null);
    setFracturePieces([]);
    setPhase('Modeling');
  };

  const handleApplyFracture = () => {
    if (!currentGeometry) return;

    setTimeout(() => {
        let mainGeometries: THREE.BufferGeometry[] = [];
        let shellGeometries: THREE.BufferGeometry[] = [];
        
        // Handle main core fracturing
        if (fractureSettings.mainAlgorithm === 'lightning') {
            const baseForMain = (fractureSettings.showShell && fractureSettings.shellAlgorithm !== 'none') ? generateInnerGeometry(currentGeometry, fractureSettings.thickness) : currentGeometry;
            mainGeometries.push(...performLightningFracture(baseForMain, fractureSettings.mainLightning));
        } else if (fractureSettings.mainAlgorithm === 'none') {
            if (fractureSettings.showShell && fractureSettings.shellAlgorithm !== 'none') {
                mainGeometries.push(generateInnerGeometry(currentGeometry, fractureSettings.thickness));
            } else {
                mainGeometries.push(currentGeometry.clone());
            }
        }

        // Handle shell fracturing
        if (fractureSettings.showShell) {
            if (fractureSettings.shellAlgorithm === 'lightning') {
                shellGeometries.push(...performLightningFracture(currentGeometry, fractureSettings.shellLightning));
            } else if (fractureSettings.shellAlgorithm === 'voronoi') {
                shellGeometries.push(...performSurfaceFracture(currentGeometry, fractureSettings));
            }
        }

        const pieces: FracturePiece[] = [];
        let globalIdx = 0;

        const addGeometries = (geos: THREE.BufferGeometry[], isShell: boolean) => {
            geos.forEach(g => {
                const centroid = new THREE.Vector3();
                g.computeBoundingBox();
                if (g.boundingBox) {
                    g.boundingBox.getCenter(centroid);
                }
                const hue = (globalIdx * 0.137) % 1.0;
                const colorColor = new THREE.Color().setHSL(hue, 0.8, 0.5);
                pieces.push({
                    id: Math.random().toString(36).substring(2, 9),
                    geometry: g,
                    visible: true,
                    centroid,
                    color: '#' + colorColor.getHexString(),
                    isShell
                });
                globalIdx++;
            });
        };

        addGeometries(mainGeometries, false);
        addGeometries(shellGeometries, true);
        
        setFracturePieces(pieces);
        setPhase('Fracture');
    }, 50);
  };

  const handleTogglePiece = (id: string) => {
     setFracturePieces(pieces => pieces.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
  };

  const handleTogglePiecesVisibility = (target: 'main' | 'shell', visible: boolean) => {
     const isShell = target === 'shell';
     setFracturePieces(pieces => pieces.map(p => {
        if (!!p.isShell === isShell) {
            return { ...p, visible };
        }
        return p;
     }));
  };

  const coreVisible = fracturePieces.some(p => !p.isShell && p.visible);
  const shellVisible = fracturePieces.some(p => p.isShell && p.visible);

  return (
    <div className="w-screen h-screen flex bg-neutral-950 overflow-hidden text-neutral-200 selection:bg-neutral-700 relative">
      <main className="flex-1 relative">
        <RockCanvas 
           phase={phase}
           geometry={currentGeometry}
           settings={settings}
           selectedFaces={selectedFaces}
           targetPos={targetPos}
           onSelectFace={handleSelectFace}
           onTargetPosChange={handleTargetChange}
           fractureSettings={fractureSettings}
           onUpdateFractureSettings={setFractureSettings}
           fracturePieces={fracturePieces}
           onTogglePiece={handleTogglePiece}
        />

        {/* Floating Toolbar */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex justify-center w-full">
           <div className="pointer-events-auto">
             <Toolbar phase={phase} onChange={setPhase} />
           </div>
        </div>
      </main>

      <Sidebar 
        phase={phase}
        settings={settings} 
        onChange={setSettings} 
        canGrow={selectedFaces.length > 0 && targetPos !== null}
        onGrow={handleGrow}
        canUndo={history.length > 1}
        onUndo={handleUndo}
        onReset={handleReset}
        fractureSettings={fractureSettings}
        onUpdateFractureSettings={setFractureSettings}
        onApplyFracture={handleApplyFracture}
        coreVisible={coreVisible}
        shellVisible={shellVisible}
        onToggleVisibility={handleTogglePiecesVisibility}
      />
    </div>
  );
}

