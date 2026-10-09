import { Scissors, Terminal, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { validateHostForm } from '../../engine/cli/host';
import { effectivePort, getNetConfig, isBridgeRole, roleOf, withNetConfig } from '../../engine/config/netConfig';
import { formatIpv4 } from '../../engine/ip/ipv4';
import { portKey } from '../../engine/physical/linkState';
import type { Device, Link } from '../../model/types';
import { useSimStore } from '../../store/simStore';
import { useTopologyStore } from '../../store/topologyStore';

/** Live engine state for the selected device / link, shown in the properties panel. */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-800 px-3 py-3">
      <h3 className="rn-label mb-2">{title}</h3>
      {children}
    </section>
  );
}

export function DeviceSimSection({ device }: { device: Device }) {
  const role = roleOf(device.kind);
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.version);
  if (role === 'opaque') return null;
  const cfg = sim.config(device.id) ?? getNetConfig(device);
  const ifs = sim.interfaces(device.id);
  const stpBridge = sim.stp.bridges.get(device.id);

  return (
    <>
      <Section title="Console">
        <button type="button" className="rn-btn" onClick={() => useSimStore.getState().openCli(device.id)}>
          <Terminal className="h-4 w-4" /> {role === 'host' ? 'Open command prompt' : 'Open CLI'}
        </button>
        {stpBridge && (
          <p className="mt-2 text-xs text-slate-400">
            STP: {stpBridge.isRoot ? <span className="text-emerald-300">root bridge</span> : <>root port {stpBridge.rootPortId ?? '—'}, cost {stpBridge.rootCost}</>} · priority {stpBridge.bridgeId.priority}
          </p>
        )}
      </Section>
      {role === 'host' && <HostIpForm device={device} />}
      <Section title="Interfaces (live)">
        <table className="w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="pb-1 font-medium">Interface</th>
              <th className="pb-1 font-medium">Status</th>
              <th className="pb-1 font-medium">{isBridgeRole(role) ? 'L2 / IP' : 'IP'}</th>
            </tr>
          </thead>
          <tbody>
            {device.ports.map((p) => {
              const st = sim.phys.ports.get(portKey(device.id, p.id));
              const l3 = ifs.find((i) => i.name === p.id);
              const eff = effectivePort(role, cfg.interfaces[p.id]);
              const stp = sim.stp.ports.get(portKey(device.id, p.id));
              const status = sim.isErrDisabled(device.id, p.id) ? 'err-disabled' : !st?.adminUp ? 'admin down' : st.operUp ? 'up' : 'down';
              const l2 = isBridgeRole(role) && eff.switchport ? `${eff.mode === 'trunk' ? 'trunk' : `vlan ${eff.accessVlan}`}${stp && stp.role !== 'disabled' && !stp.edge ? ` · ${stp.role}` : ''}` : undefined;
              if (!st?.linkId && !l3?.ip && !cfg.interfaces[p.id]) return null;
              return (
                <tr key={p.id} className="border-t border-slate-800/70">
                  <td className="py-0.5 font-mono text-slate-200">{p.name}</td>
                  <td className={`py-0.5 ${status === 'up' ? 'text-emerald-300' : status === 'err-disabled' ? 'text-red-400' : 'text-slate-500'}`} title={st?.reason}>
                    {status}
                  </td>
                  <td className="py-0.5 font-mono text-slate-300">{l2 ?? (l3?.ip !== undefined ? `${formatIpv4(l3.ip)}/${l3.prefixLen}` : '—')}</td>
                </tr>
              );
            })}
            {ifs
              .filter((i) => i.kind !== 'port')
              .map((i) => (
                <tr key={i.name} className="border-t border-slate-800/70">
                  <td className="py-0.5 font-mono text-slate-200">{i.name}</td>
                  <td className={`py-0.5 ${i.up ? 'text-emerald-300' : 'text-slate-500'}`} title={i.reason}>
                    {!i.adminUp ? 'admin down' : i.up ? 'up' : 'down'}
                  </td>
                  <td className="py-0.5 font-mono text-slate-300">{i.ip !== undefined ? `${formatIpv4(i.ip)}/${i.prefixLen}` : '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-slate-500">Unused, unconfigured ports are hidden. Use the CLI for full detail (show ip interface brief).</p>
      </Section>
    </>
  );
}

/** "IP Configuration" form for end hosts (like a PC's network settings). */
function HostIpForm({ device }: { device: Device }) {
  const cfg = getNetConfig(device);
  const nic = device.ports[0]?.id ?? 'eth0';
  const cur = cfg.interfaces[nic]?.ip;
  const [address, setAddress] = useState(cur?.address ?? '');
  const [mask, setMask] = useState(cur?.mask ?? '255.255.255.0');
  const [gateway, setGateway] = useState(cfg.defaultGateway ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAddress(cur?.address ?? '');
    setMask(cur?.mask ?? '255.255.255.0');
    setGateway(cfg.defaultGateway ?? '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id, cur?.address, cur?.mask, cfg.defaultGateway]);

  const apply = () => {
    const err = validateHostForm(address.trim(), mask.trim(), gateway.trim());
    setError(err);
    if (err) return;
    const next = structuredClone(cfg);
    next.interfaces[nic] = { ...(next.interfaces[nic] ?? {}) };
    if (address.trim()) next.interfaces[nic].ip = { address: address.trim(), mask: mask.trim() };
    else delete next.interfaces[nic].ip;
    if (gateway.trim()) next.defaultGateway = gateway.trim();
    else delete next.defaultGateway;
    const t = useTopologyStore.getState().topology;
    useTopologyStore.getState().applyTopology({ ...t, devices: t.devices.map((d) => (d.id === device.id ? withNetConfig(d, next) : d)) });
  };

  return (
    <Section title={`IP Configuration (${nic})`}>
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
      <button type="button" className="rn-btn-primary mt-2" onClick={apply}>
        Apply
      </button>
      {cur && (
        <p className="mt-1 text-[11px] text-slate-500">
          Current: {cur.address} {cur.mask}
        </p>
      )}
    </Section>
  );
}

export function LinkSimSection({ link }: { link: Link }) {
  const sim = useSimStore((s) => s.sim);
  useSimStore((s) => s.version);
  const st = sim.phys.links.get(link.id);
  const cut = sim.cuts.has(link.id);
  const stpA = sim.stp.ports.get(portKey(link.a.deviceId, link.a.portId));
  const stpB = sim.stp.ports.get(portKey(link.b.deviceId, link.b.portId));
  const blocked = [stpA, stpB].find((p) => p?.role === 'alternate');
  const blockedName = blocked ? sim.device(blocked.deviceId)?.name : undefined;
  const medium = link.kind === 'ofc' ? 'fibre' : 'cable';

  return (
    <Section title="Live status">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-slate-400">Link</dt>
        <dd className={st?.up ? 'text-emerald-300' : 'text-red-400'}>{st?.up ? 'UP' : `DOWN — ${st?.reason ?? 'unknown'}`}</dd>
        <dt className="text-slate-400">Speed</dt>
        <dd>{st?.speedGbps ? `${st.speedGbps} Gbit/s` : '—'}</dd>
        <dt className="text-slate-400">Spanning tree</dt>
        <dd>{blocked ? <span className="text-amber-300">blocked at {blockedName} {blocked.portId} (alternate)</span> : stpA || stpB ? 'forwarding' : 'n/a (not a switch-to-switch link)'}</dd>
      </dl>
      <div className="mt-2 flex gap-2">
        {cut ? (
          <button type="button" className="rn-btn" onClick={() => useSimStore.getState().restoreLink(link.id)}>
            <Wrench className="h-4 w-4" /> Repair {medium}
          </button>
        ) : (
          <button type="button" className="rn-btn-danger" onClick={() => useSimStore.getState().cutLink(link.id)}>
            <Scissors className="h-4 w-4" /> Cut {medium}
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">A cut is a simulation fault (not saved in the file). Repair restores the link.</p>
    </Section>
  );
}
