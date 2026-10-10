import { useMemo } from 'react';
import { analyseTraffic } from '../../engine/qos/analysis';
import { dscpName } from '../../engine/qos/apps';
import { longIfName } from '../../engine/config/netConfig';
import { useSimStore } from '../../store/simStore';

/** QoS tab: steady-state traffic analysis of the flows configured on hosts (no packets are sent). */
export default function QosPanel() {
  const sim = useSimStore((s) => s.sim);
  const version = useSimStore((s) => s.version);
  const report = useMemo(() => analyseTraffic(sim), [sim, version]);
  const name = (id: string) => sim.device(id)?.name ?? id;
  if (!report.flows.length)
    return (
      <p className="p-3 text-sm text-slate-500">
        No traffic flows yet. Select a host (UTS, CCTV, IP phone…) → Traffic flows → add an application flow with a destination. This tab then shows,
        for each flow, how much gets through every congested link and which queue protected it.
      </p>
    );
  const busy = report.queues.filter((q) => q.offeredMbps > 0).sort((a, b) => b.offeredMbps / b.capacityMbps - a.offeredMbps / a.capacityMbps);
  return (
    <div className="flex h-full min-h-0 gap-3 overflow-auto p-2 text-xs">
      <section className="min-w-[28rem] flex-1">
        <h3 className="rn-label mb-1">Flows</h3>
        <table className="w-full">
          <thead className="text-left text-slate-500">
            <tr>
              <th>From</th>
              <th>App</th>
              <th>DSCP</th>
              <th className="text-right">Offered</th>
              <th className="text-right">Delivered</th>
              <th className="text-right">Loss</th>
              <th className="pl-2">Bottleneck / problem</th>
            </tr>
          </thead>
          <tbody>
            {report.flows.map((f) => (
              <tr key={`${f.srcDeviceId}${f.id}`} className="border-t border-slate-800">
                <td>{name(f.srcDeviceId)}</td>
                <td>{f.app}</td>
                <td className="font-mono">{dscpName(f.dscp)}</td>
                <td className="text-right font-mono">{f.offeredMbps.toFixed(1)}</td>
                <td className="text-right font-mono">{f.deliveredMbps.toFixed(1)}</td>
                <td className={`text-right font-mono ${f.lossPct > 1 ? 'text-red-400' : 'text-emerald-300'}`}>{f.lossPct.toFixed(1)}%</td>
                <td className="pl-2 text-slate-400">
                  {f.error ?? (f.bottleneck ? `${name(f.bottleneck.deviceId)} ${longIfName(f.bottleneck.iface)}` : '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-slate-500">Mbit/s. Fluid (average-rate) analysis — jitter and burst behaviour are not modelled.</p>
      </section>
      <section className="min-w-[22rem] flex-1">
        <h3 className="rn-label mb-1">Egress queues (busiest first)</h3>
        <ul className="space-y-1">
          {busy.slice(0, 8).map((q) => (
            <li key={`${q.deviceId}${q.iface}`} className="rounded border border-slate-800 p-1.5">
              <div className="flex justify-between">
                <span>
                  {name(q.deviceId)} {longIfName(q.iface)}{' '}
                  {q.policy ? <span className="text-sky-300">policy {q.policy}</span> : <span className="text-slate-500">FIFO</span>}
                </span>
                <span className={`font-mono ${q.offeredMbps > q.capacityMbps ? 'text-red-400' : 'text-slate-300'}`}>
                  {q.offeredMbps.toFixed(1)} / {q.capacityMbps} Mbit/s
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded bg-slate-800">
                <div
                  className={`h-1.5 rounded ${q.offeredMbps > q.capacityMbps ? 'bg-red-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, (q.offeredMbps / q.capacityMbps) * 100)}%` }}
                />
              </div>
              {q.classes.length > 1 && (
                <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                  {q.classes.map((c) => `${c.name}(${c.kind}) ${c.deliveredMbps.toFixed(1)}/${c.offeredMbps.toFixed(1)}`).join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
