import { describe, expect, it } from 'vitest';
import { JODHPUR, boardsOf, checkReport, distanceKm, j2Length, j2Stops, reportMarkdown, sectionsOf, spans, validateJodhpur } from './jodhpur';

describe('Jodhpur division data', () => {
  it('passes structural validation: unique codes, known stops, monotonic km, junctions in all their sections', () => {
    expect(validateJodhpur()).toEqual([]);
  });

  it('has no duplicate station codes', () => {
    const codes = JODHPUR.stations.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('junctions appear in every section the seed places them in', () => {
    expect(sectionsOf('MTD').map((s) => s.id).sort()).toEqual(['S11B', 'S1', 'S2', 'S5'].sort());
    expect(sectionsOf('DNA').map((s) => s.id).sort()).toEqual(['S2', 'S3', 'S4']);
    expect(sectionsOf('LN').map((s) => s.id).sort()).toEqual(['S8', 'S9']);
    expect(boardsOf('DNA')).toEqual(['East']);
    expect(boardsOf('LN').sort()).toEqual(['Central', 'West']);
  });

  it('computes span lengths from chainage on the same line', () => {
    expect(distanceKm('S1', 'JU', 'MTD')).toBe(104.11);
    expect(distanceKm('S2', 'MTD', 'DNA')).toBe(44.24);
    expect(distanceKm('S6', 'RKB', 'PLC')).toBe(134.29);
    const s = spans().find((x) => x.a === 'GOTN' && x.b === 'JOM')!;
    expect(s.km).toBe(9.56);
  });

  it('J2 segment totals match map chainage', () => {
    const j = j2Length();
    expect(j.juMtd + j.mtdDna + j.dnaFl).toBeCloseTo(j.total, 6);
    expect(j.total).toBe(257.1);
  });

  it('reports the J2 stop count against the CAMTECH 29 POPs', () => {
    expect(j2Stops()).toHaveLength(27);
    expect(reportMarkdown()).toMatch(/2 station\(s\) may be missing/);
  });

  it('lists every unclear item in the check report (never guessed silently)', () => {
    const rows = checkReport();
    const keys = rows.map((r) => `${r.where}:${r.code}:${r.field}`);
    for (const k of ['S1:JWL:km', 'S1:RKB:km', 'S2:REN:km', 'station:REN:name', 'station:UNK-DIDWANA:code', 'S3:GCH:km', 'S1:—:controlBoard', 'S7:UNK-LANELA:km'])
      expect(keys).toContain(k);
    // Every stop with unknown km is reported.
    for (const sec of JODHPUR.sections) for (const p of sec.stops) if (p.km === null) expect(keys).toContain(`${sec.id}:${p.code}:km`);
  });
});
