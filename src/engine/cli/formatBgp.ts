import type { Device } from '../../model/types';
import { longIfName, type NetConfig } from '../config/netConfig';
import { tableKey, type Af, type BgpPath, type BgpPeering } from '../bgp/bgp';
import { formatIpv4 } from '../ip/ipv4';
import type { Sim } from '../sim';

/**
 * show output for BGP, MP-BGP VPNv4 and VRFs (P5). Only computed state:
 * message counters, table versions and up/down timers are shown as "-".
 */

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);
const NOT_RUNNING = '% BGP not active';

function header(sim: Sim, device: Device): string[] | null {
  const sp = sim.bgp.speakers.get(device.id);
  if (!sp) return null;
  return [`BGP router identifier ${formatIpv4(sp.rid)}, local AS number ${sp.asn}`];
}

function received(sim: Sim, p: BgpPeering, af: Af): number {
  const t = sim.bgp.tables.get(tableKey(p.speaker, af));
  let n = 0;
  for (const paths of t?.values() ?? []) n += paths.filter((x) => x.from === p.peer).length;
  return n;
}

/** "show ip bgp summary" (af ipv4) / "show bgp vpnv4 unicast all summary" (af vpnv4, incl. VRF PE–CE neighbours). */
export function showBgpSummary(sim: Sim, device: Device, af: Af): string {
  const head = header(sim, device);
  if (!head) return NOT_RUNNING;
  const rows = sim.bgp.peerings.filter(
    (p) => p.dev === device.id && (af === 'vpnv4' ? p.afs.includes('vpnv4') || !!p.vrf || p.state !== 'Established' : !p.vrf),
  );
  const cfg = sim.config(device.id)!;
  const L = [...head, '', `${pad('Neighbor', 16)}V${lpad('AS', 13)} MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd`];
  const notes: string[] = [];
  for (const p of rows) {
    if (af === 'vpnv4' && !p.vrf && p.state === 'Established' && !p.afs.includes('vpnv4')) continue;
    if (af === 'vpnv4' && !p.vrf && !cfg.bgp?.neighbors[formatIpv4(p.neighbor)]?.vpnv4) continue;
    const st = p.state === 'Established' ? String(received(sim, p, p.vrf ? 'ipv4' : af)) : p.state;
    L.push(
      `${pad(formatIpv4(p.neighbor), 16)}4${lpad(p.remoteAs, 13)}${lpad('-', 8)}${lpad('-', 8)}${lpad('-', 9)}${lpad(0, 5)}${lpad(0, 5)} ${pad('-', 8)} ${st}`,
    );
    if (p.state !== 'Established') notes.push(`  ${formatIpv4(p.neighbor)}${p.vrf ? ` (vrf ${p.vrf})` : ''}: ${p.reason}`);
  }
  if (rows.length === 0) L.push('(no neighbours configured for this address family)');
  L.push('', '(RailMPLS Lab: message counters, table versions and timers are not simulated.)');
  if (notes.length) L.push('RailMPLS Lab note — sessions not established:', ...notes);
  return L.join('\n');
}

const STATUS = [
  'Status codes: s suppressed, d damped, h history, * valid, > best, i - internal,',
  '              r RIB-failure, S Stale',
  'Origin codes: i - IGP, e - EGP, ? - incomplete',
  '',
  `     ${pad('Network', 17)}${pad('Next Hop', 20)}${lpad('Metric', 6)} ${lpad('LocPrf', 6)} ${lpad('Weight', 6)} Path`,
];

function pathRow(p: BgpPath): string {
  const status = `${p.valid ? '*' : ' '}${p.best ? '>' : ' '}${p.src === 'ibgp' ? 'i' : ' '}`;
  const nh = p.nextHop === 0 ? '0.0.0.0' : formatIpv4(p.nextHop);
  const lp = p.src === 'ibgp' ? String(p.localPref) : '';
  return ` ${status} ${pad(`${formatIpv4(p.network)}/${p.prefixLen}`, 17)}${pad(nh, 20)}${lpad(p.med, 6)} ${lpad(lp, 6)} ${lpad(p.weight, 6)} ${[...p.asPath, p.origin].join(' ')}`;
}

function sortedPaths(t: Map<string, BgpPath[]> | undefined): BgpPath[] {
  return [...(t?.values() ?? [])].flat().sort((a, b) => a.network - b.network || a.prefixLen - b.prefixLen || Number(b.best) - Number(a.best));
}

/** "show ip bgp". */
export function showIpBgp(sim: Sim, device: Device): string {
  const sp = sim.bgp.speakers.get(device.id);
  if (!sp) return NOT_RUNNING;
  const rows = sortedPaths(sim.bgp.tables.get(tableKey(device.id, 'ipv4')));
  return [
    `BGP table version is -, local router ID is ${formatIpv4(sp.rid)}`,
    ...STATUS,
    ...rows.map(pathRow),
    ...(rows.length ? [] : ['(BGP table is empty)']),
  ].join('\n');
}

/** "show bgp vpnv4 unicast all" (optionally one VRF, or the label view). */
export function showVpnv4(sim: Sim, device: Device, cfg: NetConfig, opts: { vrf?: string; labels?: boolean } = {}): string {
  const sp = sim.bgp.speakers.get(device.id);
  if (!sp) return NOT_RUNNING;
  if (opts.vrf && !cfg.vrfs[opts.vrf]) return `% VRF ${opts.vrf} does not exist`;
  const L: string[] = opts.labels
    ? [`   ${pad('Network', 17)}${pad('Next Hop', 17)}In label/Out label`]
    : [`BGP table version is -, local router ID is ${formatIpv4(sp.rid)}`, ...STATUS];
  const row = (p: BgpPath, vrf?: string) => {
    if (!opts.labels) return pathRow(p);
    const nh = p.nextHop === 0 ? '0.0.0.0' : formatIpv4(p.nextHop);
    const local = vrf && !p.imported ? sim.bgp.vpnLabelOf(device.id, vrf, p.network, p.prefixLen) : undefined;
    const inL = local !== undefined ? String(local) : 'nolabel';
    const outL = p.imported || p.src === 'ibgp' ? String(p.label ?? 'nolabel') : `nolabel${vrf ? `(${vrf})` : ''}`;
    return `   ${pad(`${formatIpv4(p.network)}/${p.prefixLen}`, 17)}${pad(nh, 17)}${inL}/${outL}`;
  };
  // Local VRFs: their table (own + imported routes) under the VRF's RD.
  const localRds = new Set<string>();
  for (const [v, vc] of Object.entries(cfg.vrfs)) {
    if (!vc.rd || (opts.vrf && v !== opts.vrf)) continue;
    localRds.add(vc.rd);
    L.push(`Route Distinguisher: ${vc.rd} (default for vrf ${v})`);
    const rows = sortedPaths(sim.bgp.tables.get(tableKey(`${device.id}#${v}`, 'ipv4')));
    L.push(...rows.map((p) => row(p, v)));
  }
  // Other RDs (what this router holds as RR or as received paths).
  if (!opts.vrf) {
    const byRd = new Map<string, BgpPath[]>();
    for (const p of sortedPaths(sim.bgp.tables.get(tableKey(device.id, 'vpnv4')))) {
      if (localRds.has(p.rd!)) continue;
      byRd.set(p.rd!, [...(byRd.get(p.rd!) ?? []), p]);
    }
    for (const [rd, ps] of [...byRd].sort()) L.push(`Route Distinguisher: ${rd}`, ...ps.map((p) => row(p)));
  }
  return L.join('\n');
}

/** "show vrf" (IOS-XE layout). */
export function showVrf(sim: Sim, device: Device, cfg: NetConfig): string {
  const names = Object.keys(cfg.vrfs);
  if (!names.length) return '% No VRF configured';
  const L = [`  ${pad('Name', 33)}${pad('Default RD', 22)}${pad('Protocols', 12)}Interfaces`];
  for (const n of names.sort()) {
    const ifs = sim
      .interfaces(device.id)
      .filter((i) => i.vrf === n)
      .map((i) => i.name);
    L.push(`  ${pad(n, 33)}${pad(cfg.vrfs[n].rd ?? '<not set>', 22)}${pad('ipv4', 12)}${ifs.join(' ')}`);
  }
  return L.join('\n');
}

/** "show ip vrf detail NAME" — RD, RTs, interfaces. */
export function showVrfDetail(sim: Sim, device: Device, cfg: NetConfig, name: string): string {
  const v = cfg.vrfs[name];
  if (!v) return `% VRF ${name} does not exist`;
  const ifs = sim
    .interfaces(device.id)
    .filter((i) => i.vrf === name)
    .map((i) => longIfName(i.name));
  return [
    `VRF ${name}; default RD ${v.rd ?? '<not set>'}`,
    '  Interfaces:',
    `    ${ifs.join(' ') || '(none)'}`,
    '  Export VPN route-target communities',
    `    ${v.exportRts.map((r) => `RT:${r}`).join('  ') || '(none)'}`,
    '  Import VPN route-target communities',
    `    ${v.importRts.map((r) => `RT:${r}`).join('  ') || '(none)'}`,
  ].join('\n');
}
