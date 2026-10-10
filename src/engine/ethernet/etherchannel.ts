import type { Topology } from '../../model/types';
import { effectivePort, isBridgeRole, roleOf, type InterfaceConfig, type NetConfig } from '../config/netConfig';
import { portKey, type PhysicalState } from '../physical/linkState';

/**
 * EtherChannel / link aggregation (IEEE 802.3ad LACP, simplified).
 *
 * Member flags follow "show etherchannel summary":
 *  P = bundled in port-channel, I = stand-alone (no LACP partner),
 *  s = suspended (mismatch), D = down.
 *
 * Bundling is computed directly from configuration and link state instead of
 * exchanging LACPDUs (no timers, no system/port priorities). A bundle is one
 * logical port for spanning tree and MAC learning; frames are spread over the
 * bundled members by a source/destination MAC hash. Only Layer 2 port-channels
 * on switches are supported. See Model Limitations.
 */

export type MemberFlag = 'P' | 'I' | 's' | 'D';

export interface BundleMember {
  portId: string;
  flag: MemberFlag;
  reason?: string;
}

export interface Bundle {
  deviceId: string;
  id: number;
  /** Logical interface key, e.g. "Po1". */
  name: string;
  protocol: 'LACP' | '-';
  members: BundleMember[];
  /** True when at least one member is bundled (P). */
  up: boolean;
  /** Member that represents the bundle in spanning tree (same physical link on both ends). */
  primary?: string;
  peerDeviceId?: string;
  /** Sum of bundled member speeds. */
  speedGbps: number;
}

export interface EtherChannelState {
  bundles: Map<string, Bundle[]>; // per device
  /** portKey → bundle name, for bundled (P) members only. */
  logical: Map<string, string>;
  /** portKey → flag, for every configured member. */
  flags: Map<string, MemberFlag>;
}

export const emptyEtherChannel = (): EtherChannelState => ({ bundles: new Map(), logical: new Map(), flags: new Map() });

/** The Layer 2 settings that must match between a member and its port-channel. */
export function switchingSignature(role: ReturnType<typeof roleOf>, ic: InterfaceConfig | undefined): string {
  const e = effectivePort(role, ic);
  const allowed = e.trunkAllowed === 'all' ? 'all' : [...(e.trunkAllowed ?? [])].sort((a, b) => a - b).join(',');
  return JSON.stringify([
    e.switchport,
    e.mode,
    e.mode === 'access' ? e.accessVlan : null,
    e.mode === 'trunk' ? e.nativeVlan : null,
    e.mode === 'trunk' ? allowed : null,
  ]);
}

export function computeEtherChannel(topo: Topology, configs: ReadonlyMap<string, NetConfig>, phys: PhysicalState): EtherChannelState {
  const state = emptyEtherChannel();
  const devById = new Map(topo.devices.map((d) => [d.id, d]));
  const groupOf = (dev: string, port: string) => {
    const d = devById.get(dev);
    if (!d || !isBridgeRole(roleOf(d.kind))) return undefined;
    return configs.get(dev)?.interfaces[port]?.channelGroup;
  };

  // Pass 1: local verdict for each member (ignoring what the far end decides).
  interface Pre {
    deviceId: string;
    id: number;
    portId: string;
    flag: MemberFlag;
    reason?: string;
    peer?: { deviceId: string; portId: string };
    linkId?: string;
    speed: number;
  }
  const pre = new Map<string, Pre>();
  const groups = new Map<string, Pre[]>(); // `${dev}|${id}`

  for (const d of topo.devices) {
    const role = roleOf(d.kind);
    if (!isBridgeRole(role)) continue;
    const cfg = configs.get(d.id);
    if (!cfg) continue;
    for (const p of d.ports) {
      const cg = cfg.interfaces[p.id]?.channelGroup;
      if (!cg) continue;
      const po = cfg.interfaces[`Po${cg.id}`];
      const st = phys.ports.get(portKey(d.id, p.id));
      const m: Pre = { deviceId: d.id, id: cg.id, portId: p.id, flag: 'P', peer: st?.peer, linkId: st?.linkId, speed: st?.speedGbps ?? 0 };
      if (!st?.operUp) {
        m.flag = 'D';
        m.reason = st?.reason ?? 'down';
      } else if (po?.shutdown) {
        m.flag = 'D';
        m.reason = `Port-channel${cg.id} is shut down`;
      } else if (!effectivePort(role, cfg.interfaces[p.id]).switchport) {
        m.flag = 's';
        m.reason = 'routed port-channels are not simulated';
      } else if (switchingSignature(role, cfg.interfaces[p.id]) !== switchingSignature(role, po)) {
        m.flag = 's';
        m.reason = `switchport settings differ from Port-channel${cg.id}`;
      } else {
        const peerCg = st.peer ? groupOf(st.peer.deviceId, st.peer.portId) : undefined;
        if (cg.mode === 'on') {
          if (!peerCg) {
            m.flag = 's';
            m.reason = 'neighbour port is not in a channel-group';
          } else if (peerCg.mode !== 'on') {
            m.flag = 's';
            m.reason = 'channel mode mismatch (on vs LACP)';
          }
        } else if (peerCg?.mode === 'on') {
          m.flag = 's';
          m.reason = 'channel mode mismatch (LACP vs on)';
        } else if (!peerCg) {
          m.flag = 'I';
          m.reason = 'no LACP partner (neighbour port not in a channel-group)';
        } else if (cg.mode === 'passive' && peerCg.mode === 'passive') {
          m.flag = 'I';
          m.reason = 'both ends passive — nobody starts LACP';
        }
      }
      pre.set(portKey(d.id, p.id), m);
      const k = `${d.id}|${cg.id}`;
      groups.set(k, [...(groups.get(k) ?? []), m]);
    }
  }

  // Pass 1b: inside a group all bundled members must reach one neighbour, one far channel-group, one speed.
  for (const ms of groups.values()) {
    const ok = ms.filter((m) => m.flag === 'P');
    const first = ok[0];
    if (!first) continue;
    const farGroup = groupOf(first.peer!.deviceId, first.peer!.portId)!.id;
    for (const m of ok.slice(1)) {
      if (m.peer!.deviceId !== first.peer!.deviceId) {
        m.flag = 's';
        m.reason = 'connects to a different neighbour than the other members';
      } else if (groupOf(m.peer!.deviceId, m.peer!.portId)!.id !== farGroup) {
        m.flag = 's';
        m.reason = 'neighbour ports are in different channel-groups';
      } else if (m.speed !== first.speed) {
        m.flag = 's';
        m.reason = 'speed differs from the other members';
      }
    }
  }

  // Pass 2: a member is bundled only when the far end bundles the same link.
  for (const m of pre.values()) {
    if (m.flag !== 'P') continue;
    const far = pre.get(portKey(m.peer!.deviceId, m.peer!.portId));
    if (far?.flag !== 'P') {
      m.flag = 's';
      m.reason = `neighbour port is not bundled${far?.reason ? ` (${far.reason})` : ''}`;
    }
  }
  // A suspension found in pass 2 can make a far member lose its partner: repeat until stable.
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of pre.values()) {
      if (m.flag !== 'P') continue;
      const far = pre.get(portKey(m.peer!.deviceId, m.peer!.portId));
      if (far?.flag !== 'P') {
        m.flag = 's';
        m.reason = 'neighbour port is not bundled';
        changed = true;
      }
    }
  }

  for (const [k, ms] of groups) {
    const [deviceId] = k.split('|');
    const d = devById.get(deviceId)!;
    const id = ms[0].id;
    const cfg = configs.get(deviceId)!;
    const order = (p: string) => d.ports.findIndex((x) => x.id === p);
    ms.sort((a, b) => order(a.portId) - order(b.portId));
    const bundled = ms.filter((m) => m.flag === 'P');
    // Representative link: the bundled link with the smallest id, so both ends agree.
    const rep = [...bundled].sort((a, b) => (a.linkId! < b.linkId! ? -1 : 1))[0];
    const anyLacp = ms.some((m) => cfg.interfaces[m.portId]?.channelGroup?.mode !== 'on');
    const bundle: Bundle = {
      deviceId,
      id,
      name: `Po${id}`,
      protocol: anyLacp ? 'LACP' : '-',
      members: ms.map((m) => ({ portId: m.portId, flag: m.flag, reason: m.reason })),
      up: bundled.length > 0,
      primary: rep?.portId,
      peerDeviceId: rep?.peer?.deviceId,
      speedGbps: bundled.reduce((a, m) => a + m.speed, 0),
    };
    state.bundles.set(
      deviceId,
      [...(state.bundles.get(deviceId) ?? []), bundle].sort((a, b) => a.id - b.id),
    );
    for (const m of ms) {
      state.flags.set(portKey(deviceId, m.portId), m.flag);
      if (m.flag === 'P') state.logical.set(portKey(deviceId, m.portId), bundle.name);
    }
  }
  return state;
}

export function bundleByName(ec: EtherChannelState, deviceId: string, name: string): Bundle | undefined {
  return ec.bundles.get(deviceId)?.find((b) => b.name === name);
}

/** Deterministic member choice for a frame (src-dst-mac hash). */
export function pickMember(members: string[], srcMac: string, dstMac: string): string | undefined {
  if (!members.length) return undefined;
  const last = (m: string) => parseInt(m.replace(/[^0-9a-f]/gi, '').slice(-2), 16) || 0;
  return members[(last(srcMac) ^ last(dstMac)) % members.length];
}
