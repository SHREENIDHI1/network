import type { Device } from '../../model/types';
import { useSimStore } from '../../store/simStore';

/** LIVE MPLS TE state of a router: tunnels it heads, LSPs through it, RSVP bandwidth per TE link. */
export function TePanel({ device }: { device: Device }) {
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.version);
  const heads = sim.te.lsps.filter((l) => l.head === device.id);
  const transit = sim.te.lsps.filter((l) => l.state === 'up' && l.head !== device.id && l.hops.some((h) => h.dev === device.id));
  const links = sim.te.links.filter((l) => l.dev === device.id);
  if (!heads.length && !transit.length && !links.length) return null;
  const name = (id?: string) => (id ? (sim.device(id)?.name ?? id) : '?');
  return (
    <section className="border-t border-slate-800 px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="rn-label">MPLS TE / RSVP (live)</h3>
        {heads.length > 0 && (
          <button
            type="button"
            className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
            title="mpls traffic-eng reoptimize"
            onClick={() => sim.teReoptimize(device.id)}
          >
            Reoptimize
          </button>
        )}
      </div>
      {heads.map((l) => (
        <p key={l.key} className="text-xs">
          <span className="font-mono text-slate-200">{l.tunnel}</span>{' '}
          {l.state === 'up' ? (
            <>
              <span className="text-emerald-300">up</span> · {l.hops.map((h) => name(h.dev)).join(' → ')} · {l.bandwidthKbps} kbps
              {l.frr.requested && (
                <span className={l.frr.state === 'active' ? 'text-amber-300' : l.frr.state === 'ready' ? 'text-emerald-300' : 'text-slate-500'}>
                  {' '}
                  · FRR {l.frr.state}
                </span>
              )}
            </>
          ) : (
            <span className="text-red-300">down — {l.reason}</span>
          )}
        </p>
      ))}
      {transit.length > 0 && (
        <p className="mt-1 text-xs text-slate-400">
          Transit / tail:{' '}
          {transit
            .map((l) => `${name(l.head)}_t${l.number}${l.frr.active && l.hops[l.frr.active.plr]?.dev === device.id ? ' (FRR active here)' : ''}`)
            .join(', ')}
        </p>
      )}
      {links.length > 0 && (
        <table className="mt-1 w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="font-medium">TE link</th>
              <th className="font-medium">Reserved / reservable (kbps)</th>
            </tr>
          </thead>
          <tbody>
            {links.map((k) => (
              <tr key={k.iface} className="border-t border-slate-800/70">
                <td className="py-0.5 font-mono text-slate-200">
                  {k.iface} → {name(k.peerDev)}
                </td>
                <td className="py-0.5 font-mono text-slate-300">
                  {k.reservedKbps} / {k.reservableKbps}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-1 text-xs text-slate-500">
        CLI: show mpls traffic-eng tunnels [brief] · show mpls traffic-eng fast-reroute database · show ip rsvp interface
      </p>
    </section>
  );
}
