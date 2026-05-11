import { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Environment, TransformControls, ContactShadows } from '@react-three/drei';
import { EffectComposer, N8AO, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { GrowthSettings, SelectedFace, Phase, FracturePiece, FractureSettings } from '../types';
import { generateInnerGeometry } from '../lib/fracture';
import { RNG, generateLightningPath } from '../lib/lightningFracture';

interface RockCanvasProps {
  phase: Phase;
  geometry: THREE.BufferGeometry | null;
  settings: GrowthSettings;
  
  // Modeling
  selectedFaces: SelectedFace[];
  targetPos: THREE.Vector3 | null;
  onSelectFace: (face: SelectedFace | null, shiftKey: boolean) => void;
  onTargetPosChange: (pos: THREE.Vector3) => void;

  // Process
  fractureSettings: FractureSettings;
  onUpdateFractureSettings?: (settings: FractureSettings) => void;
  
  // Fracture
  fracturePieces: FracturePiece[];
  selectedPrimaryPieces?: Set<string>;
  onTogglePiece: (id: string) => void;
  explodeFactor?: number;
}

const HighlightFace = ({ face }: { face: SelectedFace }) => {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setFromPoints(face.vertices);
    return g;
  }, [face]);

  return (
    <mesh geometry={geom}>
      <meshBasicMaterial 
        color="#00ffff" 
        side={THREE.DoubleSide} 
        transparent 
        opacity={0.5} 
        depthTest={false} 
      />
    </mesh>
  );
};

export function RockCanvas({ 
  phase,
  geometry, 
  settings, 
  selectedFaces, 
  targetPos, 
  onSelectFace, 
  onTargetPosChange,
  fractureSettings,
  onUpdateFractureSettings,
  fracturePieces,
  selectedPrimaryPieces,
  onTogglePiece,
  explodeFactor = 0
}: RockCanvasProps) {
  
  const [pendingCutStart, setPendingCutStart] = useState<[number, number, number] | null>(null);
  const transformRef = useRef<any>(null);
  const targetMeshRef = useRef<THREE.Mesh>(null);

  const mainLightningLines = useMemo(() => {
     if (phase !== 'Process' || fractureSettings.activeTab !== 'main' || fractureSettings.mainAlgorithm !== 'lightning' || !geometry) return null;
     const rng = new RNG(fractureSettings.mainLightning.seed);
     const mesh = new THREE.Mesh(geometry);
     mesh.updateMatrixWorld();
     const branchSurfacePts: (THREE.Vector3 | null)[] = Array.from({ length: fractureSettings.mainLightning.fractureBranches }, () => null);
     
     const allPolylines: THREE.Vector3[][] = [];
     for (const cut of fractureSettings.mainLightning.cuts) {
         const out = generateLightningPath(
           new THREE.Vector3(...cut.startPoint),
           new THREE.Vector3(...cut.endPoint),
           fractureSettings.mainLightning, rng, mesh, branchSurfacePts
         );
         allPolylines.push(...out.polylines);
     }
     return allPolylines;
  }, [phase, geometry, fractureSettings.activeTab, fractureSettings.mainAlgorithm, fractureSettings.mainLightning]);

  const secondaryLightningLines = useMemo(() => {
     if (phase !== 'Process' || fractureSettings.activeTab !== 'secondary' || fractureSettings.secondaryAlgorithm !== 'lightning' || !geometry) return null;
     const rng = new RNG(fractureSettings.secondaryLightning.seed);
     const mesh = new THREE.Mesh(geometry);
     mesh.updateMatrixWorld();
     const branchSurfacePts: (THREE.Vector3 | null)[] = Array.from({ length: fractureSettings.secondaryLightning.fractureBranches }, () => null);
     
     const allPolylines: THREE.Vector3[][] = [];
     for (const cut of fractureSettings.secondaryLightning.cuts) {
         const out = generateLightningPath(
           new THREE.Vector3(...cut.startPoint),
           new THREE.Vector3(...cut.endPoint),
           fractureSettings.secondaryLightning, rng, mesh, branchSurfacePts
         );
         allPolylines.push(...out.polylines);
     }
     return allPolylines;
  }, [phase, geometry, fractureSettings.activeTab, fractureSettings.secondaryAlgorithm, fractureSettings.secondaryLightning]);

  // Keep targetMeshRef in sync with targetPos when it changes externally
  useEffect(() => {
    if (targetMeshRef.current && targetPos && phase === 'Modeling') {
      targetMeshRef.current.position.copy(targetPos);
    }
  }, [targetPos, phase]);

  useEffect(() => {
    setPendingCutStart(null);
  }, [phase, fractureSettings.activeTab, fractureSettings.mainAlgorithm, fractureSettings.secondaryAlgorithm]);

  const innerGeometry = useMemo(() => {
      if ((phase === 'Process' || phase === 'Fracture') && geometry) {
          return generateInnerGeometry(geometry, fractureSettings.thickness);
      }
      return null;
  }, [phase, geometry, fractureSettings.thickness]);

  const handlePointerDown = (e: ThreeEvent<MouseEvent>) => {
    if ((phase === 'Process' || phase === 'Secondary') && onUpdateFractureSettings) {
        // Only place points if we are editing a lightning algorithm
        const isMainLightning = phase === 'Process' && fractureSettings.mainAlgorithm === 'lightning';
        const isSecondaryLightning = phase === 'Secondary' && fractureSettings.secondaryAlgorithm === 'lightning';
        
        if (!isMainLightning && !isSecondaryLightning) return;

        e.stopPropagation(); // prevent OrbitControls from grabbing immediately if we hit mesh

        const pt = e.point;
        const arrayPt: [number, number, number] = [pt.x, pt.y, pt.z];

        if (!pendingCutStart) {
           setPendingCutStart(arrayPt);
        } else {
           const newCut = { id: Math.random().toString(36).slice(2), startPoint: pendingCutStart, endPoint: arrayPt };
           if (isMainLightning) {
             onUpdateFractureSettings({
               ...fractureSettings,
               mainLightning: { ...fractureSettings.mainLightning, cuts: [...fractureSettings.mainLightning.cuts, newCut] }
             });
           } else {
             onUpdateFractureSettings({
               ...fractureSettings,
               secondaryLightning: { ...fractureSettings.secondaryLightning, cuts: [...fractureSettings.secondaryLightning.cuts, newCut] }
             });
           }
           setPendingCutStart(null);
        }
        return;
    }

    if (phase === 'Fracture' || phase === 'Process') {
        // Fracture handles cliks directly on pieces
        return;
    }

    e.stopPropagation();
    
    // If we clicked the transform controls, don't select a new face
    if (transformRef.current && transformRef.current.dragging) return;

    if (!e.face) {
        onSelectFace(null, e.shiftKey);
        return;
    }

    const mesh = e.object as THREE.Mesh;
    if (!mesh.geometry) return;
    
    const posAttr = mesh.geometry.attributes.position;
    
    let vA = new THREE.Vector3();
    let vB = new THREE.Vector3();
    let vC = new THREE.Vector3();
    
    if (mesh.geometry.index) {
        vA.fromBufferAttribute(posAttr, mesh.geometry.index.getX(e.face.a));
        vB.fromBufferAttribute(posAttr, mesh.geometry.index.getX(e.face.b));
        vC.fromBufferAttribute(posAttr, mesh.geometry.index.getX(e.face.c));
    } else {
        vA.fromBufferAttribute(posAttr, e.face.a);
        vB.fromBufferAttribute(posAttr, e.face.b);
        vC.fromBufferAttribute(posAttr, e.face.c);
    }
    
    // Convert to world space
    mesh.localToWorld(vA);
    mesh.localToWorld(vB);
    mesh.localToWorld(vC);
    
    const centroid = new THREE.Vector3().add(vA).add(vB).add(vC).divideScalar(3);
    const normal = e.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();

    onSelectFace({ vertices: [vA, vB, vC], centroid, normal }, e.shiftKey);
  };

  const handleMiss = (e: MouseEvent) => {
    if (phase === 'Modeling') {
       onSelectFace(null, e.shiftKey);
    }
  };

  return (
    <Canvas
      camera={{ position: [5, 5, 5], fov: 45 }}
      shadows={{ type: THREE.PCFShadowMap }}
      className="w-full h-full cursor-crosshair"
      onPointerMissed={handleMiss}
    >
      <color attach="background" args={['#1a1a1a']} />
      
      {/* makeDefault ensures it disables automatically during transform dragging */}
      <OrbitControls makeDefault />
      
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} castShadow />
      <directionalLight position={[-10, 5, -5]} intensity={0.5} />

      <Environment preset="city" />

      {phase === 'Modeling' && geometry && (
        <group>
            <mesh 
              geometry={geometry} 
              castShadow 
              receiveShadow
              onPointerDown={handlePointerDown}
            >
              <meshStandardMaterial
                color={settings.color}
                flatShading={settings.flatShading}
                roughness={0.8}
                metalness={0.1}
                side={THREE.FrontSide}
              />
            </mesh>
            <lineSegments>
                <edgesGeometry args={[geometry]} />
                <lineBasicMaterial color="#000000" opacity={0.3} transparent />
            </lineSegments>
        </group>
      )}

      {phase === 'Process' && geometry && (
         <group>
             <mesh geometry={geometry} onPointerDown={handlePointerDown}>
                <meshPhysicalMaterial 
                   color="#8a8a8a" 
                   transmission={0} 
                   opacity={0.8} 
                   transparent={true}
                   metalness={0.1} 
                   roughness={0.8} 
                   flatShading={true} 
                />
             </mesh>
            {onUpdateFractureSettings && pendingCutStart && (
               <mesh position={pendingCutStart}>
                  <sphereGeometry args={[0.15, 16, 16]} />
                  <meshBasicMaterial color="#00ffcc" depthTest={false} transparent opacity={0.8} />
               </mesh>
            )}
            {onUpdateFractureSettings && fractureSettings.mainAlgorithm === 'lightning' && (
                <>
                  {mainLightningLines && mainLightningLines.map((linePts, idx) => {
                     const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
                     return (
                        <primitive key={idx} object={new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: "#ffffff", linewidth: 2 }))} />
                     )
                  })}
                  {fractureSettings.mainLightning.cuts.map((cut, cutIdx) => (
                    <group key={cut.id}>
                      <TransformControls
                        mode="translate"
                        position={new THREE.Vector3(...cut.startPoint)}
                        onObjectChange={(e: any) => {
                          if (e?.target?.object) {
                            const p = e.target.object.position;
                            const newCuts = [...fractureSettings.mainLightning.cuts];
                            newCuts[cutIdx] = { ...newCuts[cutIdx], startPoint: [p.x, p.y, p.z] };
                            onUpdateFractureSettings?.({
                              ...fractureSettings,
                              mainLightning: { ...fractureSettings.mainLightning, cuts: newCuts }
                            });
                          }
                        }}
                      >
                        <mesh>
                          <sphereGeometry args={[0.15, 16, 16]} />
                          <meshBasicMaterial color="#00ffff" depthTest={false} transparent opacity={0.8} />
                        </mesh>
                      </TransformControls>

                      <TransformControls
                        mode="translate"
                        position={new THREE.Vector3(...cut.endPoint)}
                        onObjectChange={(e: any) => {
                          if (e?.target?.object) {
                            const p = e.target.object.position;
                            const newCuts = [...fractureSettings.mainLightning.cuts];
                            newCuts[cutIdx] = { ...newCuts[cutIdx], endPoint: [p.x, p.y, p.z] };
                            onUpdateFractureSettings?.({
                              ...fractureSettings,
                              mainLightning: { ...fractureSettings.mainLightning, cuts: newCuts }
                            });
                          }
                        }}
                      >
                        <mesh>
                          <sphereGeometry args={[0.15, 16, 16]} />
                          <meshBasicMaterial color="#00ffff" depthTest={false} transparent opacity={0.8} />
                        </mesh>
                      </TransformControls>
                    </group>
                  ))}
                </>
            )}
         </group>
      )}

      {phase === 'Secondary' && innerGeometry && (
         <group>
             <mesh geometry={innerGeometry}>
                <meshPhysicalMaterial 
                   color="#f97316" 
                   transmission={0.2} 
                   opacity={0.3} 
                   transparent={true}
                   metalness={0.1} 
                   roughness={0.8} 
                   flatShading={true} 
                />
             </mesh>
             {/* Note: primaryPieces are rendered by the shared Fracture/Secondary block below */}
            {onUpdateFractureSettings && pendingCutStart && (
               <mesh position={pendingCutStart}>
                  <sphereGeometry args={[0.15, 16, 16]} />
                  <meshBasicMaterial color="#00ffcc" depthTest={false} transparent opacity={0.8} />
               </mesh>
            )}
             {onUpdateFractureSettings && fractureSettings.secondaryAlgorithm === 'lightning' && (
                <>
                  {secondaryLightningLines && secondaryLightningLines.map((linePts, idx) => {
                     const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
                     return (
                        <primitive key={idx} object={new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: "#ffffff", linewidth: 2 }))} />
                     )
                  })}
                  {fractureSettings.secondaryLightning.cuts.map((cut, cutIdx) => (
                    <group key={cut.id}>
                      <TransformControls
                        mode="translate"
                        position={new THREE.Vector3(...cut.startPoint)}
                        onObjectChange={(e: any) => {
                          if (e?.target?.object) {
                            const p = e.target.object.position;
                            const newCuts = [...fractureSettings.secondaryLightning.cuts];
                            newCuts[cutIdx] = { ...newCuts[cutIdx], startPoint: [p.x, p.y, p.z] };
                            onUpdateFractureSettings?.({
                              ...fractureSettings,
                              secondaryLightning: { ...fractureSettings.secondaryLightning, cuts: newCuts }
                            });
                          }
                        }}
                      >
                        <mesh>
                          <sphereGeometry args={[0.15, 16, 16]} />
                          <meshBasicMaterial color="#ff00ff" depthTest={false} transparent opacity={0.8} />
                        </mesh>
                      </TransformControls>

                      <TransformControls
                        mode="translate"
                        position={new THREE.Vector3(...cut.endPoint)}
                        onObjectChange={(e: any) => {
                          if (e?.target?.object) {
                            const p = e.target.object.position;
                            const newCuts = [...fractureSettings.secondaryLightning.cuts];
                            newCuts[cutIdx] = { ...newCuts[cutIdx], endPoint: [p.x, p.y, p.z] };
                            onUpdateFractureSettings?.({
                              ...fractureSettings,
                              secondaryLightning: { ...fractureSettings.secondaryLightning, cuts: newCuts }
                            });
                          }
                        }}
                      >
                        <mesh>
                          <sphereGeometry args={[0.15, 16, 16]} />
                          <meshBasicMaterial color="#ff00ff" depthTest={false} transparent opacity={0.8} />
                        </mesh>
                      </TransformControls>
                    </group>
                  ))}
                </>
             )}
         </group>
      )}

      {(phase === 'Fracture' || phase === 'Secondary') && (
         <group>
            {fracturePieces.length === 0 && geometry && (
               <mesh geometry={geometry}>
                 <meshStandardMaterial color={settings.color} flatShading={settings.flatShading} roughness={0.8} metalness={0.1} />
               </mesh>
            )}
            {fracturePieces.map(piece => {
               const offset = piece.centroid ? piece.centroid.clone().normalize().multiplyScalar(explodeFactor * (piece.isShell ? 1.5 : 1.0)) : new THREE.Vector3();
               const isSelected = phase === 'Secondary' && selectedPrimaryPieces?.has(piece.id);
               return (
               <group key={piece.id} position={offset}>
                   <mesh
                     geometry={piece.geometry}
                     visible={piece.visible}
                     castShadow
                     receiveShadow
                     onClick={(e) => {
                        e.stopPropagation();
                        onTogglePiece(piece.id);
                     }}
                   >
                     <meshStandardMaterial
                        color={piece.color || settings.color}
                        flatShading={settings.flatShading}
                        roughness={0.8}
                        metalness={0.1}
                        side={THREE.DoubleSide}
                        emissive={isSelected ? new THREE.Color("#8b5cf6") : new THREE.Color(0x000000)}
                        emissiveIntensity={isSelected ? 0.5 : 0}
                     />
                   </mesh>
                   {piece.visible && (
                      <lineSegments visible={piece.visible}>
                        <edgesGeometry args={[piece.geometry]} />
                        <lineBasicMaterial color={isSelected ? "#a855f7" : "#000000"} opacity={isSelected ? 0.8 : 0.3} transparent />
                      </lineSegments>
                   )}
               </group>
             )})}
         </group>
      )}

      {phase === 'View' && (
         <group>
            {fracturePieces.length > 0 ? (
                <>
                   {fracturePieces.map(piece => piece.visible && (
                      <mesh key={piece.id} geometry={piece.geometry} castShadow receiveShadow>
                         <meshStandardMaterial
                            color={settings.color}
                            flatShading={settings.flatShading}
                            roughness={0.8}
                            metalness={0.1}
                            side={THREE.DoubleSide}
                         />
                      </mesh>
                   ))}
                </>
            ) : (
                geometry && (
                   <mesh geometry={geometry} castShadow receiveShadow>
                     <meshStandardMaterial
                       color={settings.color}
                       flatShading={settings.flatShading}
                       roughness={0.8}
                       metalness={0.1}
                     />
                   </mesh>
                )
            )}
            
            <ContactShadows resolution={1024} scale={20} blur={2} opacity={0.5} far={10} color="#000000" />
            
            <EffectComposer>
                <N8AO aoRadius={1} intensity={2} />
                <Vignette eskil={false} offset={0.1} darkness={1.1} />
            </EffectComposer>
         </group>
      )}

      {phase === 'Modeling' && selectedFaces.map((f, i) => (
        <HighlightFace key={i} face={f} />
      ))}

      {phase === 'Modeling' && selectedFaces.length > 0 && targetPos && (
        <TransformControls
          ref={transformRef}
          mode="translate"
          onObjectChange={(e) => {
             if (targetMeshRef.current) {
                 onTargetPosChange(targetMeshRef.current.position.clone());
             }
          }}
        >
          <mesh ref={targetMeshRef} position={targetPos}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshBasicMaterial color="#ff0055" depthTest={false} transparent opacity={0.8} />
          </mesh>
        </TransformControls>
      )}
    </Canvas>
  );
}

