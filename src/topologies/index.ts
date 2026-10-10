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
  { id: 'lab-mtd-roas', title: 'Lab A9: MTD router-on-a-stick', load: () => import('./routingLabs').then((m) => m.mtdRouterOnAStick()) },
  { id: 'lab-ospf-ring', title: 'Lab A10: OSPF ring JU–BNO–JWL–AAS', load: () => import('./routingLabs').then((m) => m.ospfRing()) },
  { id: 'lab-isis-triangle', title: 'Lab A10: IS-IS triangle JU–MTD–DNA', load: () => import('./routingLabs').then((m) => m.isisTriangle()) },
  { id: 'lab-ju-services', title: 'Lab A11: JU HQ network services', load: () => import('./routingLabs').then((m) => m.juServices()) },
  { id: 'lab-mtd-security', title: 'Lab A12: MTD security', load: () => import('./routingLabs').then((m) => m.mtdSecurity()) },
  { id: 'lab-mtd-hsrp', title: 'Lab A13: MTD gateway redundancy', load: () => import('./routingLabs').then((m) => m.mtdHsrp()) },
  { id: 'lab-mtd-qos', title: 'Lab A14: QoS on the MTD–JU uplink', load: () => import('./routingLabs').then((m) => m.mtdQos()) },
  { id: 'lab-capstone-mtd-ju', title: 'Lab A15: MTD + JU capstone', load: () => import('./routingLabs').then((m) => m.capstone()) },
  { id: 'lab-b1-bno', title: 'Lab B1: commission BNO-LER', load: () => import('./mplsLabs').then((m) => m.b1Station()) },
  { id: 'lab-b2-core', title: 'Lab B2: IGP for the J1 core', load: () => import('./mplsLabs').then((m) => m.b2Core()) },
  { id: 'lab-b3-core', title: 'Lab B3: first LSP JU → DNA', load: () => import('./mplsLabs').then((m) => m.b3Core()) },
  { id: 'lab-b4-j2', title: 'Lab B4: LDP troubleshooting on J2', load: () => import('./mplsLabs').then((m) => m.b4J2()) },
];

export const TOPOLOGY_IDS: ReadonlySet<string> = new Set(TOPOLOGIES.map((t) => t.id));

export function getTopologyEntry(id: string): TopologyEntry | undefined {
  return TOPOLOGIES.find((t) => t.id === id);
}
