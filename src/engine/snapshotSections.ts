import type { EngineSections } from '../labs/framework/snapshot';
import type { EtherChannelInfo, InterfaceIp, MacEntry, PingResult, RouteEntry, StpBridgeState, SwitchportState, VlanInfo } from '../labs/framework/types';
import { portKey } from './physical/linkState';
import { effectivePort, isBridgeRole, roleOf } from './config/netConfig';
import { formatIpv4 } from './ip/ipv4';
import type { Sim } from './sim';

/**
 * Converts live engine state into the read-only snapshot sections used by
 * lab checkers (Ethernet + IP, Phase 2). Device-keyed maps use device names.
 */
export function engineSections(sim: Sim): EngineSections {
  const switchports: Record<string, Record<string, SwitchportState>> = {};
  const macTables: Record<string, MacEntry[]> = {};
  const routingTables: Record<string, RouteEntry[]> = {};
  const interfaceIps: InterfaceIp[] = [];
  const vlans: Record<string, VlanInfo[]> = {};
  const stp: Record<string, StpBridgeState> = {};
  const etherChannels: Record<string, EtherChannelInfo[]> = {};
  const hostGateways: Record<string, string> = {};
  const duplexMismatches: string[] = [];

  for (const d of sim.topology.devices) {
    const role = roleOf(d.kind);
    const cfg = sim.config(d.id);
    if (!cfg || role === 'opaque') continue;
    if (isBridgeRole(role)) {
      const ports: Record<string, SwitchportState> = {};
      for (const p of d.ports) {
        const e = effectivePort(role, cfg.interfaces[p.id]);
        ports[p.id] = {
          mode: e.switchport ? e.mode! : 'routed',
          accessVlan: e.switchport && e.mode === 'access' ? e.accessVlan : undefined,
          allowedVlans: e.switchport && e.mode === 'trunk' ? (e.trunkAllowed === 'all' ? Array.from({ length: 4094 }, (_, i) => i + 1) : e.trunkAllowed) : undefined,
          nativeVlan: e.switchport && e.mode === 'trunk' ? e.nativeVlan : undefined,
          portSecurity: e.portSecurity
            ? { enabled: e.portSecurity.enabled, maxMac: e.portSecurity.maximum, violation: e.portSecurity.violation, errDisabled: sim.isErrDisabled(d.id, p.id) }
            : undefined,
        };
      }
      switchports[d.name] = ports;
      macTables[d.name] = sim.macTable(d.id).map((m) => ({ vlan: m.vlan, mac: m.mac, port: m.port }));
      vlans[d.name] = Object.entries(cfg.vlans)
        .map(([id, v]) => ({ id: Number(id), name: v.name }))
        .sort((a, b) => a.id - b.id);
      const br = sim.stp.bridges.get(d.id);
      if (br) {
        const ports: StpBridgeState['ports'] = {};
        for (const p of d.ports) {
          const sp = sim.stp.ports.get(portKey(d.id, p.id));
          if (sp) ports[p.id] = { role: sp.role, state: sp.state };
        }
        stp[d.name] = { isRoot: br.isRoot, priority: br.bridgeId.priority, rootPort: br.rootPortId, ports };
      }
      etherChannels[d.name] = sim.etherChannels(d.id).map((b) => ({
        name: b.name,
        protocol: b.protocol,
        up: b.up,
        members: b.members.map((m) => ({ port: m.portId, flag: m.flag })),
      }));
    }
    if (role === 'host' && cfg.defaultGateway) hostGateways[d.name] = cfg.defaultGateway;
    for (const p of d.ports) {
      const st = sim.phys.ports.get(portKey(d.id, p.id));
      if (st?.duplexMismatch) duplexMismatches.push(`${d.name} ${p.id}`);
    }
    for (const i of sim.interfaces(d.id)) {
      if (i.ip !== undefined) interfaceIps.push({ device: d.name, iface: i.name, address: `${formatIpv4(i.ip)}/${i.prefixLen}` });
    }
    routingTables[d.name] = sim.routingTable(d.id).map((r) => ({
      prefix: `${formatIpv4(r.network)}/${r.prefixLen}`,
      protocol: r.protocol === 'S' ? 'static' : 'connected',
      nextHop: r.nextHop !== undefined ? formatIpv4(r.nextHop) : undefined,
      outInterface: r.iface,
      metric: r.metric,
    }));
  }

  const pings: PingResult[] = [...sim.sessions.values()]
    .filter((s) => s.kind === 'ping' && s.done && !s.error)
    .map((s) => ({
      src: sim.device(s.srcDeviceId)?.name ?? s.srcDeviceId,
      dst: formatIpv4(s.dst),
      success: s.probes.some((p) => p.outcome === 'reply'),
      hops: undefined,
    }));

  return { switchports, macTables, routingTables, interfaceIps, pings, vlans, stp, etherChannels, hostGateways, duplexMismatches };
}
