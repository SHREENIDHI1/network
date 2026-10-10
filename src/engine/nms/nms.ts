import { roleOf } from '../config/netConfig';
import { formatIpv4, parseIpv4 } from '../ip/ipv4';
import { analyseTraffic, walkFlow } from '../qos/analysis';
import type { Sim } from '../sim';

/**
 * NMS view (P8), computed from engine state the way an SNMP-based NMS would
 * see it:
 *  - a device is MANAGED when it has an SNMP community equal to the NMS
 *    polling community and the NMS server has a path to one of its addresses;
 *    a device that has the community but cannot be reached is UNREACHABLE;
 *  - alarms are raised only for managed devices (plus "node unreachable"),
 *    in two layers: probable root causes (power, card, link, IGP, LDP) and
 *    impact (BGP, pseudowire, TE, congestion, services);
 *  - correlation is rule-based: every impact alarm lists the root-cause
 *    alarms present at the same time (no timing or topology inference).
 * See Model Limitations.
 */

export type NmsAlarmType =
  | 'NODE-UNREACHABLE'
  | 'NOT-MANAGED'
  | 'POWER-FAIL'
  | 'CARD-FAIL'
  | 'LINK-DOWN'
  | 'ERR-DISABLED'
  | 'OSPF-DOWN'
  | 'LDP-DOWN'
  | 'BGP-DOWN'
  | 'PW-DOWN'
  | 'TE-DOWN'
  | 'TE-FRR-ACTIVE'
  | 'CONGESTION'
  | 'SERVICE-DOWN'
  | 'SERVICE-DEGRADED';

export type Severity = 'critical' | 'major' | 'minor' | 'warning';

export interface NmsAlarm {
  id: string;
  deviceId: string;
  object?: string;
  type: NmsAlarmType;
  severity: Severity;
  text: string;
  layer: 'root' | 'impact' | 'info';
  /** Root-cause alarm ids this impact alarm is probably caused by. */
  causes: string[];
}

export interface NmsService {
  name: string;
  kind: 'path' | 'pw';
  status: 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN';
  detail: string;
  safety: boolean;
  path: string[];
}

export interface NmsDevice {
  deviceId: string;
  state: 'managed' | 'unreachable' | 'not-managed';
  reason?: string;
}

export interface NmsLinkLoad {
  deviceId: string;
  iface: string;
  capacityMbps: number;
  offeredMbps: number;
  pct: number;
}

export interface NmsView {
  nmsDeviceId?: string;
  pollCommunity?: string;
  devices: NmsDevice[];
  alarms: NmsAlarm[];
  services: NmsService[];
  loads: NmsLinkLoad[];
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2, warning: 3 };

export function computeNms(sim: Sim): NmsView {
  const view: NmsView = { devices: [], alarms: [], services: [], loads: [] };
  const nms = sim.topology.devices.find((d) => d.kind === 'nms' && sim.config(d.id)?.nms);
  if (!nms) return view;
  view.nmsDeviceId = nms.id;
  const ncfg = sim.config(nms.id)!.nms!;
  view.pollCommunity = ncfg.pollCommunity;
  const name = (id: string) => sim.device(id)?.name ?? id;
  const nmsUp = !nms.fault?.power && sim.interfaces(nms.id).some((i) => i.up && i.ip !== undefined);
  const nmsIp = sim.interfaces(nms.id).find((i) => i.up && i.ip !== undefined)?.ip;

  // ---------------------------------------------------------- managed?
  const managed = new Set<string>();
  for (const d of sim.topology.devices) {
    const role = roleOf(d.kind);
    if (!['router', 'l3switch', 'switch'].includes(role)) continue;
    const c = sim.config(d.id)!;
    const has = !!ncfg.pollCommunity && c.mgmt.snmpCommunities[ncfg.pollCommunity] !== undefined;
    if (!has) {
      view.devices.push({
        deviceId: d.id,
        state: 'not-managed',
        reason: ncfg.pollCommunity ? `no "snmp-server community ${ncfg.pollCommunity} ro"` : 'the NMS has no polling community set',
      });
      continue;
    }
    const addrs = d.fault?.power ? [] : sim.interfaces(d.id).filter((i) => i.ip !== undefined && !i.vrf && i.up);
    const reach = nmsUp && addrs.some((a) => !walkFlow(sim, nms.id, a.ip!, 0).error);
    // An SNMP poll needs the reply too: the device must route back to the NMS.
    const back = reach && (nmsIp === undefined || !walkFlow(sim, d.id, nmsIp, 0).error);
    if (reach && back) {
      managed.add(d.id);
      view.devices.push({ deviceId: d.id, state: 'managed' });
    } else
      view.devices.push({
        deviceId: d.id,
        state: 'unreachable',
        reason: d.fault?.power
          ? 'no response (device is down)'
          : reach
            ? 'no route back to the NMS (replies are lost)'
            : 'no path from the NMS to any of its addresses',
      });
  }

  const alarms: NmsAlarm[] = [];
  const add = (a: Omit<NmsAlarm, 'id' | 'causes'>) => alarms.push({ ...a, id: `${a.type}|${a.deviceId}|${a.object ?? ''}`, causes: [] });

  for (const dv of view.devices) {
    if (dv.state === 'unreachable')
      add({ deviceId: dv.deviceId, type: 'NODE-UNREACHABLE', severity: 'critical', layer: 'root', text: `${name(dv.deviceId)}: ${dv.reason}` });
    if (dv.state === 'not-managed')
      add({
        deviceId: dv.deviceId,
        type: 'NOT-MANAGED',
        severity: 'warning',
        layer: 'info',
        text: `${name(dv.deviceId)} is not managed: ${dv.reason}`,
      });
  }

  // ------------------------------------------------- physical / ports
  for (const d of sim.topology.devices) {
    if (!managed.has(d.id)) continue;
    for (const c of d.fault?.cards ?? [])
      add({ deviceId: d.id, object: c, type: 'CARD-FAIL', severity: 'major', layer: 'root', text: `${name(d.id)}: line card ${c}x failed` });
    for (const p of d.ports) {
      const st = sim.phys.ports.get(`${d.id}|${p.id}`);
      if (!st?.linkId || !st.adminUp || st.operUp) continue;
      if (st.reason === 'card failed') continue;
      if (st.reason === 'err-disabled') {
        add({ deviceId: d.id, object: p.id, type: 'ERR-DISABLED', severity: 'major', layer: 'root', text: `${name(d.id)} ${p.id} err-disabled` });
        continue;
      }
      const peer = st.peer ? sim.device(st.peer.deviceId) : undefined;
      const why = st.reason === 'peer down' && peer?.fault?.power ? `${peer.name} has no power` : (st.reason ?? 'down');
      add({
        deviceId: d.id,
        object: p.id,
        type: 'LINK-DOWN',
        severity: 'major',
        layer: 'root',
        text: `${name(d.id)} ${p.id}${peer ? ` → ${peer.name}` : ''} down (${why})`,
      });
    }
  }
  for (const d of sim.topology.devices)
    if (d.fault?.power) {
      const nb = sim.topology.links.some(
        (l) => (l.a.deviceId === d.id && managed.has(l.b.deviceId)) || (l.b.deviceId === d.id && managed.has(l.a.deviceId)),
      );
      if (nb)
        add({
          deviceId: d.id,
          type: 'POWER-FAIL',
          severity: 'critical',
          layer: 'root',
          text: `${name(d.id)}: power failure suspected (neighbours report the links to it down)`,
        });
    }

  // ------------------------------------------------------ protocols
  const linkUp = (dev: string, iface: string) => sim.interfaces(dev).find((i) => i.name === iface)?.up;
  for (const oi of sim.ospf.interfaces) {
    if (!managed.has(oi.deviceId) || oi.passive || !linkUp(oi.deviceId, oi.iface)) continue;
    const l3 = sim.interfaces(oi.deviceId).find((i) => i.name === oi.iface);
    const st = l3?.port ? sim.phys.ports.get(`${oi.deviceId}|${l3.port}`) : undefined;
    if (!st?.peer) continue;
    const peerRouter = ['router', 'l3switch'].includes(roleOf(sim.device(st.peer.deviceId)?.kind ?? 'pc'));
    if (peerRouter && oi.fullNeighbors === 0)
      add({
        deviceId: oi.deviceId,
        object: oi.iface,
        type: 'OSPF-DOWN',
        severity: 'major',
        layer: 'root',
        text: `${name(oi.deviceId)} ${oi.iface}: no FULL OSPF neighbour on an up link`,
      });
  }
  // LDP: an "mpls ip" link with a FULL OSPF neighbour but no LDP hello from it.
  for (const n of sim.ospf.neighbors) {
    if (n.state !== 'FULL' || !managed.has(n.deviceId)) continue;
    const me = sim.ldp.routers.get(n.deviceId);
    if (!me?.mplsIfaces.includes(n.iface)) continue;
    if (sim.ldp.discoveries.some((x) => x.deviceId === n.deviceId && x.iface === n.iface)) continue;
    add({
      deviceId: n.deviceId,
      object: n.iface,
      type: 'LDP-DOWN',
      severity: 'major',
      layer: 'root',
      text: `${name(n.deviceId)} ${n.iface}: OSPF FULL with ${name(n.neighborDeviceId)} but no LDP hello from it (MPLS not enabled at the far end?)`,
    });
  }
  for (const s of sim.ldp.sessions) {
    if (s.state === 'OPERATIONAL' || (!managed.has(s.a) && !managed.has(s.b))) continue;
    const dev = managed.has(s.a) ? s.a : s.b;
    add({
      deviceId: dev,
      object: `${name(s.a)}–${name(s.b)}`,
      type: 'LDP-DOWN',
      severity: 'major',
      layer: 'root',
      text: `LDP ${name(s.a)}–${name(s.b)} not operational${s.reason ? ` (${s.reason})` : ''}`,
    });
  }
  for (const p of sim.bgp.peerings) {
    if (p.state === 'Established' || p.state === 'Idle (Admin)' || !managed.has(p.dev)) continue;
    add({
      deviceId: p.dev,
      object: `${p.vrf ? `vrf ${p.vrf} ` : ''}${formatIpv4(p.neighbor)}`,
      type: 'BGP-DOWN',
      severity: 'major',
      layer: 'impact',
      text: `${name(p.dev)} BGP ${p.vrf ? `(vrf ${p.vrf}) ` : ''}${formatIpv4(p.neighbor)} ${p.state}${p.reason ? `: ${p.reason}` : ''}`,
    });
  }
  for (const e of sim.pw.endpoints) {
    if (e.status === 'UP' || !managed.has(e.deviceId)) continue;
    add({
      deviceId: e.deviceId,
      object: `${e.ac} VC ${e.vcId}`,
      type: 'PW-DOWN',
      severity: 'major',
      layer: 'impact',
      text: `${name(e.deviceId)} ${e.ac} VC ${e.vcId} → ${formatIpv4(e.peer)} DOWN: ${e.reason}`,
    });
  }
  for (const l of sim.te.lsps) {
    if (!managed.has(l.head)) continue;
    if (l.state !== 'up' && !l.reason?.includes('administratively'))
      add({
        deviceId: l.head,
        object: l.tunnel,
        type: 'TE-DOWN',
        severity: 'major',
        layer: 'impact',
        text: `${name(l.head)} ${l.tunnel} down: ${l.reason}`,
      });
    if (l.frr.state === 'active')
      add({
        deviceId: l.head,
        object: l.tunnel,
        type: 'TE-FRR-ACTIVE',
        severity: 'minor',
        layer: 'impact',
        text: `${name(l.head)} ${l.tunnel} is running on its FRR backup — re-optimise`,
      });
  }

  // ----------------------------------------------------- utilisation
  const qos = analyseTraffic(sim);
  for (const q of qos.queues) {
    if (q.capacityMbps <= 0 || !managed.has(q.deviceId)) continue;
    const pct = (q.offeredMbps / q.capacityMbps) * 100;
    view.loads.push({ deviceId: q.deviceId, iface: q.iface, capacityMbps: q.capacityMbps, offeredMbps: q.offeredMbps, pct });
    if (pct > 100)
      add({
        deviceId: q.deviceId,
        object: q.iface,
        type: 'CONGESTION',
        severity: 'major',
        layer: 'impact',
        text: `${name(q.deviceId)} ${q.iface}: ${pct.toFixed(0)}% offered — traffic is dropped`,
      });
    else if (pct > 90)
      add({
        deviceId: q.deviceId,
        object: q.iface,
        type: 'CONGESTION',
        severity: 'minor',
        layer: 'impact',
        text: `${name(q.deviceId)} ${q.iface}: ${pct.toFixed(0)}% utilised`,
      });
  }
  view.loads.sort((a, b) => b.pct - a.pct);

  // ------------------------------------------------------- services
  for (const s of ncfg.services) {
    const svc: NmsService = { name: s.name, kind: s.kind, status: 'UNKNOWN', detail: '', safety: !!s.safety, path: [] };
    if (s.kind === 'path') {
      const src = s.src ? sim.deviceByName(s.src) : undefined;
      const dst = s.dst ? parseIpv4(s.dst) : null;
      if (!src || dst === null) svc.detail = 'service definition incomplete';
      else {
        const w = walkFlow(sim, src.id, dst, 0);
        svc.path = [...new Set(w.hops.map((h) => name(h.deviceId)))];
        if (w.error) {
          svc.status = 'DOWN';
          svc.detail = w.error;
        } else {
          const lossy = qos.flows.find((f) => f.srcDeviceId === src.id && f.dst === s.dst && f.lossPct > 1);
          svc.status = lossy ? 'DEGRADED' : 'UP';
          svc.detail = lossy ? `${lossy.app} loses ${lossy.lossPct.toFixed(1)}%` : 'path complete';
        }
      }
    } else {
      const a = s.a ? sim.deviceByName(s.a) : undefined;
      const e = a ? sim.pw.endpoints.find((x) => x.deviceId === a.id && x.vcId === s.vcId) : undefined;
      if (!e) {
        svc.status = 'DOWN';
        svc.detail = `no pseudowire VC ${s.vcId} on ${s.a}`;
      } else {
        svc.status = e.status === 'UP' ? 'UP' : 'DOWN';
        svc.detail = e.status === 'UP' ? `VC ${e.vcId} up` : (e.reason ?? 'down');
        svc.path = [name(e.deviceId), e.remoteDeviceId ? name(e.remoteDeviceId) : formatIpv4(e.peer)];
      }
    }
    view.services.push(svc);
    if (svc.status === 'DOWN')
      add({
        deviceId: nms.id,
        object: s.name,
        type: 'SERVICE-DOWN',
        severity: svc.safety ? 'critical' : 'major',
        layer: 'impact',
        text: `Service "${s.name}" DOWN: ${svc.detail}`,
      });
    if (svc.status === 'DEGRADED')
      add({
        deviceId: nms.id,
        object: s.name,
        type: 'SERVICE-DEGRADED',
        severity: 'minor',
        layer: 'impact',
        text: `Service "${s.name}" degraded: ${svc.detail}`,
      });
  }

  // ---------------------------------------------------- correlation
  const roots = alarms.filter((a) => a.layer === 'root').map((a) => a.id);
  for (const a of alarms) if (a.layer === 'impact' && a.type !== 'CONGESTION' && a.type !== 'SERVICE-DEGRADED') a.causes = roots;
  view.alarms = alarms.sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity] || x.layer.localeCompare(y.layer));
  return view;
}
