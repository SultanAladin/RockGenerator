import { GrowthSettings, Phase, FractureSettings } from '../types';
import { Plus, Undo, Pickaxe, Zap, Scissors, MousePointer2, Camera } from 'lucide-react';

interface SidebarProps {
  phase: Phase;
  settings: GrowthSettings;
  onChange: (settings: GrowthSettings) => void;
  canGrow: boolean;
  onGrow: () => void;
  canUndo: boolean;
  onUndo: () => void;
  onReset: () => void;
  
  fractureSettings: FractureSettings;
  onUpdateFractureSettings: (s: FractureSettings) => void;
  onApplyFracture: () => void;
  coreVisible?: boolean;
  shellVisible?: boolean;
  onToggleVisibility?: (target: 'main' | 'shell', visible: boolean) => void;
}

export function Sidebar({ 
  phase,
  settings, 
  onChange, 
  canGrow,
  onGrow,
  canUndo,
  onUndo,
  onReset,
  fractureSettings,
  onUpdateFractureSettings,
  onApplyFracture,
  coreVisible = true,
  shellVisible = true,
  onToggleVisibility
}: SidebarProps) {

  return (
    <div className="w-80 h-full overflow-y-auto bg-neutral-900 border-l border-neutral-800 text-neutral-200 flex flex-col font-sans relative z-10 shadow-2xl">
      <div className="p-4 border-b border-neutral-800 sticky top-0 bg-neutral-900/95 backdrop-blur z-10 flex flex-col gap-2">
        <h1 className="text-xl font-medium flex items-center gap-2">
          {phase === 'Modeling' && <><Pickaxe className="w-5 h-5 text-neutral-400" />Modeling</>}
          {phase === 'Process' && <><Zap className="w-5 h-5 text-purple-400" />Process</>}
          {phase === 'Fracture' && <><Scissors className="w-5 h-5 text-orange-400" />Fracture</>}
          {phase === 'View' && <><Camera className="w-5 h-5 text-emerald-400" />View</>}
        </h1>
        <p className="text-xs text-neutral-500 leading-relaxed">
          {phase === 'Modeling' && 'Interactive organic generation. Select a face, position the node, and extrude organic chunks.'}
          {phase === 'Process' && 'Adjust the thickness and number of chunks to randomly fracture the mesh into pieces.'}
          {phase === 'Fracture' && 'Select disjoint geometry chunks to hide them (simulating pieces falling off).'}
          {phase === 'View' && 'View the rock with texturing, ambient occlusion, and rendering effects.'}
        </p>
      </div>

      <div className="p-4 flex flex-col gap-6">
        
        {phase === 'Modeling' && (
          <>
            {/* Action Panel */}
            <section className="flex flex-col gap-4">
              <div className="bg-neutral-800/50 border border-neutral-700/50 p-4 rounded-xl flex flex-col gap-3">
                {canGrow ? (
                  <p className="text-xs text-center text-neutral-300">
                    Position the red target node in the 3D space, then press <strong className="text-white">Grow</strong>.
                  </p>
                ) : (
                  <p className="text-xs text-center text-neutral-500">
                    Click any face on the rock to begin an extrusion.
                  </p>
                )}

                <button
                  onClick={onGrow}
                  disabled={!canGrow}
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold transition-all ${
                    canGrow 
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/50' 
                      : 'bg-neutral-800 text-neutral-600 cursor-not-allowed border border-neutral-700'
                  }`}
                >
                  <Plus className="w-4 h-4" /> Grow Towards Node
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors border border-neutral-700"
                >
                  <Undo className="w-4 h-4" /> Undo
                </button>
                <button
                  onClick={onReset}
                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-neutral-800 hover:bg-red-900/30 hover:text-red-400 rounded text-sm font-medium transition-colors border border-neutral-700"
                >
                  Reset All
                </button>
              </div>
            </section>

            {/* Growth Settings */}
            <section className="flex flex-col gap-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Extrusion Settings</h2>
              
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-end">
                  <label className="text-sm">Density (Points)</label>
                  <span className="text-xs text-neutral-500">{settings.pointsCount}</span>
                </div>
                <input 
                  type="range" min="4" max="128" step="1" 
                  value={settings.pointsCount} 
                  onChange={e => onChange({...settings, pointsCount: parseInt(e.target.value)})}
                  className="accent-neutral-400"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-end">
                   <label className="text-sm">Spread Radius</label>
                   <span className="text-xs text-neutral-500">{settings.spread.toFixed(1)}</span>
                </div>
                <input 
                  type="range" min="0.1" max="4.0" step="0.1" 
                  value={settings.spread} 
                  onChange={e => onChange({...settings, spread: parseFloat(e.target.value)})}
                  className="accent-neutral-400"
                />
              </div>

            </section>
          </>
        )}

        {phase === 'Process' && (
           <>
             <section className="flex flex-col gap-4">
                 <div className="bg-neutral-800/50 p-4 rounded-xl border border-neutral-700/50 flex flex-col gap-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-purple-400">Fracture Target</h3>
                    <div className="flex bg-neutral-900 rounded-lg p-1 gap-1 border border-neutral-700">
                      <button
                        onClick={() => onUpdateFractureSettings({ ...fractureSettings, target: 'main' })}
                        className={`flex-1 text-sm py-1 rounded-md transition-colors ${fractureSettings.target === 'main' ? 'bg-orange-600/50 text-orange-200' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'}`}
                      >
                        Main Mesh
                      </button>
                      <button
                        onClick={() => onUpdateFractureSettings({ ...fractureSettings, target: 'shell' })}
                        className={`flex-1 text-sm py-1 rounded-md transition-colors ${fractureSettings.target === 'shell' ? 'bg-purple-600/50 text-purple-200' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'}`}
                      >
                        Shell Layer
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <input 
                        type="checkbox" 
                        id="showShell" 
                        checked={fractureSettings.showShell}
                        onChange={(e) => onUpdateFractureSettings({...fractureSettings, showShell: e.target.checked})}
                        className="rounded border-neutral-600 bg-neutral-800 text-purple-500 focus:ring-purple-500"
                      />
                      <label htmlFor="showShell" className="text-sm text-neutral-300 cursor-pointer">Enable Shell</label>
                    </div>

                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mt-2">Algorithm</h3>
                    {fractureSettings.target === 'main' ? (
                      <div className="flex bg-neutral-900 rounded-lg p-1 gap-1 border border-neutral-700">
                        <button
                          onClick={() => onUpdateFractureSettings({ ...fractureSettings, mainAlgorithm: 'lightning' })}
                          className={`flex-1 text-sm py-1 rounded-md transition-colors ${fractureSettings.mainAlgorithm === 'lightning' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'}`}
                        >
                          Lightning Path
                        </button>
                        <button
                          onClick={() => onUpdateFractureSettings({ ...fractureSettings, mainAlgorithm: 'none' })}
                          className={`flex-1 text-sm py-1 rounded-md transition-colors ${fractureSettings.mainAlgorithm === 'none' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'}`}
                        >
                          None
                        </button>
                      </div>
                    ) : (
                      <div className="flex bg-neutral-900 rounded-lg p-1 gap-1 border border-neutral-700">
                        <button
                          onClick={() => onUpdateFractureSettings({ ...fractureSettings, shellAlgorithm: 'voronoi' })}
                          className={`flex-1 text-xs py-1 rounded-md transition-colors ${fractureSettings.shellAlgorithm === 'voronoi' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'}`}
                        >
                          Voronoi
                        </button>
                        <button
                          onClick={() => onUpdateFractureSettings({ ...fractureSettings, shellAlgorithm: 'lightning' })}
                          className={`flex-1 text-xs py-1 rounded-md transition-colors ${fractureSettings.shellAlgorithm === 'lightning' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'}`}
                        >
                          Lightning
                        </button>
                        <button
                          onClick={() => onUpdateFractureSettings({ ...fractureSettings, shellAlgorithm: 'none' })}
                          className={`flex-1 text-xs py-1 rounded-md transition-colors ${fractureSettings.shellAlgorithm === 'none' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'}`}
                        >
                          None
                        </button>
                      </div>
                    )}

                    {fractureSettings.target === 'shell' && fractureSettings.shellAlgorithm === 'voronoi' && (
                      <>
                        <div className="flex flex-col gap-1.5 mt-2">
                           <div className="flex justify-between items-end">
                             <label className="text-sm">Thickness</label>
                             <span className="text-xs text-neutral-500">{fractureSettings.thickness.toFixed(2)}</span>
                           </div>
                           <input 
                             type="range" min="0.05" max="2.0" step="0.05" 
                             value={fractureSettings.thickness} 
                             onChange={e => onUpdateFractureSettings({ ...fractureSettings, thickness: parseFloat(e.target.value) })}
                             className="accent-purple-500 cursor-pointer"
                           />
                        </div>
                        <div className="flex flex-col gap-1.5">
                           <div className="flex justify-between items-end">
                             <label className="text-sm">Chunks Density</label>
                             <span className="text-xs text-neutral-500">{fractureSettings.chunks}</span>
                           </div>
                           <input 
                             type="range" min="2" max="100" step="1" 
                             value={fractureSettings.chunks} 
                             onChange={e => onUpdateFractureSettings({ ...fractureSettings, chunks: parseInt(e.target.value) })}
                             className="accent-purple-500 cursor-pointer"
                           />
                        </div>
                      </>
                    )}

                    {((fractureSettings.target === 'main' && fractureSettings.mainAlgorithm === 'lightning') || 
                      (fractureSettings.target === 'shell' && fractureSettings.shellAlgorithm === 'lightning')) && (
                      <div className="mt-2 flex flex-col gap-3">
                        {(() => {
                           const light = fractureSettings.target === 'main' ? fractureSettings.mainLightning : fractureSettings.shellLightning;
                           const setLight = (newLight: any) => {
                             if (fractureSettings.target === 'main') onUpdateFractureSettings({ ...fractureSettings, mainLightning: newLight });
                             else onUpdateFractureSettings({ ...fractureSettings, shellLightning: newLight });
                           };
                           const accent = fractureSettings.target === 'main' ? 'accent-orange-500' : 'accent-purple-500';
                           return (
                             <>
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-xs text-neutral-400">{light.cuts.length} cuts defined</span>
                                  <button 
                                     onClick={() => setLight({...light, cuts: []})}
                                     className="text-xs bg-red-900/50 hover:bg-red-800 text-red-200 px-2 py-0.5 rounded"
                                  >
                                     Clear Cuts
                                  </button>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                   <div className="flex justify-between items-end">
                                     <label className="text-sm">Branches</label>
                                     <span className="text-xs text-neutral-500">{light.fractureBranches}</span>
                                   </div>
                                   <input 
                                     type="range" min="0" max="8" step="1" 
                                     value={light.fractureBranches} 
                                     onChange={e => setLight({ ...light, fractureBranches: parseInt(e.target.value) })}
                                     className={`${accent} cursor-pointer`}
                                   />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                   <div className="flex justify-between items-end">
                                     <label className="text-sm">Jitter</label>
                                     <span className="text-xs text-neutral-500">{light.fractureJitter.toFixed(2)}</span>
                                   </div>
                                   <input 
                                     type="range" min="0" max="1" step="0.05" 
                                     value={light.fractureJitter} 
                                     onChange={e => setLight({ ...light, fractureJitter: parseFloat(e.target.value) })}
                                     className={`${accent} cursor-pointer`}
                                   />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                   <div className="flex justify-between items-end">
                                     <label className="text-sm">Segments</label>
                                     <span className="text-xs text-neutral-500">{light.fractureSegments}</span>
                                   </div>
                                   <input 
                                     type="range" min="4" max="64" step="1" 
                                     value={light.fractureSegments} 
                                     onChange={e => setLight({ ...light, fractureSegments: parseInt(e.target.value) })}
                                     className={`${accent} cursor-pointer`}
                                   />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                   <div className="flex justify-between items-end">
                                     <label className="text-sm">Seed</label>
                                     <span className="text-xs text-neutral-500">{light.seed}</span>
                                   </div>
                                   <input 
                                     type="range" min="0" max="1000" step="1" 
                                     value={light.seed} 
                                     onChange={e => setLight({ ...light, seed: parseInt(e.target.value) })}
                                     className={`${accent} cursor-pointer`}
                                   />
                                </div>
                             </>
                           );
                        })()}
                      </div>
                    )}
                 </div>
             </section>
             <section className="flex flex-col gap-4 border-t border-neutral-800 pt-4 mt-2">
                <button
                  onClick={onApplyFracture}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-orange-900/50 transition-all"
                >
                  <Scissors className="w-4 h-4" /> Apply Fracture
                </button>
             </section>
           </>
        )}

        {(phase === 'Fracture' || phase === 'View') && (
           <section className="flex flex-col gap-4">
              {phase === 'Fracture' && (
                  <div className="bg-neutral-800/50 border border-neutral-700/50 p-4 rounded-xl flex flex-col gap-3">
                     <p className="text-sm text-neutral-300 flex items-start gap-2">
                       <MousePointer2 className="w-5 h-5 shrink-0 text-orange-400" />     
                       Click chunks on the rock to toggle their visibility.
                     </p>
                  </div>
              )}
              
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Visibility</h3>
                <div className="flex flex-col gap-2 bg-neutral-800/30 border border-neutral-700/50 p-2 rounded-lg">
                   <div className="flex items-center justify-between">
                     <span className="text-sm text-neutral-300">Core</span>
                     <button
                        onClick={() => onToggleVisibility?.('main', !coreVisible)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-neutral-900 ${coreVisible ? 'bg-orange-500' : 'bg-neutral-600'}`}
                     >
                        <span aria-hidden="true" className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${coreVisible ? 'translate-x-2' : '-translate-x-2'}`} />
                     </button>
                   </div>
                   <div className="flex items-center justify-between">
                     <span className="text-sm text-neutral-300">Shell</span>
                     <button
                        onClick={() => onToggleVisibility?.('shell', !shellVisible)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-neutral-900 ${shellVisible ? 'bg-purple-500' : 'bg-neutral-600'}`}
                     >
                        <span aria-hidden="true" className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${shellVisible ? 'translate-x-2' : '-translate-x-2'}`} />
                     </button>
                   </div>
                </div>
              </div>

              {phase === 'Fracture' && (
                  <button
                      onClick={onReset}
                      className="mt-2 flex items-center justify-center gap-2 py-2 px-3 bg-neutral-800 hover:bg-red-900/30 hover:text-red-400 rounded text-sm font-medium transition-colors border border-neutral-700"
                    >
                      Reset To Whole Rock
                  </button>
              )}
           </section>
        )}

        {/* Global Settings (Always relevant) */}
        <section className="flex flex-col gap-4 border-t border-neutral-800 pt-4 mt-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Material</h2>
          
          <div className="flex items-center justify-between">
            <label className="text-sm">Flat Shading</label>
            <input 
              type="checkbox" 
              checked={settings.flatShading} 
              onChange={e => onChange({...settings, flatShading: e.target.checked})}
              className="w-4 h-4 bg-neutral-800 border-neutral-700 rounded text-neutral-500 focus:ring-neutral-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm">Base Color</label>
            <div className="flex gap-2">
               {['#6a6f73', '#8b7355', '#4a5d4e', '#2c2c2c', '#d1d5db'].map(c => (
                 <button
                   key={c}
                   onClick={() => onChange({...settings, color: c})}
                   className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${settings.color === c ? 'border-white' : 'border-transparent'}`}
                   style={{ backgroundColor: c }}
                 />
               ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
