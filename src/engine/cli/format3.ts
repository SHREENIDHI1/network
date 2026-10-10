import { tsText } from '../l2vpn/pw';
import { isisProtocolLines, ripProtocolLines } from './formatIgp';
import type { Device } from '../../model/types';
import { longIfName, type InterfaceConfig, type NetConfig } from '../config/netConfig';
import { ciscoMac } from '../core/mac';
import { formatIpv4 } from '../ip/ipv4';
import { analyseTraffic } from '../qos/analysis';
import { dscpName } from '../qos/apps';
import { formatAclEntry, showAcl } from '../security/acl';
import type { Sim } from '../sim';

/** Phase 3 "show" renderers and running-config sections (IOS-like layouts). */

const pad = (s: string | number, n: number) => String(s).padEnd(n);

// ---------------------------------------------------------------- OSPF

export function showOspfNeighbor(sim: Sim, device: Device): string {
  const ns = sim.ospf.neighbors.filter((n) => n.deviceId === device.id);
  const L = [`${pad('Neighbor ID', 17)}${pad('Pri', 5)}${pad('State', 17)}${pad('Dead Time', 12)}${pad('Address', 16)}Interface`];
  for (const n of ns) {
    const role = n.state === '2WAY' ? 'DROTHER' : n.neighborRole;
    L.push(
      `${pad(formatIpv4(n.neighborRid), 17)}${pad(n.neighborPriority, 5)}${pad(`${n.state}/${role}`, 17)}${pad('-', 12)}${pad(formatIpv4(n.neighborIp), 16)}${longIfName(n.iface)}`,
    );
  }
  if (!sim.ospf.routerIds.has(device.id)) L.push('', '% OSPF is not running on this device.');
  else if (ns.length) L.push('', '(Dead Time not shown: RailMPLS Lab computes OSPF state without hello timers.)');
  return L.join('\n');
}

export function showOspfIntBrief(sim: Sim, device: Device): string {
  const ois = sim.ospf.interfaces.filter((o) => o.deviceId === device.id);
  const L = [`${pad('Interface', 11)}${pad('PID', 5)}${pad('Area', 12)}${pad('IP Address/Mask', 20)}${pad('Cost', 6)}${pad('State', 6)}Nbrs F/C`];
  const pid = sim.config(device.id)?.ospf?.processId ?? 1;
  for (const o of ois) {
    const state = o.passive ? 'DR' : o.neighbors === 0 ? 'DR' : o.role === 'DROTHER' ? 'DROTH' : o.role;
    L.push(
      `${pad(o.iface, 11)}${pad(pid, 5)}${pad(o.area, 12)}${pad(`${formatIpv4(o.ip)}/${o.prefixLen}`, 20)}${pad(o.cost, 6)}${pad(state, 6)}${o.fullNeighbors}/${o.neighbors}`,
    );
  }
  return L.join('\n');
}

/** "show ip ospf interface [IF]": computed OSPF settings per interface (no packet counters or timers that are not modelled). */
export function showOspfInterface(sim: Sim, device: Device, only?: string): string {
  const ois = sim.ospf.interfaces.filter((o) => o.deviceId === device.id && (!only || o.iface === only));
  if (!ois.length) return only ? `% OSPF is not enabled on ${longIfName(only)}.` : '% OSPF is not running on this device.';
  const rid = sim.ospf.routerIds.get(device.id);
  const pid = sim.config(device.id)?.ospf?.processId ?? 1;
  const L: string[] = [];
  for (const o of ois) {
    const loop = o.iface.startsWith('Lo');
    const state = o.passive || o.neighbors === 0 ? 'DR' : o.role === 'DROTHER' ? 'DROTHER' : o.role;
    L.push(
      `${longIfName(o.iface)} is up, line protocol is up`,
      `  Internet Address ${formatIpv4(o.ip)}/${o.prefixLen}, Area ${o.area}`,
      `  Process ID ${pid}, Router ID ${rid !== undefined ? formatIpv4(rid) : '0.0.0.0'}, Network Type ${loop ? 'LOOPBACK' : 'BROADCAST'}, Cost: ${o.cost}`,
    );
    if (loop) {
      L.push('  Loopback interface is treated as a stub Host', '');
      continue;
    }
    L.push(`  State ${state}, Priority ${o.priority}`, `  Timer intervals configured, Hello ${o.hello}, Dead ${o.dead}`);
    L.push(o.passive ? '  No Hellos (Passive interface)' : `  Neighbor Count is ${o.neighbors}, Adjacent neighbor count is ${o.fullNeighbors}`, '');
  }
  return L.join('\n').trimEnd();
}

export function showOspfDatabase(sim: Sim, device: Device): string {
  const rid = sim.ospf.routerIds.get(device.id);
  if (rid === undefined) return '% OSPF is not running on this device.';
  const myAreas = new Set(sim.ospf.interfaces.filter((o) => o.deviceId === device.id).map((o) => o.area));
  const L = [`            OSPF Router with ID (${formatIpv4(rid)}) (Process ID ${sim.config(device.id)?.ospf?.processId ?? 1})`];
  const titles: Record<string, string> = { router: 'Router Link States', network: 'Net Link States', summary: 'Summary Net Link States' };
  for (const area of [...myAreas].sort((a, b) => a - b)) {
    for (const type of ['router', 'network', 'summary'] as const) {
      const lsas = sim.ospf.lsdb.filter((l) => l.type === type && l.area === area);
      if (!lsas.length) continue;
      L.push('', `                ${titles[type]} (Area ${area})`, '', `${pad('Link ID', 16)}${pad('ADV Router', 16)}Detail`);
      for (const l of lsas) L.push(`${pad(formatIpv4(l.linkId), 16)}${pad(formatIpv4(l.advRouter), 16)}${l.detail}`);
    }
  }
  const ext = sim.ospf.lsdb.filter((l) => l.type === 'external');
  if (ext.length) {
    L.push('', '                Type-5 AS External Link States', '', `${pad('Link ID', 16)}${pad('ADV Router', 16)}Detail`);
    for (const l of ext) L.push(`${pad(formatIpv4(l.linkId), 16)}${pad(formatIpv4(l.advRouter), 16)}${l.detail}`);
  }
  L.push('', '(Derived summary — RailMPLS Lab does not keep LSA ages, sequence numbers or checksums.)');
  return L.join('\n');
}

export function showIpProtocols(sim: Sim, device: Device, cfg: NetConfig): string {
  const extra = [...isisProtocolLines(sim, device, cfg), ...ripProtocolLines(sim, device, cfg)];
  const o = cfg.ospf;
  if (!o && !extra.length) return '*** IP Routing is NSF aware ***\n\n(No routing protocol is configured — only connected and static routes.)';
  if (!o) return ['*** IP Routing is NSF aware ***', '', ...extra].join('\n');
  const rid = sim.ospf.routerIds.get(device.id);
  const L = [
    `Routing Protocol is "ospf ${o.processId}"`,
    '  Outgoing update filter list for all interfaces is not set',
    '  Incoming update filter list for all interfaces is not set',
    `  Router ID ${rid !== undefined ? formatIpv4(rid) : 'not selected'}`,
  ];
  if (sim.ospf.abrs.has(device.id)) L.push('  It is an area border router');
  if (sim.ospf.asbrs.has(device.id)) L.push('  It is an autonomous system boundary router');
  if (o.redistributeStatic) L.push('  Redistributing External Routes from,\n    static, includes subnets in redistribution');
  L.push('  Maximum path: 4', '  Routing for Networks:');
  for (const n of o.networks) L.push(`    ${n.address} ${n.wildcard} area ${n.area}`);
  if (o.passive.length) {
    L.push('  Passive Interface(s):');
    for (const p of o.passive) L.push(`    ${longIfName(p)}`);
  }
  L.push(`  Reference bandwidth unit is ${o.referenceBandwidth} mbps`, '  Distance: (default is 110)');
  if (extra.length) L.push('', ...extra);
  return L.join('\n');
}

// ---------------------------------------------------------------- ACL

export function showAccessLists(sim: Sim, device: Device, cfg: NetConfig, only?: string): string {
  const names = Object.keys(cfg.acls).filter((n) => !only || n === only);
  if (!names.length) return only ? `% Access list ${only} does not exist` : '';
  return names.map((n) => showAcl(n, cfg.acls[n], sim.aclHits.get(`${device.id}|${n}`) ?? [])).join('\n');
}

// ---------------------------------------------------------------- NAT

export function showNatTranslations(sim: Sim, device: Device): string {
  const L = [`${pad('Pro', 5)}${pad('Inside global', 22)}${pad('Inside local', 22)}${pad('Outside local', 22)}Outside global`];
  for (const t of sim.natTranslations(device.id)) {
    const g = t.globalId !== undefined ? `${formatIpv4(t.insideGlobal)}:${t.globalId}` : formatIpv4(t.insideGlobal);
    const l = t.localId !== undefined ? `${formatIpv4(t.insideLocal)}:${t.localId}` : formatIpv4(t.insideLocal);
    const o = t.outside !== undefined ? `${formatIpv4(t.outside)}:${t.globalId}` : '---';
    L.push(`${pad(t.static ? '---' : 'icmp', 5)}${pad(g, 22)}${pad(l, 22)}${pad(o, 22)}${o}`);
  }
  return L.join('\n');
}

export function showNatStatistics(sim: Sim, device: Device, cfg: NetConfig): string {
  const all = sim.natTranslations(device.id);
  const inside = Object.entries(cfg.interfaces)
    .filter(([, c]) => c.natRole === 'inside')
    .map(([n]) => longIfName(n));
  const outside = Object.entries(cfg.interfaces)
    .filter(([, c]) => c.natRole === 'outside')
    .map(([n]) => longIfName(n));
  return [
    `Total active translations: ${all.length} (${all.filter((t) => t.static).length} static, ${all.filter((t) => !t.static).length} dynamic; ${all.filter((t) => !t.static).length} extended)`,
    `Outside interfaces:\n  ${outside.join(', ') || '(none)'}`,
    `Inside interfaces:\n  ${inside.join(', ') || '(none)'}`,
    ...cfg.nat.overload.map(
      (o) => `-- Inside Source\n[Id: 1] access-list ${o.acl} interface ${longIfName(o.iface)} refcount ${all.filter((t) => !t.static).length}`,
    ),
  ].join('\n');
}

// ---------------------------------------------------------------- DHCP

export function showDhcpBinding(sim: Sim, device: Device): string {
  const L = [
    'Bindings from all pools not associated with VRF:',
    `${pad('IP address', 18)}${pad('Client-ID/', 21)}${pad('Lease expiration', 26)}${pad('Type', 10)}State`,
    `${pad('', 18)}${pad('Hardware address/', 21)}`,
    `${pad('', 18)}${pad('User name', 21)}`,
  ];
  for (const b of sim.bindings(device.id))
    L.push(
      `${pad(formatIpv4(b.ip), 18)}${pad(`01${ciscoMac(b.mac).replace(/\./g, '.')}`, 21)}${pad('(lease timers not simulated)', 26)}${pad('Automatic', 10)}Active`,
    );
  return L.join('\n');
}

export function showDhcpPool(sim: Sim, device: Device, cfg: NetConfig): string {
  const L: string[] = [];
  const binds = sim.bindings(device.id);
  for (const [name, p] of Object.entries(cfg.dhcp.pools)) {
    L.push(
      '',
      `Pool ${name} :`,
      ` Network                       : ${p.network ?? '(not set)'} ${p.mask ?? ''}`,
      ` Default router                : ${p.defaultRouter ?? '(not set)'}`,
      ` DNS server                    : ${p.dnsServer ?? '(not set)'}`,
      ` Lease                         : ${p.leaseDays} day(s)`,
      ` Leased addresses              : ${binds.filter((b) => b.pool === name).length}`,
    );
  }
  if (cfg.dhcp.excluded.length) L.push('', 'Excluded addresses:', ...cfg.dhcp.excluded.map((r) => `  ${r.from} - ${r.to}`));
  return L.length ? L.join('\n') : '% No DHCP pools configured';
}

// ---------------------------------------------------------------- HSRP / VRRP

export function showFhrpBrief(sim: Sim, device: Device, proto: 'hsrp' | 'vrrp'): string {
  const L =
    proto === 'hsrp'
      ? [
          '                     P indicates configured to preempt.',
          '                     |',
          `${pad('Interface', 11)}${pad('Grp', 5)}${pad('Pri', 4)}${pad('P', 2)}${pad('State', 9)}${pad('Active', 16)}${pad('Standby', 16)}Virtual IP`,
        ]
      : [
          `${pad('Interface', 15)}${pad('Grp', 5)}${pad('Pri', 5)}${pad('Own', 5)}${pad('Pre', 5)}${pad('State', 8)}${pad('Master addr', 16)}Group addr`,
        ];
  for (const [k, entries] of sim.fhrp.byIface) {
    if (!k.startsWith(`${device.id}|`)) continue;
    for (const { group: g, member: m } of entries) {
      if (g.protocol !== proto) continue;
      const active = g.active ? (g.active === m ? 'local' : formatIpv4(g.active.ip)) : 'unknown';
      const standby = g.standby ? (g.standby === m ? 'local' : formatIpv4(g.standby.ip)) : 'unknown';
      const vip = g.vip !== undefined ? formatIpv4(g.vip) : 'unknown';
      if (proto === 'hsrp')
        L.push(
          `${pad(m.iface, 11)}${pad(g.group, 5)}${pad(m.priority, 4)}${pad(m.preempt ? 'P' : '', 2)}${pad(m.role, 9)}${pad(active, 16)}${pad(standby, 16)}${vip}`,
        );
      else
        L.push(
          `${pad(m.iface, 15)}${pad(g.group, 5)}${pad(m.priority, 5)}${pad(m.configuredPriority === 255 ? 'Y' : 'N', 5)}${pad(m.preempt ? 'Y' : 'N', 5)}${pad(m.role, 8)}${pad(g.active ? formatIpv4(g.active.ip) : '-', 16)}${vip}`,
        );
    }
  }
  return L.join('\n');
}

// ---------------------------------------------------------------- QoS

export function showClassMaps(cfg: NetConfig): string {
  const L: string[] = [];
  for (const [n, c] of Object.entries(cfg.qos.classMaps)) {
    L.push(
      ` Class Map ${c.matchAll ? 'match-all' : 'match-any'} ${n} (id ${L.length + 1})`,
      ...(c.dscp.length || !(c.exp ?? []).length ? [`   Match dscp ${c.dscp.map(dscpName).join(' ') || '(none)'}`] : []),
      ...((c.exp ?? []).length ? [`   Match mpls experimental topmost ${c.exp!.join(' ')}`] : []),
      '',
    );
  }
  L.push(' Class Map match-any class-default (id 0)', '   Match any');
  return L.join('\n');
}

export function showPolicyMaps(cfg: NetConfig): string {
  const L: string[] = [];
  for (const [n, p] of Object.entries(cfg.qos.policyMaps)) {
    L.push(`  Policy Map ${n}`);
    for (const c of p.classes) {
      L.push(`    Class ${c.name}`);
      if (c.priorityPercent) L.push(`      priority ${c.priorityPercent} (%)`);
      if (c.bandwidthPercent) L.push(`      bandwidth ${c.bandwidthPercent} (%)`);
      if (c.setDscp !== undefined) L.push(`      set dscp ${dscpName(c.setDscp)}`);
      if (c.setExpImposition !== undefined) L.push(`      set mpls experimental imposition ${c.setExpImposition}`);
      if (c.setExpTopmost !== undefined) L.push(`      set mpls experimental topmost ${c.setExpTopmost}`);
    }
  }
  return L.join('\n') || '% No policy maps configured';
}

export function showPolicyInterface(sim: Sim, device: Device, iface: string): string {
  const cfg = sim.config(device.id)!;
  const ic = cfg.interfaces[iface];
  if (!ic?.servicePolicyOut && !ic?.servicePolicyIn) return `% No service policy attached to ${longIfName(iface)}`;
  const report = analyseTraffic(sim);
  const q = report.queues.find((x) => x.deviceId === device.id && x.iface === iface);
  const L = [` ${longIfName(iface)}`, ''];
  if (ic.servicePolicyIn) L.push(`  Service-policy input: ${ic.servicePolicyIn}`, '');
  if (ic.servicePolicyOut) {
    L.push(`  Service-policy output: ${ic.servicePolicyOut}`, '');
    if (!q) L.push('    (no configured traffic flows use this interface — add flows on hosts to see the steady-state result)');
    else {
      L.push(
        `    Interface capacity ${q.capacityMbps} Mbit/s, offered ${q.offeredMbps.toFixed(2)} Mbit/s${q.offeredMbps > q.capacityMbps ? ' — CONGESTED' : ''}`,
        '',
      );
      for (const c of q.classes) {
        const drop = Math.max(0, c.offeredMbps - c.deliveredMbps);
        L.push(
          `    Class-map: ${c.name} (${c.kind})`,
          `      offered ${c.offeredMbps.toFixed(2)} Mbit/s, sent ${c.deliveredMbps.toFixed(2)} Mbit/s, dropped ${drop.toFixed(2)} Mbit/s`,
          '',
        );
      }
    }
  }
  L.push('  (Steady-state rates from the RailMPLS Lab fluid QoS model, not packet counters.)');
  return L.join('\n');
}

// ---------------------------------------------------------------- logging

export function showLogging(sim: Sim, device: Device): string {
  const lines: string[] = [];
  for (const p of sim.ospf.problems) if (p.deviceId === device.id) lines.push(`%OSPF: ${p.iface ? `${longIfName(p.iface)}: ` : ''}${p.text}`);
  for (const g of sim.fhrp.groups) {
    if (!g.members.some((m) => m.deviceId === device.id)) continue;
    for (const pr of g.problems) lines.push(`%${g.protocol.toUpperCase()}: group ${g.group}: ${pr}`);
    if (g.active)
      lines.push(
        `%${g.protocol.toUpperCase()}-5-STATECHANGE: group ${g.group} ${g.protocol === 'hsrp' ? 'Active' : 'Master'} is ${sim.device(g.active.deviceId)?.name} ${g.active.iface}`,
      );
  }
  for (const p of sim.topology.devices.find((d) => d.id === device.id)?.ports ?? []) {
    if (sim.isErrDisabled(device.id, p.id))
      lines.push(`%PM-4-ERR_DISABLE: psecure-violation error detected on ${longIfName(p.id)}, putting ${longIfName(p.id)} in err-disable state`);
  }
  const hosts = sim.config(device.id)?.mgmt.loggingHosts ?? [];
  const buffer = sim.deviceLog(device.id).map((l) => `*${(l.at / 1000).toFixed(3)}s: ${l.text}`);
  return [
    'Syslog logging: enabled',
    `    Trap logging: level informational${hosts.length ? '' : ' (no logging host)'}`,
    ...hosts.map((h) => `        Logging to ${h}  (udp port 514)`),
    '',
    `Log Buffer (${buffer.length} messages):`,
    ...(buffer.length ? buffer : ['(no messages)']),
    ...(lines.length ? ['', 'Current protocol state (RailMPLS Lab derived, not timestamped):', ...lines] : []),
  ].join('\n');
}

// ---------------------------------------------------------------- running-config sections

/** Extra interface lines for Phase 3 features. */
export function interfaceLines(ic: InterfaceConfig | undefined): string[] {
  if (!ic) return [];
  const L: string[] = [];
  if (ic.speedMbps) L.push(` speed ${ic.speedMbps}`);
  if (ic.duplex && ic.duplex !== 'auto') L.push(` duplex ${ic.duplex}`);
  if (ic.channelGroup) L.push(` channel-group ${ic.channelGroup.id} mode ${ic.channelGroup.mode}`);
  if (ic.mtu) L.push(` ip mtu ${ic.mtu}`);
  for (const h of ic.helpers ?? []) L.push(` ip helper-address ${h}`);
  if (ic.aclIn) L.push(` ip access-group ${ic.aclIn} in`);
  if (ic.aclOut) L.push(` ip access-group ${ic.aclOut} out`);
  if (ic.natRole) L.push(` ip nat ${ic.natRole}`);
  if (ic.isisEnabled) L.push(' ip router isis');
  if (ic.mplsIp) L.push(' mpls ip');
  if (ic.teEnabled) L.push(' mpls traffic-eng tunnels');
  if (ic.teBackupPath) L.push(` mpls traffic-eng backup-path ${ic.teBackupPath}`);
  if (ic.rsvpBandwidth !== undefined) L.push(` ip rsvp bandwidth${ic.rsvpBandwidth === 'default' ? '' : ` ${ic.rsvpBandwidth}`}`);
  if (ic.l2Mtu) L.push(` mtu ${ic.l2Mtu}`);
  if (ic.xconnect)
    L.push('vfi' in ic.xconnect ? ` xconnect vfi ${ic.xconnect.vfi}` : ` xconnect ${ic.xconnect.peer} ${ic.xconnect.vcId} encapsulation mpls`);
  if (ic.isisMetric) L.push(` isis metric ${ic.isisMetric}`);
  if (ic.isisCircuitType && ic.isisCircuitType !== 'level-1-2') L.push(` isis circuit-type ${ic.isisCircuitType}`);
  if (ic.ospfCost) L.push(` ip ospf cost ${ic.ospfCost}`);
  if (ic.ospfHello) L.push(` ip ospf hello-interval ${ic.ospfHello}`);
  if (ic.ospfDead) L.push(` ip ospf dead-interval ${ic.ospfDead}`);
  if (ic.ospfPriority !== undefined) L.push(` ip ospf priority ${ic.ospfPriority}`);
  for (const f of ic.fhrp ?? []) {
    const c = f.protocol === 'hsrp' ? 'standby' : 'vrrp';
    if (f.ip) L.push(` ${c} ${f.group} ip ${f.ip}`);
    if (f.priority) L.push(` ${c} ${f.group} priority ${f.priority}`);
    if (f.preempt) L.push(` ${c} ${f.group} preempt`);
    for (const t of f.track) L.push(` ${c} ${f.group} track ${t.iface} decrement ${t.decrement}`);
  }
  if (ic.servicePolicyIn) L.push(` service-policy input ${ic.servicePolicyIn}`);
  if (ic.servicePolicyOut) L.push(` service-policy output ${ic.servicePolicyOut}`);
  return L;
}

/** Global sections placed before the interfaces. */
export function globalLinesBeforeInterfaces(cfg: NetConfig): string[] {
  const L: string[] = [];
  const m = cfg.mgmt;
  for (const [u, v] of Object.entries(m.users)) L.push(`username ${u}${v.privilege !== 1 ? ` privilege ${v.privilege}` : ''} secret <hidden>`);
  if (m.domainName) L.push(`ip domain-name ${m.domainName}`);
  if (!m.domainLookup) L.push('no ip domain-lookup');
  for (const n of m.nameServers) L.push(`ip name-server ${n}`);
  if (m.dnsServer) L.push('ip dns server');
  if (m.sshVersion) L.push(`ip ssh version ${m.sshVersion}`);
  if (L.length) L.push('!');
  for (const [n, v] of Object.entries(cfg.vrfs)) {
    L.push(`vrf definition ${n}`);
    if (v.description) L.push(` description ${v.description}`);
    if (v.rd) L.push(` rd ${v.rd}`);
    L.push(' !', ' address-family ipv4');
    for (const rt of v.exportRts) L.push(`  route-target export ${rt}`);
    for (const rt of v.importRts) L.push(`  route-target import ${rt}`);
    L.push(' exit-address-family', '!');
  }
  for (const [n, v] of Object.entries(cfg.vfis)) {
    L.push(`l2 vfi ${n} manual`);
    if (v.vpnId !== undefined) L.push(` vpn id ${v.vpnId}`);
    for (const nb of v.neighbors) L.push(` neighbor ${nb} encapsulation mpls`);
    L.push('!');
  }
  for (const [k, c] of Object.entries(cfg.e1Controllers)) {
    L.push(`controller E1 ${k}`);
    for (const [g, grp] of Object.entries(c.cemGroups)) L.push(` cem-group ${g} ${grp.unframed ? 'unframed' : `timeslots ${tsText(grp.timeslots)}`}`);
    if (c.shutdown) L.push(' shutdown');
    L.push('!');
  }
  for (const [k, c] of Object.entries(cfg.e1Controllers)) {
    if (!Object.keys(c.cemGroups).length) continue;
    L.push(`interface CEM${k}`, ' no ip address');
    for (const g of Object.keys(c.cemGroups)) {
      L.push(` cem ${g}`);
      const xc = c.xconnects[g];
      if (xc) L.push(`  xconnect ${xc.peer} ${xc.vcId} encapsulation mpls`);
    }
    L.push('!');
  }
  if (cfg.mpls.teTunnels) L.push('mpls traffic-eng tunnels', '!');
  if (cfg.sr?.enabled) {
    L.push('segment-routing mpls');
    if (cfg.sr.srgbBase !== 16000 || cfg.sr.srgbEnd !== 23999) L.push(` global-block ${cfg.sr.srgbBase} ${cfg.sr.srgbEnd}`);
    if (cfg.sr.prefixSids.length) {
      L.push(' !', ' connected-prefix-sid-map', '  address-family ipv4');
      for (const p of cfg.sr.prefixSids) L.push(`   ${p.prefix} index ${p.index} range 1`);
      L.push('  exit-address-family', ' !');
    }
    L.push('!');
  }
  for (const [n, t] of Object.entries(cfg.teTunnels)) {
    L.push(`interface ${n}`);
    if (t.description) L.push(` description ${t.description}`);
    L.push(t.unnumbered ? ` ip unnumbered ${longIfName(t.unnumbered)}` : ' no ip address');
    if (t.mode === 'mpls-te') L.push(' tunnel mode mpls traffic-eng');
    if (t.destination) L.push(` tunnel destination ${t.destination}`);
    if (t.autoroute) L.push(' tunnel mpls traffic-eng autoroute announce');
    if (t.bandwidthKbps) L.push(` tunnel mpls traffic-eng bandwidth ${t.bandwidthKbps}`);
    for (const o of [...t.pathOptions].sort((a, b) => a.pref - b.pref))
      L.push(` tunnel mpls traffic-eng path-option ${o.pref} ${o.kind === 'dynamic' ? 'dynamic' : `explicit name ${o.name}`}`);
    if (t.frr) L.push(' tunnel mpls traffic-eng fast-reroute');
    if (t.shutdown) L.push(' shutdown');
    L.push('!');
  }
  for (const [n, p] of Object.entries(cfg.explicitPaths)) {
    L.push(`ip explicit-path name ${n} enable`);
    for (const e of p.entries) L.push(` ${e.kind === 'next' ? 'next-address' : 'exclude-address'} ${e.address}`);
    L.push('!');
  }
  const mp = cfg.mpls;
  if (mp.ldpRouterId || mp.explicitNull || !mp.propagateTtl) {
    if (!mp.propagateTtl) L.push('no mpls ip propagate-ttl');
    if (mp.explicitNull) L.push('mpls ldp explicit-null');
    if (mp.ldpRouterId) L.push(`mpls ldp router-id ${longIfName(mp.ldpRouterId)} force`);
    L.push('!');
  }
  for (const r of cfg.dhcp.excluded) L.push(`ip dhcp excluded-address ${r.from}${r.to !== r.from ? ` ${r.to}` : ''}`);
  for (const [n, p] of Object.entries(cfg.dhcp.pools)) {
    L.push(`ip dhcp pool ${n}`);
    if (p.network) L.push(` network ${p.network} ${p.mask}`);
    if (p.defaultRouter) L.push(` default-router ${p.defaultRouter}`);
    if (p.dnsServer) L.push(` dns-server ${p.dnsServer}`);
    if (p.leaseDays !== 1) L.push(` lease ${p.leaseDays}`);
  }
  if (L.length) L.push('!');
  for (const [n, c] of Object.entries(cfg.qos.classMaps))
    L.push(
      `class-map ${c.matchAll ? 'match-all' : 'match-any'} ${n}`,
      ...(c.dscp.length ? [` match dscp ${c.dscp.map(dscpName).join(' ')}`] : []),
      ...((c.exp ?? []).length ? [` match mpls experimental topmost ${c.exp!.join(' ')}`] : []),
      '!',
    );
  for (const [n, p] of Object.entries(cfg.qos.policyMaps)) {
    L.push(`policy-map ${n}`);
    for (const c of p.classes) {
      L.push(` class ${c.name}`);
      if (c.priorityPercent) L.push(`  priority percent ${c.priorityPercent}`);
      if (c.bandwidthPercent) L.push(`  bandwidth percent ${c.bandwidthPercent}`);
      if (c.setDscp !== undefined) L.push(`  set dscp ${dscpName(c.setDscp)}`);
      if (c.setExpImposition !== undefined) L.push(`  set mpls experimental imposition ${c.setExpImposition}`);
      if (c.setExpTopmost !== undefined) L.push(`  set mpls experimental topmost ${c.setExpTopmost}`);
    }
    L.push('!');
  }
  return L;
}

/** Global sections placed after the interfaces. */
export function globalLinesAfterInterfaces(cfg: NetConfig): string[] {
  const L: string[] = [];
  const o = cfg.ospf;
  if (o) {
    L.push(`router ospf ${o.processId}`);
    if (o.routerId) L.push(` router-id ${o.routerId}`);
    if (o.referenceBandwidth !== 100) L.push(` auto-cost reference-bandwidth ${o.referenceBandwidth}`);
    for (const p of o.passive) L.push(` passive-interface ${longIfName(p)}`);
    for (const n of o.networks) L.push(` network ${n.address} ${n.wildcard} area ${n.area}`);
    if (o.redistributeStatic) L.push(' redistribute static subnets');
    if (o.defaultOriginate !== 'off') L.push(` default-information originate${o.defaultOriginate === 'always' ? ' always' : ''}`);
    if (o.ldpSync) L.push(' mpls ldp sync');
    if (o.ldpAutoconfig) L.push(' mpls ldp autoconfig');
    if (o.segmentRouting) L.push(' segment-routing mpls');
    if (o.frrPerPrefix) L.push(' fast-reroute per-prefix enable prefix-priority low');
    if (o.tiLfa) L.push(' fast-reroute per-prefix ti-lfa');
    if (o.teRouterId) L.push(` mpls traffic-eng router-id ${longIfName(o.teRouterId)}`);
    for (const a of o.teAreas ?? []) L.push(` mpls traffic-eng area ${a}`);
    L.push('!');
  }
  const b = cfg.bgp;
  if (b) {
    L.push(`router bgp ${b.asn}`);
    if (b.routerId) L.push(` bgp router-id ${b.routerId}`);
    L.push(' bgp log-neighbor-changes');
    if (b.noDefaultIpv4) L.push(' no bgp default ipv4-unicast');
    for (const [ip, n] of Object.entries(b.neighbors)) {
      L.push(` neighbor ${ip} remote-as ${n.remoteAs}`);
      if (n.description) L.push(` neighbor ${ip} description ${n.description}`);
      if (n.updateSource) L.push(` neighbor ${ip} update-source ${longIfName(n.updateSource)}`);
      if (n.ebgpMultihop) L.push(` neighbor ${ip} ebgp-multihop ${n.ebgpMultihop}`);
      if (n.shutdown) L.push(` neighbor ${ip} shutdown`);
    }
    const v4 = Object.entries(b.neighbors).filter(([, n]) => n.ipv4 !== undefined || n.rrClient || n.nextHopSelf);
    if (b.networks.length || b.redistributeConnected || b.redistributeStatic || v4.length) {
      L.push(' !', ' address-family ipv4');
      for (const n of b.networks) L.push(`  network ${n.prefix} mask ${n.mask}`);
      if (b.redistributeConnected) L.push('  redistribute connected');
      if (b.redistributeStatic) L.push('  redistribute static');
      for (const [ip, n] of v4) {
        if (n.ipv4 ?? !b.noDefaultIpv4) L.push(`  neighbor ${ip} activate`);
        if (n.rrClient) L.push(`  neighbor ${ip} route-reflector-client`);
        if (n.nextHopSelf) L.push(`  neighbor ${ip} next-hop-self`);
      }
      L.push(' exit-address-family');
    }
    const vpn = Object.entries(b.neighbors).filter(([, n]) => n.vpnv4);
    if (vpn.length) {
      L.push(' !', ' address-family vpnv4');
      for (const [ip, n] of vpn) {
        L.push(`  neighbor ${ip} activate`, `  neighbor ${ip} send-community extended`);
        if (n.rrClientVpnv4) L.push(`  neighbor ${ip} route-reflector-client`);
      }
      L.push(' exit-address-family');
    }
    for (const [v, c] of Object.entries(b.vrfs)) {
      L.push(' !', ` address-family ipv4 vrf ${v}`);
      for (const n of c.networks) L.push(`  network ${n.prefix} mask ${n.mask}`);
      if (c.redistributeConnected) L.push('  redistribute connected');
      if (c.redistributeStatic) L.push('  redistribute static');
      for (const [ip, n] of Object.entries(c.neighbors)) {
        L.push(`  neighbor ${ip} remote-as ${n.remoteAs}`);
        if (n.activate) L.push(`  neighbor ${ip} activate`);
      }
      L.push(' exit-address-family');
    }
    L.push('!');
  }
  const i = cfg.isis;
  if (i) {
    L.push(`router isis${i.tag ? ` ${i.tag}` : ''}`);
    if (i.net) L.push(` net ${i.net}`);
    if (i.isType !== 'level-1-2') L.push(` is-type ${i.isType}`);
    for (const p of i.passive) L.push(` passive-interface ${longIfName(p)}`);
    L.push('!');
  }
  const r = cfg.rip;
  if (r) {
    L.push('router rip');
    if (r.version === 2) L.push(' version 2');
    for (const p of r.passive) L.push(` passive-interface ${longIfName(p)}`);
    for (const n of r.networks) L.push(` network ${n}`);
    if (r.defaultOriginate) L.push(' default-information originate');
    L.push(r.autoSummary ? ' auto-summary' : ' no auto-summary', '!');
  }
  const m = cfg.mgmt;
  for (const [h, a] of Object.entries(m.hosts)) L.push(`ip host ${h} ${a}`);
  for (const h of m.loggingHosts) L.push(`logging host ${h}`);
  for (const [c, a] of Object.entries(m.snmpCommunities)) L.push(`snmp-server community ${c} ${a.toUpperCase()}`);
  if (m.snmpTraps) L.push('snmp-server enable traps');
  for (const t of m.snmpTrapHosts) L.push(`snmp-server host ${t.ip} version 2c ${t.community}`);
  if (m.ntpMaster) L.push(`ntp master ${m.ntpMaster}`);
  for (const s of m.ntpServers) L.push(`ntp server ${s}`);
  const v = m.vty;
  if (v.transport !== 'all' || v.login !== 'line' || v.passwordSet || v.accessClass) {
    L.push('line vty 0 4');
    if (v.accessClass) L.push(` access-class ${v.accessClass} in`);
    if (v.passwordSet) L.push(' password <hidden>');
    L.push(v.login === 'local' ? ' login local' : v.login === 'none' ? ' no login' : ' login');
    if (v.transport !== 'all') L.push(` transport input ${v.transport}`);
    L.push('!');
  }
  for (const st of cfg.nat.statics) L.push(`ip nat inside source static ${st.local} ${st.global}`);
  for (const r of cfg.nat.overload) L.push(`ip nat inside source list ${r.acl} interface ${longIfName(r.iface)} overload`);
  for (const [n, a] of Object.entries(cfg.acls)) {
    if (/^\d+$/.test(n)) for (const e of a.entries) L.push(`access-list ${n} ${formatAclEntry(a.kind, e)}`);
    else {
      L.push(`ip access-list ${a.kind} ${n}`);
      for (const e of a.entries) L.push(` ${formatAclEntry(a.kind, e)}`);
    }
  }
  return L;
}
