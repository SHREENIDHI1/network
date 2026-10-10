/**
 * LEARN mode data model. Lessons are data files (Hinglish text with English
 * technical terms); the UI only renders them. Pure TS, no UI imports.
 */

export type WidgetId =
  | 'bandwidth-calc'
  | 'encapsulation'
  | 'optical-budget'
  | 'binary-converter'
  | 'mac-learning'
  | 'subnet-calc'
  | 'vlsm-planner'
  | 'vlan-tag'
  | 'root-election'
  | 'lpm'
  | 'spf'
  | 'acl-eval'
  | 'hsrp'
  | 'queue-sim'
  | 'label-header'
  | 'lsp-walk'
  | 'ibgp-mesh'
  | 'rt-matcher';
export type DiagramId =
  | 'circuit-vs-packet'
  | 'osi-stack'
  | 'fibre-vs-copper'
  | 'ethernet-frame'
  | 'vlan-trunk'
  | 'stp-loop'
  | 'router-on-a-stick'
  | 'dhcp-dora'
  | 'nat-pat';

export type LessonBlock =
  | { kind: 'text'; heading?: string; body: string }
  | { kind: 'analogy'; body: string }
  | { kind: 'keyterms'; terms: Array<{ term: string; meaning: string }> }
  | { kind: 'table'; caption?: string; headers: string[]; rows: string[][] }
  | { kind: 'widget'; widget: WidgetId; caption: string }
  | { kind: 'diagram'; diagram: DiagramId; caption: string }
  | { kind: 'note'; tone: 'info' | 'source' | 'safety'; body: string };

export interface FlashQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface GlossaryEntry {
  term: string;
  en: string;
  hi: string;
}

export interface Lesson {
  id: string; // "A0"
  part: 'A' | 'B';
  title: string;
  /** One-line Hinglish summary shown in the lesson list. */
  summary: string;
  estMinutes: number;
  blocks: LessonBlock[];
  /** Exactly 5 flash questions. */
  flash: FlashQuestion[];
  glossary: GlossaryEntry[];
  /** Where to practise; honest when the lab does not exist yet. */
  practice: { labId?: string; note: string };
}
