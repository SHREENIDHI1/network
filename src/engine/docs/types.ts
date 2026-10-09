import type { DeviceKind, LinkKind } from '../../model/types';

/**
 * Equipment Encyclopedia data model. Pure data: no UI imports.
 *
 * Bilingual fields use `Bi` ({ en, hi }); `hi` is simple Hinglish (Roman
 * script). Technical tables (ports, specs, alarms, CLI) stay in English, as
 * they appear on real equipment and in manuals.
 */

export interface Bi {
  en: string;
  hi: string;
}

export type OsiLayer = 'physical' | 'TDM (PDH/SDH)' | 'L2' | 'L3' | 'MPLS (L2.5)' | 'application';

export interface PortDoc {
  name: string;
  medium: string;
  connector: string;
  rate: string;
  purpose: string;
}

export interface SpecDoc {
  param: string;
  value: string;
  /** "Standard" when fixed by a standard; otherwise a teaching value, labelled typical. */
  note: string;
}

export interface ConnectsToDoc {
  /** Device kind at the other end, or a free-text description for things not on the palette. */
  device: DeviceKind | string;
  link: LinkKind;
  note: string;
}

export interface AlarmDoc {
  indicator: string;
  meaning: string;
  action: string;
}

export interface MaintenanceDoc {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half-yearly' | 'yearly' | 'as required';
  check: string;
}

export interface FaultDoc {
  /** Field complaint, as the station/control would report it. */
  symptom: Bi;
  likelyCause: string;
  howToCheck: string;
  fix: string;
}

export interface QuizDoc {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface GlossaryDoc {
  term: string;
  meaning: string;
}

export interface DeviceDoc {
  type: DeviceKind;
  fullName: string;
  /** Tooltip, max 20 words. */
  oneLiner: Bi;
  /** 4–6 simple lines plus one railway analogy. */
  overview: Bi;
  railwayRole: Bi;
  whereInstalled: string[];
  layer: OsiLayer[];
  cardsAndModules: string[];
  ports: PortDoc[];
  typicalSpecs: SpecDoc[];
  connectsTo: ConnectsToDoc[];
  protocolsStandards: string[];
  /** Ordered steps. CLI examples for IP gear; EMS/LCT GUI steps (vendor-neutral) for TDM gear. */
  configBasics: string[];
  ledsAndAlarms: AlarmDoc[];
  maintenance: MaintenanceDoc[];
  commonFaults: FaultDoc[];
  /** Shown prominently in the UI. */
  safetyNotes: Bi[];
  /** Fate in SDH → IP-MPLS migration (Option 1). */
  migrationNote: Bi;
  /** Vendor examples only where the CAMTECH handbook names them; otherwise ["Generic"]. */
  vendorExamples: string[];
  relatedLabs: string[];
  quickQuiz: QuizDoc[];
  glossary: GlossaryDoc[];
  sources: string[];
  /** Notes where the handbook differs from the standard term/behaviour. */
  handbookNotes?: string[];
  /** Marks content an S&T field expert should review before training use. */
  needsExpertReview?: string;
  /** True for circuits that affect train safety (block, BPAC, signalling data). */
  safetyCritical?: boolean;
}

/** Tabs of the info panel; search results point to one of these. */
export type DocTab =
  | 'overview'
  | 'ports'
  | 'specs'
  | 'railway'
  | 'config'
  | 'alarms'
  | 'maintenance'
  | 'troubleshoot'
  | 'live'
  | 'quiz';
