import { useMemo } from 'react';
import { longIfName } from '../../engine/config/netConfig';
import type { NmsAlarm, Severity } from '../../engine/nms/nms';
import { useSimStore } from '../../store/simStore';

const SEV: Record<Severity, string> = {
  critical: 'bg-red-600/80 text-white',
  major: 'bg-orange-500/80 text-slate-950',
  minor: 'bg-amber-300/80 text-slate-950',
  warning: 'bg-slate-600 text-slate-100',
};

/** NMS tab: what the NMS server sees — managed devices, alarms (root cause vs impact), railway services, link load. */
export default function NmsPanel() {
  const sim = useSimStore((s) => s.sim);
  const version = useSimStore((s) => s.version);
  const v = useMemo(() => sim.nmsView(), [sim, version]);
  const name = (id: string) => sim.device(id)?.name ?? id;
  if (!v.nmsDeviceId)
    return (
      <p className="p-3 text-sm text-slate-500">
        No NMS server is set up. Add an NMS device, give it an IP, then in its properties set the SNMP polling community and the railway services to
        watch. Routers become managed with "snmp-server community &lt;same&gt; ro" and a path from the NMS.
      </p>
    );
  const count = (s: string) => v.devices.filter((d) => d.state === s).length;
  const roots = v.alarms.filter((a) => a.layer === 'root');
  const impact = v.alarms.filter((a) => a.layer === 'impact');
  const info = v.alarms.filter((a) => a.layer === 'info');
  const byId = new Map(v.alarms.map((a) => [a.id, a]));
  const row = (a: NmsAlarm) => (
    <li key={a.id} className="flex gap-2 border-t border-slate-800 py-0.5">
      <span className={`h-fit shrink-0 rounded px-1 text-[10px] font-semibold uppercase ${SEV[a.severity]}`}>{a.severity}</span>
      <span className="shrink-0 font-mono text-slate-300">{a.type}</span>
      <span className="text-slate-200">
        {a.text}
        {a.causes.length > 0 && (
          <span className="block text-slate-500">
            probable cause:{' '}
            {a.causes
              .map((c) => byId.get(c)?.text ?? c)
              .slice(0, 2)
              .join('; ')}
            {a.causes.length > 2 ? ` (+${a.causes.length - 2})` : ''}
          </span>
        )}
      </span>
    </li>
  );
  return (
    <div className="flex h-full min-h-0 gap-3 overflow-auto p-2 text-xs">
      <section className="min-w-[30rem] flex-1">
        <p className="mb-1 text-slate-400">
          NMS <span className="font-mono text-slate-200">{name(v.nmsDeviceId)}</span> · polling community{' '}
          <span className="font-mono text-slate-200">{v.pollCommunity ?? '(not set)'}</span> · devices:{' '}
          <span className="text-emerald-300">{count('managed')} managed</span>,{' '}
          <span className="text-red-300">{count('unreachable')} unreachable</span>,{' '}
          <span className="text-slate-300">{count('not-managed')} not managed</span>
        </p>
        <h3 className="rn-label mt-1">Probable root causes ({roots.length})</h3>
        <ul>{roots.length ? roots.map(row) : <li className="text-slate-500">none</li>}</ul>
        <h3 className="rn-label mt-2">Impact ({impact.length})</h3>
        <ul>{impact.length ? impact.map(row) : <li className="text-slate-500">none</li>}</ul>
        {info.length > 0 && (
          <>
            <h3 className="rn-label mt-2">Information</h3>
            <ul>{info.map(row)}</ul>
          </>
        )}
        <p className="mt-1 text-slate-500">Correlation is rule-based: impact alarms list the root-cause alarms present at the same time.</p>
      </section>
      <section className="min-w-[22rem] flex-1">
        <h3 className="rn-label mb-1">Railway services</h3>
        <table className="w-full">
          <tbody>
            {v.services.map((s) => (
              <tr key={s.name} className="border-t border-slate-800">
                <td className="py-0.5 text-slate-200">
                  {s.name}
                  {s.safety && <span className="ml-1 text-[10px] text-red-300">SAFETY</span>}
                </td>
                <td
                  className={`py-0.5 font-semibold ${s.status === 'UP' ? 'text-emerald-300' : s.status === 'DEGRADED' ? 'text-amber-300' : 'text-red-400'}`}
                >
                  {s.status}
                </td>
                <td className="py-0.5 text-slate-500">{s.detail}</td>
              </tr>
            ))}
            {!v.services.length && (
              <tr>
                <td className="text-slate-500">No services defined (NMS device properties).</td>
              </tr>
            )}
          </tbody>
        </table>
        <h3 className="rn-label mb-1 mt-2">Link utilisation (managed devices, busiest first)</h3>
        <ul className="space-y-1">
          {v.loads.slice(0, 6).map((l) => (
            <li key={`${l.deviceId}${l.iface}`}>
              <div className="flex justify-between">
                <span>
                  {name(l.deviceId)} {longIfName(l.iface)}
                </span>
                <span className="font-mono">{l.pct.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 rounded bg-slate-800">
                <div
                  className={`h-1.5 rounded ${l.pct > 100 ? 'bg-red-500' : l.pct > 90 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, l.pct)}%` }}
                />
              </div>
            </li>
          ))}
          {!v.loads.length && <li className="text-slate-500">No traffic flows configured.</li>}
        </ul>
      </section>
    </div>
  );
}
