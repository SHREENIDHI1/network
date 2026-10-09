import type { Device } from '../../model/types';
import { effectivePort, isBridgeRole, isSubinterface, longIfName, roleOf, sviVlan, type NetConfig } from '../config/netConfig';
import { ciscoMac } from '../core/mac';
import { formatBridgeId } from '../ethernet/stp';
import { formatIpv4, prefixToMask } from '../ip/ipv4';
import { routesPackets } from '../ip/routing';
import { portKey } from '../physical/linkState';
import type { ProbeSession, Sim } from '../sim';
import { globalLinesAfterInterfaces, globalLinesBeforeInterfaces, interfaceLines } from './format3';

/**
 * Text renderers for IOS-style "show" output. Layout follows Cisco IOS closely
 * enough to teach reading real output; it is not byte-identical.
 */

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);

/** "1,10,20-22" style VLAN list. */
export function formatVlanList(v: number[] | 'all'): string {
  if (v === 'all') return '1-4094';
  if (!v.length) return 'none';
  const s = [...new Set(v)].sort((a, b) => a - b);
  const out: string[] = [];
  let start = s[0];
  let prev = s[0];
  for (const x of [...s.slice(1), Infinity]) {
    if (x === prev + 1) {
      prev = x;
      continue;
    }
    out.push(start === prev ? `${start}` : prev === start + 1 ? `${start},${prev}` : `${start}-${prev}`);
    start = prev = x;
  }
  return out.join(',');
}

/** Parses "10,20,30-32" to numbers; null if invalid. */
export function parseVlanList(s: string): number[] | null {
  const out: number[] = [];
  for (const part of s.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b > 4094 || a > b) return null;
    for (let i = a; i <= b; i++) out.push(i);
  }
  return out;
}

function sortedIfNames(device: Device, cfg: NetConfig): string[] {
  const phys = device.ports.map((p) => p.id);
  const subs = Object.keys(cfg.interfaces).filter(isSubinterface).sort();
  const svis = Object.keys(cfg.interfaces)
    .filter((n) => sviVlan(n) !== null)
    .sort((a, b) => sviVlan(a)! - sviVlan(b)!);
  const ordered: string[] = [];
  for (const p of phys) {
    ordered.push(p);
    for (const s of subs) if (s.startsWith(`${p}.`)) ordered.push(s);
  }
  return [...ordered, ...svis];
}

// ---------------------------------------------------------------------------
// running-config
// ---------------------------------------------------------------------------

export function runningConfig(device: Device, cfg: NetConfig, header = 'Current configuration'): string {
  const role = roleOf(device.kind);
  const L: string[] = ['Building configuration...', '', `${header}:`, '!', `hostname ${device.name}`, '!'];
  if (role === 'l3switch' && cfg.ipRouting) L.push('ip routing', '!');
  if (role === 'router' && !cfg.ipRouting) L.push('no ip routing', '!');
  if (isBridgeRole(role)) {
    L.push('spanning-tree mode rapid-pvst');
    if (cfg.stpPriority !== 32768) L.push(`spanning-tree vlan 1-4094 priority ${cfg.stpPriority}`);
    L.push('!');
    for (const id of Object.keys(cfg.vlans).map(Number).sort((a, b) => a - b)) {
      if (id === 1) continue;
      L.push(`vlan ${id}`, ` name ${cfg.vlans[String(id)].name}`, '!');
    }
  }
  L.push(...globalLinesBeforeInterfaces(cfg));
  for (const name of sortedIfNames(device, cfg)) {
    const ic = cfg.interfaces[name];
    const isSvi = sviVlan(name) !== null;
    const isSub = isSubinterface(name);
    const eff = isSvi || isSub ? { ...ic, shutdown: ic?.shutdown ?? isSvi, switchport: false } : effectivePort(role, ic);
    L.push(`interface ${longIfName(name)}`);
    if (ic?.description) L.push(` description ${ic.description}`);
    if (isSub && ic?.encapsulation) L.push(` encapsulation dot1Q ${ic.encapsulation.vlan}${ic.encapsulation.native ? ' native' : ''}`);
    if (isBridgeRole(role) && !isSvi) {
      if (!eff.switchport) L.push(' no switchport');
      else {
        if (eff.mode === 'access' && eff.accessVlan !== 1) L.push(` switchport access vlan ${eff.accessVlan}`);
        if (eff.mode === 'trunk') {
          if (eff.nativeVlan !== 1) L.push(` switchport trunk native vlan ${eff.nativeVlan}`);
          if (eff.trunkAllowed !== 'all') L.push(` switchport trunk allowed vlan ${formatVlanList(eff.trunkAllowed ?? [])}`);
          L.push(' switchport mode trunk');
        } else if (ic?.mode === 'access') L.push(' switchport mode access');
        if (ic?.portSecurity?.enabled) {
          if (ic.portSecurity.maximum !== 1) L.push(` switchport port-security maximum ${ic.portSecurity.maximum}`);
          if (ic.portSecurity.violation !== 'shutdown') L.push(` switchport port-security violation ${ic.portSecurity.violation}`);
          L.push(' switchport port-security');
        }
      }
    }
    if (!eff.switchport) {
      if (ic?.ip) L.push(` ip address ${ic.ip.address} ${ic.ip.mask}`);
      else if (role !== 'host') L.push(' no ip address');
    }
    L.push(...interfaceLines(ic));
    if (eff.shutdown) L.push(' shutdown');
    L.push('!');
  }
  L.push(...globalLinesAfterInterfaces(cfg));
  for (const r of cfg.staticRoutes) {
    L.push(`ip route ${r.prefix} ${r.mask}${r.exitInterface ? ` ${longIfName(r.exitInterface)}` : ''}${r.nextHop ? ` ${r.nextHop}` : ''}${r.distance ? ` ${r.distance}` : ''}`);
  }
  if (cfg.defaultGateway) L.push(`ip default-gateway ${cfg.defaultGateway}`);
  L.push('!', 'end');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// show ip interface brief / interfaces
// ---------------------------------------------------------------------------

function portStatusText(sim: Sim, deviceId: string, port: string): { status: string; protocol: string } {
  const st = sim.phys.ports.get(portKey(deviceId, port));
  if (!st?.adminUp) return { status: 'administratively down', protocol: 'down' };
  if (st.operUp) return { status: 'up', protocol: 'up' };
  return { status: 'down', protocol: 'down' };
}

export function showIpIntBrief(sim: Sim, device: Device): string {
  const cfg = sim.config(device.id)!;
  const ifs = sim.interfaces(device.id);
  const L = [`${pad('Interface', 23)}${pad('IP-Address', 16)}OK? Method ${pad('Status', 22)}Protocol`];
  for (const name of sortedIfNames(device, cfg)) {
    const l3 = ifs.find((i) => i.name === name);
    let status: string;
    let protocol: string;
    if (l3 && (l3.kind !== 'port' || !device.ports.some((p) => p.id === name))) {
      status = !l3.adminUp ? 'administratively down' : l3.up ? 'up' : 'down';
      protocol = l3.up ? 'up' : 'down';
    } else {
      ({ status, protocol } = portStatusText(sim, device.id, name));
    }
    const ip = l3?.ip !== undefined ? formatIpv4(l3.ip) : 'unassigned';
    const method = l3?.ip !== undefined ? 'manual' : 'unset ';
    L.push(`${pad(longIfName(name), 23)}${pad(ip, 16)}YES ${method} ${pad(status, 22)}${protocol}`);
  }
  return L.join('\n');
}

export function showInterface(sim: Sim, device: Device, name: string): string {
  const role = roleOf(device.kind);
  const l3 = sim.interfaces(device.id).find((i) => i.name === name);
  const port = device.ports.find((p) => p.id === name);
  const cfg = sim.config(device.id)!;
  const ic = cfg.interfaces[name];
  const L: string[] = [];
  if (port) {
    const st = sim.phys.ports.get(portKey(device.id, name))!;
    const ed = sim.isErrDisabled(device.id, name);
    const status = !st.adminUp ? 'administratively down' : st.operUp ? 'up' : 'down';
    const extra = ed ? ' (err-disabled)' : isBridgeRole(role) && effectivePort(role, ic).switchport ? (st.operUp ? ' (connected)' : ' (notconnect)') : '';
    L.push(`${longIfName(name)} is ${status}, line protocol is ${st.operUp ? 'up' : 'down'}${extra}`);
    const idx = device.ports.indexOf(port);
    const mac = l3?.mac ?? `02:00:00:00:00:${idx.toString(16).padStart(2, '0')}`;
    L.push(`  Hardware is ${port.kind === 'sfp' ? 'SFP Ethernet' : 'Gigabit Ethernet'}, address is ${ciscoMac(mac)} (bia ${ciscoMac(mac)})`);
    if (ic?.description) L.push(`  Description: ${ic.description}`);
    if (l3?.ip !== undefined) L.push(`  Internet address is ${formatIpv4(l3.ip)}/${l3.prefixLen}`);
    const bw = (st.speedGbps || 1) * 1_000_000;
    L.push(`  MTU 1500 bytes, BW ${bw} Kbit/sec, DLY 10 usec`);
    if (st.operUp) L.push(`  Full-duplex, ${st.speedGbps >= 1 ? `${st.speedGbps}Gb/s` : '100Mb/s'}`);
    else if (st.reason) L.push(`  Down reason: ${st.reason}`);
    const c = sim.portCounters(device.id, name);
    L.push(`     ${c.rx} packets input, ${c.tx} packets output, ${c.drops} drops`);
  } else if (l3) {
    L.push(`${longIfName(name)} is ${!l3.adminUp ? 'administratively down' : l3.up ? 'up' : 'down'}, line protocol is ${l3.up ? 'up' : 'down'}`);
    L.push(`  Hardware is ${l3.kind === 'svi' ? 'Ethernet SVI' : 'Gigabit Ethernet subinterface'}, address is ${ciscoMac(l3.mac)}`);
    if (ic?.description) L.push(`  Description: ${ic.description}`);
    if (l3.ip !== undefined) L.push(`  Internet address is ${formatIpv4(l3.ip)}/${l3.prefixLen}`);
    if (l3.kind === 'sub') L.push(`  Encapsulation 802.1Q Virtual LAN, Vlan ID  ${l3.vlan ?? '-'}${l3.native ? ' (native)' : ''}.`);
    if (!l3.up && l3.reason) L.push(`  Down reason: ${l3.reason}`);
  } else return `% Invalid interface ${name}`;
  return L.join('\n');
}

export function showInterfacesStatus(sim: Sim, device: Device): string {
  const role = roleOf(device.kind);
  const cfg = sim.config(device.id)!;
  const L = [`${pad('Port', 10)}${pad('Name', 19)}${pad('Status', 13)}${pad('Vlan', 11)}${pad('Duplex', 7)}${pad('Speed', 7)}Type`];
  for (const p of device.ports) {
    const ic = cfg.interfaces[p.id];
    const eff = effectivePort(role, ic);
    const st = sim.phys.ports.get(portKey(device.id, p.id))!;
    const status = sim.isErrDisabled(device.id, p.id) ? 'err-disabled' : !st.adminUp ? 'disabled' : st.operUp ? 'connected' : 'notconnect';
    const vlan = !eff.switchport ? 'routed' : eff.mode === 'trunk' ? 'trunk' : String(eff.accessVlan);
    const speed = st.operUp ? (st.speedGbps >= 1 ? `a-${st.speedGbps}G` : 'a-100') : 'auto';
    L.push(`${pad(p.name, 10)}${pad((ic?.description ?? '').slice(0, 18), 19)}${pad(status, 13)}${pad(vlan, 11)}${pad(st.operUp ? 'a-full' : 'auto', 7)}${pad(speed, 7)}${p.kind === 'sfp' ? 'SFP' : '10/100/1000BaseTX'}`);
  }
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// VLAN / MAC / trunk / port-security / STP
// ---------------------------------------------------------------------------

export function showVlanBrief(sim: Sim, device: Device): string {
  const role = roleOf(device.kind);
  const cfg = sim.config(device.id)!;
  const L = [`${pad('VLAN', 5)}${pad('Name', 33)}${pad('Status', 10)}Ports`, `${'-'.repeat(4)} ${'-'.repeat(32)} ${'-'.repeat(9)} ${'-'.repeat(31)}`];
  for (const id of Object.keys(cfg.vlans).map(Number).sort((a, b) => a - b)) {
    const ports = device.ports
      .filter((p) => {
        const e = effectivePort(role, cfg.interfaces[p.id]);
        return e.switchport && e.mode === 'access' && e.accessVlan === id;
      })
      .map((p) => p.name);
    const chunks: string[] = [];
    for (let i = 0; i < ports.length; i += 4) chunks.push(ports.slice(i, i + 4).join(', '));
    L.push(`${pad(id, 5)}${pad(cfg.vlans[String(id)].name, 33)}${pad('active', 10)}${chunks[0] ?? ''}`);
    for (const c of chunks.slice(1)) L.push(`${' '.repeat(48)}${c}`);
  }
  // Access ports assigned to VLANs that do not exist are inactive.
  const missing = new Set<number>();
  for (const p of device.ports) {
    const e = effectivePort(role, cfg.interfaces[p.id]);
    if (e.switchport && e.mode === 'access' && !cfg.vlans[String(e.accessVlan)]) missing.add(e.accessVlan!);
  }
  if (missing.size) L.push('', `Note: access ports in VLAN(s) ${[...missing].join(', ')} are inactive (VLAN not created).`);
  return L.join('\n');
}

export function showMacTable(sim: Sim, device: Device): string {
  const rows = sim.macTable(device.id);
  const L = ['          Mac Address Table', '-------------------------------------------', '', `${pad('Vlan', 8)}${pad('Mac Address', 18)}${pad('Type', 12)}Ports`, `${pad('----', 8)}${pad('-----------', 18)}${pad('--------', 12)}-----`];
  for (const r of rows) L.push(`${lpad(r.vlan, 4)}    ${pad(ciscoMac(r.mac), 18)}${pad(r.type, 12)}${r.port}`);
  L.push(`Total Mac Addresses for this criterion: ${rows.length}`);
  return L.join('\n');
}

export function showTrunks(sim: Sim, device: Device): string {
  const role = roleOf(device.kind);
  const cfg = sim.config(device.id)!;
  const trunks = device.ports.filter((p) => {
    const e = effectivePort(role, cfg.interfaces[p.id]);
    return e.switchport && e.mode === 'trunk' && sim.phys.ports.get(portKey(device.id, p.id))?.operUp;
  });
  if (!trunks.length) return '';
  const allowed = (p: string) => effectivePort(role, cfg.interfaces[p]).trunkAllowed ?? 'all';
  const active = (p: string) => {
    const a = allowed(p);
    const ids = Object.keys(cfg.vlans).map(Number);
    return a === 'all' ? ids : a.filter((v) => ids.includes(v));
  };
  const L = [`${pad('Port', 12)}${pad('Mode', 13)}${pad('Encapsulation', 15)}${pad('Status', 14)}Native vlan`];
  for (const p of trunks) L.push(`${pad(p.name, 12)}${pad('on', 13)}${pad('802.1q', 15)}${pad('trunking', 14)}${effectivePort(role, cfg.interfaces[p.id]).nativeVlan}`);
  L.push('', `${pad('Port', 12)}Vlans allowed on trunk`);
  for (const p of trunks) L.push(`${pad(p.name, 12)}${formatVlanList(allowed(p.id))}`);
  L.push('', `${pad('Port', 12)}Vlans allowed and active in management domain`);
  for (const p of trunks) L.push(`${pad(p.name, 12)}${formatVlanList(active(p.id))}`);
  L.push('', `${pad('Port', 12)}Vlans in spanning tree forwarding state and not pruned`);
  for (const p of trunks) {
    const fwd = sim.stp.ports.get(portKey(device.id, p.id))?.state === 'forwarding';
    L.push(`${pad(p.name, 12)}${fwd ? formatVlanList(active(p.id)) : 'none'}`);
  }
  return L.join('\n');
}

export function showPortSecurity(sim: Sim, device: Device, port?: string): string {
  const cfg = sim.config(device.id)!;
  if (port) {
    const ps = cfg.interfaces[port]?.portSecurity;
    const ed = sim.isErrDisabled(device.id, port);
    return [
      `Port Security              : ${ps?.enabled ? 'Enabled' : 'Disabled'}`,
      `Port Status                : ${!ps?.enabled ? 'Secure-down' : ed ? 'Secure-shutdown' : 'Secure-up'}`,
      `Violation Mode             : ${ps ? ps.violation[0].toUpperCase() + ps.violation.slice(1) : 'Shutdown'}`,
      `Maximum MAC Addresses      : ${ps?.maximum ?? 1}`,
      `Total MAC Addresses        : ${sim.secureMacs(device.id, port).length}`,
      `Last Source Address:Vlan   : ${sim.secureMacs(device.id, port).at(-1) ? ciscoMac(sim.secureMacs(device.id, port).at(-1)!) : '0000.0000.0000'}`,
      `Security Violation Count   : ${sim.violationCount(device.id, port)}`,
    ].join('\n');
  }
  const L = [
    `Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action`,
    `                (Count)       (Count)          (Count)`,
    '---------------------------------------------------------------------------',
  ];
  for (const p of device.ports) {
    const ps = cfg.interfaces[p.id]?.portSecurity;
    if (!ps?.enabled) continue;
    L.push(`${lpad(p.name, 11)}${lpad(ps.maximum, 15)}${lpad(sim.secureMacs(device.id, p.id).length, 13)}${lpad(sim.violationCount(device.id, p.id), 19)}         ${ps.violation[0].toUpperCase() + ps.violation.slice(1)}`);
  }
  L.push('---------------------------------------------------------------------------');
  return L.join('\n');
}

const STP_ROLE: Record<string, string> = { root: 'Root', designated: 'Desg', alternate: 'Altn', disabled: 'Disa' };

export function showSpanningTree(sim: Sim, device: Device): string {
  const br = sim.stp.bridges.get(device.id);
  if (!br) return '% Spanning tree is not running on this device';
  const ports = [...sim.stp.ports.values()].filter((p) => p.deviceId === device.id && p.role !== 'disabled');
  const rootPort = br.rootPortId ? ports.find((p) => p.portId === br.rootPortId) : undefined;
  const L = [
    'Spanning tree instance 0 (common to all VLANs in RailMPLS Lab)',
    '  Spanning tree enabled protocol rstp',
    `  Root ID    Priority    ${br.rootId.priority}`,
    `             Address     ${ciscoMac(br.rootId.mac)}`,
    br.isRoot ? '             This bridge is the root' : `             Cost        ${br.rootCost}`,
    ...(br.isRoot ? [] : [`             Port        ${rootPort?.portNumber ?? '-'} (${longIfName(br.rootPortId ?? '')})`]),
    '             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec',
    '',
    `  Bridge ID  Priority    ${br.bridgeId.priority}`,
    `             Address     ${ciscoMac(br.bridgeId.mac)}`,
    '',
    `${pad('Interface', 20)}${pad('Role', 5)}${pad('Sts', 4)}${pad('Cost', 10)}${pad('Prio.Nbr', 9)}Type`,
    `${'-'.repeat(19)} ---- --- --------- -------- --------------------------------`,
  ];
  for (const p of ports) {
    L.push(`${pad(p.portId, 20)}${pad(STP_ROLE[p.role], 5)}${pad(p.state === 'forwarding' ? 'FWD' : 'BLK', 4)}${pad(p.cost, 10)}${pad(`${p.portPriority}.${p.portNumber}`, 9)}P2p${p.edge ? ' Edge' : ''}`);
  }
  L.push('', `(Bridge ID ${formatBridgeId(br.bridgeId)})`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Routing / ARP
// ---------------------------------------------------------------------------

function classfulLen(net: number): number {
  const first = net >>> 24;
  return first < 128 ? 8 : first < 192 ? 16 : 24;
}

export function showIpRoute(sim: Sim, device: Device): string {
  const cfg = sim.config(device.id)!;
  const table = sim.routingTable(device.id);
  if (!routesPackets(device.kind, cfg)) {
    const gw = table.find((r) => r.isGateway);
    return [`Default gateway is ${gw ? formatIpv4(gw.nextHop!) : cfg.defaultGateway ?? 'not set'}`, '', 'Host               Gateway           Last Use    Total Uses  Interface', 'ICMP redirect cache is empty'].join('\n');
  }
  const L = [
    'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
    '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
    '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
    '       E1 - OSPF external type 1, E2 - OSPF external type 2',
    '       i - IS-IS, su - IS-IS summary, L1 - IS-IS level-1, L2 - IS-IS level-2',
    '       * - candidate default, U - per-user static route, o - ODR',
    '',
  ];
  const def = table.find((r) => r.prefixLen === 0);
  L.push(def ? `Gateway of last resort is ${def.nextHop !== undefined ? formatIpv4(def.nextHop) : 'directly connected'} to network 0.0.0.0` : 'Gateway of last resort is not set', '');
  const line = (r: (typeof table)[number], indent: string) => {
    const star = r.prefixLen === 0 ? '*' : '';
    const code = r.protocol === 'O E2' ? `O${star}E2` : `${r.protocol}${star}`;
    const head = code.length < indent.length ? `${code}${indent.slice(code.length)}` : `${code} `;
    const pfx = `${formatIpv4(r.network)}/${r.prefixLen}`;
    if (r.protocol === 'C' || r.protocol === 'L') return `${head}${pfx} is directly connected, ${longIfName(r.iface!)}`;
    if (r.paths && r.paths.length) {
      const first = `${head}${pfx} [${r.ad}/${r.metric}] via ${formatIpv4(r.paths[0].nextHop)}, ${longIfName(r.paths[0].iface)}`;
      const more = r.paths.slice(1).map((p) => `${' '.repeat(head.length + pfx.length + 1)}[${r.ad}/${r.metric}] via ${formatIpv4(p.nextHop)}, ${longIfName(p.iface)}`);
      return [first, ...more].join('\n');
    }
    const via = r.nextHop !== undefined ? `via ${formatIpv4(r.nextHop)}` : 'is directly connected';
    return `${head}${pfx} [${r.ad}/${r.metric}] ${via}${r.iface && r.nextHop === undefined ? `, ${longIfName(r.iface)}` : ''}`;
  };
  // Group by classful major network, as IOS does.
  const groups = new Map<string, typeof table>();
  const top: typeof table = [];
  for (const r of table) {
    const cl = classfulLen(r.network);
    if (r.prefixLen <= cl) top.push(r);
    else {
      const major = `${formatIpv4((r.network & (0xffffffff << (32 - cl))) >>> 0)}/${cl}`;
      groups.set(major, [...(groups.get(major) ?? []), r]);
    }
  }
  for (const r of top) L.push(line(r, '      '));
  for (const [major, rs] of groups) {
    const masks = new Set(rs.map((r) => r.prefixLen));
    L.push(masks.size === 1 ? `      ${major.split('/')[0]}/${[...masks][0]} is subnetted, ${rs.length} subnets` : `      ${major} is variably subnetted, ${rs.length} subnets, ${masks.size} masks`);
    for (const r of rs) L.push(line(r, '         '));
  }
  return L.join('\n');
}

export function showArp(sim: Sim, device: Device): string {
  const L = [`${pad('Protocol', 10)}${pad('Address', 17)}${pad('Age (min)', 11)}${pad('Hardware Addr', 16)}${pad('Type', 7)}Interface`];
  const rows: Array<[number, string, string, string]> = [];
  for (const i of sim.interfaces(device.id)) if (i.ip !== undefined && i.up) rows.push([i.ip, '-', i.mac, i.name]);
  for (const a of sim.arpTable(device.id)) rows.push([a.ip, String(Math.floor(a.ageMs / 60000)), a.mac, a.iface]);
  rows.sort((a, b) => a[0] - b[0]);
  for (const [ip, age, mac, ifn] of rows) L.push(`${pad('Internet', 10)}${pad(formatIpv4(ip), 17)}${lpad(age, 9)}  ${pad(ciscoMac(mac), 16)}${pad('ARPA', 7)}${longIfName(ifn)}`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// ping / traceroute output
// ---------------------------------------------------------------------------

const ms = (x?: number) => Math.max(1, Math.ceil(x ?? 0));

export function iosPingOutput(s: ProbeSession): string {
  const L = ['Type escape sequence to abort.', `Sending ${s.count}, ${s.sizeBytes}-byte ICMP Echos to ${formatIpv4(s.dst)}, timeout is ${s.timeoutMs / 1000} seconds:`];
  if (s.error) return [...L, `% ${s.error}`].join('\n');
  const sym = s.probes.map((p) => (p.outcome === 'reply' ? '!' : p.outcome === 'unreachable' ? 'U' : p.outcome === 'ttl-exceeded' ? '&' : '.')).join('');
  L.push(sym);
  const ok = s.probes.filter((p) => p.outcome === 'reply');
  const pct = Math.round((ok.length / Math.max(1, s.count)) * 100);
  if (ok.length) {
    const r = ok.map((p) => ms(p.rttMs));
    L.push(`Success rate is ${pct} percent (${ok.length}/${s.count}), round-trip min/avg/max = ${Math.min(...r)}/${Math.round(r.reduce((a, b) => a + b, 0) / r.length)}/${Math.max(...r)} ms`);
  } else L.push(`Success rate is 0 percent (0/${s.count})`);
  return L.join('\n');
}

export function iosTraceOutput(s: ProbeSession): string {
  const L = ['Type escape sequence to abort.', `Tracing the route to ${formatIpv4(s.dst)}`, ''];
  if (s.error) return [...L, `% ${s.error}`].join('\n');
  for (let h = 0; h * s.probesPerHop < s.probes.length; h++) {
    const ps = s.probes.slice(h * s.probesPerHop, (h + 1) * s.probesPerHop);
    const from = ps.find((p) => p.from !== undefined)?.from;
    const cells = ps.map((p) => (p.outcome === 'timeout' || p.outcome === 'no-route' || p.outcome === 'pending' ? '*' : p.outcome === 'unreachable' ? `${ms(p.rttMs)} msec !${p.code === 'host-unreachable' ? 'H' : p.code === 'admin-prohibited' ? 'A' : 'N'}` : `${ms(p.rttMs)} msec`));
    L.push(`${lpad(h + 1, 3)} ${from !== undefined ? `${formatIpv4(from)} ` : ''}${cells.join(' ')}`);
  }
  return L.join('\n');
}

export function windowsPingOutput(s: ProbeSession): string {
  const L = ['', `Pinging ${formatIpv4(s.dst)} with ${s.sizeBytes} bytes of data:`];
  if (s.error) return [...L, s.error].join('\n');
  for (const p of s.probes) {
    if (p.outcome === 'reply') L.push(`Reply from ${formatIpv4(p.from!)}: bytes=${s.sizeBytes} time${(p.rttMs ?? 0) < 1 ? '<1ms' : `=${Math.round(p.rttMs!)}ms`} TTL=${p.replyTtl ?? 128}`);
    else if (p.outcome === 'unreachable') L.push(`Reply from ${formatIpv4(p.from!)}: Destination ${p.code === 'host-unreachable' ? 'host' : 'net'} unreachable.`);
    else if (p.outcome === 'ttl-exceeded') L.push(`Reply from ${formatIpv4(p.from!)}: TTL expired in transit.`);
    else if (p.outcome === 'no-route') L.push('PING: transmit failed. General failure.');
    else L.push('Request timed out.');
  }
  const recv = s.probes.filter((p) => p.outcome === 'reply' || p.outcome === 'unreachable' || p.outcome === 'ttl-exceeded').length;
  L.push('', `Ping statistics for ${formatIpv4(s.dst)}:`, `    Packets: Sent = ${s.count}, Received = ${recv}, Lost = ${s.count - recv} (${Math.round(((s.count - recv) / s.count) * 100)}% loss),`);
  const ok = s.probes.filter((p) => p.outcome === 'reply').map((p) => Math.round(p.rttMs ?? 0));
  if (ok.length) L.push('Approximate round trip times in milli-seconds:', `    Minimum = ${Math.min(...ok)}ms, Maximum = ${Math.max(...ok)}ms, Average = ${Math.round(ok.reduce((a, b) => a + b, 0) / ok.length)}ms`);
  return L.join('\n');
}

export function windowsTraceOutput(s: ProbeSession): string {
  const L = ['', `Tracing route to ${formatIpv4(s.dst)} over a maximum of ${s.maxTtl} hops`, ''];
  if (s.error) return [...L, s.error].join('\n');
  for (let h = 0; h * s.probesPerHop < s.probes.length; h++) {
    const ps = s.probes.slice(h * s.probesPerHop, (h + 1) * s.probesPerHop);
    const from = ps.find((p) => p.from !== undefined)?.from;
    const cells = ps.map((p) => (p.outcome === 'reply' || p.outcome === 'ttl-exceeded' || p.outcome === 'unreachable' ? lpad((p.rttMs ?? 0) < 1 ? '<1 ms' : `${Math.round(p.rttMs!)} ms`, 8) : lpad('*', 8)));
    L.push(`${lpad(h + 1, 3)} ${cells.join(' ')}  ${from !== undefined ? formatIpv4(from) : 'Request timed out.'}`);
  }
  L.push('', 'Trace complete.');
  return L.join('\n');
}

export { prefixToMask };
