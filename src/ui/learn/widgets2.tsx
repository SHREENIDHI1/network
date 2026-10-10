import { useState } from 'react';
import { dot1qTag, electRoot, forwardFrame, parsePrefix, subnetInfo, vlsmPlan, type BridgeInput } from '../../lessons/widgetMath';

/** P2 widgets: MAC learning, subnet calculator, VLSM planner, 802.1Q tag, root election. */

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-sky-900 bg-slate-900/80 p-3 text-sm">{children}</div>
);

const HOSTS = [
  { name: 'PC1', mac: '00:00:00:00:00:01' },
  { name: 'PC2', mac: '00:00:00:00:00:02' },
  { name: 'PC3', mac: '00:00:00:00:00:03' },
  { name: 'PC4', mac: '00:00:00:00:00:04' },
];

export function MacLearning() {
  const [device, setDevice] = useState<'hub' | 'switch'>('switch');
  const [table, setTable] = useState<Record<string, number>>({});
  const [src, setSrc] = useState(0);
  const [dst, setDst] = useState(2);
  const [last, setLast] = useState<{ out: number[]; action: string; src: number } | null>(null);
  const send = () => {
    const dstMac = dst === -1 ? 'FF:FF:FF:FF:FF:FF' : HOSTS[dst].mac;
    const r = forwardFrame(device, 4, table, src + 1, HOSTS[src].mac, dstMac);
    setTable(r.table);
    setLast({ out: r.outPorts, action: r.action, src });
  };
  const reset = (d = device) => {
    setDevice(d);
    setTable({});
    setLast(null);
  };
  const explain: Record<string, string> = {
    repeat: 'Hub ne bits har doosre port par repeat kiye — sabko frame mila.',
    'learn+flood': 'Switch ne source MAC seekha; destination pata nahi (ya broadcast) → VLAN mein flood.',
    'learn+forward': 'Switch ko destination ka port pata tha → sirf usi port par bheja.',
    filter: 'Destination usi port par hai jahan se aaya → switch ne frame filter kar diya.',
  };
  return (
    <Box>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {(['hub', 'switch'] as const).map((d) => (
          <button key={d} type="button" className={d === device ? 'rn-btn-primary' : 'rn-btn'} onClick={() => reset(d)}>
            {d === 'hub' ? 'Hub' : 'Switch'}
          </button>
        ))}
        <span className="ml-2 text-slate-400">From</span>
        <select className="rn-input w-20" value={src} onChange={(e) => setSrc(+e.target.value)}>
          {HOSTS.map((h, i) => (
            <option key={h.name} value={i}>
              {h.name}
            </option>
          ))}
        </select>
        <span className="text-slate-400">to</span>
        <select className="rn-input w-32" value={dst} onChange={(e) => setDst(+e.target.value)}>
          {HOSTS.map((h, i) => (
            <option key={h.name} value={i}>
              {h.name}
            </option>
          ))}
          <option value={-1}>Broadcast</option>
        </select>
        <button type="button" className="rn-btn-primary" onClick={send}>
          Send frame
        </button>
        <button type="button" className="rn-btn" onClick={() => reset()}>
          Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {HOSTS.map((h, i) => {
          const got = last?.out.includes(i + 1);
          const isSrc = last?.src === i;
          return (
            <div
              key={h.name}
              className={`w-24 rounded border px-2 py-1 text-center ${isSrc ? 'border-sky-500' : got ? 'border-amber-400 bg-amber-950/40' : 'border-slate-700'}`}
            >
              <div className="font-semibold">{h.name}</div>
              <div className="text-[10px] text-slate-400">port {i + 1}</div>
              <div className="text-[10px]">{isSrc ? 'sender' : got ? 'received' : '—'}</div>
            </div>
          );
        })}
      </div>
      {last && <p className="mt-2 text-slate-300">{explain[last.action]}</p>}
      {device === 'switch' && (
        <table className="mt-2 w-full font-mono text-xs">
          <thead className="text-left text-slate-400">
            <tr>
              <th>MAC address</th>
              <th>Port</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(table).map(([m, p]) => (
              <tr key={m}>
                <td>{m}</td>
                <td>{p}</td>
              </tr>
            ))}
            {!Object.keys(table).length && (
              <tr>
                <td colSpan={2} className="text-slate-500">
                  MAC table empty — send a frame
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Box>
  );
}

export function SubnetCalc() {
  const [text, setText] = useState('10.52.20.70/27');
  const p = parsePrefix(text);
  const r = p ? subnetInfo(p.ip, p.len) : null;
  return (
    <Box>
      <label className="flex items-center gap-2">
        <span className="text-slate-400">IP / prefix</span>
        <input
          className={`rn-input font-mono ${r ? '' : 'border-red-600'}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="10.52.20.70/27 or 10.52.20.70 255.255.255.224"
        />
      </label>
      {r ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-xs text-slate-200 sm:grid-cols-4">
          <dt className="text-slate-400">Network</dt>
          <dd>
            {r.network}/{r.prefixLen}
          </dd>
          <dt className="text-slate-400">Broadcast</dt>
          <dd>{r.broadcast}</dd>
          <dt className="text-slate-400">Mask</dt>
          <dd>{r.mask}</dd>
          <dt className="text-slate-400">Wildcard</dt>
          <dd>{r.wildcard}</dd>
          <dt className="text-slate-400">First host</dt>
          <dd>{r.firstHost}</dd>
          <dt className="text-slate-400">Last host</dt>
          <dd>{r.lastHost}</dd>
          <dt className="text-slate-400">Usable hosts</dt>
          <dd>{r.usableHosts}</dd>
          <dt className="text-slate-400">Class (history)</dt>
          <dd>
            {r.klass} · {r.isPrivate ? 'private' : 'public'}
          </dd>
        </dl>
      ) : (
        <p className="mt-2 text-xs text-red-300">Format: 10.52.20.70/27 or 10.52.20.70 255.255.255.224</p>
      )}
    </Box>
  );
}

export function VlsmPlanner() {
  const [block, setBlock] = useState('10.52.20.0/24');
  const [needs, setNeeds] = useState([
    { name: 'CCTV', hosts: 50 },
    { name: 'UTS/PRS', hosts: 20 },
    { name: 'MGMT', hosts: 5 },
  ]);
  const plan = vlsmPlan(block, needs);
  return (
    <Box>
      <label className="flex items-center gap-2">
        <span className="text-slate-400">Station block</span>
        <input className="rn-input w-48 font-mono" value={block} onChange={(e) => setBlock(e.target.value)} />
      </label>
      <div className="mt-2 grid gap-1">
        {needs.map((n, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="rn-input w-32"
              value={n.name}
              onChange={(e) => setNeeds(needs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
            />
            <input
              type="number"
              min={1}
              className="rn-input w-24"
              value={n.hosts}
              onChange={(e) => setNeeds(needs.map((x, k) => (k === i ? { ...x, hosts: Math.max(1, Math.floor(+e.target.value) || 1) } : x)))}
            />
            <span className="text-xs text-slate-500">hosts</span>
            <button type="button" className="text-xs text-red-300 hover:underline" onClick={() => setNeeds(needs.filter((_, k) => k !== i))}>
              remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="rn-btn w-fit py-0.5 text-xs"
          onClick={() => setNeeds([...needs, { name: `LAN${needs.length + 1}`, hosts: 10 }])}
        >
          + Add LAN
        </button>
      </div>
      {plan ? (
        <table className="mt-2 w-full font-mono text-xs">
          <thead className="text-left text-slate-400">
            <tr>
              <th>LAN</th>
              <th>Hosts</th>
              <th>Subnet</th>
              <th>Usable range</th>
              <th>Broadcast</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>{r.hosts}</td>
                <td>
                  {r.network}/{r.prefixLen}
                </td>
                <td>{r.range}</td>
                <td>{r.broadcast}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-2 text-xs text-red-300">Does not fit in this block (or the block is invalid).</p>
      )}
    </Box>
  );
}

export function VlanTag() {
  const [vlan, setVlan] = useState(10);
  const [pcp, setPcp] = useState(0);
  const tag = dot1qTag(vlan, pcp);
  return (
    <Box>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">VLAN ID</span>
          <input type="number" min={1} max={4094} className="rn-input w-24" value={vlan} onChange={(e) => setVlan(Math.floor(+e.target.value))} />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Priority (PCP)</span>
          <select className="rn-input w-20" value={pcp} onChange={(e) => setPcp(+e.target.value)}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap font-mono text-xs">
        {['Dst MAC (6)', 'Src MAC (6)'].map((x) => (
          <div key={x} className="border-r border-slate-950 bg-slate-700 px-2 py-2">
            {x}
          </div>
        ))}
        <div className="border-r border-slate-950 bg-amber-700 px-2 py-2 text-white">802.1Q tag: {tag ? tag.hex : 'invalid'}</div>
        {['Type (2)', 'Payload', 'FCS (4)'].map((x) => (
          <div key={x} className="border-r border-slate-950 bg-slate-700 px-2 py-2">
            {x}
          </div>
        ))}
      </div>
      {tag ? (
        <p className="mt-2 font-mono text-xs text-slate-300">TPID 0x8100 · TCI bits (PCP DEI VID) = {tag.tciBits}</p>
      ) : (
        <p className="mt-2 text-xs text-red-300">VLAN must be 1–4094 (0 and 4095 are reserved).</p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        Access port par tag nahi lagta; trunk par native VLAN chhod kar har frame par yeh 4-byte tag lagta hai.
      </p>
    </Box>
  );
}

export function RootElection() {
  const [bridges, setBridges] = useState<BridgeInput[]>([
    { name: 'MTD-SW-CORE', priority: 32768, mac: '0011.2233.4455' },
    { name: 'MTD-SW-COUNTER', priority: 32768, mac: '0011.2233.0001' },
    { name: 'MTD-SW-PLAT', priority: 32768, mac: '00aa.bbcc.0002' },
  ]);
  const root = electRoot(bridges);
  return (
    <Box>
      <table className="w-full text-xs">
        <thead className="text-left text-slate-400">
          <tr>
            <th>Switch</th>
            <th>Priority</th>
            <th>MAC</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {bridges.map((b, i) => (
            <tr key={b.name}>
              <td className="py-0.5">{b.name}</td>
              <td>
                <select
                  className="rn-input w-28"
                  value={b.priority}
                  onChange={(e) => setBridges(bridges.map((x, k) => (k === i ? { ...x, priority: +e.target.value } : x)))}
                >
                  {Array.from({ length: 16 }, (_, k) => k * 4096).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  className="rn-input w-36 font-mono"
                  value={b.mac}
                  onChange={(e) => setBridges(bridges.map((x, k) => (k === i ? { ...x, mac: e.target.value } : x)))}
                />
              </td>
              <td className="pl-2 font-semibold text-emerald-300">{root === b.name ? 'ROOT' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-400">
        {root
          ? `Root bridge: ${root}. Priority pehle compare hota hai; barabar ho to sabse chhota MAC jeetta hai.`
          : 'Invalid: priority must be a multiple of 4096 (0–61440) and MAC 12 hex digits.'}
      </p>
    </Box>
  );
}
