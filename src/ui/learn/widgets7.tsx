import { useState } from 'react';
import { cspf, expBits, type TeEdge } from '../../lessons/widgetMath7';

/** P7 widgets: DSCP → EXP at imposition, CSPF on the B10 ring. */

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-violet-900 bg-slate-900/80 p-3 text-sm">{children}</div>
);

const APPS: Array<[string, number]> = [
  ['Signalling CS5', 40],
  ['Voice EF', 46],
  ['UTS AF31', 26],
  ['CCTV AF41', 34],
  ['Railnet default', 0],
];

export function DscpExpWidget() {
  const [dscp, setDscp] = useState(46);
  const r = expBits(dscp);
  return (
    <Box>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col text-slate-400">
          DSCP
          <input type="number" min={0} max={63} className="rn-input w-20 font-mono" value={dscp} onChange={(e) => setDscp(Number(e.target.value))} />
        </label>
        {APPS.map(([n, v]) => (
          <button
            key={n}
            type="button"
            className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
            onClick={() => setDscp(v)}
          >
            {n}
          </button>
        ))}
      </div>
      {typeof r === 'string' ? (
        <p className="mt-2 text-amber-300">{r}</p>
      ) : (
        <p className="mt-2 font-mono text-xs">
          DSCP <span className="text-amber-300">{r.dscp.slice(0, 3)}</span>
          <span className="text-slate-500">{r.dscp.slice(3)}</span> → EXP <span className="text-emerald-300">{r.exp}</span> = {parseInt(r.exp, 2)}
          <span className="ml-2 font-sans text-slate-500">
            (top 3 bits copied at imposition; the PE can override with "set mpls experimental imposition")
          </span>
        </p>
      )}
    </Box>
  );
}

export function CspfWidget() {
  const [bw, setBw] = useState(1100);
  const [pprJu, setPprJu] = useState(1000);
  const edges: TeEdge[] = [
    { a: 'MTD', b: 'PPR', cost: 10, freeMbps: 7500 },
    { a: 'PPR', b: 'JU', cost: 10, freeMbps: pprJu },
    { a: 'MTD', b: 'DNA', cost: 10, freeMbps: 7500 },
    { a: 'DNA', b: 'JU', cost: 50, freeMbps: 7500 },
  ];
  const r = cspf(edges, 'MTD', 'JU', bw);
  return (
    <Box>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="flex flex-col text-slate-400">
          Tunnel bandwidth (Mbit/s)
          <input type="number" min={0} className="rn-input w-28 font-mono" value={bw} onChange={(e) => setBw(Number(e.target.value))} />
        </label>
        <label className="flex flex-col text-slate-400">
          Free on PPR–JU (Mbit/s)
          <input type="number" min={0} className="rn-input w-28 font-mono" value={pprJu} onChange={(e) => setPprJu(Number(e.target.value))} />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Ring of lab LB10: MTD–PPR and PPR–JU cost 10, MTD–DNA cost 10, leased DNA–JU cost 50; other links have 7500 Mbit/s free.
      </p>
      {r ? (
        <p className="mt-1 text-xs">
          Path <span className="font-mono text-emerald-300">{r.path.join(' → ')}</span> (TE metric {r.cost})
          {r.pruned.length > 0 && <span className="text-amber-300"> · pruned: {r.pruned.join(', ')}</span>}
        </p>
      ) : (
        <p className="mt-1 text-xs text-red-300">No path has {bw} Mbit/s free — the tunnel stays down.</p>
      )}
    </Box>
  );
}
