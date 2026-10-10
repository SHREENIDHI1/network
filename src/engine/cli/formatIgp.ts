import type { Device } from '../../model/types';
import { longIfName, type NetConfig } from '../config/netConfig';
import { formatIpv4 } from '../ip/ipv4';
import type { Sim } from '../sim';

/** show output for IS-IS and RIP (P3). No hello timers run, so holdtimes are not shown. */

const pad = (s: string | number, n: number) => String(s).padEnd(n);

export function showIsisNeighbors(sim: Sim, device: Device, cfg: NetConfig): string {
  if (!cfg.isis) return '% IS-IS is not configured';
  const name = (id: string) => sim.device(id)?.name ?? id;
  const L = [
    `Tag ${cfg.isis.tag ?? 'null'}:`,
    `${pad('System Id', 16)}${pad('Type', 5)}${pad('Interface', 14)}${pad('IP Address', 16)}${pad('State', 6)}${pad('Holdtime', 9)}Circuit Id`,
  ];
  const adj = sim.isis.adjacencies.filter((a) => a.deviceId === device.id).sort((a, b) => a.iface.localeCompare(b.iface) || a.level - b.level);
  for (const a of adj)
    L.push(
      `${pad(name(a.neighborDeviceId), 16)}${pad(`L${a.level}`, 5)}${pad(a.iface, 14)}${pad(formatIpv4(a.neighborIp), 16)}${pad('UP', 6)}${pad('-', 9)}${name(a.neighborDeviceId)}`,
    );
  if (adj.length) L.push('', '(Holdtime not shown: RailMPLS Lab computes IS-IS adjacencies without hello timers.)');
  const probs = sim.isis.problems.filter((p) => p.deviceId === device.id);
  if (probs.length) L.push('', 'RailMPLS Lab note:', ...probs.map((p) => `  ${p.iface ? `${p.iface}: ` : ''}${p.text}`));
  return L.join('\n');
}

export function showIsisDatabase(sim: Sim, device: Device, cfg: NetConfig): string {
  if (!cfg.isis) return '% IS-IS is not configured';
  const r = sim.isis.routers.get(device.id);
  if (!r) return '% IS-IS is not running (check the NET)';
  const levels = r.isType === 'level-1' ? [1] : r.isType === 'level-2-only' ? [2] : [1, 2];
  const L: string[] = [`Tag ${cfg.isis.tag ?? 'null'}:`];
  for (const lv of levels) {
    // Each router sees the LSPs of its level domain (L1: own area only).
    const lsps = sim.isis.lsps.filter((x) => x.level === lv && (lv === 2 || sim.isis.routers.get(x.deviceId)?.area === r.area));
    L.push(
      `IS-IS Level-${lv} Link State Database:`,
      `${pad('LSPID', 25)}${pad('LSP Seq Num', 14)}${pad('LSP Checksum', 14)}${pad('LSP Holdtime/Rcvd', 19)}ATT/P/OL`,
    );
    for (const x of lsps)
      L.push(
        `${pad(`${x.lspId}${x.deviceId === device.id ? '  *' : ''}`, 25)}${pad('0x00000001', 14)}${pad('-', 14)}${pad('1199/*', 19)}${x.attached ? 1 : 0}/0/0${x.pseudonode ? '   (pseudonode)' : `   ${x.prefixes} IP prefix(es)`}`,
      );
    L.push('');
  }
  L.push('RailMPLS Lab note: sequence numbers, checksums and timers are not simulated; the LSP list and prefixes are computed from the topology.');
  return L.join('\n');
}

export function isisProtocolLines(sim: Sim, device: Device, cfg: NetConfig): string[] {
  const i = cfg.isis;
  if (!i) return [];
  const r = sim.isis.routers.get(device.id);
  const ifs = sim.isis.interfaces.filter((x) => x.deviceId === device.id);
  return [
    `Routing Protocol is "isis${i.tag ? ` ${i.tag}` : ''}"`,
    `  NET: ${i.net ?? 'not set'}${r ? ` (area ${r.area}, system ID ${r.systemId})` : ''}`,
    `  IS-Type: ${i.isType}`,
    '  Routing for Networks:',
    ...ifs.filter((x) => !x.passive).map((x) => `    ${longIfName(x.iface)}`),
    ...(ifs.some((x) => x.passive) ? ['  Passive Interface(s):', ...ifs.filter((x) => x.passive).map((x) => `    ${longIfName(x.iface)}`)] : []),
    '  Distance: (default is 115)',
  ];
}

export function ripProtocolLines(sim: Sim, device: Device, cfg: NetConfig): string[] {
  const r = cfg.rip;
  if (!r) return [];
  const running = sim.rip.enabled.has(device.id);
  const nbrs = sim.rip.neighbors.get(device.id) ?? [];
  return [
    'Routing Protocol is "rip"',
    running
      ? '  Sending updates every 30 seconds (not simulated: converged state shown)'
      : '  RIP is not running: RailMPLS Lab models RIPv2 only — add "version 2"',
    `  Default version control: send version ${r.version}, receive version ${r.version}`,
    `  Automatic network summarization is not in effect`,
    ...(r.defaultOriginate ? ['  Default route originated'] : []),
    '  Routing for Networks:',
    ...r.networks.map((n) => `    ${n}`),
    ...(r.passive.length ? ['  Passive Interface(s):', ...r.passive.map((p) => `    ${longIfName(p)}`)] : []),
    '  Routing Information Sources:',
    `    ${pad('Gateway', 16)}Distance`,
    ...nbrs.map((n) => `    ${pad(formatIpv4(n.ip), 16)}120`),
    '  Distance: (default is 120)',
  ];
}
