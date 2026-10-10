import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { validateHostForm } from '../../engine/cli/host';
import { getNetConfig, withNetConfig, type NetConfig } from '../../engine/config/netConfig';
import { formatIpv4, maskToPrefix, parseIpv4, prefixToMask } from '../../engine/ip/ipv4';
import { APP_CLASSES, appClass, dscpName } from '../../engine/qos/apps';
import type { Device } from '../../model/types';
import { useSimStore } from '../../store/simStore';
import { useTopologyStore } from '../../store/topologyStore';

/** Forms for end hosts and the DNS/DHCP server: IP settings, DHCP pools, traffic flows. */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-slate-800 px-3 py-3">
      <h3 className="rn-label mb-2">{title}</h3>
      {children}
    </section>
  );
}

/** Applies a config change to one device through the topology store (saved with the file). */
export function saveNet(device: Device, mutate: (c: NetConfig) => void): void {
  const t = useTopologyStore.getState().topology;
  const cur = t.devices.find((d) => d.id === device.id);
  if (!cur) return;
  const next = structuredClone(getNetConfig(cur));
  mutate(next);
  useTopologyStore.getState().applyTopology({ ...t, devices: t.devices.map((d) => (d.id === device.id ? withNetConfig(d, next) : d)) });
}

/** Runs a DHCP action; in Realtime mode the resulting exchange completes immediately. */
function runDhcp(action: () => void): void {
  action();
  const { mode, sim } = useSimStore.getState();
  if (mode === 'realtime') sim.runUntilIdle();
}

// ---------------------------------------------------------------------------

export function HostIpForm({ device }: { device: Device }) {
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.version);
  const cfg = getNetConfig(device);
  const nic = device.ports[0]?.id ?? 'eth0';
  const ic = cfg.interfaces[nic];
  const dhcp = !!ic?.dhcpClient;
  const [address, setAddress] = useState(ic?.ip?.address ?? '');
  const [mask, setMask] = useState(ic?.ip?.mask ?? '255.255.255.0');
  const [gateway, setGateway] = useState(cfg.defaultGateway ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAddress(ic?.ip?.address ?? '');
    setMask(ic?.ip?.mask ?? '255.255.255.0');
    setGateway(cfg.defaultGateway ?? '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id, ic?.ip?.address, ic?.ip?.mask, cfg.defaultGateway]);

  const setMode = (useDhcp: boolean) =>
    saveNet(device, (c) => {
      c.interfaces[nic] = { ...(c.interfaces[nic] ?? {}), dhcpClient: useDhcp };
      if (useDhcp) {
        delete c.interfaces[nic].ip;
        delete c.defaultGateway;
      }
    });

  const applyStatic = () => {
    const err = validateHostForm(address.trim(), mask.trim(), gateway.trim());
    setError(err);
    if (err) return;
    saveNet(device, (c) => {
      c.interfaces[nic] = { ...(c.interfaces[nic] ?? {}), dhcpClient: false };
      if (address.trim()) c.interfaces[nic].ip = { address: address.trim(), mask: mask.trim() };
      else delete c.interfaces[nic].ip;
      if (gateway.trim()) c.defaultGateway = gateway.trim();
      else delete c.defaultGateway;
    });
  };

  const client = sim.dhcpClient(device.id, nic);
  const lease = client?.lease;

  return (
    <Section title={`IP Configuration (${nic})`}>
      <div className="mb-2 flex gap-3 text-sm" role="radiogroup" aria-label="Address mode">
        {(['Static', 'DHCP'] as const).map((m) => (
          <label key={m} className="flex items-center gap-1.5">
            <input type="radio" checked={(m === 'DHCP') === dhcp} onChange={() => setMode(m === 'DHCP')} /> {m}
          </label>
        ))}
      </div>
      {dhcp ? (
        <div className="space-y-1 text-xs">
          <p>
            <span className="text-slate-400">State:</span>{' '}
            <span className={client?.state === 'bound' ? 'text-emerald-300' : client?.state === 'apipa' ? 'text-amber-300' : 'text-slate-300'}>
              {client?.state ?? 'waiting for link'}
            </span>
          </p>
          {lease && (
            <p className="font-mono text-slate-200">
              {formatIpv4(lease.ip)}/{lease.prefixLen}
              {lease.router !== undefined ? ` gw ${formatIpv4(lease.router)}` : ''}
              {lease.apipa ? ' (APIPA — no DHCP server answered)' : ''}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" className="rn-btn" onClick={() => runDhcp(() => useSimStore.getState().sim.dhcpRenew(device.id))}>
              <RefreshCw className="h-3.5 w-3.5" /> Renew
            </button>
            <button type="button" className="rn-btn" onClick={() => runDhcp(() => useSimStore.getState().sim.dhcpRelease(device.id))}>
              Release
            </button>
          </div>
          {useSimStore.getState().mode === 'simulation' && <p className="text-slate-500">Simulation mode: press Step / Play to run the DHCP exchange.</p>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 block">
              <span className="rn-label">IPv4 address</span>
              <input className="rn-input font-mono" value={address} placeholder="e.g. 10.20.10.11" onChange={(e) => setAddress(e.target.value)} />
            </label>
            <label className="block">
              <span className="rn-label">Subnet mask</span>
              <input className="rn-input font-mono" value={mask} onChange={(e) => setMask(e.target.value)} />
            </label>
            <label className="block">
              <span className="rn-label">Default gateway</span>
              <input className="rn-input font-mono" value={gateway} placeholder="optional" onChange={(e) => setGateway(e.target.value)} />
            </label>
          </div>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          <button type="button" className="rn-btn-primary mt-2" onClick={applyStatic}>
            Apply
          </button>
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

export function DhcpServerForm({ device }: { device: Device }) {
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.version);
  const cfg = getNetConfig(device);
  const [name, setName] = useState('');
  const [network, setNetwork] = useState('');
  const [mask, setMask] = useState('255.255.255.0');
  const [gw, setGw] = useState('');
  const [dns, setDns] = useState('');
  const [exFrom, setExFrom] = useState('');
  const [exTo, setExTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addPool = () => {
    const n = name.trim() || `POOL${Object.keys(cfg.dhcp.pools).length + 1}`;
    const net = parseIpv4(network.trim());
    const len = maskToPrefix(mask.trim());
    if (net === null || len === null) return setError('Enter a valid network and mask.');
    if (gw.trim() && parseIpv4(gw.trim()) === null) return setError('Invalid default router.');
    if (dns.trim() && parseIpv4(dns.trim()) === null) return setError('Invalid DNS server.');
    if ((exFrom.trim() || exTo.trim()) && (parseIpv4(exFrom.trim()) === null || parseIpv4(exTo.trim() || exFrom.trim()) === null)) return setError('Invalid excluded range.');
    setError(null);
    saveNet(device, (c) => {
      c.dhcp.pools[n] = {
        network: formatIpv4((net & (len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0)) >>> 0),
        mask: prefixToMask(len),
        defaultRouter: gw.trim() || undefined,
        dnsServer: dns.trim() || undefined,
        leaseDays: 1,
      };
      if (exFrom.trim()) c.dhcp.excluded.push({ from: exFrom.trim(), to: exTo.trim() || exFrom.trim() });
    });
    setName('');
    setNetwork('');
    setGw('');
    setExFrom('');
    setExTo('');
  };

  return (
    <Section title="DHCP server pools">
      {Object.entries(cfg.dhcp.pools).length === 0 && <p className="mb-2 text-xs text-slate-500">No pools. Routers on other subnets need "ip helper-address" pointing to this server.</p>}
      <ul className="mb-2 space-y-1 text-xs">
        {Object.entries(cfg.dhcp.pools).map(([n, p]) => (
          <li key={n} className="flex items-center gap-2">
            <span className="font-mono text-slate-200">
              {n}: {p.network}/{maskToPrefix(p.mask ?? '') ?? '?'} gw {p.defaultRouter ?? '—'} · {sim.bindings(device.id).filter((b) => b.pool === n).length} leased
            </span>
            <button type="button" className="ml-auto text-slate-500 hover:text-red-400" aria-label={`Delete pool ${n}`} onClick={() => saveNet(device, (c) => delete c.dhcp.pools[n])}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {cfg.dhcp.excluded.map((r, i) => (
          <li key={`ex${i}`} className="flex items-center gap-2 text-slate-400">
            excluded {r.from}–{r.to}
            <button type="button" className="ml-auto text-slate-500 hover:text-red-400" aria-label="Delete excluded range" onClick={() => saveNet(device, (c) => c.dhcp.excluded.splice(i, 1))}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <input className="rn-input" placeholder="Pool name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Pool name" />
        <input className="rn-input font-mono" placeholder="Network 10.20.10.0" value={network} onChange={(e) => setNetwork(e.target.value)} aria-label="Pool network" />
        <input className="rn-input font-mono" placeholder="Mask" value={mask} onChange={(e) => setMask(e.target.value)} aria-label="Pool mask" />
        <input className="rn-input font-mono" placeholder="Default router" value={gw} onChange={(e) => setGw(e.target.value)} aria-label="Default router" />
        <input className="rn-input font-mono" placeholder="DNS server" value={dns} onChange={(e) => setDns(e.target.value)} aria-label="DNS server" />
        <span />
        <input className="rn-input font-mono" placeholder="Exclude from" value={exFrom} onChange={(e) => setExFrom(e.target.value)} aria-label="Exclude from" />
        <input className="rn-input font-mono" placeholder="Exclude to" value={exTo} onChange={(e) => setExTo(e.target.value)} aria-label="Exclude to" />
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      <button type="button" className="rn-btn mt-2" onClick={addPool}>
        <Plus className="h-3.5 w-3.5" /> Add pool
      </button>
    </Section>
  );
}

// ---------------------------------------------------------------------------

export function TrafficFlowsForm({ device }: { device: Device }) {
  const cfg = getNetConfig(device);
  const [dst, setDst] = useState('');
  const [app, setApp] = useState<string>(APP_CLASSES[0].id);
  const [rate, setRate] = useState(String(APP_CLASSES[0].defaultMbps));
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const r = Number(rate);
    if (parseIpv4(dst.trim()) === null) return setError('Enter a destination IP.');
    if (!(r > 0)) return setError('Rate must be > 0 Mbit/s.');
    setError(null);
    const a = appClass(app)!;
    saveNet(device, (c) => c.traffic.push({ id: `${device.name}-${Date.now().toString(36)}`, dst: dst.trim(), app, dscp: a.dscp, rateMbps: r }));
  };

  return (
    <Section title="Traffic flows (QoS analysis)">
      <ul className="mb-2 space-y-1 text-xs">
        {cfg.traffic.map((f, i) => (
          <li key={f.id} className="flex items-center gap-2">
            <span className="text-slate-200">
              {appClass(f.app)?.label ?? f.app} → {f.dst}, {f.rateMbps} Mbit/s, DSCP {dscpName(f.dscp)}
            </span>
            <button type="button" className="ml-auto text-slate-500 hover:text-red-400" aria-label="Delete flow" onClick={() => saveNet(device, (c) => c.traffic.splice(i, 1))}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {!cfg.traffic.length && <li className="text-slate-500">No flows. Add one to see congestion and QoS results in Console → Traffic &amp; QoS.</li>}
      </ul>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <select
          className="rn-input col-span-3"
          value={app}
          aria-label="Application"
          onChange={(e) => {
            setApp(e.target.value);
            setRate(String(appClass(e.target.value)?.defaultMbps ?? 1));
          }}
        >
          {APP_CLASSES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} (DSCP {dscpName(a.dscp)})
            </option>
          ))}
        </select>
        <input className="rn-input col-span-2 font-mono" placeholder="Destination IP" value={dst} onChange={(e) => setDst(e.target.value)} aria-label="Destination IP" />
        <input className="rn-input font-mono" type="number" min={0} step="any" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Rate Mbit/s" />
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      <button type="button" className="rn-btn mt-2" onClick={add}>
        <Plus className="h-3.5 w-3.5" /> Add flow
      </button>
    </Section>
  );
}

// ---------------------------------------------------------------------------

/** DNS server used by a host for nslookup / ping by name (DHCP-learned server is used when empty). */
export function HostDnsForm({ device }: { device: Device }) {
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.version);
  const cfg = getNetConfig(device);
  const [value, setValue] = useState(cfg.mgmt.nameServers[0] ?? '');
  useEffect(() => setValue(cfg.mgmt.nameServers[0] ?? ''), [device.id, cfg.mgmt.nameServers]);
  const learned = sim.nameServersOf(device.id);
  const bad = value.trim() !== '' && parseIpv4(value.trim()) === null;
  return (
    <Section title="DNS server">
      <div className="flex gap-2">
        <input className={`rn-input font-mono ${bad ? 'border-red-600' : ''}`} value={value} placeholder={learned.length ? `from DHCP: ${formatIpv4(learned[0])}` : 'e.g. 10.1.1.53'} onChange={(e) => setValue(e.target.value)} />
        <button
          type="button"
          className="rn-btn"
          disabled={bad}
          onClick={() => saveNet(device, (c) => (c.mgmt.nameServers = value.trim() ? [value.trim()] : []))}
        >
          Apply
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Used by nslookup, ping &lt;name&gt;, telnet/ssh &lt;name&gt; in this device’s console.</p>
    </Section>
  );
}

/** A-records served by the DNS/DHCP/NTP server (UDP 53). */
export function DnsRecordsForm({ device }: { device: Device }) {
  const cfg = getNetConfig(device);
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const n = name.trim().toLowerCase();
    if (!/^[a-z][a-z0-9.-]*$/.test(n)) return setError('Name: letters, digits, dot and dash; start with a letter.');
    if (parseIpv4(addr.trim()) === null) return setError('Invalid IPv4 address.');
    setError(null);
    saveNet(device, (c) => (c.mgmt.hosts = { ...c.mgmt.hosts, [n]: addr.trim() }));
    setName('');
    setAddr('');
  };
  return (
    <Section title="DNS records (A)">
      <ul className="mb-2 space-y-1 text-xs">
        {Object.entries(cfg.mgmt.hosts).map(([n, a]) => (
          <li key={n} className="flex items-center gap-2 font-mono text-slate-200">
            {n} → {a}
            <button
              type="button"
              className="ml-auto text-slate-500 hover:text-red-400"
              aria-label={`Delete record ${n}`}
              onClick={() =>
                saveNet(device, (c) => {
                  const h = { ...c.mgmt.hosts };
                  delete h[n];
                  c.mgmt.hosts = h;
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {!Object.keys(cfg.mgmt.hosts).length && <li className="text-slate-500">No records yet.</li>}
      </ul>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1">
        <input className="rn-input" placeholder="name, e.g. uts-server" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rn-input font-mono" placeholder="10.1.1.20" value={addr} onChange={(e) => setAddr(e.target.value)} />
        <button type="button" className="rn-btn" onClick={add} aria-label="Add record">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      <p className="mt-1 text-xs text-slate-500">This server also answers NTP as a stratum 2 clock (teaching assumption: GPS-referenced).</p>
    </Section>
  );
}

/** Syslog messages and SNMP traps received by the NMS server. */
export function NmsInbox({ device }: { device: Device }) {
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.version);
  const items = sim.nmsInbox(device.id);
  return (
    <Section title={`NMS inbox (${items.length})`}>
      {!items.length ? (
        <p className="text-xs text-slate-500">Nothing received yet. On routers/switches: logging host &lt;this IP&gt;, snmp-server host &lt;this IP&gt; version 2c &lt;community&gt; and snmp-server enable traps.</p>
      ) : (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto font-mono text-[11px]">
          {[...items].reverse().map((i, k) => (
            <li key={k} className={i.kind === 'trap' ? 'text-amber-200' : 'text-slate-300'}>
              {(i.at / 1000).toFixed(1)}s {i.kind === 'trap' ? `TRAP(${i.community})` : 'SYSLOG'} {formatIpv4(i.from)}: {i.text}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
