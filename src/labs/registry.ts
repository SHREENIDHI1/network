import { lockReason } from './framework/modules';
import type { Lab } from './framework/types';
import { CAPSTONE_LABS } from './content/capstone';
import { FOUNDATION_LABS } from './content/foundations';
import { BGP_LABS } from './content/bgp';
import { MPLS_LABS } from './content/mpls';
import { ROUTING_LABS } from './content/routing';

/**
 * Lab registry. Labs are added level by level: A4–A8 in P2, A9–A15 in P3, B-labs from P4.
 * Lock state is derived from module availability, never hard-coded.
 */
export const LABS: readonly Lab[] = [...FOUNDATION_LABS, ...ROUTING_LABS, ...CAPSTONE_LABS, ...MPLS_LABS, ...BGP_LABS];

export function visibleLabs(labs: readonly Lab[] = LABS): Lab[] {
  const part = (l: Lab) => (l.part === 'B' ? 1 : 0);
  return labs.filter((l) => !l.hidden).sort((a, b) => part(a) - part(b) || a.level - b.level || a.order - b.order);
}

export function labLockReason(lab: Lab): string | null {
  return lockReason(lab.requiredModules);
}

export function getLab(id: string, labs: readonly Lab[] = LABS): Lab | undefined {
  return labs.find((l) => l.id === id);
}
