import type { Topology } from '../../model/types';
import { portKey, type PhysicalState } from '../physical/linkState';
import type { NetConfig } from '../config/netConfig';
import type { Segment } from '../ethernet/segments';
import type { L3Interface } from '../ip/interfaces';
import { formatIpv4, parseIpv4 } from '../ip/ipv4';

/**
 * First-hop redundancy: HSRP v1 (RFC 2281) and VRRPv2 (RFC 3768), simplified.
 *
 * Election is computed from configuration and live interface state rather
 * than from hello packets: highest effective priority wins (tie: highest
 * interface IP); a running active/master keeps the role unless a better
 * router has preemption enabled. Interface tracking lowers priority when a
 * tracked interface is down. The winner owns the virtual IP and virtual MAC.
 */

export type FhrpRole = 'Active' | 'Standby' | 'Listen' | 'Master' | 'Backup' | 'Init';

export interface FhrpMember {
  deviceId: string;
  iface: string;
  ip: number;
  configuredPriority: number;
  priority: number;
  preempt: boolean;
  role: FhrpRole;
}

export interface FhrpGroup {
  key: string;
  protocol: 'hsrp' | 'vrrp';
  group: number;
  segmentId: number;
  vip?: number;
  vmac: string;
  members: FhrpMember[];
  active?: FhrpMember;
  standby?: FhrpMember;
  problems: string[];
}

export interface FhrpResult {
  groups: FhrpGroup[];
  /** `${deviceId}|${iface}` -> groups this interface participates in */
  byIface: Map<string, Array<{ group: FhrpGroup; member: FhrpMember }>>;
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');

export function virtualMac(protocol: 'hsrp' | 'vrrp', group: number): string {
  return protocol === 'hsrp' ? `00:00:0c:07:ac:${hex2(group)}` : `00:00:5e:00:01:${hex2(group)}`;
}

export function computeFhrp(
  topo: Topology,
  configs: ReadonlyMap<string, NetConfig>,
  l3: ReadonlyMap<string, L3Interface[]>,
  phys: PhysicalState,
  segments: Segment[],
  previousActive: ReadonlyMap<string, string>,
): FhrpResult {
  const result: FhrpResult = { groups: [], byIface: new Map() };
  const segOf = new Map<string, number>();
  for (const s of segments) for (const m of s.members) segOf.set(`${m.deviceId}|${m.iface}`, s.id);
  const groups = new Map<string, FhrpGroup>();

  const ifUp = (deviceId: string, name: string) => {
    const i = l3.get(deviceId)?.find((x) => x.name === name);
    if (i) return i.up;
    return !!phys.ports.get(portKey(deviceId, name))?.operUp;
  };

  for (const d of topo.devices) {
    const cfg = configs.get(d.id);
    if (!cfg) continue;
    for (const i of l3.get(d.id) ?? []) {
      const fh = cfg.interfaces[i.name]?.fhrp;
      // Down interfaces are in Init state and take no part in the election.
      if (!fh?.length || i.ip === undefined || !i.up) continue;
      const seg = segOf.get(`${d.id}|${i.name}`) ?? -1;
      for (const g of fh) {
        const key = `${g.protocol}|${seg}|${g.group}`;
        let grp = groups.get(key);
        if (!grp) {
          grp = { key, protocol: g.protocol, group: g.group, segmentId: seg, vmac: virtualMac(g.protocol, g.group), members: [], problems: [] };
          groups.set(key, grp);
        }
        const vip = g.ip ? parseIpv4(g.ip) ?? undefined : undefined;
        if (vip !== undefined) {
          if (grp.vip !== undefined && grp.vip !== vip) grp.problems.push(`Virtual IP mismatch: ${formatIpv4(grp.vip)} vs ${formatIpv4(vip)}.`);
          grp.vip ??= vip;
        }
        let prio = g.priority ?? 100;
        if (g.protocol === 'vrrp' && vip !== undefined && vip === i.ip) prio = 255; // address owner
        let eff = prio;
        for (const t of g.track) if (!ifUp(d.id, t.iface)) eff -= t.decrement;
        const member: FhrpMember = {
          deviceId: d.id,
          iface: i.name,
          ip: i.ip,
          configuredPriority: prio,
          priority: Math.max(eff, 0),
          preempt: g.preempt ?? g.protocol === 'vrrp',
          role: 'Init',
        };
        grp.members.push(member);
        const k = `${d.id}|${i.name}`;
        result.byIface.set(k, [...(result.byIface.get(k) ?? []), { group: grp, member }]);
      }
    }
  }

  const better = (a: FhrpMember, b: FhrpMember) => a.priority > b.priority || (a.priority === b.priority && a.ip > b.ip);

  for (const grp of groups.values()) {
    if (grp.vip === undefined) {
      grp.problems.push('No virtual IP configured on any member.');
      result.groups.push(grp);
      continue;
    }
    const ms = grp.members;
    if (!ms.length) {
      result.groups.push(grp);
      continue;
    }
    let best = ms[0];
    for (const m of ms) if (better(m, best)) best = m;
    const prevKey = previousActive.get(grp.key);
    const prev = ms.find((m) => `${m.deviceId}|${m.iface}` === prevKey);
    // Without preemption on the better router, the current active keeps the role.
    const active = prev && prev !== best && !best.preempt ? prev : best;
    grp.active = active;
    const rest = ms.filter((m) => m !== active);
    let standby: FhrpMember | undefined;
    for (const m of rest) if (!standby || better(m, standby)) standby = m;
    if (grp.protocol === 'hsrp') {
      grp.standby = standby;
      active.role = 'Active';
      for (const m of rest) m.role = m === standby ? 'Standby' : 'Listen';
    } else {
      active.role = 'Master';
      for (const m of rest) m.role = 'Backup';
    }
    result.groups.push(grp);
  }
  return result;
}
