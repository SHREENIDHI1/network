import { X } from 'lucide-react';
import { useTopologyStore } from '../store/topologyStore';

export function Notices() {
  const notices = useTopologyStore((s) => s.notices);
  const dismiss = useTopologyStore((s) => s.dismissNotice);
  if (!notices.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-10 right-4 z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {notices.map((n) => (
        <div
          key={n.id}
          role={n.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-2 rounded border px-3 py-2 text-sm shadow-lg ${
            n.kind === 'error' ? 'border-red-700 bg-red-950 text-red-100' : 'border-sky-800 bg-slate-900 text-slate-100'
          }`}
        >
          <span className="flex-1 whitespace-pre-line">{n.text}</span>
          <button type="button" aria-label="Dismiss" className="text-slate-400 hover:text-slate-100" onClick={() => dismiss(n.id)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
