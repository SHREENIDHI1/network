import { useState } from 'react';
import { encodeLabel, lspWalk, reservedLabel } from '../../lessons/widgetMath4';

/** P4 widgets: MPLS label header encoder, LSP packet walk. */

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-violet-900 bg-slate-900/80 p-3 text-sm">{children}</div>
);

export function LabelHeaderWidget() {
  const [label, setLabel] = useState(18);
  const [tc, setTc] = useState(5);
  const [s, setS] = useState<0 | 1>(1);
  const [ttl, setTtl] = useState(63);
  const r = encodeLabel({ label, tc, s, ttl });
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
  const field = (name: string, value: number, set: (n: number) => void, max: number, width = 'w-24') => (
    <label className="flex flex-col text-xs text-slate-400">
      {name}
      <input
        type="number"
        min={0}
        max={max}
        className={`rn-input ${width} font-mono`}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => set(num(e.target.value))}
      />
    </label>
  );
  return (
    <Box>
      <div className="flex flex-wrap items-end gap-3">
        {field('Label (20 bit)', label, setLabel, 1048575, 'w-28')}
        {field('TC / EXP (3 bit)', tc, setTc, 7)}
        <label className="flex flex-col text-xs text-slate-400">
          S (bottom of stack)
          <select className="rn-input w-24" value={s} onChange={(e) => setS(Number(e.target.value) as 0 | 1)}>
            <option value={1}>1 (last)</option>
            <option value={0}>0 (more below)</option>
          </select>
        </label>
        {field('TTL (8 bit)', ttl, setTtl, 255)}
      </div>
      {typeof r === 'string' ? (
        <p className="mt-2 text-amber-300">{r}</p>
      ) : (
        <div className="mt-2 font-mono text-xs">
          <p>
            <span className="text-violet-300">{r.bits.split(' ')[0]}</span> <span className="text-amber-300">{r.bits.split(' ')[1]}</span>{' '}
            <span className="text-sky-300">{r.bits.split(' ')[2]}</span> <span className="text-emerald-300">{r.bits.split(' ')[3]}</span>
          </p>
          <p className="text-slate-400">= {r.hex} (32 bits = 4 bytes between the Ethernet header and the IP header, EtherType 0x8847)</p>
          {reservedLabel(label) && (
            <p className="mt-1 text-amber-300">
              Label {label}: {reservedLabel(label)}.
            </p>
          )}
        </div>
      )}
    </Box>
  );
}

export function LspWalkWidget() {
  const [explicitNull, setExplicitNull] = useState(false);
  const [propagateTtl, setPropagateTtl] = useState(true);
  const path = ['JU-LSR', 'RKB-LSR', 'PPR-LSR', 'MTD-LSR', 'DNA-LSR'];
  const hops = lspWalk(path, { explicitNull, propagateTtl });
  return (
    <Box>
      <p className="text-xs text-slate-400">
        Packet from JU to DNA&apos;s loopback (FEC 10.0.2.6/32). Labels are illustrative; each router picks its own.
      </p>
      <div className="mt-1 flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={explicitNull} onChange={(e) => setExplicitNull(e.target.checked)} /> DNA advertises explicit-null (no PHP)
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={propagateTtl} onChange={(e) => setPropagateTtl(e.target.checked)} /> mpls ip propagate-ttl (default)
        </label>
      </div>
      <table className="mt-2 w-full text-xs">
        <thead className="text-left text-slate-400">
          <tr>
            <th>Router</th>
            <th>Action</th>
            <th>Out label</th>
            <th>Label TTL</th>
            <th>IP TTL</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {hops.map((h) => (
            <tr key={h.router} className="border-t border-slate-800">
              <td className="text-slate-200">{h.router}</td>
              <td className="text-violet-200">{h.action}</td>
              <td>{h.labelOut}</td>
              <td>{h.labelTtl}</td>
              <td>{h.ipTtl}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-slate-500">Try the same in the simulator: lab LB3.1, "traceroute 10.0.2.6" and "show mpls forwarding-table".</p>
    </Box>
  );
}
