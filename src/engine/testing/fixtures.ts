import type { Topology } from '../../model/types';
import { getNetConfig, withNetConfig, type InterfaceConfig, type NetConfig } from '../config/netConfig';

/**
 * Helpers to build configured topologies in tests and lab fixtures without
 * going through the CLI.
 */

/** Returns a new topology where `deviceName`'s net config has been changed by `mutate`. */
export function configure(topo: Topology, deviceName: string, mutate: (c: NetConfig) => void): Topology {
  const dev = topo.devices.find((d) => d.name === deviceName);
  if (!dev) throw new Error(`No device named ${deviceName}`);
  const cfg = structuredClone(getNetConfig(dev));
  mutate(cfg);
  return { ...topo, devices: topo.devices.map((d) => (d.id === dev.id ? withNetConfig(d, cfg) : d)) };
}

export function setIf(c: NetConfig, name: string, patch: InterfaceConfig): void {
  c.interfaces[name] = { ...(c.interfaces[name] ?? {}), ...patch };
}

export function ipIf(c: NetConfig, name: string, address: string, mask = '255.255.255.0', extra: InterfaceConfig = {}): void {
  setIf(c, name, { ...extra, ip: { address, mask } });
}

export function addVlans(c: NetConfig, ...ids: number[]): void {
  for (const id of ids) c.vlans[String(id)] = { name: `VLAN${String(id).padStart(4, '0')}` };
}

/** Host NIC + default gateway in one call. */
export function host(topo: Topology, name: string, address: string, gateway?: string, mask = '255.255.255.0', nic = 'eth0'): Topology {
  return configure(topo, name, (c) => {
    ipIf(c, nic, address, mask);
    if (gateway) c.defaultGateway = gateway;
  });
}
