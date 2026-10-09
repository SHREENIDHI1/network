import raw from './jodhpurDivision.json';

/**
 * Jodhpur division station data (NWR), loaded from jodhpurDivision.json.
 * Pure data + checks: no UI imports. Everything here is a TRACK map reading;
 * the simulator assumes OFC runs along the track (see Model Limitations).
 */

export type ControlBoard = 'North' | 'Central' | 'West' | 'East';
export type Confidence = 'high' | 'check';

export interface Station {
  code: string;
  name: string;
  isJunction: boolean;
  isDivisionBoundary: boolean;
  isHalt: boolean;
  confidence: Confidence;
  note?: string;
}

export interface Stop {
  code: string;
  /** Chainage as printed, along the section's chainageRef line; null = not known yet. */
  km: number | null;
  confidence: Confidence;
  note?: string;
}

export interface Section {
  id: string;
  name: string;
  controlBoard: ControlBoard | null;
  controlBoardConfidence: Confidence;
  chainageRef: string;
  stops: Stop[];
  note?: string;
}

export interface JodhpurData {
  meta: { title: string; source: string; imageAvailable: boolean; disclaimer: string; kmNote: string; version: number };
  controlBoards: ControlBoard[];
  stations: Station[];
  sections: Section[];
}

export const JODHPUR: JodhpurData = raw as JodhpurData;

export function station(code: string, d: JodhpurData = JODHPUR): Station | undefined {
  return d.stations.find((s) => s.code === code);
}

/** Sections a station appears in. */
export function sectionsOf(code: string, d: JodhpurData = JODHPUR): Section[] {
  return d.sections.filter((s) => s.stops.some((p) => p.code === code));
}

/** Control boards a station belongs to (several for junctions between boards). */
export function boardsOf(code: string, d: JodhpurData = JODHPUR): ControlBoard[] {
  return [...new Set(sectionsOf(code, d).map((s) => s.controlBoard).filter((b): b is ControlBoard => b !== null))];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Span {
  section: string;
  a: string;
  b: string;
  /** Length from chainage difference; null if either km is unknown. */
  km: number | null;
}

/** Spans between consecutive stops of every section. */
export function spans(d: JodhpurData = JODHPUR): Span[] {
  const out: Span[] = [];
  for (const s of d.sections)
    for (let i = 0; i + 1 < s.stops.length; i++) {
      const p = s.stops[i];
      const q = s.stops[i + 1];
      out.push({ section: s.id, a: p.code, b: q.code, km: p.km !== null && q.km !== null ? round2(Math.abs(p.km - q.km)) : null });
    }
  return out;
}

/** Length between two stops of the same section (chainage difference), or null. */
export function distanceKm(sectionId: string, a: string, b: string, d: JodhpurData = JODHPUR): number | null {
  const s = d.sections.find((x) => x.id === sectionId);
  const pa = s?.stops.find((p) => p.code === a);
  const pb = s?.stops.find((p) => p.code === b);
  if (!pa || !pb || pa.km === null || pb.km === null) return null;
  return round2(Math.abs(pa.km - pb.km));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateJodhpur(d: JodhpurData = JODHPUR): string[] {
  const errors: string[] = [];
  const codes = new Set<string>();
  for (const s of d.stations) {
    if (codes.has(s.code)) errors.push(`Duplicate station code ${s.code}`);
    codes.add(s.code);
  }
  const sectionIds = new Set<string>();
  for (const sec of d.sections) {
    if (sectionIds.has(sec.id)) errors.push(`Duplicate section id ${sec.id}`);
    sectionIds.add(sec.id);
    const seen = new Set<string>();
    for (const p of sec.stops) {
      if (!codes.has(p.code)) errors.push(`${sec.id}: stop ${p.code} is not in the station list`);
      if (seen.has(p.code)) errors.push(`${sec.id}: ${p.code} appears twice`);
      seen.add(p.code);
    }
    // km must be strictly monotonic along the section (ignoring unknown km).
    const known = sec.stops.filter((p) => p.km !== null).map((p) => p.km!);
    if (known.length >= 2) {
      const dir = Math.sign(known[known.length - 1] - known[0]);
      for (let i = 1; i < known.length; i++)
        if (Math.sign(known[i] - known[i - 1]) !== dir) errors.push(`${sec.id}: km not monotonic at ${known[i - 1]} → ${known[i]}`);
    }
  }
  for (const s of d.stations) {
    const n = sectionsOf(s.code, d).length;
    if (n === 0) errors.push(`${s.code} is not in any section`);
    if (s.isJunction && !s.isDivisionBoundary && n < 2) errors.push(`Junction ${s.code} appears in only ${n} section(s)`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// "check" report (things the user must verify on the physical map)
// ---------------------------------------------------------------------------

export interface CheckRow {
  where: string;
  code: string;
  name: string;
  field: string;
  value: string;
  reason: string;
}

export function checkReport(d: JodhpurData = JODHPUR): CheckRow[] {
  const rows: CheckRow[] = [];
  for (const s of d.stations)
    if (s.confidence === 'check') rows.push({ where: 'station', code: s.code, name: s.name, field: s.code.startsWith('UNK-') ? 'code' : 'name', value: s.code.startsWith('UNK-') ? '(unknown)' : s.name, reason: s.note ?? 'Unclear in seed' });
  for (const sec of d.sections) {
    if (sec.controlBoardConfidence === 'check') rows.push({ where: sec.id, code: '—', name: sec.name, field: 'controlBoard', value: sec.controlBoard ?? '(unknown)', reason: sec.note ?? 'Control board not given' });
    for (const p of sec.stops) {
      if (p.confidence !== 'check') continue;
      rows.push({ where: sec.id, code: p.code, name: station(p.code, d)?.name ?? '?', field: 'km', value: p.km === null ? '(unknown)' : `~${p.km}`, reason: p.note ?? 'km not given in seed' });
    }
  }
  return rows;
}

/** J2 (JU–MTD–DNA–FL) length from chainage, compared with the CAMTECH case study. */
export function j2Length(d: JodhpurData = JODHPUR): { juMtd: number; mtdDna: number; dnaFl: number; total: number } {
  const juMtd = distanceKm('S1', 'JU', 'MTD', d)!;
  const mtdDna = distanceKm('S2', 'MTD', 'DNA', d)!;
  const dnaFl = distanceKm('S3', 'DNA', 'FL', d)!;
  return { juMtd, mtdDna, dnaFl, total: round2(juMtd + mtdDna + dnaFl) };
}

/** Distinct stops on the J2 route JU–MTD–DNA–FL (S1 + S2 + S3). */
export function j2Stops(d: JodhpurData = JODHPUR): string[] {
  const ids = ['S1', 'S2', 'S3'];
  return [...new Set(d.sections.filter((s) => ids.includes(s.id)).flatMap((s) => s.stops.map((p) => p.code)))];
}

export function reportMarkdown(d: JodhpurData = JODHPUR): string {
  const rows = checkReport(d);
  const j2 = j2Length(d);
  const stops = j2Stops(d);
  const L = [
    '# Jodhpur division data — items to verify ("check")',
    '',
    `Source: ${d.meta.source}`,
    '',
    `Stations: ${d.stations.length} · Sections: ${d.sections.length} · Items to check: ${rows.length}`,
    '',
    '| # | Where | Code | Name | Field | Current value | Why |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r, i) => `| ${i + 1} | ${r.where} | ${r.code} | ${r.name} | ${r.field} | ${r.value} | ${r.reason.replace(/\|/g, '/')} |`),
    '',
    '## J2 length (JU–MTD–DNA–FL) from map chainage',
    '',
    `- JU–MTD: 624.96 − 520.85 = **${j2.juMtd} km**`,
    `- MTD–DNA: 520.85 − 476.61 = **${j2.mtdDna} km** (Source note: CAMTECH handbook says 43.5 km; map value used)`,
    `- DNA–FL: 108.75 − 0.00 = **${j2.dnaFl} km**`,
    `- Total: **${j2.total} km** (Source note: CAMTECH case study says ~256.5 km)`,
    `- Stops on J2 in the seed: **${stops.length}** (${stops.join(', ')}). CAMTECH case study counts **29 POPs** (6 junctions + 23 stations) — ${stops.length < 29 ? `${29 - stops.length} station(s) may be missing from the seed; please check the map between JU and FL.` : 'matches.'}`,
    '',
    `Validation: ${validateJodhpur(d).length === 0 ? 'no structural errors' : validateJodhpur(d).join('; ')}`,
  ];
  return L.join('\n');
}
