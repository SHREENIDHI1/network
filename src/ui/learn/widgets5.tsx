import { useState } from 'react';
import { ibgpSessions, rtImports, type VrfRts } from '../../lessons/widgetMath5';

/** P5 widgets: iBGP full mesh vs route reflector calculator, RT import matcher. */

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-violet-900 bg-slate-900/80 p-3 text-sm">{children}</div>
);

export function IbgpMeshWidget() {
  const [n, setN] = useState(150);
  const [rrs, setRrs] = useState(2);
  const r = ibgpSessions(n, rrs);
  return (
    <Box>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-slate-400">
          BGP routers (POPs)
          <input type="number" min={2} className="rn-input w-28 font-mono" value={n} onChange={(e) => setN(Number(e.target.value))} />
        </label>
        <label className="flex flex-col text-xs text-slate-400">
          Route reflectors
          <input type="number" min={1} className="rn-input w-24 font-mono" value={rrs} onChange={(e) => setRrs(Number(e.target.value))} />
        </label>
      </div>
      {typeof r === 'string' ? (
        <p className="mt-2 text-amber-300">{r}</p>
      ) : (
        <div className="mt-2 text-xs">
          <p>
            Full mesh: <span className="font-mono text-amber-300">{r.fullMesh.toLocaleString('en-IN')}</span> iBGP sessions (n × (n − 1) / 2); every
            new POP touches all {n - 1} others.
          </p>
          <p>
            With {rrs} RR{rrs > 1 ? 's' : ''}: <span className="font-mono text-emerald-300">{r.withRr.toLocaleString('en-IN')}</span> sessions; a new
            POP needs only {r.perClient} session{r.perClient > 1 ? 's' : ''} (to the RRs).
          </p>
          <p className="mt-1 text-slate-500">Lab LB5.1 uses JU as the single RR; the division design pairs JU and MTD.</p>
        </div>
      )}
    </Box>
  );
}

const START: VrfRts[] = [
  { pe: 'JU', vrf: 'NMS-MGMT', exports: ['65000:107'], imports: ['65000:107'] },
  { pe: 'MTD', vrf: 'SCADA', exports: ['65000:103'], imports: ['65000:103'] },
  { pe: 'DNA', vrf: 'SCADA', exports: ['65000:103'], imports: ['65000:103'] },
  { pe: 'DNA', vrf: 'UTS', exports: ['65000:100'], imports: ['65000:100'] },
];

export function RtMatcherWidget() {
  const [rows, setRows] = useState(START);
  const split = (s: string) => s.split(/[\s,]+/).filter(Boolean);
  const set = (i: number, k: 'exports' | 'imports', v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: split(v) } : r)));
  const r = rtImports(rows);
  return (
    <Box>
      <table className="w-full text-xs">
        <thead className="text-left text-slate-400">
          <tr>
            <th>PE : VRF</th>
            <th>Export RTs</th>
            <th>Import RTs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v, i) => (
            <tr key={`${v.pe}:${v.vrf}`}>
              <td className="font-mono text-slate-200">
                {v.pe}:{v.vrf}
              </td>
              <td>
                <input className="rn-input w-full font-mono" defaultValue={v.exports.join(' ')} onChange={(e) => set(i, 'exports', e.target.value)} />
              </td>
              <td>
                <input className="rn-input w-full font-mono" defaultValue={v.imports.join(' ')} onChange={(e) => set(i, 'imports', e.target.value)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {typeof r === 'string' ? (
        <p className="mt-2 text-amber-300">{r}</p>
      ) : (
        <ul className="mt-2 font-mono text-xs">
          {r.length === 0 && <li className="text-slate-500">No VRF imports anything from another PE.</li>}
          {r.map((x) => (
            <li key={`${x.from}>${x.into}`}>
              <span className="text-sky-300">{x.from}</span> → <span className="text-emerald-300">{x.into}</span>{' '}
              <span className="text-slate-500">(RT {x.via.join(', ')})</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-slate-500">
        Try: add 65000:103 to JU NMS-MGMT imports and 65000:107 to MTD SCADA imports — the shared-service pattern of lab LB6.2.
      </p>
    </Box>
  );
}
