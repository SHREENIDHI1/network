import type { NetConfig } from '../config/netConfig';
import type { OspfResult } from '../ospf/ospf';

/**
 * BFD (RFC 5880, asynchronous mode) for OSPF neighbours — v1.1.
 *
 * A session exists for every FULL OSPF adjacency where OSPF on that router
 * registers with BFD ("bfd all-interfaces" or "ip ospf bfd"). It is Up when
 * both ends have BFD timers on the interface and both register OSPF.
 * Negotiated intervals: transmit = max(local DesiredMinTx, remote RequiredMinRx);
 * detection time = remote multiplier × max(local RequiredMinRx, remote DesiredMinTx).
 * Packets and timers are not run: the engine reconverges instantly, so the
 * detection time is computed and reported (show bfd, logs), not waited for.
 */

export interface BfdSession {
  deviceId: string;
  iface: string;
  neighborDeviceId: string;
  neighborIp: number;
  state: 'Up' | 'Down';
  reason?: string;
  localDisc: number;
  remoteDisc: number;
  txMs: number;
  rxMs: number;
  multiplier: number;
  detectMs: number;
  clients: string[];
}

export interface BfdResult {
  sessions: BfdSession[];
}

export const emptyBfd = (): BfdResult => ({ sessions: [] });

const registers = (cfg: NetConfig | undefined, iface: string) => !!cfg?.ospf && (!!cfg.ospf.bfdAllInterfaces || !!cfg.interfaces[iface]?.ospfBfd);

export function computeBfd(configs: Map<string, NetConfig>, ospf: OspfResult): BfdResult {
  const sessions: BfdSession[] = [];
  const disc = new Map<string, number>();
  const nextDisc = (dev: string, key: string) => {
    const k = `${dev}|${key}`;
    if (!disc.has(k)) disc.set(k, [...disc.keys()].filter((x) => x.startsWith(`${dev}|`)).length + 1);
    return disc.get(k)!;
  };
  for (const n of ospf.neighbors) {
    if (n.state !== 'FULL') continue;
    const local = configs.get(n.deviceId);
    if (!registers(local, n.iface)) continue;
    const back = ospf.neighbors.find((m) => m.deviceId === n.neighborDeviceId && m.neighborDeviceId === n.deviceId && m.state === 'FULL');
    const remote = configs.get(n.neighborDeviceId);
    const lt = local!.interfaces[n.iface]?.bfd;
    const rt = back ? remote?.interfaces[back.iface]?.bfd : undefined;
    const base = {
      deviceId: n.deviceId,
      iface: n.iface,
      neighborDeviceId: n.neighborDeviceId,
      neighborIp: n.neighborIp,
      localDisc: nextDisc(n.deviceId, n.iface),
      remoteDisc: back ? nextDisc(n.neighborDeviceId, back.iface) : 0,
      clients: ['OSPF'],
    };
    let reason: string | undefined;
    if (!lt) reason = 'no "bfd interval … min_rx … multiplier …" on this interface';
    else if (!back || !rt) reason = 'neighbour sends no BFD control packets (no BFD timers on its interface)';
    else if (!registers(remote, back.iface)) reason = 'neighbour has BFD timers but OSPF there does not register with BFD';
    if (reason || !lt || !rt) {
      sessions.push({
        ...base,
        state: 'Down',
        reason,
        remoteDisc: 0,
        txMs: lt?.intervalMs ?? 0,
        rxMs: lt?.minRxMs ?? 0,
        multiplier: lt?.multiplier ?? 0,
        detectMs: 0,
      });
      continue;
    }
    const txMs = Math.max(lt.intervalMs, rt.minRxMs);
    const rxMs = Math.max(lt.minRxMs, rt.intervalMs);
    sessions.push({ ...base, state: 'Up', txMs, rxMs, multiplier: lt.multiplier, detectMs: rt.multiplier * rxMs });
  }
  return { sessions };
}
