import { lockReason } from './framework/modules';
import type { Lab } from './framework/types';

/**
 * Lab registry. Labs are added level by level (Phase 7.4–7.6).
 * Lock state is derived from module availability, never hard-coded.
 */
export const LABS: readonly Lab[] = [];

export function visibleLabs(labs: readonly Lab[] = LABS): Lab[] {
  return labs.filter((l) => !l.hidden).sort((a, b) => a.level - b.level || a.order - b.order);
}

export function labLockReason(lab: Lab): string | null {
  return lockReason(lab.requiredModules);
}

export function getLab(id: string, labs: readonly Lab[] = LABS): Lab | undefined {
  return labs.find((l) => l.id === id);
}
