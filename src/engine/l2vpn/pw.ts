import type { Topology } from '../../model/types';
import type { NetConfig } from '../config/netConfig';
import type { L3Interface } from '../ip/interfaces';
import { formatIpv4, parseIpv4 } from '../ip/ipv4';
import { resolve, type Route } from '../ip/routing';
import { prefixKey, type LdpResult } from '../mpls/ldp';

/**
 * Pseudowires (RFC 4447 / 4448 / 4553 / 5086), simplified.
 *
 * Like LDP and BGP, the pseudowire control plane is computed, not exchanged:
 * every provisioned endpoint ("xconnect PEER VCID", a VFI neighbour, or a CEM
 * group's xconnect) looks for its mirror on the peer PE — same VC ID, pointing
 * back at this PE's LDP router-ID — and the VC is UP only when
 *  - the targeted LDP session can form (peer router-ID routable both ways),
 *  - both ends agree on PW type (Ethernet / Eth VLAN / SAToP / CESoPSN),
 *    MTU (Ethernet types) and timeslots (CESoPSN),
 *  - both attachment circuits are up,
 *  - an LSP (LDP label, or a directly connected peer) leads to the peer.
 * Otherwise the reason is kept for show output and lab checks.
 * VC labels are allocated per PE from FIRST_VC_LABEL in config order.
 */

export const FIRST_VC_LABEL = 2000;
export const DEFAULT_L2_MTU = 1500;

export type PwType = 'Ethernet' | 'Eth VLAN' | 'SATOP E1' | 'CESoPSN Basic';

export interface PwEndpoint {
  key: string;
  deviceId: string;
  /** Attachment circuit: interface name, "VFI NAME", or "CEM0/4/0 group N". */
  ac: string;
  /** Interface carrying the AC (Ethernet / Eth VLAN / VFI ports are separate). */
  iface?: string;
  vfi?: string;
  controller?: string;
  cemGroup?: number;
  type: PwType;
  vlan?: number;
  peer: number;
  vcId: number;
  mtu: number;
  timeslots: number[];
  acUp: boolean;
  acReason?: string;
  localLabel: number;
  /** Mirror endpoint on the peer PE. */
  remote?: PwEndpoint;
  remoteDeviceId?: string;
  status: 'UP' | 'DOWN';
  reason?: string;
  /** Outgoing transport label towards the peer (undefined = directly connected / implicit-null). */
  transport?: { label?: number; nextHop: number; iface: string };
}

export interface PwResult {
  endpoints: PwEndpoint[];
  /** "deviceId|label" → endpoint whose local label it is. */
  byLabel: Map<string, PwEndpoint>;
  /** VPLS forwarders: "deviceId|vfi" → AC interfaces. */
  vfiAcs: Map<string, string[]>;
}

export const emptyPw = (): PwResult => ({ endpoints: [], byLabel: new Map(), vfiAcs: new Map() });

const isEthernet = (t: PwType) => t === 'Ethernet' || t === 'Eth VLAN';

export function computePseudowires(
  topo: Topology,
  configs: Map<string, NetConfig>,
  l3: Map<string, L3Interface[]>,
  routes: Map<string, Route[]>,
  ldp: LdpResult,
): PwResult {
  const res = emptyPw();
  const name = (id: string) => topo.devices.find((d) => d.id === id)?.name ?? id;

  for (const d of topo.devices) {
    const cfg = configs.get(d.id);
    if (!cfg) continue;
    const ifs = l3.get(d.id) ?? [];
    // VC labels come after every LDP label of this PE, from FIRST_VC_LABEL at the lowest.
    let next = Math.max(FIRST_VC_LABEL, ...[...(ldp.local.get(d.id)?.values() ?? [])].map((l) => l + 1));
    const add = (e: Omit<PwEndpoint, 'key' | 'localLabel' | 'status'>) =>
      res.endpoints.push({ ...e, key: `${d.id}|${e.ac}|${e.peer}|${e.vcId}`, localLabel: next++, status: 'DOWN' });

    for (const [ifName, ic] of Object.entries(cfg.interfaces)) {
      const xc = ic.xconnect;
      if (!xc) continue;
      const li = ifs.find((i) => i.name === ifName);
      const acUp = !!li?.up;
      const acReason = li ? li.reason : 'interface does not exist';
      if ('vfi' in xc) {
        const k = `${d.id}|${xc.vfi}`;
        res.vfiAcs.set(k, [...(res.vfiAcs.get(k) ?? []), ifName]);
        continue;
      }
      const peer = parseIpv4(xc.peer);
      if (peer === null) continue;
      add({
        deviceId: d.id,
        ac: ifName,
        iface: ifName,
        type: li?.kind === 'sub' ? 'Eth VLAN' : 'Ethernet',
        vlan: li?.kind === 'sub' ? li.vlan : undefined,
        peer,
        vcId: xc.vcId,
        mtu: cfg.interfaces[li?.kind === 'sub' ? li.port! : ifName]?.l2Mtu ?? DEFAULT_L2_MTU,
        timeslots: [],
        acUp,
        acReason: acUp ? undefined : acReason,
      });
    }
    for (const [vfi, v] of Object.entries(cfg.vfis)) {
      const acs = res.vfiAcs.get(`${d.id}|${vfi}`) ?? [];
      const acUp = acs.some((a) => ifs.find((i) => i.name === a)?.up);
      for (const n of v.neighbors) {
        const peer = parseIpv4(n);
        if (peer === null || v.vpnId === undefined) continue;
        add({
          deviceId: d.id,
          ac: `VFI ${vfi}`,
          vfi,
          type: 'Ethernet',
          peer,
          vcId: v.vpnId,
          mtu: DEFAULT_L2_MTU,
          timeslots: [],
          acUp,
          acReason: acUp ? undefined : acs.length ? 'no attachment interface of the VFI is up' : 'no interface attached ("xconnect vfi")',
        });
      }
    }
    for (const [ctrl, c] of Object.entries(cfg.e1Controllers)) {
      for (const [g, xc] of Object.entries(c.xconnects)) {
        const peer = parseIpv4(xc.peer);
        const grp = c.cemGroups[g];
        if (peer === null) continue;
        const acUp = !c.shutdown && !!grp;
        add({
          deviceId: d.id,
          ac: `CEM${ctrl}`,
          controller: ctrl,
          cemGroup: Number(g),
          type: !grp || grp.unframed ? 'SATOP E1' : 'CESoPSN Basic',
          peer,
          vcId: xc.vcId,
          mtu: DEFAULT_L2_MTU,
          timeslots: grp?.unframed ? [] : (grp?.timeslots ?? []),
          acUp,
          acReason: c.shutdown ? `controller E1 ${ctrl} is shut down` : !grp ? `cem-group ${g} is not defined on controller E1 ${ctrl}` : undefined,
        });
      }
    }
  }

  const owner = (ip: number) => {
    for (const [dev, ifs] of l3) if (ifs.some((i) => i.ip === ip && i.up && !i.vrf)) return dev;
    return undefined;
  };
  const reachable = (from: string, to: number) => !!resolve(routes.get(from) ?? [], to);

  for (const e of res.endpoints) {
    const me = ldp.routers.get(e.deviceId);
    const fail = (reason: string) => {
      e.status = 'DOWN';
      e.reason = reason;
    };
    if (!me) {
      fail('MPLS/LDP is not running on this PE (no LDP router-ID)');
      continue;
    }
    const peerDev = owner(e.peer);
    e.remoteDeviceId = peerDev;
    if (!peerDev || !ldp.routers.has(peerDev)) {
      fail(`no LDP router owns ${formatIpv4(e.peer)} (peer must be the remote PE's loopback / LDP router-ID)`);
      continue;
    }
    const remoteRid = ldp.routers.get(peerDev)!.routerId;
    if (remoteRid !== e.peer) {
      fail(`${formatIpv4(e.peer)} is on ${name(peerDev)}, but its LDP router-ID is ${formatIpv4(remoteRid)} — targeted LDP goes to the router-ID`);
      continue;
    }
    if (!reachable(e.deviceId, e.peer) || !reachable(peerDev, me.routerId)) {
      fail(`targeted LDP session to ${formatIpv4(e.peer)} cannot form (router-IDs not reachable both ways)`);
      continue;
    }
    const remote = res.endpoints.find((r) => r.deviceId === peerDev && r.vcId === e.vcId && r.peer === me.routerId);
    e.remote = remote;
    if (!remote) {
      const other = res.endpoints.find((r) => r.deviceId === peerDev && r.peer === me.routerId);
      fail(
        other
          ? `remote PE ${name(peerDev)} has no pseudowire with VC ID ${e.vcId} to ${formatIpv4(me.routerId)} (it has VC ID ${other.vcId})`
          : `remote PE ${name(peerDev)} has no xconnect / VFI neighbour pointing back to ${formatIpv4(me.routerId)}`,
      );
      continue;
    }
    if (remote.type !== e.type && !(isEthernet(remote.type) && isEthernet(e.type))) {
      fail(`PW type mismatch: local ${e.type}, remote ${remote.type}`);
      continue;
    }
    if (isEthernet(e.type) && remote.mtu !== e.mtu) {
      fail(`MTU mismatch: local ${e.mtu}, remote ${remote.mtu} (interface "mtu" on the attachment circuits must match)`);
      continue;
    }
    if (e.type === 'CESoPSN Basic' && e.timeslots.join(',') !== remote.timeslots.join(',')) {
      fail(`CESoPSN timeslots mismatch: local ${tsText(e.timeslots)}, remote ${tsText(remote.timeslots)}`);
      continue;
    }
    if (!e.acUp) {
      fail(`local attachment circuit ${e.ac} is down (${e.acReason ?? 'down'})`);
      continue;
    }
    if (!remote.acUp) {
      fail(`remote attachment circuit ${remote.ac} on ${name(peerDev)} is down`);
      continue;
    }
    // LSP towards the peer's /32.
    const g = resolve(routes.get(e.deviceId) ?? [], e.peer)!;
    const ftn = ldp.byFec.get(`${e.deviceId}|${prefixKey(g.route.network, g.route.prefixLen)}`)?.find((x) => x.nextHop === g.nextHop) ??
      ldp.byFec.get(`${e.deviceId}|${prefixKey(g.route.network, g.route.prefixLen)}`)?.[0];
    const direct = g.route.protocol === 'C' || ftn?.out === 'pop';
    if (!direct && (!ftn || typeof ftn.out !== 'number')) {
      fail(`no LSP to ${formatIpv4(e.peer)} (no LDP label for ${formatIpv4(g.route.network)}/${g.route.prefixLen})`);
      continue;
    }
    e.transport = { label: direct ? undefined : (ftn!.out as number), nextHop: ftn?.nextHop ?? g.nextHop, iface: ftn?.iface ?? g.iface };
    e.status = 'UP';
    e.reason = undefined;
  }
  for (const e of res.endpoints) res.byLabel.set(`${e.deviceId}|${e.localLabel}`, e);
  return res;
}

export function tsText(ts: number[]): string {
  if (!ts.length) return 'none';
  const parts: string[] = [];
  let start = ts[0];
  for (let i = 1; i <= ts.length; i++) {
    if (ts[i] !== ts[i - 1] + 1) {
      parts.push(start === ts[i - 1] ? String(start) : `${start}-${ts[i - 1]}`);
      start = ts[i];
    }
  }
  return parts.join(',');
}

/** Parses "1-4,7" into [1,2,3,4,7]; null if invalid (E1 timeslots 1–31). */
export function parseTimeslots(s: string): number[] | null {
  const out = new Set<number>();
  for (const part of s.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b > 31 || b < a) return null;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}
