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
    L.push(`${pad(formatIpv4(n.neighborRid), 17)}${pad(n.neighborPriority, 5)}${pad(`${n.state}/${role}`, 17)}${pad('00:00:35', 12)}${pad(formatIpv4(n.neighborIp), 16)}${longIfName(n.iface)}`);
  }
  if (!sim.ospf.routerIds.has(device.id)) L.push('', '% OSPF is not running on this device.');
  return L.join('\n');
}

export function showOspfIntBrief(sim: Sim, device: Device): string {
  const ois = sim.ospf.interfaces.filter((o) => o.deviceId === device.id);
  const L = [`${pad('Interface', 11)}${pad('PID', 5)}${pad('Area', 12)}${pad('IP Address/Mask', 20)}${pad('Cost', 6)}${pad('State', 6)}Nbrs F/C`];
  const pid = sim.config(device.id)?.ospf?.processId ?? 1;
  for (const o of ois) {
    const state = o.passive ? 'DR' : o.neighbors === 0 ? 'DR' : o.role === 'DROTHER' ? 'DROTH' : o.role;
    L.push(`${pad(o.iface, 11)}${pad(pid, 5)}${pad(o.area, 12)}${pad(`${formatIpv4(o.ip)}/${o.prefixLen}`, 20)}${pad(o.cost, 6)}${pad(state, 6)}${o.fullNeighbors}/${o.neighbors}`);
  }
  return L.join('\n');
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
  const o = cfg.ospf;
  if (!o) return '*** IP Routing is NSF aware ***\n\n(No routing protocol is configured — only connected and static routes.)';
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
  const L = [`${pad('Pro', 4)}${pad('Inside global', 22)}${pad('Inside local', 22)}${pad('Outside local', 22)}Outside global`];
  for (const t of sim.natTranslations(device.id)) {
    const g = t.globalId !== undefined ? `${formatIpv4(t.insideGlobal)}:${t.globalId}` : formatIpv4(t.insideGlobal);
    const l = t.localId !== undefined ? `${formatIpv4(t.insideLocal)}:${t.localId}` : formatIpv4(t.insideLocal);
    const o = t.outside !== undefined ? `${formatIpv4(t.outside)}:${t.globalId}` : '---';
    L.push(`${pad(t.static ? '---' : 'icmp', 4)}${pad(g, 22)}${pad(l, 22)}${pad(o, 22)}${o}`);
  }
  return L.join('\n');
}

export function showNatStatistics(sim: Sim, device: Device, cfg: NetConfig): string {
  const all = sim.natTranslations(device.id);
  const inside = Object.entries(cfg.interfaces).filter(([, c]) => c.natRole === 'inside').map(([n]) => longIfName(n));
  const outside = Object.entries(cfg.interfaces).filter(([, c]) => c.natRole === 'outside').map(([n]) => longIfName(n));
  return [
    `Total active translations: ${all.length} (${all.filter((t) => t.static).length} static, ${all.filter((t) => !t.static).length} dynamic; ${all.filter((t) => !t.static).length} extended)`,
    `Outside interfaces:\n  ${outside.join(', ') || '(none)'}`,
    `Inside interfaces:\n  ${inside.join(', ') || '(none)'}`,
    ...cfg.nat.overload.map((o) => `-- Inside Source\n[Id: 1] access-list ${o.acl} interface ${longIfName(o.iface)} refcount ${all.filter((t) => !t.static).length}`),
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
  for (const b of sim.bindings(device.id)) L.push(`${pad(formatIpv4(b.ip), 18)}${pad(`01${ciscoMac(b.mac).replace(/\./g, '.')}`, 21)}${pad('(lease timers not simulated)', 26)}${pad('Automatic', 10)}Active`);
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
      ? ['                     P indicates configured to preempt.', '                     |', `${pad('Interface', 11)}${pad('Grp', 5)}${pad('Pri', 4)}${pad('P', 2)}${pad('State', 9)}${pad('Active', 16)}${pad('Standby', 16)}Virtual IP`]
      : [`${pad('Interface', 15)}${pad('Grp', 5)}${pad('Pri', 5)}${pad('Own', 5)}${pad('Pre', 5)}${pad('State', 8)}${pad('Master addr', 16)}Group addr`];
  for (const [k, entries] of sim.fhrp.byIface) {
    if (!k.startsWith(`${device.id}|`)) continue;
    for (const { group: g, member: m } of entries) {
      if (g.protocol !== proto) continue;
      const active = g.active ? (g.active === m ? 'local' : formatIpv4(g.active.ip)) : 'unknown';
      const standby = g.standby ? (g.standby === m ? 'local' : formatIpv4(g.standby.ip)) : 'unknown';
      const vip = g.vip !== undefined ? formatIpv4(g.vip) : 'unknown';
      if (proto === 'hsrp') L.push(`${pad(m.iface, 11)}${pad(g.group, 5)}${pad(m.priority, 4)}${pad(m.preempt ? 'P' : '', 2)}${pad(m.role, 9)}${pad(active, 16)}${pad(standby, 16)}${vip}`);
      else L.push(`${pad(m.iface, 15)}${pad(g.group, 5)}${pad(m.priority, 5)}${pad(m.configuredPriority === 255 ? 'Y' : 'N', 5)}${pad(m.preempt ? 'Y' : 'N', 5)}${pad(m.role, 8)}${pad(g.active ? formatIpv4(g.active.ip) : '-', 16)}${vip}`);
    }
  }
  return L.join('\n');
}

// ---------------------------------------------------------------- QoS

export function showClassMaps(cfg: NetConfig): string {
  const L: string[] = [];
  for (const [n, c] of Object.entries(cfg.qos.classMaps)) {
    L.push(` Class Map ${c.matchAll ? 'match-all' : 'match-any'} ${n} (id ${L.length + 1})`, `   Match dscp ${c.dscp.map(dscpName).join(' ') || '(none)'}`, '');
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
      L.push(`    Interface capacity ${q.capacityMbps} Mbit/s, offered ${q.offeredMbps.toFixed(2)} Mbit/s${q.offeredMbps > q.capacityMbps ? ' — CONGESTED' : ''}`, '');
      for (const c of q.classes) {
        const drop = Math.max(0, c.offeredMbps - c.deliveredMbps);
        L.push(`    Class-map: ${c.name} (${c.kind})`, `      offered ${c.offeredMbps.toFixed(2)} Mbit/s, sent ${c.deliveredMbps.toFixed(2)} Mbit/s, dropped ${drop.toFixed(2)} Mbit/s`, '');
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
    if (g.active) lines.push(`%${g.protocol.toUpperCase()}-5-STATECHANGE: group ${g.group} ${g.protocol === 'hsrp' ? 'Active' : 'Master'} is ${sim.device(g.active.deviceId)?.name} ${g.active.iface}`);
  }
  for (const p of sim.topology.devices.find((d) => d.id === device.id)?.ports ?? []) {
    if (sim.isErrDisabled(device.id, p.id)) lines.push(`%PM-4-ERR_DISABLE: psecure-violation error detected on ${longIfName(p.id)}, putting ${longIfName(p.id)} in err-disable state`);
  }
  return ['Syslog logging: enabled (RailMPLS Lab derived messages)', '', 'Log Buffer:', ...(lines.length ? lines : ['(no messages)'])].join('\n');
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
  for (const r of cfg.dhcp.excluded) L.push(`ip dhcp excluded-address ${r.from}${r.to !== r.from ? ` ${r.to}` : ''}`);
  for (const [n, p] of Object.entries(cfg.dhcp.pools)) {
    L.push(`ip dhcp pool ${n}`);
    if (p.network) L.push(` network ${p.network} ${p.mask}`);
    if (p.defaultRouter) L.push(` default-router ${p.defaultRouter}`);
    if (p.dnsServer) L.push(` dns-server ${p.dnsServer}`);
    if (p.leaseDays !== 1) L.push(` lease ${p.leaseDays}`);
  }
  if (L.length) L.push('!');
  for (const [n, c] of Object.entries(cfg.qos.classMaps)) L.push(`class-map ${c.matchAll ? 'match-all' : 'match-any'} ${n}`, ...(c.dscp.length ? [` match dscp ${c.dscp.map(dscpName).join(' ')}`] : []), '!');
  for (const [n, p] of Object.entries(cfg.qos.policyMaps)) {
    L.push(`policy-map ${n}`);
    for (const c of p.classes) {
      L.push(` class ${c.name}`);
      if (c.priorityPercent) L.push(`  priority percent ${c.priorityPercent}`);
      if (c.bandwidthPercent) L.push(`  bandwidth percent ${c.bandwidthPercent}`);
      if (c.setDscp !== undefined) L.push(`  set dscp ${dscpName(c.setDscp)}`);
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
