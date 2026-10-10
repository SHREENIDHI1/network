import { ChevronDown, Map as MapIcon, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ENABLE_LEGACY_TDM } from '../config/features';
import type { Topology } from '../model/types';
import { useTopologyStore } from '../store/topologyStore';
import { demoNetworking } from '../topologies/demoNetworking';
import { demoTwoStation } from '../topologies/demoTwoStation';
import type { JodhpurLevel } from '../topologies/jodhpur/generate';

type Item = { id: string; label: string; hint: string; build: (level: JodhpurLevel) => Promise<Topology> };

const gen = () => import('../topologies/jodhpur/generate');

const ITEMS: Item[] = [
  { id: 'j1', label: 'J1 · Jodhpur core', hint: '10 junction LSRs + 5 boundary LERs, express links', build: async (l) => (await gen()).j1Core(l) },
  { id: 'j2', label: 'J2 · JU–MTD–DNA–FL', hint: 'CAMTECH case-study route, every POP', build: async (l) => (await gen()).j2(l) },
  { id: 'j3n', label: 'J3 · North board', hint: 'MTD–BKN', build: async (l) => (await gen()).j3('North', l) },
  { id: 'j3c', label: 'J3 · Central board', hint: 'RKB–PLC–JSM, JU–LN–MJ', build: async (l) => (await gen()).j3('Central', l) },
  { id: 'j3w', label: 'J3 · West board', hint: 'LN–SMR–BME–MBF, SMR–BLDI', build: async (l) => (await gen()).j3('West', l) },
  { id: 'j3e', label: 'J3 · East board', hint: 'MTD–DNA–FL, DNA–RTGH', build: async (l) => (await gen()).j3('East', l) },
  { id: 'j4', label: 'J4 · Full division', hint: 'all 156 stations, multi-area OSPF', build: async (l) => (await gen()).j4(l) },
];

const LEVELS: Array<{ id: JodhpurLevel; label: string }> = [
  { id: 'none', label: 'Cabled only' },
  { id: 'ip', label: 'IP plan applied' },
  { id: 'ospf', label: '+ OSPF' },
  { id: 'mpls', label: '+ OSPF + MPLS/LDP' },
];

/** Toolbar menu: demo topology and the generated Jodhpur division topologies (J1–J4). */
export function LoadMenu({ confirmDiscard, onLoaded }: { confirmDiscard: () => boolean; onLoaded: () => void }) {
  const loadTopology = useTopologyStore((s) => s.loadTopology);
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<JodhpurLevel>('ip');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const load = async (build: () => Topology | Promise<Topology>) => {
    if (!confirmDiscard()) return;
    setBusy(true);
    try {
      loadTopology(await build());
      setOpen(false);
      onLoaded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="rn-btn"
        title="Load a demo or a Jodhpur division topology"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Sparkles className="h-4 w-4" /> <span className="hidden xl:inline">Load</span> <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-9 z-50 w-80 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl">
          <button
            type="button"
            role="menuitem"
            className="flex w-full flex-col rounded px-2 py-1.5 text-left hover:bg-slate-800"
            onClick={() => void load(() => (ENABLE_LEGACY_TDM ? demoTwoStation() : demoNetworking()))}
          >
            <span className="text-sm text-slate-100">Demo topology</span>
            <span className="text-xs text-slate-500">Small station LAN + uplink</span>
          </button>
          <div className="my-2 border-t border-slate-800" />
          <div className="mb-1 flex items-center gap-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <MapIcon className="h-3.5 w-3.5" /> Jodhpur division (track-map design)
          </div>
          <label className="mb-1 flex items-center gap-2 px-2 text-xs text-slate-400">
            Config
            <select className="rn-input py-0.5 text-xs" value={level} onChange={(e) => setLevel(e.target.value as JodhpurLevel)}>
              {LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          {ITEMS.map((it) => (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              disabled={busy}
              className="flex w-full flex-col rounded px-2 py-1.5 text-left hover:bg-slate-800 disabled:opacity-50"
              onClick={() => void load(() => it.build(level))}
            >
              <span className="text-sm text-slate-100">{it.label}</span>
              <span className="text-xs text-slate-500">{it.hint}</span>
            </button>
          ))}
          <p className="mt-2 px-2 text-[11px] leading-snug text-slate-500">
            Generated from the station data on the track map. OFC is assumed along the track — not the real RailTel / NWR network.
          </p>
        </div>
      )}
    </div>
  );
}
