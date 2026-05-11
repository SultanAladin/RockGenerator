import { Pickaxe, Zap, Scissors, Camera, Layers } from 'lucide-react';
import { Phase } from '../types';

interface ToolbarProps {
  phase: Phase;
  onChange: (phase: Phase) => void;
}

export function Toolbar({ phase, onChange }: ToolbarProps) {
  return (
    <div className="bg-neutral-950/80 backdrop-blur-md border border-neutral-800 rounded-2xl flex items-center p-2 gap-2 shadow-2xl pointer-events-auto">
       <button 
         onClick={() => onChange('Modeling')}
         className={`px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2 text-sm font-medium ${phase === 'Modeling' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'}`}
         title="Modeling Phase"
       >
         <Pickaxe className="w-4 h-4" />
         Modeling
       </button>
       
       <button 
         onClick={() => onChange('Process')}
         className={`px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2 text-sm font-medium ${phase === 'Process' ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/50' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'}`}
         title="Core Fracture Phase"
       >
         <Zap className="w-4 h-4" />
         Core Fracture
       </button>

       <button 
         onClick={() => onChange('Secondary')}
         className={`px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2 text-sm font-medium ${phase === 'Secondary' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'}`}
         title="Surface Fracture Phase"
       >
         <Layers className="w-4 h-4" />
         Surface Layer
       </button>

       <button 
         onClick={() => onChange('Fracture')}
         className={`px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2 text-sm font-medium ${phase === 'Fracture' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'}`}
         title="Review Fracture Phase"
       >
         <Scissors className="w-4 h-4" />
         Review
       </button>

       <button 
         onClick={() => onChange('View')}
         className={`px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-2 text-sm font-medium ${phase === 'View' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'}`}
         title="View Phase"
       >
         <Camera className="w-4 h-4" />
         View
       </button>
    </div>
  );
}
