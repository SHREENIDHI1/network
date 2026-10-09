import { Pause, Play, RotateCcw, SkipForward, Terminal } from 'lucide-react';
import { useSimStore } from '../../store/simStore';

const SPEEDS = [1, 2, 4, 8, 16, 32];

/** Toolbar block: Realtime / Simulation mode, Step, Play/Pause, speed, sim clock. */
export function SimControls() {
  const mode = useSimStore((s) => s.mode);
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.version); // re-render on engine changes
  const { setMode, step, play, pause, setSpeed, resetSim, toggleDock } = useSimStore.getState();
  const pending = sim.pendingEvents();
  const sm = mode === 'simulation';

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex overflow-hidden rounded border border-slate-700 text-xs" role="group" aria-label="Simulation mode">
        {(['realtime', 'simulation'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-2 py-1 ${mode === m ? 'bg-sky-700 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
            title={m === 'realtime' ? 'Commands run to completion immediately' : 'Events wait in the queue; use Step / Play'}
          >
            {m === 'realtime' ? 'Realtime' : 'Simulation'}
          </button>
        ))}
      </div>
      <button type="button" className="rn-btn px-2" disabled={!sm || pending === 0 || playing} onClick={step} title="Process the next event">
        <SkipForward className="h-4 w-4" />
      </button>
      <button type="button" className="rn-btn px-2" disabled={!sm || (!playing && pending === 0)} onClick={playing ? pause : play} title={playing ? 'Pause' : 'Play events'}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <select
        className="rn-input w-auto py-0.5 text-xs"
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
        disabled={!sm}
        aria-label="Playback speed (events per second)"
      >
        {SPEEDS.map((v) => (
          <option key={v} value={v}>
            {v} ev/s
          </option>
        ))}
      </select>
      <span className="w-36 truncate font-mono text-[11px] text-slate-400" title="Simulated time and queued events">
        t={sim.now.toFixed(3)} ms · {pending} queued
      </span>
      <button type="button" className="rn-btn px-2" onClick={resetSim} title="Reset simulation (clears MAC/ARP tables, queue, traces; keeps config)">
        <RotateCcw className="h-4 w-4" />
      </button>
      <button type="button" className="rn-btn" onClick={toggleDock} title="Show / hide the console dock">
        <Terminal className="h-4 w-4" /> Console
      </button>
    </div>
  );
}
