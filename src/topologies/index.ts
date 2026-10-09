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
    id: 'demo-two-station',
    title: 'Demo: two-station SDH + LAN',
    load: () => import('./demoTwoStation').then((m) => m.demoTwoStation()),
  },
];

export const TOPOLOGY_IDS: ReadonlySet<string> = new Set(TOPOLOGIES.map((t) => t.id));

export function getTopologyEntry(id: string): TopologyEntry | undefined {
  return TOPOLOGIES.find((t) => t.id === id);
}
