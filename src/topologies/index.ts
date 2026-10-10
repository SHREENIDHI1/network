import type { Topology } from '../model/types';

/**
 * Registry of preloaded topologies. Loaders are dynamic imports so each
 * topology is code-split and only fetched when a lab or the user opens it.
 */

export interface TopologyEntry {
  id: string;
  title: string;
  /** Hidden from the lab browser (e.g. reference solutions). */
  hidden?: boolean;
  load: () => Promise<Topology>;
}

export const TOPOLOGIES: readonly TopologyEntry[] = [
  {
    id: 'demo-networking',
    title: 'Demo: GOTN station LAN + MPLS uplink',
    load: () => import('./demoNetworking').then((m) => m.demoNetworking()),
  },
  {
    id: 'demo-two-station',
    title: 'Demo: two-station SDH + LAN',
    load: () => import('./demoTwoStation').then((m) => m.demoTwoStation()),
  },
  { id: 'lab-hub-vs-switch', title: 'Lab A4: hub vs switch', load: () => import('./basicsLabs').then((m) => m.hubVsSwitch()) },
  { id: 'lab-mtd-station-lan', title: 'Lab A5: MTD station LAN', load: () => import('./basicsLabs').then((m) => m.mtdStationLan()) },
  { id: 'lab-mtd-vlsm', title: 'Lab A6: MTD VLSM plan', load: () => import('./basicsLabs').then((m) => m.mtdVlsm()) },
  { id: 'lab-mtd-vlans', title: 'Lab A7: VLANs per application at MTD', load: () => import('./basicsLabs').then((m) => m.mtdVlans()) },
  { id: 'lab-mtd-resilience', title: 'Lab A8: MTD switching resilience', load: () => import('./basicsLabs').then((m) => m.mtdResilience()) },
];

export const TOPOLOGY_IDS: ReadonlySet<string> = new Set(TOPOLOGIES.map((t) => t.id));

export function getTopologyEntry(id: string): TopologyEntry | undefined {
  return TOPOLOGIES.find((t) => t.id === id);
}
