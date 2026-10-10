import type { Device } from '../../model/types';
import { effectivePort, isBridgeRole, isSubinterface, loopbackId, parentOf, roleOf, sviVlan, type NetConfig } from '../config/netConfig';
import { baseMac, macFor } from '../core/mac';
import type { StpState } from '../ethernet/stp';
import { portKey, type PhysicalState } from '../physical/linkState';
import { maskToPrefix, networkOf, parseIpv4 } from './ipv4';

/**
 * Layer-3 interfaces of a device, derived from its config and live L1/L2 state:
 *  - 'port' : routed physical port (router, L3-switch "no switchport", host NIC)
 *  - 'sub'  : router subinterface with 802.1Q encapsulation (router-on-a-stick)
 *  - 'svi'  : switch virtual interface "interface vlan N"
 *  - 'loop' : loopback "interface loopback N" (always up unless shut down)
 */

export interface L3Interface {
  name: string;
  kind: 'port' | 'sub' | 'svi' | 'loop';
  port?: string;
  vlan?: number;
  /** Subinterface sends/receives untagged (encapsulation dot1Q N native). */
  native?: boolean;
  ip?: number;
  prefixLen?: number;
  network?: number;
  mac: string;
  adminUp: boolean;
  /** Line protocol up. */
  up: boolean;
  reason?: string;
}

/** Is VLAN `vlan` carried by switchport `portId` (membership only, no STP/oper check)? */
export function portCarriesVlan(cfg: NetConfig, role: ReturnType<typeof roleOf>, portId: string, vlan: number): boolean {
  const p = effectivePort(role, cfg.interfaces[portId]);
  if (!p.switchport) return false;
  if (p.mode === 'access') return p.accessVlan === vlan;
  return p.trunkAllowed === 'all' || (p.trunkAllowed ?? []).includes(vlan);
}

export function vlanExists(cfg: NetConfig, vlan: number): boolean {
  return Object.prototype.hasOwnProperty.call(cfg.vlans, String(vlan));
}

function addr(ifCfg: { ip?: { address: string; mask: string } } | undefined) {
  if (!ifCfg?.ip) return {};
  const ip = parseIpv4(ifCfg.ip.address);
  const len = maskToPrefix(ifCfg.ip.mask);
  if (ip === null || len === null) return {};
  return { ip, prefixLen: len, network: networkOf(ip, len) };
}

export function deriveL3Interfaces(device: Device, cfg: NetConfig, phys: PhysicalState, stp: StpState): L3Interface[] {
  const role = roleOf(device.kind);
  if (role === 'opaque' || role === 'hub') return [];
  const out: L3Interface[] = [];
  const portUp = (portId: string) => !!phys.ports.get(portKey(device.id, portId))?.operUp;

  device.ports.forEach((p, idx) => {
    const eff = effectivePort(role, cfg.interfaces[p.id]);
    if (isBridgeRole(role) && eff.switchport) return; // L2 port, not an L3 interface
    const up = !eff.shutdown && portUp(p.id);
    out.push({
      name: p.id,
      kind: 'port',
      port: p.id,
      mac: macFor(device.id, idx),
      adminUp: !eff.shutdown,
      up,
      reason: eff.shutdown ? 'administratively down' : up ? undefined : 'line protocol down',
      ...addr(cfg.interfaces[p.id]),
    });
  });

  for (const [name, ic] of Object.entries(cfg.interfaces)) {
    if (role === 'router' && isSubinterface(name)) {
      const parent = parentOf(name);
      const idx = device.ports.findIndex((p) => p.id === parent);
      if (idx < 0) continue;
      const parentEff = effectivePort(role, cfg.interfaces[parent]);
      const adminUp = !(ic.shutdown ?? false);
      const up = adminUp && !parentEff.shutdown && portUp(parent) && !!ic.encapsulation;
      out.push({
        name,
        kind: 'sub',
        port: parent,
        vlan: ic.encapsulation?.vlan,
        native: ic.encapsulation?.native,
        mac: macFor(device.id, idx),
        adminUp,
        up,
        reason: !adminUp ? 'administratively down' : !ic.encapsulation ? 'no encapsulation' : up ? undefined : 'parent down',
        ...addr(ic),
      });
    }
    if (loopbackId(name) !== null && (role === 'router' || role === 'l3switch')) {
      const adminUp = !(ic.shutdown ?? false);
      out.push({ name, kind: 'loop', mac: baseMac(device.id), adminUp, up: adminUp, reason: adminUp ? undefined : 'administratively down', ...addr(ic) });
      continue;
    }
    const vlan = sviVlan(name);
    if (vlan !== null && isBridgeRole(role)) {
      // New SVIs are shut down until "no shutdown" (IOS behaviour).
      const adminUp = !(ic.shutdown ?? true);
      // Autostate: SVI is up only if the VLAN exists and at least one port in it is up and forwarding.
      const active =
        vlanExists(cfg, vlan) &&
        device.ports.some((p) => {
          if (!portCarriesVlan(cfg, role, p.id, vlan) || !portUp(p.id)) return false;
          return stp.ports.get(portKey(device.id, p.id))?.state === 'forwarding';
        });
      out.push({
        name,
        kind: 'svi',
        vlan,
        mac: baseMac(device.id),
        adminUp,
        up: adminUp && active,
        reason: !adminUp ? 'administratively down' : !vlanExists(cfg, vlan) ? 'VLAN does not exist' : active ? undefined : 'no active port in VLAN',
        ...addr(ic),
      });
    }
  }
  return out;
}
