import { formatIpv4 } from '../../engine/ip/ipv4';
import type { Device } from '../../model/types';
import { useSimStore } from '../../store/simStore';

/** LIVE L2VPN state of a router: pseudowires (with the reason when down) and VPLS MAC tables. */
export function L2vpnPanel({ device }: { device: Device }) {
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.version);
  const pws = sim.pw.endpoints.filter((e) => e.deviceId === device.id);
  const vfis = Object.keys(sim.config(device.id)?.vfis ?? {});
  if (!pws.length && !vfis.length) return null;
  const name = (id?: string) => (id ? (sim.device(id)?.name ?? id) : '?');
  return (
    <section className="border-t border-slate-800 px-3 py-2">
      <h3 className="rn-label mb-1">L2VPN pseudowires (live)</h3>
      <table className="w-full text-xs">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="font-medium">AC</th>
            <th className="font-medium">Peer · VC</th>
            <th className="font-medium">Labels</th>
            <th className="font-medium">State</th>
          </tr>
        </thead>
        <tbody>
          {pws.map((e) => (
            <tr key={e.key} className="border-t border-slate-800/70">
              <td className="py-0.5 font-mono text-slate-200">{e.ac}</td>
              <td className="py-0.5 font-mono text-slate-300">
                {name(e.remoteDeviceId)} · {e.vcId}
              </td>
              <td className="py-0.5 font-mono text-violet-200">
                {e.localLabel}/{e.remote?.localLabel ?? '-'}
              </td>
              <td className={`py-0.5 ${e.status === 'UP' ? 'text-emerald-300' : 'text-red-300'}`}>
                {e.status === 'UP' ? `UP · ${e.type}` : `DOWN — ${e.reason}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {vfis.map((v) => {
        const macs = [...(sim.vfiMacs.get(`${device.id}|${v}`) ?? new Map()).entries()];
        return (
          <div key={v} className="mt-1 text-xs text-slate-400">
            VFI <span className="font-mono text-slate-200">{v}</span> MAC table:{' '}
            {macs.length === 0 ? (
              <span className="text-slate-500">empty (send traffic to learn)</span>
            ) : (
              macs.map(([mac, e]) => (
                <span key={mac} className="mr-2 font-mono text-slate-300">
                  {mac} → {e.iface ?? `PW ${formatIpv4(e.peer!)}`}
                </span>
              ))
            )}
          </div>
        );
      })}
      <p className="mt-1 text-xs text-slate-500">CLI: show mpls l2transport vc [detail] · show vfi · ping mpls pseudowire PEER VCID</p>
    </section>
  );
}
