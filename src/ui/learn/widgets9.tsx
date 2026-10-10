import { useState } from 'react';
import { drawTickets, GRAND_TICKET_TITLES, RING_SID, ringEdges, srLabel, tiLfa } from '../../lessons/widgetMath9';

/** P9 widgets: SID → label calculator, TI-LFA on the teaching ring, seeded ticket draw. */

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-violet-900 bg-slate-900/80 p-3 text-sm">{children}</div>
);

function Num({ label, value, set }: { label: string; value: number; set: (n: number) => void }) {
  return (
    <label className="flex flex-col text-xs text-slate-400">
      {label}
      <input type="number" className="rn-input w-28" value={value} onChange={(e) => set(Number(e.target.value))} />
    </label>
  );
}

export function SrLabelWidget() {
  const [base, setBase] = useState(16000);
  const [end, setEnd] = useState(23999);
  const [index, setIndex] = useState(4);
  const r = srLabel(base, end, index);
  return (
    <Box>
      <div className="flex flex-wrap gap-3">
        <Num label="SRGB base" value={base} set={setBase} />
        <Num label="SRGB end" value={end} set={setEnd} />
        <Num label="Prefix SID index" value={index} set={setIndex} />
      </div>
      <p className={`mt-2 font-mono text-sm ${'label' in r ? 'text-emerald-300' : 'text-amber-300'}`}>
        {'label' in r ? `label ${r.label} — the same on every router with this SRGB` : r.error}
      </p>
      <p className="mt-1 text-xs text-slate-500">LDP gives every hop its own local label; an SR prefix SID is one global number per prefix.</p>
    </Box>
  );
}

export function TiLfaWidget() {
  const [lease, setLease] = useState(50);
  const v = tiLfa(ringEdges(lease), 'MTD', 'JU', (n) => RING_SID[n]);
  return (
    <Box>
      <label className="text-xs text-slate-400">
        OSPF cost of the leased JU–DNA lambda: <span className="font-mono text-slate-200">{lease}</span>
        <input type="range" min={1} max={100} value={lease} onChange={(e) => setLease(Number(e.target.value))} className="ml-2 align-middle" />
      </label>
      <p className="mt-1 text-xs text-slate-400">Ring JU–PPR–MTD–DNA, other spans cost 10. MTD protects its path to the JU loopback.</p>
      {v && (
        <ul className="mt-2 space-y-0.5 text-xs">
          <li>
            Primary: <span className="font-mono text-slate-200">{v.primary.join(' → ')}</span> · protected link {v.protectedLink}
          </li>
          <li>
            Post-convergence: <span className="font-mono text-slate-200">{v.post?.join(' → ') ?? 'none'}</span>
          </li>
          <li>P-space of MTD: {v.pSpace.join(', ') || '—'}</li>
          <li>Q-space of JU: {v.qSpace.join(', ') || '—'}</li>
          <li className="text-emerald-300">
            Repair: {v.segments.length ? v.segments.join(' + ') : 'plain LFA — the first post-convergence hop is already safe'}
          </li>
        </ul>
      )}
    </Box>
  );
}

export function TicketSeedWidget() {
  const [seed, setSeed] = useState(1234);
  const d = drawTickets(seed);
  return (
    <Box>
      <Num label="Seed" value={seed} set={setSeed} />
      <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-slate-300">
        {d.map((x) => (
          <li key={x.n}>
            <span className="text-slate-500">#{x.n}</span> {x.t}
          </li>
        ))}
      </ol>
      <p className="mt-1 text-xs text-slate-500">
        10 of {GRAND_TICKET_TITLES.length} catalog faults. Same seed = same tickets in the same order (the lab shows its seed).
      </p>
    </Box>
  );
}
