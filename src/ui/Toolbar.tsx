import { useReactFlow } from '@xyflow/react';
import { BookOpen, FilePlus, FlaskConical, FolderOpen, Info, LayoutGrid, Save, TrainFront } from 'lucide-react';
import { useAppMode, type AppMode } from '../store/appModeStore';
import { useLabStore } from '../store/labStore';
import { useRef } from 'react';
import { useTopologyStore } from '../store/topologyStore';
import { LoadMenu } from './LoadMenu';
import { SimControls } from './sim/SimControls';

function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'topology';
}

export function Toolbar({ onShowLimitations }: { onShowLimitations: () => void }) {
  const topology = useTopologyStore((s) => s.topology);
  const newTopology = useTopologyStore((s) => s.newTopology);
  const loadFromText = useTopologyStore((s) => s.loadFromText);
  const exportText = useTopologyStore((s) => s.exportText);
  const notify = useTopologyStore((s) => s.notify);
  const fileInput = useRef<HTMLInputElement>(null);
  const { fitView } = useReactFlow();
  const mode = useAppMode((s) => s.mode);
  const labOpen = useLabStore((s) => s.lab !== null);
  const canvas = mode === 'sandbox' || (mode === 'lab' && labOpen);

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
      notify('error', 'File is larger than 5 MB; not a RailMPLS Lab topology.');
      return;
    }
    if (loadFromText(await file.text())) fit();
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-950 px-3">
      <div className="mr-2 flex shrink-0 items-center gap-2">
        <TrainFront className="h-5 w-5 text-amber-400" />
        <span className="whitespace-nowrap font-semibold tracking-tight">RailMPLS Lab</span>
        <span className="hidden whitespace-nowrap rounded bg-slate-800 px-1.5 text-[10px] font-medium uppercase text-slate-400 2xl:inline">
          P7 · MPLS QoS + TE
        </span>
      </div>
      <ModeSwitch />
      {mode === 'sandbox' && (
        <>
          <button
            type="button"
            className="rn-btn"
            title="New topology"
            aria-label="New topology"
            onClick={() => {
              if (confirmDiscard()) newTopology();
            }}
          >
            <FilePlus className="h-4 w-4" /> <span className="hidden xl:inline">New</span>
          </button>
          <button
            type="button"
            className="rn-btn"
            title="Open topology file"
            aria-label="Open topology file"
            onClick={() => fileInput.current?.click()}
          >
            <FolderOpen className="h-4 w-4" /> <span className="hidden xl:inline">Open</span>
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
          <button type="button" className="rn-btn" title="Save topology file" aria-label="Save topology file" onClick={onSave}>
            <Save className="h-4 w-4" /> <span className="hidden xl:inline">Save</span>
          </button>
          <LoadMenu confirmDiscard={confirmDiscard} onLoaded={fit} />
          <div className="ml-2 min-w-0 flex-1 truncate text-sm text-slate-400" title={topology.meta.name}>
            {topology.meta.name}
          </div>
        </>
      )}
      {mode === 'lab' && labOpen && (
        <div className="ml-2 min-w-0 flex-1 truncate text-sm text-slate-400" title={topology.meta.name}>
          {topology.meta.name}
        </div>
      )}
      {canvas && <SimControls />}
      {!canvas && <div className="flex-1" />}
      <button type="button" className="rn-btn border-amber-800 text-amber-200" onClick={onShowLimitations}>
        <Info className="h-4 w-4" /> <span className="hidden xl:inline">Model </span>Limitations
      </button>
    </header>
  );
}

const MODES: Array<{
  id: AppMode;
  label: string;
  icon: typeof BookOpen;
  hint: string;
}> = [
  {
    id: 'learn',
    label: 'Learn',
    icon: BookOpen,
    hint: 'Lessons with widgets and flash quizzes',
  },
  {
    id: 'lab',
    label: 'Lab',
    icon: FlaskConical,
    hint: 'Auto-checked labs (from P2)',
  },
  {
    id: 'sandbox',
    label: 'Sandbox',
    icon: LayoutGrid,
    hint: 'Free canvas: build, configure, simulate',
  },
];

function ModeSwitch() {
  const mode = useAppMode((s) => s.mode);
  const setMode = useAppMode((s) => s.setMode);
  return (
    <div role="tablist" aria-label="Mode" className="mr-2 flex rounded border border-slate-700 p-0.5">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={mode === m.id}
          title={m.hint}
          onClick={() => setMode(m.id)}
          className={`flex items-center gap-1 rounded px-2 py-0.5 text-sm ${mode === m.id ? 'bg-sky-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
        >
          <m.icon className="h-3.5 w-3.5" /> {m.label}
        </button>
      ))}
    </div>
  );
}
