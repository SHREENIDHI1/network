import type { DeviceDoc, DocTab } from './types';

/**
 * Full-text search across equipment docs. Each hit points to the tab where
 * the match lives, so the UI can jump straight there.
 */

export interface DocSearchHit {
  type: DeviceDoc['type'];
  fullName: string;
  tab: DocTab;
  /** Short excerpt around the match. */
  snippet: string;
  score: number;
}

interface Field {
  tab: DocTab;
  text: string;
  weight: number;
}

function fieldsOf(d: DeviceDoc): Field[] {
  return [
    { tab: 'overview', text: d.fullName, weight: 10 },
    { tab: 'overview', text: `${d.oneLiner.en} ${d.oneLiner.hi}`, weight: 4 },
    { tab: 'overview', text: d.glossary.map((g) => `${g.term}: ${g.meaning}`).join('\n'), weight: 5 },
    { tab: 'overview', text: `${d.overview.en}\n${d.overview.hi}`, weight: 2 },
    { tab: 'alarms', text: d.ledsAndAlarms.map((a) => `${a.indicator}: ${a.meaning}`).join('\n'), weight: 6 },
    { tab: 'troubleshoot', text: d.commonFaults.map((f) => `${f.symptom.en} ${f.symptom.hi} ${f.likelyCause}`).join('\n'), weight: 4 },
    { tab: 'ports', text: [...d.cardsAndModules, ...d.ports.map((p) => `${p.name} ${p.purpose}`)].join('\n'), weight: 3 },
    { tab: 'specs', text: [...d.typicalSpecs.map((s) => `${s.param} ${s.value}`), ...d.protocolsStandards].join('\n'), weight: 3 },
    { tab: 'railway', text: `${d.railwayRole.en}\n${d.railwayRole.hi}\n${d.migrationNote.en}`, weight: 2 },
    { tab: 'config', text: d.configBasics.join('\n'), weight: 1 },
    { tab: 'maintenance', text: d.maintenance.map((m) => m.check).join('\n'), weight: 1 },
  ];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function snippetAround(text: string, idx: number, len: number): string {
  const line = text.slice(text.lastIndexOf('\n', idx) + 1, (text.indexOf('\n', idx + len) + 1 || text.length + 1) - 1);
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

export function searchDocs(docs: readonly DeviceDoc[], query: string, limit = 20): DocSearchHit[] {
  const q = query.trim();
  if (q.length < 2) return [];
  // Whole-word match for short technical terms (TS16, RDI, LOS) so "RDI" does not hit "coordination".
  const re = new RegExp(q.length <= 5 ? `\\b${escapeRe(q)}\\b` : escapeRe(q), 'i');
  const hits: DocSearchHit[] = [];
  for (const d of docs) {
    let best: DocSearchHit | undefined;
    for (const f of fieldsOf(d)) {
      const m = re.exec(f.text);
      if (!m) continue;
      const count = f.text.split(new RegExp(re.source, 'gi')).length - 1;
      const score = f.weight * (1 + Math.log2(count));
      if (!best || score > best.score) best = { type: d.type, fullName: d.fullName, tab: f.tab, snippet: snippetAround(f.text, m.index, m[0].length), score };
    }
    if (best) hits.push(best);
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
