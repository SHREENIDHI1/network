import { describe, expect, it } from 'vitest';
import { LABS } from '../../labs/registry';
import { DEVICE_TEMPLATES } from '../../model/catalog';
import { loadAllDeviceDocs, loadDeviceDoc } from './index';
import { LEGACY_DOCS } from './legacy';
import { searchDocs } from './search';
import { validateDeviceDoc } from './validate';

const labIds = new Set(LABS.map((l) => l.id));

describe('legacy equipment docs', () => {
  it('every legacy device kind has exactly one doc', () => {
    const kinds = DEVICE_TEMPLATES.filter((t) => t.category === 'legacy').map((t) => t.kind).sort();
    expect(LEGACY_DOCS.map((d) => d.type).sort()).toEqual(kinds);
  });

  it('every doc passes content validation (both languages, quiz, links, labels)', () => {
    const errors = LEGACY_DOCS.flatMap((d) => validateDeviceDoc(d, labIds));
    expect(errors).toEqual([]);
  });

  it('PD-Mux covers the must-have facts', () => {
    const d = LEGACY_DOCS.find((x) => x.type === 'pdmux')!;
    const text = JSON.stringify(d);
    for (const s of ['2.048 Mbit/s', '32', 'TS0', 'TS16', 'CAS', 'FXS', 'FXO', 'E&M', 'omnibus', 'Drop-insert']) expect(text).toContain(s);
  });

  it('STM docs cover rates, mapping chain, protection and alarm chain', () => {
    const rates: Record<string, string> = { 'adm-stm1': '155.52', 'adm-stm4': '622.08', 'adm-stm16': '2488.32' };
    for (const [kind, rate] of Object.entries(rates)) {
      const text = JSON.stringify(LEGACY_DOCS.find((x) => x.type === kind));
      expect(text).toContain(rate);
      for (const s of ['C-12 → VC-12 → TU-12 → TUG-2 → TUG-3 → VC-4 → AU-4 → AUG', 'MSP', 'SNCP', '50 ms', 'SETS', 'LOS', 'AIS', 'RDI', 'LCT']) expect(text).toContain(s);
    }
    expect(JSON.stringify(LEGACY_DOCS.find((x) => x.type === 'adm-stm1'))).toContain('63 × E1');
  });

  it('CWDM covers the G.694.2 grid and Option 1', () => {
    const text = JSON.stringify(LEGACY_DOCS.find((x) => x.type === 'cwdm-mux'));
    for (const s of ['G.694.2', '1271', '1611', '20 nm', 'Insertion loss', 'Option 1']) expect(text).toContain(s);
  });

  it('safety-critical equipment is flagged', () => {
    for (const k of ['block-instrument', 'bpac', 'data-logger', 'lc-gate-phone']) {
      expect(LEGACY_DOCS.find((x) => x.type === k)?.safetyCritical, k).toBe(true);
    }
  });
});

describe('lazy loaders', () => {
  it('load a single doc and all docs', async () => {
    expect((await loadDeviceDoc('pdmux'))?.fullName).toMatch(/PD-Mux/);
    expect((await loadAllDeviceDocs()).length).toBeGreaterThanOrEqual(LEGACY_DOCS.length);
  });
});

describe('search', () => {
  it('finds the PD-Mux doc for "TS16"', () => {
    const hits = searchDocs(LEGACY_DOCS, 'TS16');
    expect(hits[0].type).toBe('pdmux');
  });

  it('finds an STM doc for "RDI", pointing at the alarms tab', () => {
    const hits = searchDocs(LEGACY_DOCS, 'RDI');
    expect(['adm-stm1', 'adm-stm4', 'adm-stm16']).toContain(hits[0].type);
    expect(hits[0].tab).toBe('alarms');
  });

  it('matches Hinglish fault text and ignores too-short queries', () => {
    expect(searchDocs(LEGACY_DOCS, 'ghanti nahi').some((h) => h.tab === 'troubleshoot')).toBe(true);
    expect(searchDocs(LEGACY_DOCS, 'a')).toEqual([]);
  });
});
