import type { EngineSections } from '../labs/framework/snapshot';
import { analyseTraffic } from './qos/analysis';
import type {
  BgpSessionInfo,
  PseudowireState,
  BgpVpnv4Route,
  RouteProtocol,
  VrfDefinition,
  VrfRoute,
  LdpNeighbor,
  LfibEntry,
  LspResult,
  AclBinding,
  AppResult,
  FhrpGroupInfo,
  IsisAdjacencyInfo,
  OspfNeighbor,
  QosFlowInfo,
  TeTunnelInfo,
  NmsDeviceInfo,
  SrSidInfo,
  TiLfaInfo,
  NmsAlarmInfo,
  ServiceState,
  EtherChannelInfo,
  InterfaceIp,
  MacEntry,
  PingResult,
  RouteEntry,
  StpBridgeState,
  SwitchportState,
  VlanInfo,
} from '../labs/framework/types';
import { portKey } from './physical/linkState';
import { effectivePort, isBridgeRole, roleOf } from './config/netConfig';
import { formatIpv4 } from './ip/ipv4';
import type { Sim } from './sim';
import { runningConfig } from './cli/format';

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
          allowedVlans:
            e.switchport && e.mode === 'trunk'
              ? e.trunkAllowed === 'all'
                ? Array.from({ length: 4094 }, (_, i) => i + 1)
                : e.trunkAllowed
              : undefined,
          nativeVlan: e.switchport && e.mode === 'trunk' ? e.nativeVlan : undefined,
          portSecurity: e.portSecurity
            ? {
                enabled: e.portSecurity.enabled,
                maxMac: e.portSecurity.maximum,
                violation: e.portSecurity.violation,
                errDisabled: sim.isErrDisabled(d.id, p.id),
              }
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
      protocol: protoOf(r.protocol),
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
      vrf: s.vrf,
      success: s.probes.some((p) => p.outcome === 'reply'),
      hops: undefined,
    }));

  const name = (id: string) => sim.device(id)?.name ?? id;
  const ospfNeighbors: OspfNeighbor[] = sim.ospf.neighbors.map((n) => ({
    device: name(n.deviceId),
    neighbor: name(n.neighborDeviceId),
    state: n.state === 'FULL' ? 'FULL' : n.state === '2WAY' ? '2WAY' : 'EXSTART',
    area: String(n.area),
  }));
  const isisAdjacencies: IsisAdjacencyInfo[] = sim.isis.adjacencies.map((a) => ({
    device: name(a.deviceId),
    neighbor: name(a.neighborDeviceId),
    level: a.level,
  }));
  const fhrpGroups: FhrpGroupInfo[] = sim.fhrp.groups.map((g) => ({
    protocol: g.protocol,
    group: g.group,
    vip: g.vip !== undefined ? formatIpv4(g.vip) : undefined,
    active: g.active ? name(g.active.deviceId) : undefined,
    standby: g.standby ? name(g.standby.deviceId) : undefined,
    members: g.members.map((m) => name(m.deviceId)),
  }));
  const natTranslations: Record<string, Array<{ insideLocal: string; insideGlobal: string }>> = {};
  const dhcpStates: Record<string, string> = {};
  const aclBindings: AclBinding[] = [];
  const ntp: Record<string, { synced: boolean; stratum?: number }> = {};
  const nmsInbox: Record<string, { syslog: number; traps: number }> = {};
  const vty: Record<string, { transport: string; login: string; sshEnabled: boolean; accessClass?: string }> = {};
  for (const d of sim.topology.devices) {
    const cfg = sim.config(d.id);
    const role = roleOf(d.kind);
    if (!cfg || role === 'opaque') continue;
    const tr = sim.natTranslations(d.id);
    if (tr.length) natTranslations[d.name] = tr.map((t) => ({ insideLocal: formatIpv4(t.insideLocal), insideGlobal: formatIpv4(t.insideGlobal) }));
    for (const p of d.ports) {
      const c = sim.dhcpClient(d.id, p.id);
      if (c) dhcpStates[d.name] = c.state;
    }
    for (const [iface, ic] of Object.entries(cfg.interfaces)) {
      if (ic.aclIn) aclBindings.push({ device: d.name, iface, dir: 'in', acl: ic.aclIn });
      if (ic.aclOut) aclBindings.push({ device: d.name, iface, dir: 'out', acl: ic.aclOut });
    }
    const st = sim.ntpState.get(d.id);
    if (cfg.mgmt.ntpMaster) ntp[d.name] = { synced: true, stratum: cfg.mgmt.ntpMaster };
    else if (cfg.mgmt.ntpServers.length) ntp[d.name] = { synced: !!st, stratum: st?.stratum };
    if (d.kind === 'nms') {
      const inbox = sim.nmsInbox(d.id);
      nmsInbox[d.name] = { syslog: inbox.filter((i) => i.kind === 'syslog').length, traps: inbox.filter((i) => i.kind === 'trap').length };
    }
    if (role !== 'host' && role !== 'hub') {
      const m = cfg.mgmt;
      vty[d.name] = { transport: m.vty.transport, login: m.vty.login, sshEnabled: !!m.rsaModulus && !!m.domainName, accessClass: m.vty.accessClass };
    }
  }
  const appResults: AppResult[] = [...sim.appSessions.values()].map((a) => ({
    src: name(a.deviceId),
    kind: a.kind,
    target: a.kind === 'dns' ? (a.name ?? '') : sim.addressOwner(a.target) ? name(sim.addressOwner(a.target)!.deviceId) : formatIpv4(a.target),
    status: a.status,
    result: a.result ?? '',
  }));
  const qos = analyseTraffic(sim);
  const qosFlows: QosFlowInfo[] = qos.flows.map((f) => ({
    src: name(f.srcDeviceId),
    dst: f.dst,
    app: f.app,
    dscp: f.dscp,
    offeredMbps: f.offeredMbps,
    deliveredMbps: f.deliveredMbps,
    lossPct: f.lossPct,
    hops: f.hops.map((h) => ({ device: name(h.deviceId), iface: h.iface, exp: h.exp })),
  }));
  const srSids: SrSidInfo[] = sim.sr.sids.map((x) => ({ device: name(x.owner), prefix: `${formatIpv4(x.network)}/${x.prefixLen}`, index: x.index }));
  const srRouters = [...sim.sr.routers.keys()].map(name);
  const tiLfa: TiLfaInfo[] = sim.sr.tiLfa.map((x) => ({ device: name(x.deviceId), prefix: x.prefix, protected: x.path.length > 0 }));
  const nv = sim.nmsView();
  const nmsDevices: NmsDeviceInfo[] = nv.devices.map((d) => ({ device: name(d.deviceId), state: d.state }));
  const nmsAlarms: NmsAlarmInfo[] = nv.alarms.map((a) => ({ device: name(a.deviceId), object: a.object, type: a.type, severity: a.severity, layer: a.layer }));
  const services: ServiceState[] = nv.services.map((s) => ({ name: s.name, status: s.status === 'UNKNOWN' ? 'DOWN' : s.status, carriedBy: s.kind === 'pw' ? 'mpls' : 'ip' }));
  const runningConfigs = sim.topology.devices
    .filter((d) => ['router', 'l3switch', 'switch'].includes(roleOf(d.kind)))
    .map((d) => ({ device: d.name, text: runningConfig(d, sim.config(d.id)!) }));
  const teTunnels: TeTunnelInfo[] = sim.te.lsps.map((l) => ({
    head: name(l.head),
    tunnel: l.tunnel,
    state: l.state,
    reason: l.reason,
    path: l.hops.map((h) => name(h.dev)),
    bandwidthKbps: l.bandwidthKbps,
    frr: l.frr.state,
  }));

  const cutLinks: Array<[string, string]> = [];
  for (const id of sim.cuts) {
    const l = sim.topology.links.find((x) => x.id === id);
    if (l) cutLinks.push([name(l.a.deviceId), name(l.b.deviceId)]);
  }

  // MPLS / LDP (Phase 4).
  const ldpNeighbors: LdpNeighbor[] = [];
  for (const sess of sim.ldp.sessions) {
    const state = sess.state === 'OPERATIONAL' ? 'OPERATIONAL' : 'NON-EXISTENT';
    ldpNeighbors.push({ device: name(sess.a), neighbor: name(sess.b), state }, { device: name(sess.b), neighbor: name(sess.a), state });
  }
  const lfib: LfibEntry[] = [];
  for (const e of sim.ldp.lfib) {
    if (e.out === 'none') continue;
    const fec = `${formatIpv4(e.network)}/${e.prefixLen}`;
    const nextHop = formatIpv4(e.nextHop);
    if (e.out === 'pop') lfib.push({ device: name(e.deviceId), inLabel: e.inLabel, fec, action: 'pop', nextHop });
    else {
      lfib.push({ device: name(e.deviceId), inLabel: e.inLabel, fec, action: 'swap', outLabel: e.out, nextHop });
      lfib.push({ device: name(e.deviceId), inLabel: null, fec, action: 'push', outLabel: e.out, nextHop });
    }
  }
  const lspResults: LspResult[] = [...sim.lspSessions.values()]
    .filter((x) => x.done)
    .map((x) => ({
      src: name(x.srcDeviceId),
      fec: x.pw ? `pseudowire ${formatIpv4(x.pw.peer)} ${x.pw.vcId}` : `${formatIpv4(x.network)}/${x.prefixLen}`,
      kind: x.kind,
      codes: x.probes.map((p) => p.code).join(''),
      success: x.kind === 'ping' ? x.probes.length > 0 && x.probes.every((p) => p.code === '!') : x.probes.some((p) => p.code === '!'),
    }));

  // BGP / L3VPN (Phase 5).
  const vrfs: VrfDefinition[] = [];
  const vrfRoutes: VrfRoute[] = [];
  for (const d of sim.topology.devices) {
    const cfg = sim.config(d.id);
    for (const [v, vc] of Object.entries(cfg?.vrfs ?? {}))
      vrfs.push({ device: d.name, vrf: v, rd: vc.rd ?? '', importRts: [...vc.importRts], exportRts: [...vc.exportRts] });
    for (const v of sim.vrfNames(d.id))
      for (const r of sim.routingTable(d.id, v))
        if (r.protocol !== 'L')
          vrfRoutes.push({ device: d.name, vrf: v, prefix: `${formatIpv4(r.network)}/${r.prefixLen}`, protocol: protoOf(r.protocol) });
  }
  const bgpSessions: BgpSessionInfo[] = sim.bgp.peerings.map((p) => ({
    device: name(p.dev),
    vrf: p.vrf,
    neighbor: formatIpv4(p.neighbor),
    peer: p.peer ? name(sim.bgp.speakers.get(p.peer)!.dev) : undefined,
    state: p.state,
    ibgp: p.ibgp,
    afs: [...p.afs],
  }));
  const pwType = (t: string, vfi?: string): PseudowireState['type'] =>
    vfi ? 'vpls' : t === 'SATOP E1' ? 'satop' : t === 'CESoPSN Basic' ? 'cesopsn' : 'vpws-eth';
  const pseudowires: PseudowireState[] = sim.pw.endpoints.map((e) => ({
    a: name(e.deviceId),
    b: e.remoteDeviceId ? name(e.remoteDeviceId) : formatIpv4(e.peer),
    vcId: e.vcId,
    type: pwType(e.type, e.vfi),
    status: e.status,
    reason: e.reason,
  }));
  const bgpVpnv4: BgpVpnv4Route[] = [];
  for (const [tk, t] of sim.bgp.tables) {
    if (!tk.endsWith('|vpnv4')) continue;
    const dev = tk.slice(0, -'|vpnv4'.length);
    for (const paths of t.values())
      for (const p of paths)
        bgpVpnv4.push({
          device: name(dev),
          rd: p.rd ?? '',
          prefix: `${formatIpv4(p.network)}/${p.prefixLen}`,
          nextHop: p.nextHop === 0 ? '0.0.0.0' : formatIpv4(p.nextHop),
          rts: [...p.rts],
          label: p.label ?? 0,
          best: !!p.best,
        });
  }

  return {
    vrfs,
    vrfRoutes,
    bgpVpnv4,
    bgpSessions,
    pseudowires,
    ldpNeighbors,
    lfib,
    lspResults,
    cutLinks,
    switchports,
    macTables,
    routingTables,
    interfaceIps,
    pings,
    vlans,
    stp,
    etherChannels,
    hostGateways,
    duplexMismatches,
    ospfNeighbors,
    isisAdjacencies,
    fhrpGroups,
    natTranslations,
    dhcpStates,
    aclBindings,
    ntp,
    nmsInbox,
    vty,
    appResults,
    qosFlows,
    teTunnels,
    nmsDevices,
    srSids,
    srRouters,
    tiLfa,
    nmsAlarms,
    services,
    runningConfigs,
  };
}

function protoOf(p: string): RouteProtocol {
  if (p === 'S') return 'static';
  if (p.startsWith('O')) return 'ospf';
  if (p.startsWith('i ')) return 'isis';
  if (p === 'R') return 'rip';
  if (p === 'B') return 'bgp';
  return 'connected';
}
