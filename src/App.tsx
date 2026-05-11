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
import { performSecondaryFracture, performLightningFracture, generateInnerGeometry } from './lib/fracture';
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
    activeTab: 'main',
    mainAlgorithm: 'lightning',
    secondaryAlgorithm: 'none',
    mainLightning: {
      seed: 123,
      fractureBranches: 3,
      fractureJitter: 0.35,
      fractureSegments: 24,
      cuts: [{ id: '1', startPoint: [-0.9, 0.9, 0], endPoint: [0.9, -0.9, 0] }],
    },
    secondaryLightning: {
      seed: 456,
      fractureBranches: 2,
      fractureJitter: 0.2,
      fractureSegments: 16,
      cuts: [{ id: '1', startPoint: [-0.6, 0.6, 0], endPoint: [0.6, -0.6, 0] }],
    }
  });
  
  // Fracture state
  const [primaryPieces, setPrimaryPieces] = useState<FracturePiece[]>([]);
  const [selectedPrimaryPieces, setSelectedPrimaryPieces] = useState<Set<string>>(new Set());
  const [fracturePieces, setFracturePieces] = useState<FracturePiece[]>([]); // Final pieces
  const [explodeFactor, setExplodeFactor] = useState(0);

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

  const handleApplyPrimaryFracture = () => {
    if (!currentGeometry) return;
    setTimeout(() => {
        let mainGeometries: THREE.BufferGeometry[] = [];
        if (fractureSettings.mainAlgorithm === 'lightning') {
            mainGeometries.push(...performLightningFracture(currentGeometry, fractureSettings.mainLightning));
        } else {
            mainGeometries.push(currentGeometry.clone());
        }

        const pieces: FracturePiece[] = [];
        mainGeometries.forEach((g, i) => {
            const centroid = new THREE.Vector3();
            g.computeBoundingBox();
            if (g.boundingBox) g.boundingBox.getCenter(centroid);
            pieces.push({
                id: 'primary-' + i + '-' + Math.random().toString(36).substring(2, 9),
                geometry: g,
                visible: true,
                centroid,
                isShell: false
            });
        });
        setPrimaryPieces(pieces);
        setSelectedPrimaryPieces(new Set());
        setFractureSettings({ ...fractureSettings, activeTab: 'secondary' });
        setPhase('Secondary');
    }, 50);
  };

  const handleApplySecondaryFracture = () => {
    if (!currentGeometry || primaryPieces.length === 0) return;
    
    setTimeout(() => {
        const globalInnerCoreGeo = generateInnerGeometry(currentGeometry, fractureSettings.thickness);
        const finalPieces: FracturePiece[] = [];
        let globalIdx = 0;

        const addGeo = (g: THREE.BufferGeometry, isShell: boolean) => {
            const centroid = new THREE.Vector3();
            g.computeBoundingBox();
            if (g.boundingBox) g.boundingBox.getCenter(centroid);
            const hue = (globalIdx * 0.137) % 1.0;
            const colorColor = new THREE.Color().setHSL(hue, 0.8, 0.5);
            finalPieces.push({
                id: 'final-' + globalIdx + '-' + Math.random().toString(36).substring(2, 9),
                geometry: g,
                visible: true,
                centroid,
                color: '#' + colorColor.getHexString(),
                isShell
            });
            globalIdx++;
        };

        primaryPieces.forEach(piece => {
            if (selectedPrimaryPieces.has(piece.id) && fractureSettings.secondaryAlgorithm !== 'none') {
                const { coreGeos, shellGeos } = performSecondaryFracture(piece.geometry, globalInnerCoreGeo, fractureSettings);
                coreGeos.forEach(cg => addGeo(cg, false));
                shellGeos.forEach(sg => addGeo(sg, true));
            } else {
                addGeo(piece.geometry, piece.isShell || false);
            }
        });

        setFracturePieces(finalPieces);
        setPhase('Fracture');
    }, 50);
  };

  const handleTogglePiece = (id: string) => {
     if (phase === 'Secondary') {
         setSelectedPrimaryPieces(prev => {
             const next = new Set(prev);
             if (next.has(id)) next.delete(id);
             else next.add(id);
             return next;
         });
     } else if (phase === 'Fracture') {
         setFracturePieces(pieces => pieces.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
     }
  };

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
           fracturePieces={phase === 'Secondary' ? primaryPieces : fracturePieces}
           selectedPrimaryPieces={selectedPrimaryPieces}
           onTogglePiece={handleTogglePiece}
           explodeFactor={explodeFactor}
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
        onApplyPrimaryFracture={handleApplyPrimaryFracture}
        onApplySecondaryFracture={handleApplySecondaryFracture}
        explodeFactor={explodeFactor}
        onExplodeChange={setExplodeFactor}
      />
    </div>
  );
}

