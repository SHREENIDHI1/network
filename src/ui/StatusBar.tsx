import { computeBudget } from '../engine/physical/opticalBudget';
import { useTopologyStore } from '../store/topologyStore';

export function StatusBar() {
  const topology = useTopologyStore((s) => s.topology);
  let los = 0;
  let marginal = 0;
  for (const l of topology.links) {
    if (l.kind !== 'ofc' || !l.optical) continue;
    const st = computeBudget(l.lengthKm, l.optical).status;
    if (st === 'los' || st === 'overload') los += 1;
    else if (st === 'marginal') marginal += 1;
  }
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-slate-800 bg-slate-950 px-3 text-xs text-slate-400">
      <span>{topology.devices.length} devices</span>
      <span>{topology.links.length} links</span>
      {los > 0 && <span className="text-red-400">{los} optical link(s) failing budget</span>}
      {marginal > 0 && <span className="text-yellow-300">{marginal} marginal optical link(s)</span>}
      <span className="ml-auto">Simulation engine (step / play) arrives in Phase 2 — this phase edits topology only.</span>
    </footer>
  );
}
