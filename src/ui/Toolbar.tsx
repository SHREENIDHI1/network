import { useReactFlow } from '@xyflow/react';
import { FilePlus, FolderOpen, Info, Save, Sparkles, TrainFront } from 'lucide-react';
import { useRef } from 'react';
import { useTopologyStore } from '../store/topologyStore';
import { ENABLE_LEGACY_TDM } from '../config/features';
import { demoNetworking } from '../topologies/demoNetworking';
import { demoTwoStation } from '../topologies/demoTwoStation';
import { SimControls } from './sim/SimControls';

function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'topology';
}

export function Toolbar({ onShowLimitations }: { onShowLimitations: () => void }) {
  const topology = useTopologyStore((s) => s.topology);
  const newTopology = useTopologyStore((s) => s.newTopology);
  const loadTopology = useTopologyStore((s) => s.loadTopology);
  const loadFromText = useTopologyStore((s) => s.loadFromText);
  const exportText = useTopologyStore((s) => s.exportText);
  const notify = useTopologyStore((s) => s.notify);
  const fileInput = useRef<HTMLInputElement>(null);
  const { fitView } = useReactFlow();

  const confirmDiscard = () =>
    topology.devices.length === 0 || window.confirm('Replace the current topology? Unsaved changes will be lost (save first if needed).');

  const fit = () => setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50);

  const onSave = () => {
    const blob = new Blob([exportText()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileName(topology.meta.name)}.railnet.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('info', `Saved ${a.download}`);
  };

  const onOpenFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5_000_000) {
      notify('error', 'File is larger than 5 MB; not a RailNet Sim topology.');
      return;
    }
    if (loadFromText(await file.text())) fit();
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-950 px-3">
      <div className="mr-3 flex items-center gap-2">
        <TrainFront className="h-5 w-5 text-amber-400" />
        <span className="font-semibold tracking-tight">RailNet Sim</span>
        <span className="rounded bg-slate-800 px-1.5 text-[10px] font-medium uppercase text-slate-400">Phase 2 · Ethernet + IP</span>
      </div>
      <button
        type="button"
        className="rn-btn"
        onClick={() => {
          if (confirmDiscard()) newTopology();
        }}
      >
        <FilePlus className="h-4 w-4" /> New
      </button>
      <button type="button" className="rn-btn" onClick={() => fileInput.current?.click()}>
        <FolderOpen className="h-4 w-4" /> Open
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          if (confirmDiscard()) void onOpenFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <button type="button" className="rn-btn" onClick={onSave}>
        <Save className="h-4 w-4" /> Save
      </button>
      <button
        type="button"
        className="rn-btn"
        onClick={() => {
          if (!confirmDiscard()) return;
          loadTopology(ENABLE_LEGACY_TDM ? demoTwoStation() : demoNetworking());
          fit();
        }}
      >
        <Sparkles className="h-4 w-4" /> Load demo
      </button>
      <div className="ml-3 min-w-0 flex-1 truncate text-sm text-slate-400" title={topology.meta.name}>
        {topology.meta.name}
      </div>
      <SimControls />
      <button type="button" className="rn-btn border-amber-800 text-amber-200" onClick={onShowLimitations}>
        <Info className="h-4 w-4" /> Model Limitations
      </button>
    </header>
  );
}
