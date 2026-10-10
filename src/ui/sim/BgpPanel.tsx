import { formatIpv4 } from '../../engine/ip/ipv4';
import type { Device } from '../../model/types';
import { useSimStore } from '../../store/simStore';

/** LIVE BGP / VRF state of a router: sessions (with the reason when down) and VRF route counts. */
export function BgpPanel({ device }: { device: Device }) {
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.version);
  const sp = sim.bgp.speakers.get(device.id);
  const vrfs = sim.vrfNames(device.id);
  if (!sp && vrfs.length === 0) return null;
  const name = (id?: string) => (id ? (sim.device(id)?.name ?? id) : '?');
  const peerings = sim.bgp.peerings.filter((p) => p.dev === device.id);
  return (
    <section className="border-t border-slate-800 px-3 py-2">
      <h3 className="rn-label mb-1">BGP / VRF (live)</h3>
      {sp && (
        <p className="text-xs text-slate-400">
          AS <span className="font-mono text-slate-200">{sp.asn}</span> · router-ID{' '}
          <span className="font-mono text-slate-200">{formatIpv4(sp.rid)}</span>
        </p>
      )}
      {peerings.length > 0 && (
        <table className="mt-1 w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="font-medium">Neighbour</th>
              <th className="font-medium">AF</th>
              <th className="font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {peerings.map((p) => (
              <tr key={`${p.vrf ?? ''}${p.neighbor}`} className="border-t border-slate-800/70">
                <td className="py-0.5 font-mono text-slate-200">
                  {formatIpv4(p.neighbor)} {p.peer && <span className="text-slate-500">({name(p.peer)})</span>}
                </td>
                <td className="py-0.5 text-slate-400">{p.vrf ? `vrf ${p.vrf}` : p.afs.join(', ') || '-'}</td>
                <td className={`py-0.5 ${p.state === 'Established' ? 'text-emerald-300' : 'text-red-300'}`}>
                  {p.state === 'Established' ? `Est${p.rrClient.vpnv4 || p.rrClient.ipv4 ? ' · RR client' : ''}` : `${p.state} — ${p.reason ?? ''}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {vrfs.length > 0 && (
        <p className="mt-1 text-xs text-slate-400">
          VRFs:{' '}
          {vrfs.map((v) => {
            const rs = sim.routingTable(device.id, v);
            return (
              <span key={v} className="mr-2 font-mono text-slate-200">
                {v}{' '}
                <span className="text-slate-500">
                  ({rs.length} routes, {rs.filter((r) => r.protocol === 'B').length} BGP)
                </span>
              </span>
            );
          })}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">CLI: show ip bgp summary · show bgp vpnv4 unicast all · show ip route vrf NAME</p>
    </section>
  );
}
