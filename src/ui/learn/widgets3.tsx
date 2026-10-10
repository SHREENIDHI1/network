import { useState } from 'react';
import { dscpName } from '../../engine/qos/apps';
import {
  aclEvaluate,
  hsrpElect,
  lpmPick,
  pathTo,
  queueSim,
  spf,
  type Edge,
  type HsrpRouter,
  type QueueClassCfg,
  type RouteRow,
  type TestPacket,
} from '../../lessons/widgetMath3';

/** P3 widgets: routing table lookup, SPF, ACL evaluator, HSRP election, queue simulator. */

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-sky-900 bg-slate-900/80 p-3 text-sm">{children}</div>
);

export function LpmWidget() {
  const [routes, setRoutes] = useState<RouteRow[]>([
    { prefix: '0.0.0.0/0', via: 'JU firewall (S*)', ad: 1, metric: 0 },
    { prefix: '10.52.0.0/16', via: 'MTD (O)', ad: 110, metric: 20 },
    { prefix: '10.52.10.0/24', via: 'GOTN (O)', ad: 110, metric: 30 },
    { prefix: '10.52.10.0/24', via: 'GOTN static (S)', ad: 1, metric: 0 },
  ]);
  const [dst, setDst] = useState('10.52.10.25');
  const r = lpmPick(routes, dst);
  return (
    <Box>
      <label className="flex items-center gap-2">
        <span className="text-slate-400">Destination</span>
        <input className="rn-input w-40 font-mono" value={dst} onChange={(e) => setDst(e.target.value)} />
      </label>
      <table className="mt-2 w-full font-mono text-xs">
        <thead className="text-left text-slate-400">
          <tr>
            <th>Prefix</th>
            <th>Via</th>
            <th>AD</th>
            <th>Metric</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((x, i) => (
            <tr key={i} className={r?.index === i ? 'bg-emerald-900/50 text-emerald-100' : ''}>
              <td>
                <input
                  className="rn-input w-36 py-0 font-mono text-xs"
                  value={x.prefix}
                  onChange={(e) => setRoutes(routes.map((y, k) => (k === i ? { ...y, prefix: e.target.value } : y)))}
                />
              </td>
              <td>{x.via}</td>
              <td>
                <input
                  type="number"
                  className="rn-input w-16 py-0 text-xs"
                  value={x.ad}
                  onChange={(e) => setRoutes(routes.map((y, k) => (k === i ? { ...y, ad: +e.target.value } : y)))}
                />
              </td>
              <td>{x.metric}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-slate-300">
        {r ? `Chosen: ${routes[r.index].prefix} via ${routes[r.index].via} — ${r.reason}.` : 'No route matches → packet dropped (ICMP unreachable).'}
      </p>
    </Box>
  );
}

const RING_NODES = ['JU', 'BNO', 'JWL', 'AAS'];
const POS: Record<string, [number, number]> = { JU: [60, 40], BNO: [300, 40], JWL: [300, 160], AAS: [60, 160] };

export function SpfWidget() {
  const [edges, setEdges] = useState<Edge[]>([
    { a: 'JU', b: 'BNO', cost: 10 },
    { a: 'BNO', b: 'JWL', cost: 10 },
    { a: 'JWL', b: 'AAS', cost: 10 },
    { a: 'AAS', b: 'JU', cost: 10 },
  ]);
  const [target, setTarget] = useState('JWL');
  const r = spf(RING_NODES, edges, 'JU');
  const path = pathTo(r.prev, 'JU', target);
  const onPath = (e: Edge) => path.some((n, i) => i > 0 && ((path[i - 1] === e.a && n === e.b) || (path[i - 1] === e.b && n === e.a)));
  return (
    <Box>
      <div className="flex flex-wrap gap-4">
        <svg viewBox="0 0 360 200" className="w-80" role="img" aria-label="OSPF ring">
          {edges.map((e) => (
            <g key={`${e.a}${e.b}`}>
              <line
                x1={POS[e.a][0]}
                y1={POS[e.a][1]}
                x2={POS[e.b][0]}
                y2={POS[e.b][1]}
                stroke={e.cost <= 0 ? '#475569' : onPath(e) ? '#34d399' : '#38bdf8'}
                strokeWidth={onPath(e) ? 4 : 2}
                strokeDasharray={e.cost <= 0 ? '6 6' : undefined}
              />
              <text x={(POS[e.a][0] + POS[e.b][0]) / 2 + 6} y={(POS[e.a][1] + POS[e.b][1]) / 2 - 4} fill="#fbbf24" fontSize={12}>
                {e.cost <= 0 ? 'cut' : e.cost}
              </text>
            </g>
          ))}
          {RING_NODES.map((n) => (
            <g key={n}>
              <circle cx={POS[n][0]} cy={POS[n][1]} r={20} fill="#1e293b" stroke={n === 'JU' ? '#34d399' : '#38bdf8'} />
              <text x={POS[n][0]} y={POS[n][1] + 4} fill="#e2e8f0" fontSize={11} textAnchor="middle">
                {n}
              </text>
            </g>
          ))}
        </svg>
        <div className="space-y-1 text-xs">
          {edges.map((e, i) => (
            <label key={i} className="flex items-center gap-2">
              <span className="w-20">
                {e.a}–{e.b}
              </span>
              <input
                type="number"
                min={0}
                className="rn-input w-20 py-0 text-xs"
                value={e.cost}
                onChange={(ev) => setEdges(edges.map((x, k) => (k === i ? { ...x, cost: Math.max(0, +ev.target.value) } : x)))}
              />
              <span className="text-slate-500">(0 = fibre cut)</span>
            </label>
          ))}
          <label className="flex items-center gap-2 pt-1">
            <span className="w-20">Path to</span>
            <select className="rn-input w-24 py-0 text-xs" value={target} onChange={(e) => setTarget(e.target.value)}>
              {RING_NODES.filter((n) => n !== 'JU').map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <p className="pt-1 text-slate-300">
            {path.length ? `${path.join(' → ')} (cost ${r.dist[target]})` : `${target} unreachable`}
            <br />
            <span className="text-slate-500">Settled order: {r.order.join(', ')}</span>
          </p>
        </div>
      </div>
    </Box>
  );
}

export function AclEvalWidget() {
  const [kind, setKind] = useState<'standard' | 'extended'>('extended');
  const [text, setText] = useState('deny ip 10.52.10.0 0.0.0.255 10.52.50.0 0.0.0.255\npermit ip any any');
  const [p, setP] = useState<TestPacket>({ protocol: 'icmp', src: '10.52.10.11', dst: '10.52.50.20' });
  const lines = text.split('\n');
  const r = aclEvaluate(kind, lines, p);
  return (
    <Box>
      <div className="mb-2 flex gap-2">
        {(['standard', 'extended'] as const).map((k) => (
          <button key={k} type="button" className={k === kind ? 'rn-btn-primary' : 'rn-btn'} onClick={() => setKind(k)}>
            {k}
          </button>
        ))}
      </div>
      <textarea className="rn-input min-h-[80px] font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} aria-label="ACL lines" />
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select className="rn-input" value={p.protocol} onChange={(e) => setP({ ...p, protocol: e.target.value as TestPacket['protocol'] })}>
          <option value="icmp">icmp (ping)</option>
          <option value="tcp">tcp</option>
          <option value="udp">udp</option>
        </select>
        <input className="rn-input font-mono" value={p.src} onChange={(e) => setP({ ...p, src: e.target.value })} aria-label="Source" />
        <input className="rn-input font-mono" value={p.dst} onChange={(e) => setP({ ...p, dst: e.target.value })} aria-label="Destination" />
        <input
          className="rn-input font-mono"
          type="number"
          placeholder="dst port"
          value={p.dstPort ?? ''}
          disabled={p.protocol === 'icmp'}
          onChange={(e) => setP({ ...p, dstPort: e.target.value ? +e.target.value : undefined })}
          aria-label="Destination port"
        />
      </div>
      {r.error ? (
        <p className="mt-2 text-red-300">{r.error}</p>
      ) : (
        <p className={`mt-2 font-semibold ${r.verdict === 'permit' ? 'text-emerald-300' : 'text-red-300'}`}>
          {r.verdict.toUpperCase()} —{' '}
          {r.implicit ? 'no line matched: implicit "deny any" at the end' : `line ${r.line} matched first (later lines are not checked)`}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        Standard ACL sirf source dekhta hai; extended source, destination, protocol aur port. Wildcard 0.0.0.255 = last octet "kuch bhi".
      </p>
    </Box>
  );
}

export function HsrpWidget() {
  const [routers, setRouters] = useState<HsrpRouter[]>([
    { name: 'MTD-R1', priority: 110, up: true, ip: '10.52.10.2', decrement: 20 },
    { name: 'MTD-R2', priority: 100, up: true, ip: '10.52.10.3', decrement: 20 },
  ]);
  const [preempt, setPreempt] = useState(true);
  const [current, setCurrent] = useState<string | undefined>('MTD-R1');
  const r = hsrpElect(routers, preempt, current);
  const upd = (i: number, patch: Partial<HsrpRouter>) => {
    const next = routers.map((x, k) => (k === i ? { ...x, ...patch } : x));
    setRouters(next);
    setCurrent(hsrpElect(next, preempt, current).active);
  };
  return (
    <Box>
      <label className="mb-2 flex items-center gap-2">
        <input type="checkbox" checked={preempt} onChange={(e) => setPreempt(e.target.checked)} /> preempt (better router takes over when it returns)
      </label>
      <table className="w-full text-xs">
        <thead className="text-left text-slate-400">
          <tr>
            <th>Router</th>
            <th>Priority</th>
            <th>Up</th>
            <th>Uplink down (track −20)</th>
            <th>Effective</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {routers.map((x, i) => (
            <tr key={x.name}>
              <td>{x.name}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={255}
                  className="rn-input w-16 py-0 text-xs"
                  value={x.priority}
                  onChange={(e) => upd(i, { priority: +e.target.value })}
                />
              </td>
              <td>
                <input type="checkbox" checked={x.up} onChange={(e) => upd(i, { up: e.target.checked })} />
              </td>
              <td>
                <input type="checkbox" checked={!!x.trackDown} onChange={(e) => upd(i, { trackDown: e.target.checked })} />
              </td>
              <td className="font-mono">{r.effective[x.name]}</td>
              <td className={r.active === x.name ? 'font-semibold text-emerald-300' : 'text-slate-400'}>
                {r.active === x.name ? 'Active' : r.standby === x.name ? 'Standby' : x.up ? 'Listen' : 'Init (down)'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-400">
        Hosts always use the virtual gateway 10.52.10.1 — jo bhi Active ho, wahi us IP aur virtual MAC ka jawab deta hai.
      </p>
    </Box>
  );
}

const QFLOWS = [
  { name: 'Control voice (VoIP)', rateMbps: 2, dscp: 46 },
  { name: 'UTS / PRS', rateMbps: 3, dscp: 26 },
  { name: 'CCTV', rateMbps: 20, dscp: 34 },
  { name: 'Railnet', rateMbps: 10, dscp: 0 },
];

export function QueueSimWidget() {
  const [cap, setCap] = useState(20);
  const [mode, setMode] = useState<'fifo' | 'qos'>('fifo');
  const classes: QueueClassCfg[] = [
    { name: 'VOICE', dscp: [46], priorityPercent: 20 },
    { name: 'TICKETING', dscp: [26], bandwidthPercent: 20 },
    { name: 'VIDEO', dscp: [34], bandwidthPercent: 40 },
  ];
  const r = queueSim(cap, QFLOWS, mode === 'qos' ? classes : null);
  return (
    <Box>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Link (Mbit/s)</span>
          <input type="range" min={5} max={50} value={cap} onChange={(e) => setCap(+e.target.value)} />
          <span className="w-8 font-mono">{cap}</span>
        </label>
        {(['fifo', 'qos'] as const).map((m) => (
          <button key={m} type="button" className={m === mode ? 'rn-btn-primary' : 'rn-btn'} onClick={() => setMode(m)}>
            {m === 'fifo' ? 'No QoS (FIFO)' : 'LLQ + CBWFQ'}
          </button>
        ))}
      </div>
      <table className="w-full text-xs">
        <thead className="text-left text-slate-400">
          <tr>
            <th>Traffic</th>
            <th>DSCP</th>
            <th className="text-right">Offered</th>
            <th className="text-right">Delivered</th>
            <th className="text-right">Loss</th>
          </tr>
        </thead>
        <tbody>
          {QFLOWS.map((f, i) => (
            <tr key={f.name}>
              <td>{f.name}</td>
              <td className="font-mono">{dscpName(f.dscp)}</td>
              <td className="text-right font-mono">{f.rateMbps}</td>
              <td className="text-right font-mono">{r[i].deliveredMbps.toFixed(1)}</td>
              <td className={`text-right font-mono ${r[i].lossPct > 1 ? 'text-red-400' : 'text-emerald-300'}`}>{r[i].lossPct.toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {mode === 'qos' && (
        <p className="mt-1 font-mono text-[11px] text-slate-400">priority VOICE 20% · bandwidth TICKETING 20% · VIDEO 40% · class-default rest</p>
      )}
    </Box>
  );
}
