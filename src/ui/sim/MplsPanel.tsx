import { Radar } from 'lucide-react';
import { useState } from 'react';
import { lspPingOutput, lspTraceOutput } from '../../engine/cli/formatMpls';
import { formatIpv4, networkOf, parseIpv4 } from '../../engine/ip/ipv4';
import type { Device } from '../../model/types';
import { useSimStore } from '../../store/simStore';

/** LIVE MPLS state of a router: LDP identity, sessions, LFIB, and LSP ping / trace. */
export function MplsPanel({ device }: { device: Device }) {
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.version);
  const [fec, setFec] = useState('');
  const [out, setOut] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const me = sim.ldp.routers.get(device.id);
  if (!me) return null;
  const name = (id: string) => sim.device(id)?.name ?? id;
  const sessions = sim.ldp.sessions.filter((s) => s.a === device.id || s.b === device.id);
  const lfib = sim.ldp.lfib
    .filter((e) => e.deviceId === device.id && e.inLabel !== null)
    .filter((e) => !filter || `${formatIpv4(e.network)}/${e.prefixLen}`.includes(filter.trim()))
    .sort((a, b) => a.inLabel! - b.inLabel!);

  const run = (kind: 'ping' | 'trace') => {
    const m = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(fec.trim());
    const n = m ? parseIpv4(m[1]) : null;
    if (!m || n === null) {
      setOut('Enter a FEC as A.B.C.D/len, e.g. a loopback 10.0.2.6/32.');
      return;
    }
    const len = Number(m[2]);
    const id = kind === 'ping' ? sim.lspPing(device.id, networkOf(n, len), len) : sim.lspTrace(device.id, networkOf(n, len), len);
    sim.runUntilIdle();
    const s = sim.lspSession(id)!;
    setOut(kind === 'ping' ? lspPingOutput(s) : lspTraceOutput(sim, s));
  };

  return (
    <section className="border-t border-slate-800 px-3 py-2">
      <h3 className="rn-label mb-1">MPLS / LDP (live)</h3>
      <p className="text-xs text-slate-400">
        LDP router-ID <span className="font-mono text-slate-200">{formatIpv4(me.routerId)}</span> ({me.ridIface}) · MPLS on{' '}
        <span className="font-mono text-slate-200">{me.mplsIfaces.join(', ') || 'no interface'}</span>
      </p>
      <table className="mt-1 w-full text-xs">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="font-medium">LDP peer</th>
            <th className="font-medium">State</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const peer = s.a === device.id ? s.b : s.a;
            return (
              <tr key={peer} className="border-t border-slate-800/70">
                <td className="py-0.5 font-mono text-slate-200">{name(peer)}</td>
                <td className={`py-0.5 ${s.state === 'OPERATIONAL' ? 'text-emerald-300' : 'text-red-300'}`} title={s.reason}>
                  {s.state === 'OPERATIONAL' ? 'Oper' : `down — ${s.reason}`}
                </td>
              </tr>
            );
          })}
          {!sessions.length && (
            <tr>
              <td colSpan={2} className="py-0.5 text-slate-500">
                No LDP neighbour discovered (is "mpls ip" on the neighbour’s link?).
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2">
        <h4 className="text-xs font-semibold text-slate-400">LFIB</h4>
        <input className="rn-input flex-1 py-0.5 text-xs" placeholder="filter prefix" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="max-h-48 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="font-medium">In</th>
              <th className="font-medium">Out</th>
              <th className="font-medium">FEC</th>
              <th className="font-medium">Next hop</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {lfib.slice(0, 200).map((e, i) => (
              <tr key={i} className="border-t border-slate-800/70">
                <td className="text-slate-200">{e.inLabel}</td>
                <td className={e.out === 'none' ? 'text-amber-300' : 'text-violet-200'}>
                  {e.out === 'pop' ? 'Pop' : e.out === 'none' ? 'No Label' : e.out}
                </td>
                <td className="text-slate-300">
                  {formatIpv4(e.network)}/{e.prefixLen}
                </td>
                <td className="text-slate-400">
                  {formatIpv4(e.nextHop)} {e.iface}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex gap-1">
        <input className="rn-input flex-1 py-0.5 text-xs" placeholder="FEC, e.g. 10.0.2.6/32" value={fec} onChange={(e) => setFec(e.target.value)} />
        <button type="button" className="rn-btn py-0.5 text-xs" onClick={() => run('ping')}>
          <Radar className="h-3.5 w-3.5" /> LSP ping
        </button>
        <button type="button" className="rn-btn py-0.5 text-xs" onClick={() => run('trace')}>
          LSP trace
        </button>
      </div>
      {out && <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-emerald-200">{out}</pre>}
    </section>
  );
}
