import type { DeviceKind } from '../model/types';

/**
 * Equipment detail panel data (networking devices visible in RailMPLS Lab).
 * Text is bilingual: `en` English, `hi` simple Hinglish. Commands stay English.
 * Pure data, no UI imports.
 */

export interface Bi {
  en: string;
  hi: string;
}

export type Family = 'endpoint' | 'hub' | 'l2switch' | 'l3switch' | 'router' | 'firewall' | 'mpls' | 'cloud';

export interface FamilyDoc {
  family: Family;
  /** How a frame/packet is handled, step by step. */
  forwarding: Bi[];
  /** Field checks / faults (symptom → check). */
  troubleshoot: Array<{ symptom: Bi; check: Bi }>;
  maintenance: Bi[];
  safety: Bi[];
}

export interface KindDoc {
  kind: DeviceKind;
  family: Family;
  /** Tooltip, ≤ 20 words. */
  oneLiner: Bi;
  overview: Bi;
  railwayUse: Bi;
}

/** One step of a config or verify guide. `cli` lines are real commands accepted by the simulator. */
export interface GuideStep {
  say: Bi;
  cli?: string[];
  /** 'ios' = IOS-like CLI, 'host' = Windows-style prompt, 'ui' = done in the properties panel. */
  where: 'ios' | 'host' | 'ui';
}

export type Capability = { what: string; status: 'simulated' | 'planned' | 'not-modelled'; note?: string };
