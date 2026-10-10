import { computeBudget } from '../../engine/physical/opticalBudget';
import type { Topology } from '../../model/types';
import { BUILT_MODULES, type EngineModule } from './modules';
import type { OpticalLinkState, SimSnapshot } from './types';

/** Sections produced by engine modules other than topology/physical. */
export type EngineSections = Omit<SimSnapshot, 'topology' | 'modules' | 'optical'>;

/**
 * Builds the read-only snapshot that lab checks inspect.
 *
 * Today only the topology and physical modules exist, so only `topology`
 * and `optical` are filled from real state. Later phases pass their state in
 * `sections`; tests may also pass hand-built sections to exercise checkers.
 */
export function buildSnapshot(topology: Topology, sections: EngineSections = {}, modules: ReadonlySet<EngineModule> = BUILT_MODULES): SimSnapshot {
  const optical: OpticalLinkState[] = topology.links
    .filter((l) => l.kind === 'ofc' && l.optical)
    .map((l) => {
      const b = computeBudget(l.lengthKm, l.optical!);
      return { linkId: l.id, status: b.status, rxPowerDbm: b.rxPowerDbm, marginDb: b.marginDb };
    });
  return Object.freeze({ ...sections, topology, modules, optical });
}
