import { cidrsOverlap, parseCidr } from '../../engine/ip/ipv4';
import { JODHPUR, station, type ControlBoard, type JodhpurData, type Section } from '../data/jodhpur';

/**
 * Jodhpur division IP-MPLS design data derived from jodhpurDivision.json:
 * device roles, span lengths (with estimates for unknown chainage), a
 * schematic map layout and the IP plan. Everything here is a TEACHING design
 * on the track map — not the real RailTel / NWR network.
 */

/** LSR (NEON-LSR) sites: junctions + aggregation stations (design rule). */
export const LSR_SITES = ['JU', 'RKB', 'PLC', 'PPR', 'MTD', 'DNA', 'LN', 'SMR', 'BME', 'JSM'];
/** Division boundary stations that hand off to an adjacent division. */
export const BOUNDARIES: Record<string, string> = {
  FL: 'Jaipur division',
  RTGH: 'Bikaner division',
  BKN: 'Bikaner division',
  MJ: 'Ajmer division',
  BLDI: 'Ahmedabad division',
};
/** Route reflectors (P5) and NMS / firewall / internet breakout (P8) sit at JU; RR pair JU + MTD. */
export const RR_SITES = ['JU', 'MTD'];

export const SECTION_NUMBER: Record<string, number> = { S1: 1, S2: 2, S3: 3, S4: 4, S5: 5, S6: 6, S7: 7, S8: 8, S9: 9, S10: 10, S11A: 11, S11B: 12 };
/** OSPF area per control board; the JU–MTD trunk and unassigned branches stay in area 0 (backbone). */
export const BOARD_AREA: Record<ControlBoard, number> = { North: 1, Central: 2, West: 3, East: 4 };
export const VRFS = ['UTS', 'PRS', 'FOIS', 'SCADA', 'CCTV', 'RAILNET', 'VOIP', 'NMS-MGMT'] as const;

export type SiteRole = 'LSR' | 'LER' | 'UCPE';

export function siteRole(code: string, d: JodhpurData = JODHPUR): SiteRole {
  if (LSR_SITES.includes(code)) return 'LSR';
  return station(code, d)?.isHalt ? 'UCPE' : 'LER';
}

export function hostname(code: string, d: JodhpurData = JODHPUR): string {
  const r = siteRole(code, d);
  return `${code}-${r === 'LSR' ? 'LSR' : r === 'LER' ? 'LER' : 'UCPE'}`;
}

export interface PlanSpan {
  section: string;
  index: number;
  a: string;
  b: string;
  km: number;
  /** km was interpolated because a chainage is unknown in the data file. */
  estimated: boolean;
}

/** Chainage per stop, filling unknown values by even interpolation between known neighbours. */
function filledKm(sec: Section): Array<{ code: string; km: number; estimated: boolean }> {
  const out = sec.stops.map((p) => ({ code: p.code, km: p.km ?? NaN, estimated: p.km === null }));
  for (let i = 0; i < out.length; i++) {
    if (!Number.isNaN(out[i].km)) continue;
    let j = i;
    while (j < out.length && Number.isNaN(out[j].km)) j++;
    const before = i > 0 ? out[i - 1].km : NaN;
    const after = j < out.length ? out[j].km : NaN;
    for (let k = i; k < j; k++) {
      if (!Number.isNaN(before) && !Number.isNaN(after)) out[k].km = before + ((after - before) * (k - i + 1)) / (j - i + 1);
      else if (!Number.isNaN(before)) out[k].km = before + 10 * (k - i + 1) * Math.sign(before - (out[i - 2]?.km ?? before - 1));
      else out[k].km = (after || 0) - 10 * (j - k);
    }
    i = j;
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function planSpans(d: JodhpurData = JODHPUR, sectionIds?: string[]): PlanSpan[] {
  const out: PlanSpan[] = [];
  for (const sec of d.sections) {
    if (sectionIds && !sectionIds.includes(sec.id)) continue;
    const km = filledKm(sec);
    for (let i = 0; i + 1 < km.length; i++)
      out.push({
        section: sec.id,
        index: i,
        a: km[i].code,
        b: km[i + 1].code,
        km: Math.max(0.5, round2(Math.abs(km[i].km - km[i + 1].km))),
        estimated: km[i].estimated || km[i + 1].estimated,
      });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Schematic map layout
// ---------------------------------------------------------------------------

type Dir = [number, number];
/** Direction of travel per section (screen coordinates, north = −y), changing at the named stops. */
const DIRECTIONS: Record<string, Array<{ from: string; d: Dir }>> = {
  S1: [{ from: 'JU', d: [0.72, -0.7] }],
  S2: [{ from: 'MTD', d: [1, -0.05] }],
  S3: [{ from: 'DNA', d: [0.95, 0.35] }],
  S4: [{ from: 'DNA', d: [0.3, -1] }],
  S5: [{ from: 'MTD', d: [-0.15, -1] }],
  S6: [{ from: 'RKB', d: [-0.62, -0.8] }],
  S7: [{ from: 'PLC', d: [-1, -0.12] }],
  S8: [{ from: 'JU', d: [0.5, 0.86] }],
  S9: [
    { from: 'LN', d: [-0.4, 0.95] },
    { from: 'SMR', d: [-1, 0.3] },
    { from: 'BME', d: [-1, -0.05] },
  ],
  S10: [{ from: 'SMR', d: [0.2, 1] }],
  S11A: [{ from: 'PPR', d: [0.75, 0.66] }],
  S11B: [{ from: 'MTD', d: [0.9, 0.45] }],
};
const PX_PER_KM = 20;
/** Very short spans are drawn at least this long so nodes do not overlap (schematic, not to scale). */
const MIN_DRAWN_KM = 9;

export function layout(d: JodhpurData = JODHPUR): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>([['JU', { x: 0, y: 0 }]]);
  const spans = planSpans(d);
  // Sections in data order are already "connected" order (each starts at an already placed junction).
  for (const sec of d.sections) {
    const dirs = DIRECTIONS[sec.id] ?? [{ from: sec.stops[0].code, d: [1, 0] as Dir }];
    const start = sec.stops.findIndex((s) => pos.has(s.code));
    if (start < 0) continue;
    let dir: Dir = dirs[0].d;
    for (let i = start; i + 1 < sec.stops.length; i++) {
      const a = sec.stops[i].code;
      const b = sec.stops[i + 1].code;
      dir = dirs.find((x) => x.from === a)?.d ?? dir;
      if (pos.has(b)) continue;
      const span = spans.find((s) => s.section === sec.id && s.a === a && s.b === b)!;
      const len = Math.hypot(dir[0], dir[1]);
      const p = pos.get(a)!;
      const step = Math.max(span.km, MIN_DRAWN_KM) * PX_PER_KM;
      pos.set(b, { x: Math.round(p.x + (dir[0] / len) * step), y: Math.round(p.y + (dir[1] / len) * step) });
    }
  }
  return pos;
}

// ---------------------------------------------------------------------------
// IP plan
// ---------------------------------------------------------------------------

export interface IpPlanRow {
  kind: 'loopback' | 'p2p' | 'vrf' | 'express';
  what: string;
  prefix: string;
  site?: string;
  section?: string;
}

export interface IpPlan {
  loopbacks: Map<string, string>;
  /** Span key "SEC:index" → [address of a, address of b] (/31). */
  p2p: Map<string, [string, string]>;
  rows: IpPlanRow[];
}

export const spanKey = (s: { section: string; index: number }) => `${s.section}:${s.index}`;

/**
 * Loopback 10.0.<section>.<position>/32 (section of the station's first appearance),
 * span /31 10.255.<section>.<2·index>, per-station VRF /24 10.<100+vrf>.<station no>.0.
 * Express links of the J1 core get 10.254.0.<2k>/31 (see expressPlan).
 */
export function ipPlan(d: JodhpurData = JODHPUR): IpPlan {
  const loopbacks = new Map<string, string>();
  const rows: IpPlanRow[] = [];
  for (const sec of d.sections) {
    const n = SECTION_NUMBER[sec.id];
    sec.stops.forEach((p, i) => {
      if (loopbacks.has(p.code)) return;
      const a = `10.0.${n}.${i + 1}`;
      loopbacks.set(p.code, a);
      rows.push({ kind: 'loopback', what: `${hostname(p.code, d)} Loopback0`, prefix: `${a}/32`, site: p.code, section: sec.id });
    });
  }
  const p2p = new Map<string, [string, string]>();
  for (const s of planSpans(d)) {
    const n = SECTION_NUMBER[s.section];
    const base = 2 * s.index;
    p2p.set(spanKey(s), [`10.255.${n}.${base}`, `10.255.${n}.${base + 1}`]);
    rows.push({
      kind: 'p2p',
      what: `${s.a}–${s.b} (${s.km} km${s.estimated ? ', estimated' : ''})`,
      prefix: `10.255.${n}.${base}/31`,
      section: s.section,
    });
  }
  const codes = [...loopbacks.keys()];
  codes.forEach((code, i) => {
    VRFS.forEach((v, k) => rows.push({ kind: 'vrf', what: `${code} VRF ${v}`, prefix: `10.${100 + k}.${i + 1}.0/24`, site: code }));
  });
  return { loopbacks, p2p, rows };
}

/** Overlapping prefixes in a plan (should be empty). */
export function planOverlaps(rows: IpPlanRow[]): string[] {
  const parsed = rows.map((r) => ({ r, c: parseCidr(r.prefix) })).filter((x) => x.c);
  const bad: string[] = [];
  const sorted = parsed.sort((a, b) => a.c!.network - b.c!.network);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length && sorted[j].c!.network <= a.c!.network + 2 ** (32 - a.c!.prefixLen) - 1; j++)
      if (cidrsOverlap(a.c!, sorted[j].c!)) bad.push(`${a.r.prefix} (${a.r.what}) overlaps ${sorted[j].r.prefix} (${sorted[j].r.what})`);
  }
  return bad;
}

/** OSPF area of a section (per control board; trunk and unassigned branches = 0). */
export function sectionArea(sec: Section): number {
  return sec.controlBoard ? BOARD_AREA[sec.controlBoard] : 0;
}
