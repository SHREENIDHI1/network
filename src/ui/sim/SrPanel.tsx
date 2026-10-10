import { formatIpv4 } from '../../engine/ip/ipv4';
import type { Device } from '../../model/types';
import { useSimStore } from '../../store/simStore';

/** LIVE Segment Routing state of a router: SRGB, prefix SIDs it advertises, SR problems and TI-LFA repairs. */
export function SrPanel({ device }: { device: Device }) {
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.version);
  const srgb = sim.sr.routers.get(device.id);
  const problems = sim.sr.problems.filter((p) => p.deviceId === device.id);
  if (!srgb && !problems.length) return null;
  const own = sim.sr.sids.filter((s) => s.owner === device.id);
  const lfa = sim.sr.tiLfa.filter((t) => t.deviceId === device.id);
  return (
    <section className="border-t border-slate-800 px-3 py-2">
      <h3 className="rn-label mb-1">Segment Routing (live)</h3>
      {srgb && (
        <p className="text-xs text-slate-400">
          SRGB {srgb.base}–{srgb.end} · {sim.sr.entries.filter((e) => e.deviceId === device.id).length} SR label entries
        </p>
      )}
      {own.map((s) => (
        <p key={`${s.network}/${s.prefixLen}`} className="font-mono text-xs text-slate-200">
          {formatIpv4(s.network)}/{s.prefixLen} → index {s.index} (label {(srgb?.base ?? 16000) + s.index})
        </p>
      ))}
      {problems.map((p, i) => (
        <p key={i} className="text-xs text-amber-300">
          {p.text}
        </p>
      ))}
      {lfa.length > 0 && (
        <table className="mt-1 w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="font-medium">Prefix</th>
              <th className="font-medium">TI-LFA repair</th>
            </tr>
          </thead>
          <tbody>
            {lfa.map((t) => (
              <tr key={t.prefix} className="border-t border-slate-800/70">
                <td className="py-0.5 font-mono text-slate-200">{t.prefix}</td>
                <td className={`py-0.5 ${t.reason ? 'text-slate-500' : 'text-emerald-300'}`}>
                  {t.reason ?? (t.segments.length ? t.segments.join(' + ') : 'LFA (no extra label)')} {!t.reason && `· protects ${t.protectedIface}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
