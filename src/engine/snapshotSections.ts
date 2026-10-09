import type { EngineSections } from '../labs/framework/snapshot';
import type { InterfaceIp, MacEntry, PingResult, RouteEntry, SwitchportState } from '../labs/framework/types';
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

  return { switchports, macTables, routingTables, interfaceIps, pings };
}
