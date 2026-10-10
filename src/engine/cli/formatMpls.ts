import type { Device } from '../../model/types';
import { longIfName, type NetConfig } from '../config/netConfig';
import { formatIpv4 } from '../ip/ipv4';
import { LABEL_EXPLICIT_NULL, LABEL_IMPLICIT_NULL, remoteBindings } from '../mpls/ldp';
import type { LspSession, Sim } from '../sim';

/**
 * show output for MPLS / LDP (P4). Only state the engine computes is shown:
 * no message counters, uptimes, ephemeral TCP ports or LIB revision numbers.
 */

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const ms = (x?: number) => Math.max(1, Math.ceil(x ?? 0));
const NOT_RUNNING = '% MPLS is not enabled on this device (no interface has "mpls ip").';

export const labelText = (l: number) => (l === LABEL_IMPLICIT_NULL ? 'imp-null' : l === LABEL_EXPLICIT_NULL ? 'exp-null' : String(l));
const ident = (sim: Sim, id: string) => `${formatIpv4(sim.ldp.routers.get(id)!.routerId)}:0`;

export function showMplsInterfaces(sim: Sim, device: Device, cfg: NetConfig): string {
  const configured = Object.entries(cfg.interfaces)
    .filter(([, c]) => c.mplsIp)
    .map(([n]) => n);
  const r = sim.ldp.routers.get(device.id);
  const names = [...new Set([...configured, ...(r?.mplsIfaces ?? [])])].sort();
  if (!names.length) return NOT_RUNNING;
  const L = [`${pad('Interface', 25)}${pad('IP', 14)}${pad('Tunnel', 9)}${pad('BGP', 4)}${pad('Static', 7)}Operational`];
  for (const n of names)
    L.push(
      `${pad(longIfName(n), 25)}${pad('Yes (ldp)', 14)}${pad('No', 9)}${pad('No', 4)}${pad('No', 7)}${r?.mplsIfaces.includes(n) ? 'Yes' : 'No'}`,
    );
  return L.join('\n');
}

export function showLdpNeighbor(sim: Sim, device: Device): string {
  const me = sim.ldp.routers.get(device.id);
  if (!me) return NOT_RUNNING;
  const L: string[] = [];
  const down: string[] = [];
  for (const s of sim.ldp.sessions) {
    if (s.a !== device.id && s.b !== device.id) continue;
    const peer = s.a === device.id ? s.b : s.a;
    if (s.state !== 'OPERATIONAL') {
      down.push(`  ${sim.device(peer)?.name ?? peer} (${ident(sim, peer)}): ${s.reason}`);
      continue;
    }
    L.push(`    Peer LDP Ident: ${ident(sim, peer)}; Local LDP Ident ${ident(sim, device.id)}`);
    L.push(`        TCP connection: ${formatIpv4(sim.ldp.routers.get(peer)!.routerId)}.646 - ${formatIpv4(me.routerId)}`);
    L.push('        State: Oper; Downstream');
    L.push('        LDP discovery sources:');
    for (const d of sim.ldp.discoveries.filter((x) => x.deviceId === device.id && x.neighborDeviceId === peer))
      L.push(`          ${longIfName(d.iface)}, Src IP addr: ${formatIpv4(d.neighborIp)}`);
    L.push('        Addresses bound to peer LDP Ident:');
    const addrs = sim
      .interfaces(peer)
      .filter((i) => i.up && i.ip !== undefined)
      .map((i) => formatIpv4(i.ip!));
    for (let i = 0; i < addrs.length; i += 3)
      L.push(
        `          ${addrs
          .slice(i, i + 3)
          .map((a) => pad(a, 16))
          .join('')}`.trimEnd(),
      );
  }
  if (!L.length) L.push('(no LDP session is operational)');
  if (down.length) L.push('', 'RailMPLS Lab note — hellos seen but no session:', ...down);
  return L.join('\n');
}

export function showLdpDiscovery(sim: Sim, device: Device): string {
  const me = sim.ldp.routers.get(device.id);
  if (!me) return NOT_RUNNING;
  const L = [' Local LDP Identifier:', `    ${ident(sim, device.id)}`, '    Discovery Sources:', '    Interfaces:'];
  for (const iface of me.mplsIfaces) {
    const ds = sim.ldp.discoveries.filter((d) => d.deviceId === device.id && d.iface === iface);
    L.push(`        ${longIfName(iface)} (ldp): ${ds.length ? 'xmit/recv' : 'xmit'}`);
    for (const d of ds) L.push(`            LDP Id: ${ident(sim, d.neighborDeviceId)}`);
  }
  const probs = sim.ldp.problems.filter((p) => p.deviceId === device.id);
  if (probs.length) L.push('', 'RailMPLS Lab note:', ...probs.map((p) => `  ${p.text}`));
  return L.join('\n');
}

export function showLdpBindings(sim: Sim, device: Device, only?: { network: number; prefixLen: number }): string {
  const local = sim.ldp.local.get(device.id);
  if (!local) return NOT_RUNNING;
  const L: string[] = [];
  const keys = [...local.keys()].sort((a, b) => {
    const [na, la] = a.split('/').map(Number);
    const [nb, lb] = b.split('/').map(Number);
    return na - nb || la - lb;
  });
  for (const k of keys) {
    const [n, len] = k.split('/').map(Number);
    if (only && (only.network !== n || only.prefixLen !== len)) continue;
    L.push(`  lib entry: ${formatIpv4(n)}/${len}`, `        local binding:  label: ${labelText(local.get(k)!)}`);
    for (const r of remoteBindings(sim.ldp, device.id, k)) L.push(`        remote binding: lsr: ${ident(sim, r.peer)}, label: ${labelText(r.label)}`);
  }
  return L.length ? L.join('\n') : '(no matching LIB entry)';
}

export function showMplsForwarding(sim: Sim, device: Device, only?: number): string {
  if (!sim.ldp.routers.has(device.id)) return NOT_RUNNING;
  const L = [
    `${pad('Local', 11)}${pad('Outgoing', 11)}${pad('Prefix', 19)}${pad('Bytes Label', 14)}${pad('Outgoing', 11)}Next Hop`,
    `${pad('Label', 11)}${pad('Label', 11)}${pad('or Tunnel Id', 19)}${pad('Switched', 14)}${pad('interface', 11)}`,
  ];
  const rows = sim.ldp.lfib
    .filter((e) => e.deviceId === device.id && e.inLabel !== null && (only === undefined || e.network === only))
    .sort((a, b) => a.inLabel! - b.inLabel! || a.nextHop - b.nextHop);
  let last: number | null = null;
  for (const e of rows) {
    const out = e.out === 'pop' ? 'Pop Label' : e.out === 'none' ? 'No Label' : labelText(e.out);
    const first = e.inLabel !== last;
    last = e.inLabel;
    L.push(
      `${pad(first ? e.inLabel! : '', 11)}${pad(out, 11)}${pad(first ? `${formatIpv4(e.network)}/${e.prefixLen}` : '', 19)}${pad(sim.lfibBytes.get(`${device.id}|${e.inLabel}`) ?? 0, 14)}${pad(e.iface, 11)}${formatIpv4(e.nextHop)}`,
    );
  }
  return L.join('\n');
}

export function showLdpIgpSync(sim: Sim, device: Device, cfg: NetConfig): string {
  const me = sim.ldp.routers.get(device.id);
  if (!me) return NOT_RUNNING;
  const L: string[] = [];
  for (const iface of me.mplsIfaces) {
    const sess = sim.ldp.sessions.find((s) => s.state === 'OPERATIONAL' && s.ifaces.get(device.id)?.includes(iface));
    const peer = sess ? (sess.a === device.id ? sess.b : sess.a) : undefined;
    L.push(
      `    ${longIfName(iface)}:`,
      '        LDP configured; ' + (cfg.ospf?.ldpSync ? 'LDP-IGP Synchronization enabled.' : 'LDP-IGP Synchronization not enabled.'),
    );
    if (cfg.ospf?.ldpSync)
      L.push(`        Sync status: ${peer ? 'sync achieved; peer reachable.' : 'sync not achieved; OSPF cost held at max-metric (65535).'}`);
    if (peer) L.push(`        Peer LDP Ident: ${ident(sim, peer)}`);
    L.push(`        IGP enabled: ${cfg.ospf ? `OSPF ${cfg.ospf.processId}` : 'none'}`);
  }
  return L.join('\n') || '(no MPLS interfaces)';
}

const LSP_CODES = [
  "Codes: '!' - success, 'Q' - request not sent, '.' - timeout,",
  "  'L' - labeled output interface, 'B' - unlabeled output interface,",
  "  'N' - no label entry, 'f' - FEC mismatch",
];

export function lspPingOutput(s: LspSession): string {
  const fec = s.pw ? formatIpv4(s.pw.peer) : `${formatIpv4(s.network)}/${s.prefixLen}`;
  const L = [
    `Sending ${s.count}, 100-byte MPLS Echos to ${fec},`,
    `     timeout is ${s.timeoutMs / 1000} seconds, send interval is 0 msec:`,
    '',
    ...LSP_CODES,
    '',
    'Type escape sequence to abort.',
  ];
  if (s.error) return [...L, s.error].join('\n');
  L.push(s.probes.map((p) => (p.code === 'pending' ? '.' : p.code)).join(''));
  const ok = s.probes.filter((p) => p.code === '!');
  const pct = Math.round((ok.length / Math.max(1, s.count)) * 100);
  if (ok.length) {
    const r = ok.map((p) => ms(p.rttMs));
    L.push(
      `Success rate is ${pct} percent (${ok.length}/${s.count}), round-trip min/avg/max = ${Math.min(...r)}/${Math.round(r.reduce((a, b) => a + b, 0) / r.length)}/${Math.max(...r)} ms`,
    );
  } else L.push(`Success rate is 0 percent (0/${s.count})`);
  return L.join('\n');
}

export function lspTraceOutput(sim: Sim, s: LspSession): string {
  const fec = `${formatIpv4(s.network)}/${s.prefixLen}`;
  const L = [
    `Tracing MPLS Label Switched Path to ${fec}, timeout is ${s.timeoutMs / 1000} seconds`,
    '',
    ...LSP_CODES,
    '',
    'Type escape sequence to abort.',
  ];
  if (s.error) return [...L, s.error].join('\n');
  const ing = s.ingress;
  if (ing) {
    const src = sim.interfaces(s.srcDeviceId).find((i) => i.name === ing.iface)?.ip;
    const lab = ing.out === 'pop' ? 'implicit-null' : ing.out === 'none' ? 'none' : labelText(ing.out);
    L.push(`  0 ${src !== undefined ? formatIpv4(src) : '?'} [Labels: ${lab} Exp: 0]`);
  }
  s.probes.forEach((p, i) => {
    if (p.code === 'Q') L.push(`Q ${i + 1} *`);
    else if (p.code === '.' || p.code === 'pending') L.push(`. ${i + 1} *`);
    else
      L.push(
        `${p.code} ${i + 1} ${p.from !== undefined ? formatIpv4(p.from) : '?'}${p.info?.startsWith('Labels:') ? ` [${p.info} Exp: 0]` : p.info ? ` (${p.info})` : ''} ${ms(p.rttMs)} ms`,
      );
  });
  return L.join('\n');
}
