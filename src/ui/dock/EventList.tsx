import { useSimStore } from '../../store/simStore';

/** Queued events (what Step will process next) and the last processed event. */
export default function EventList() {
  const sim = useSimStore((s) => s.sim);
  const mode = useSimStore((s) => s.mode);
  useSimStore((s) => s.version);
  const pending = sim.describePending(100);
  return (
    <div className="h-full overflow-y-auto p-2 text-xs">
      {mode === 'realtime' && (
        <p className="mb-2 text-slate-400">Realtime mode runs events immediately. Switch to Simulation mode to queue events and Step through them.</p>
      )}
      <p className="mb-2 text-slate-300">
        <span className="rn-label inline">Last event</span>{' '}
        {sim.lastEvent ? `t=${sim.lastEvent.time.toFixed(3)} ms — ${sim.lastEvent.description}` : 'none'}
      </p>
      <h4 className="rn-label">Queued ({sim.pendingEvents()})</h4>
      {pending.length === 0 ? (
        <p className="text-slate-500">Queue empty.</p>
      ) : (
        <ol className="space-y-0.5">
          {pending.map((e, i) => (
            <li key={i} className={i === 0 ? 'text-sky-300' : 'text-slate-300'}>
              <span className="font-mono text-slate-500">{e.time.toFixed(3)}</span> {i === 0 ? '▶ ' : ''}
              {e.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
