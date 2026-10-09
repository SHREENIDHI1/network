import { useReactFlow } from '@xyflow/react';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_LABELS, DEVICE_TEMPLATES, type DeviceTemplate } from '../model/catalog';
import type { DeviceCategory } from '../model/types';
import { useTopologyStore } from '../store/topologyStore';
import { DRAG_MIME } from './canvas/TopologyCanvas';
import { CATEGORY_ACCENT, DEVICE_ICONS } from './icons';

const CATEGORIES: DeviceCategory[] = ['legacy', 'lan', 'mpls'];

export function Palette() {
  const [query, setQuery] = useState('');
  const addDevice = useTopologyStore((s) => s.addDevice);
  const { screenToFlowPosition } = useReactFlow();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEVICE_TEMPLATES;
    return DEVICE_TEMPLATES.filter(
      (t) => t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.kind.includes(q),
    );
  }, [query]);

  /** Click-to-add: place the device at the first free grid spot near the canvas centre. */
  const addAtCentre = (t: DeviceTemplate) => {
    const pane = document.querySelector('.react-flow');
    const r = pane?.getBoundingClientRect();
    const c = r ? screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
    const devices = useTopologyStore.getState().topology.devices;
    const taken = (x: number, y: number) => devices.some((d) => Math.abs(d.position.x - x) < 170 && Math.abs(d.position.y - y) < 90);
    let spot = { x: c.x - 75, y: c.y - 30 };
    search: for (let ring = 0; ring < 12; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const x = c.x - 75 + dx * 190;
          const y = c.y - 30 + dy * 110;
          if (!taken(x, y)) {
            spot = { x, y };
            break search;
          }
        }
      }
    }
    addDevice(t.kind, spot);
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950">
      <div className="border-b border-slate-800 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1.5 h-4 w-4 text-slate-500" />
          <input
            className="rn-input pl-7"
            placeholder="Search devices…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">Drag onto the canvas, or click to add.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {CATEGORIES.map((cat) => {
          const items = filtered.filter((t) => t.category === cat);
          if (!items.length) return null;
          return (
            <section key={cat} className="mb-3">
              <h3 className="rn-label px-1">{CATEGORY_LABELS[cat]}</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map((t) => {
                  const Icon = DEVICE_ICONS[t.icon];
                  return (
                    <button
                      key={t.kind}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_MIME, t.kind);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => addAtCentre(t)}
                      title={t.description}
                      className={`flex cursor-grab flex-col items-center gap-1 rounded border bg-slate-900 px-1 py-2 text-center hover:bg-slate-800 active:cursor-grabbing ${CATEGORY_ACCENT[t.category]}`}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                      <span className="text-[11px] leading-tight text-slate-200">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!filtered.length && <p className="p-2 text-sm text-slate-500">No device matches “{query}”.</p>}
      </div>
    </aside>
  );
}
