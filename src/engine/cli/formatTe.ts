import type { Device } from '../../model/types';
import { longIfName, type ExplicitPathConfig, type NetConfig } from '../config/netConfig';
import { formatIpv4 } from '../ip/ipv4';
import type { Sim } from '../sim';
import { outLabel, type TeLsp } from '../te/te';

/**
 * show output for MPLS TE / RSVP / FRR (P7). Layouts follow IOS but are
 * simplified: priorities, affinities, timers and counters are not simulated
 * and are left out rather than invented.
 */

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const short = (n?: string) => (n ?? '-').replace(/^TenGigabitEthernet/, 'Te').replace(/^GigabitEthernet/, 'Gi').replace(/^Tunnel/, 'Tu');
const lspName = (sim: Sim, l: TeLsp) => `${sim.device(l.head)?.name ?? l.head}_t${l.number}`;
const lbl = (v: number | 'pop') => (v === 'pop' ? 'Pop' : String(v));

export function explicitPathLines(p: ExplicitPathConfig): string[] {
  return p.entries.map((e, i) => `    ${i + 1}: ${e.kind === 'next' ? 'next-address' : 'exclude-address'} ${e.address}`);
}

export function showExplicitPaths(cfg: NetConfig): string {
  const names = Object.keys(cfg.explicitPaths);
  if (!names.length) return '';
  return names
    .map((n) => {
      const p = cfg.explicitPaths[n];
      const strict = p.entries.some((e) => e.kind === 'next');
      return [`PATH ${n} (${strict ? 'strict' : 'loose'} source route, path complete)`, ...explicitPathLines(p)].join('\n');
    })
    .join('\n');
}

export function showTeBrief(sim: Sim, device: Device): string {
  const rows: string[] = [];
  let heads = 0;
  let mids = 0;
  let tails = 0;
  for (const l of sim.te.lsps) {
    const name = lspName(sim, l);
    const dest = l.destination !== undefined ? formatIpv4(l.destination) : '-';
    if (l.head === device.id) {
      heads++;
      rows.push(`${pad(name, 33)}${pad(dest, 17)}${pad('-', 11)}${pad(short(l.hops[0]?.outIface), 11)}${l.state === 'up' ? 'up/up' : 'up/down'}`);
      continue;
    }
    if (l.state !== 'up') continue;
    const i = l.hops.findIndex((h) => h.dev === device.id);
    if (i <= 0) continue;
    const upIf = sim.te.links.find((k) => k.dev === l.hops[i - 1].dev && k.iface === l.hops[i - 1].outIface)?.peerIface;
    if (i === l.hops.length - 1) tails++;
    else mids++;
    rows.push(`${pad(name, 33)}${pad(dest, 17)}${pad(short(upIf), 11)}${pad(i === l.hops.length - 1 ? '-' : short(l.hops[i].outIface), 11)}up/up`);
  }
  const L = [
    'P2P TUNNELS/LSPs:',
    `${pad('TUNNEL NAME', 33)}${pad('DESTINATION', 17)}${pad('UP IF', 11)}${pad('DOWN IF', 11)}STATE/PROT`,
    ...rows,
    `Displayed ${heads} heads, ${mids} midpoints, ${tails} tails`,
  ];
  const down = sim.te.lsps.filter((l) => l.head === device.id && l.state !== 'up');
  if (down.length) L.push('', 'RailMPLS Lab note — why tunnels are down:', ...down.map((l) => `  ${l.tunnel}: ${l.reason}`));
  return L.join('\n');
}

export function showTeTunnels(sim: Sim, device: Device, only?: string): string {
  const ls = sim.te.lsps.filter((l) => l.head === device.id && (!only || l.tunnel === only));
  if (!ls.length) return only ? `% ${only} is not an MPLS TE tunnel on this router` : '';
  const out: string[] = [];
  for (const l of ls) {
    const cfg = sim.config(device.id)!.teTunnels[l.tunnel];
    const opt = l.pathOption;
    const frr = l.frr.requested ? `enabled, Protection: ${l.frr.state === 'active' ? 'active (traffic on the backup tunnel)' : l.frr.state === 'ready' ? 'ready' : 'none'}` : 'disabled';
    out.push(
      `Name: ${lspName(sim, l)}  (${l.tunnel}) Destination: ${l.destination !== undefined ? formatIpv4(l.destination) : '-'}`,
      '  Status:',
      `    Admin: ${cfg.shutdown ? 'admin-down' : 'up'}   Oper: ${l.state}   Path: ${l.state === 'up' ? 'valid' : 'not valid'}   Signalling: ${l.state === 'up' ? 'connected' : 'down'}`,
      ...(opt && l.state === 'up' ? [`    path option ${opt.pref}, type ${opt.kind}${opt.name ? ` ${opt.name}` : ''} (Basis for Setup, path weight ${l.weight})`] : []),
      '',
      '  Config Parameters:',
      `    Bandwidth: ${l.bandwidthKbps} kbps`,
      `    AutoRoute: ${l.autoroute ? 'enabled' : 'disabled'}`,
      `    Fast Reroute: ${frr}`,
    );
    if (l.state === 'up') {
      const o = outLabel(l, 0);
      out.push(
        '',
        `  OutLabel : ${longIfName(l.hops[0].outIface!)}, ${o === 'pop' ? 'implicit-null' : o}`,
        `  Explicit Route: ${l.hops
          .slice(0, -1)
          .map((h) => formatIpv4(h.nextIp!))
          .join(' ')} ${formatIpv4(l.destination!)}`,
        `  Path: ${l.hops.map((h) => sim.device(h.dev)?.name ?? h.dev).join(' → ')}`,
      );
      if (l.frr.active) {
        const plr = l.hops[l.frr.active.plr];
        out.push(`  RailMPLS Lab note: link ${sim.device(plr.dev)?.name} ${plr.outIface} is down; ${sim.device(plr.dev)?.name} switched the LSP to backup ${l.frr.active.backup.split('|')[1]} (FRR). Run "mpls traffic-eng reoptimize" on the head end to re-signal a new path.`);
      }
    } else out.push(`  RailMPLS Lab note: ${l.reason}`);
    out.push('');
  }
  return out.join('\n').trimEnd();
}

export function showFrrDatabase(sim: Sim, device: Device): string {
  const head: string[] = [];
  const mid: string[] = [];
  for (const l of sim.te.lsps) {
    if (l.state !== 'up' || !l.frr.requested) continue;
    const i = l.hops.findIndex((h) => h.dev === device.id);
    if (i < 0 || i === l.hops.length - 1) continue;
    const prot = l.frr.protectedHops.get(i) ?? (l.frr.active?.plr === i ? { backup: l.frr.active.backup, merge: l.frr.active.merge } : undefined);
    if (!prot) continue;
    const b = sim.te.lsps.find((x) => x.key === prot.backup);
    const bOut = b ? outLabel(b, 0) : 'pop';
    const status = l.frr.active?.plr === i ? 'Active' : 'Ready';
    const row = `${pad(i === 0 ? l.tunnel : `${lspName(sim, l)}`, 31)}${pad(i === 0 ? 'Tun hd' : String(l.hops[i].inLabel), 9)}${pad(`${short(l.hops[i].outIface)}:${lbl(outLabel(l, i))}`, 17)}${pad(`${short(b?.tunnel)}:${lbl(bOut)}`, 17)}${status}`;
    (i === 0 ? head : mid).push(row);
  }
  const hdr = `${pad('LSP / tunnel', 31)}${pad('In-label', 9)}${pad('Out intf/label', 17)}${pad('FRR intf/label', 17)}Status`;
  return ['P2P Headend FRR information:', hdr, ...head, '', 'P2P LSP midpoint frr information:', hdr, ...mid, '', '(RailMPLS Lab: simplified layout.)'].join('\n');
}

export function showRsvpInterface(sim: Sim, device: Device): string {
  const cfg = sim.config(device.id)!;
  const ifs = Object.entries(cfg.interfaces).filter(([, c]) => c.rsvpBandwidth !== undefined);
  if (!ifs.length) return '';
  const L = [`${pad('interface', 13)}${pad('rsvp', 7)}${pad('allocated', 12)}i/f max (kbps)`];
  for (const [n] of ifs) {
    const link = sim.te.links.find((k) => k.dev === device.id && k.iface === n);
    L.push(`${pad(short(n), 13)}${pad('ena', 7)}${pad(link ? link.reservedKbps : 0, 12)}${link ? link.reservableKbps : '- (not a TE link)'}`);
  }
  return L.join('\n');
}
