import { X } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useSimStore, type DockTab } from '../../store/simStore';

const CliPanel = lazy(() => import('./CliPanel'));
const PacketInspector = lazy(() => import('./PacketInspector'));
const EventList = lazy(() => import('./EventList'));
const QosPanel = lazy(() => import('./QosPanel'));

const TABS: Array<{ id: DockTab; label: string }> = [
  { id: 'cli', label: 'CLI' },
  { id: 'inspector', label: 'Packet Inspector' },
  { id: 'events', label: 'Events' },
  { id: 'qos', label: 'QoS' },
];

/** Bottom dock with the device CLI, packet inspector and event queue. Lazy-loaded panels. */
export function BottomDock() {
  const open = useSimStore((s) => s.dockOpen);
  const tab = useSimStore((s) => s.dockTab);
  if (!open) return null;
  return (
    <section className="flex h-72 shrink-0 flex-col border-t border-slate-800 bg-slate-950" aria-label="Console dock">
      <div className="flex items-center border-b border-slate-800 text-xs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => useSimStore.getState().openDock(t.id)}
            className={`px-3 py-1.5 ${tab === t.id ? 'border-b-2 border-sky-500 text-sky-300' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          className="ml-auto p-1.5 text-slate-400 hover:text-slate-100"
          onClick={() => useSimStore.getState().toggleDock()}
          aria-label="Close dock"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense fallback={<p className="p-3 text-sm text-slate-500">Loading…</p>}>
          {tab === 'cli' && <CliPanel />}
          {tab === 'inspector' && <PacketInspector />}
          {tab === 'events' && <EventList />}
          {tab === 'qos' && <QosPanel />}
        </Suspense>
      </div>
    </section>
  );
}
