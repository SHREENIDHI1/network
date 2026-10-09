import { isDeviceKind } from '../../model/catalog';
import { isLinkKind } from '../../model/linkRules';
import { SAFETY_FIELD_WORK } from './common';
import type { Bi, DeviceDoc } from './types';

/**
 * Content validation for equipment docs, run by unit tests so incomplete or
 * inconsistent text never reaches learners.
 */

/** Vendor names allowed: only those named in the CAMTECH handbook, or "Generic". */
export const ALLOWED_VENDOR_EXAMPLES = [
  'Generic',
  'Cisco ASR 920',
  'Cisco ASR 903',
  'Juniper ACX4000',
  'Juniper MX104',
  'Nokia SAR8',
  'Nokia IXR R4',
  'Team Engineers NEON',
];

const SPEC_LABEL = /standard|typical|requirement/i;

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function biErrors(at: string, field: string, v: Bi): string[] {
  const e: string[] = [];
  if (!v.en.trim()) e.push(`${at}: ${field}.en is empty`);
  if (!v.hi.trim()) e.push(`${at}: ${field}.hi is empty`);
  return e;
}

export function validateDeviceDoc(d: DeviceDoc, labIds: ReadonlySet<string>): string[] {
  const at = `Doc ${d.type}`;
  const e: string[] = [];

  if (!isDeviceKind(d.type)) e.push(`${at}: unknown device kind`);
  if (!d.fullName.trim()) e.push(`${at}: fullName empty`);

  e.push(...biErrors(at, 'oneLiner', d.oneLiner));
  e.push(...biErrors(at, 'overview', d.overview));
  e.push(...biErrors(at, 'railwayRole', d.railwayRole));
  e.push(...biErrors(at, 'migrationNote', d.migrationNote));
  d.safetyNotes.forEach((s, i) => e.push(...biErrors(at, `safetyNotes[${i}]`, s)));
  d.commonFaults.forEach((f, i) => e.push(...biErrors(at, `commonFaults[${i}].symptom`, f.symptom)));

  if (wordCount(d.oneLiner.en) > 20 || wordCount(d.oneLiner.hi) > 20) e.push(`${at}: oneLiner must be ≤ 20 words`);
  for (const lang of ['en', 'hi'] as const) {
    const lines = d.overview[lang].split('\n').filter((l) => l.trim());
    if (lines.length < 4 || lines.length > 7) e.push(`${at}: overview.${lang} should be 4–6 lines plus an analogy`);
  }
  if (!/analogy/i.test(d.overview.en)) e.push(`${at}: overview.en needs a railway analogy`);
  if (!/misaal/i.test(d.overview.hi)) e.push(`${at}: overview.hi needs an analogy (Misaal)`);

  const nonEmpty: Array<[string, unknown[]]> = [
    ['whereInstalled', d.whereInstalled],
    ['layer', d.layer],
    ['cardsAndModules', d.cardsAndModules],
    ['ports', d.ports],
    ['typicalSpecs', d.typicalSpecs],
    ['connectsTo', d.connectsTo],
    ['protocolsStandards', d.protocolsStandards],
    ['configBasics', d.configBasics],
    ['ledsAndAlarms', d.ledsAndAlarms],
    ['maintenance', d.maintenance],
    ['commonFaults', d.commonFaults],
    ['safetyNotes', d.safetyNotes],
    ['vendorExamples', d.vendorExamples],
    ['glossary', d.glossary],
    ['sources', d.sources],
  ];
  for (const [name, arr] of nonEmpty) if (!arr.length) e.push(`${at}: ${name} must not be empty`);

  for (const p of d.ports) if (!p.name || !p.medium || !p.connector || !p.rate || !p.purpose) e.push(`${at}: port ${p.name} has empty fields`);
  for (const s of d.typicalSpecs) if (!SPEC_LABEL.test(s.note)) e.push(`${at}: spec "${s.param}" must be labelled Standard or Typical`);
  for (const c of d.connectsTo) {
    if (!isLinkKind(c.link)) e.push(`${at}: connectsTo uses unknown link kind ${c.link}`);
    if (!c.device.trim() || !c.note.trim()) e.push(`${at}: connectsTo entry incomplete`);
    if (/^[a-z0-9-]+$/.test(c.device) && !isDeviceKind(c.device)) e.push(`${at}: connectsTo unknown device kind ${c.device}`);
  }
  for (const a of d.ledsAndAlarms) if (!a.indicator || !a.meaning || !a.action) e.push(`${at}: alarm entry incomplete`);
  for (const f of d.commonFaults) if (!f.likelyCause || !f.howToCheck || !f.fix) e.push(`${at}: fault entry incomplete`);
  for (const g of d.glossary) if (!g.term.trim() || !g.meaning.trim()) e.push(`${at}: glossary entry incomplete`);
  for (const v of d.vendorExamples) if (!ALLOWED_VENDOR_EXAMPLES.includes(v)) e.push(`${at}: vendor example "${v}" is not from the CAMTECH handbook`);
  for (const id of d.relatedLabs) if (!labIds.has(id)) e.push(`${at}: relatedLabs id ${id} does not exist`);

  if (d.quickQuiz.length !== 3) e.push(`${at}: quickQuiz must have 3 questions`);
  d.quickQuiz.forEach((q, i) => {
    if (!q.prompt.trim()) e.push(`${at}: quiz ${i} prompt empty`);
    if (q.options.length < 2 || new Set(q.options).size !== q.options.length) e.push(`${at}: quiz ${i} options invalid`);
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) e.push(`${at}: quiz ${i} correctIndex out of range`);
    if (!q.explanation.trim()) e.push(`${at}: quiz ${i} needs an explanation`);
  });

  if (d.safetyCritical && !d.safetyNotes.some((s) => s.en === SAFETY_FIELD_WORK.en))
    e.push(`${at}: safety-critical equipment must carry the field-work safety note`);
  return e;
}
