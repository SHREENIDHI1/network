import { configure } from '../../engine/testing/fixtures';
import { applyOpticProfile } from '../../model/linkRules';
import * as ops from '../../model/topologyOps';
import type { DeviceKind, Topology } from '../../model/types';
import { JODHPUR, station, type ControlBoard, type JodhpurData } from '../data/jodhpur';
import { BOUNDARIES, BOARD_AREA, hostname, ipPlan, layout, LSR_SITES, planSpans, siteRole, spanKey, type PlanSpan } from './plan';

/**
 * Jodhpur division topology generators (J1–J4). Generated from
 * jodhpurDivision.json; laid out as a schematic of the track map; every link
 * goes through the same validation as the editor. Teaching design only —
 * the OFC is assumed to follow the track, which is not the real RailTel route.
 *
 * level: 'none' = cabled only; 'ip' = interfaces + loopbacks addressed per the
 * IP plan; 'ospf' = + OSPF; 'mpls' = + "mpls ip" on core links.
 */

export type JodhpurLevel = 'none' | 'ip' | 'ospf' | 'mpls';

const DISCLAIMER = 'Teaching design on the NWR Jodhpur division TRACK map (OFC assumed along the track). Not the real RailTel / NWR telecom network.';

const KIND: Record<'LSR' | 'LER' | 'UCPE', DeviceKind> = { LSR: 'neon-lsr', LER: 'neon-ler', UCPE: 'ucpe' };

/** Core-facing ports in allocation order. */
function corePorts(kind: DeviceKind): string[] {
  if (kind === 'neon-lsr') return Array.from({ length: 28 }, (_, i) => `Te0/0/${i}`);
  if (kind === 'neon-ler') return Array.from({ length: 4 }, (_, i) => `Te0/0/${i}`);
  if (kind === 'ucpe') return ['Gi0/4', 'Gi0/5'];
  if (kind === 'adj-division') return Array.from({ length: 4 }, (_, i) => `Te0/0/${i}`);
  return [];
}

/** Optic per span length: ER (40 km class) up to 25 km, else ZR (80 km class). */
const opticFor = (km: number) => (km <= 25 ? '10GBASE-ER' : '10GBASE-ZR');

/** Backbone (area 0): JU–MTD trunk (S1), MTD–DNA (S2), JU–LN on S8, and the short branches. */
function spanArea(s: PlanSpan, multiArea: boolean, d: JodhpurData): number {
  if (!multiArea) return 0;
  if (['S1', 'S2', 'S11A', 'S11B'].includes(s.section)) return 0;
  if (s.section === 'S8') {
    const stops = d.sections.find((x) => x.id === 'S8')!.stops.map((p) => p.code);
    if (stops.indexOf(s.b) <= stops.indexOf('LN')) return 0;
  }
  const board = d.sections.find((x) => x.id === s.section)!.controlBoard;
  return board ? BOARD_AREA[board] : 0;
}

export interface GenOptions {
  name: string;
  description: string;
  sections: string[];
  /** Only these stations (J1 core); spans are then "express" links between them. */
  sites?: string[];
  level: JodhpurLevel;
  multiArea?: boolean;
  boundaryClouds?: boolean;
  d?: JodhpurData;
}

interface Edge {
  a: string;
  b: string;
  km: number;
  estimated: boolean;
  /** Logical express path through intermediate POPs (J1 core). */
  express: boolean;
  addr: [string, string];
  area: number;
  label: string;
}

export function generateJodhpur(o: GenOptions): Topology {
  const d = o.d ?? JODHPUR;
  const plan = ipPlan(d);
  const pos = layout(d);
  const spans = planSpans(d, o.sections);

  // Edges: real spans, or express links between the chosen core sites.
  const edges: Edge[] = [];
  if (!o.sites) {
    for (const s of spans)
      edges.push({
        a: s.a,
        b: s.b,
        km: s.km,
        estimated: s.estimated,
        express: false,
        addr: plan.p2p.get(spanKey(s))!,
        area: spanArea(s, !!o.multiArea, d),
        label: `${s.km} km${s.estimated ? ' (estimated)' : ''}`,
      });
  } else {
    let k = 0;
    for (const secId of o.sections) {
      const sec = d.sections.find((x) => x.id === secId)!;
      const inSec = spans.filter((s) => s.section === secId);
      let from: string | null = null;
      let acc = 0;
      let est = false;
      for (const [i, stop] of sec.stops.entries()) {
        if (i > 0) {
          acc += inSec[i - 1].km;
          est ||= inSec[i - 1].estimated;
        }
        if (!o.sites.includes(stop.code)) continue;
        if (from !== null && from !== stop.code) {
          const km = Math.round(acc * 100) / 100;
          edges.push({
            a: from,
            b: stop.code,
            km,
            estimated: est,
            express: true,
            addr: [`10.254.0.${2 * k}`, `10.254.0.${2 * k + 1}`],
            area: 0,
            label: `Express path ${km} km${est ? ' (estimated)' : ''} via intermediate POPs (logical)`,
          });
          k++;
        }
        from = stop.code;
        acc = 0;
        est = false;
      }
    }
  }

  const codes = [...new Set(edges.flatMap((e) => [e.a, e.b]))];
  let topo = ops.emptyTopology(o.name);
  topo.meta.description = `${o.description} ${DISCLAIMER}`;
  const ids = new Map<string, string>();
  const free = new Map<string, string[]>();
  for (const code of codes) {
    const kind = KIND[siteRole(code, d)];
    const p = pos.get(code) ?? { x: 0, y: 0 };
    const res = ops.addDevice(topo, kind, p, false);
    const st = station(code, d);
    const note = [
      st?.name,
      LSR_SITES.includes(code) ? 'junction / aggregation LSR' : st?.isHalt ? 'halt — uCPE (design choice)' : 'station LER',
      BOUNDARIES[code] ? `division boundary towards ${BOUNDARIES[code]}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    topo = ops.updateDevice(res.topology, res.device.id, { name: hostname(code, d), station: code, notes: note });
    ids.set(code, res.device.id);
    free.set(code, corePorts(kind));
  }

  const take = (code: string) => {
    const list = free.get(code)!;
    const p = list.shift();
    if (!p) throw new Error(`${code}: no free core port`);
    return p;
  };
  const ifAddr: Array<{ code: string; port: string; ip: string; area: number; mpls: boolean }> = [];
  for (const e of edges) {
    const pa = take(e.a);
    const pb = take(e.b);
    const res = ops.addLink(topo, {
      kind: 'ofc',
      a: { deviceId: ids.get(e.a)!, portId: pa },
      b: { deviceId: ids.get(e.b)!, portId: pb },
      lengthKm: e.km,
    });
    if (!res.ok) throw new Error(`Invalid Jodhpur link ${e.a}–${e.b}: ${res.reason}`);
    topo = res.topology;
    const link = res.link;
    const optical = e.express ? undefined : applyOpticProfile(link.optical!, opticFor(e.km));
    topo = { ...topo, links: topo.links.map((l) => (l.id === link.id ? { ...l, optical, label: e.label } : l)) };
    ifAddr.push({ code: e.a, port: pa, ip: e.addr[0], area: e.area, mpls: true }, { code: e.b, port: pb, ip: e.addr[1], area: e.area, mpls: true });
  }

  if (o.boundaryClouds) {
    for (const code of codes) {
      const div = BOUNDARIES[code];
      if (!div) continue;
      const p = pos.get(code)!;
      const res = ops.addDevice(topo, 'adj-division', { x: p.x + 60, y: p.y - 160 }, false);
      topo = ops.updateDevice(res.topology, res.device.id, {
        name: `${div.split(' ')[0]}-DIV`,
        station: code,
        notes: `${div} (adjacent division cloud, used in inter-division labs)`,
      });
      const l = ops.addLink(topo, {
        kind: 'ofc',
        a: { deviceId: ids.get(code)!, portId: take(code) },
        b: { deviceId: res.device.id, portId: 'Te0/0/0' },
        lengthKm: 2,
      });
      if (l.ok) topo = ops.updateLink(l.topology, l.link.id, { label: `Hand-off to ${div}` }).topology;
    }
  }

  if (o.level === 'none') return topo;
  const loopArea = (code: string) => {
    const mine = ifAddr.filter((x) => x.code === code).map((x) => x.area);
    return mine.includes(0) ? 0 : (mine[0] ?? 0);
  };
  for (const code of codes) {
    topo = configure(topo, hostname(code, d), (c) => {
      c.interfaces.Loopback0 = { ip: { address: plan.loopbacks.get(code)!, mask: '255.255.255.255' } };
      for (const x of ifAddr.filter((i) => i.code === code)) {
        c.interfaces[x.port] = {
          ...(c.interfaces[x.port] ?? {}),
          shutdown: false,
          ip: { address: x.ip, mask: '255.255.255.254' },
          ...(o.level === 'mpls' ? { mplsIp: true } : {}),
        };
      }
      if (o.level === 'ospf' || o.level === 'mpls') {
        c.ospf = {
          processId: 1,
          routerId: plan.loopbacks.get(code),
          networks: [
            { address: plan.loopbacks.get(code)!, wildcard: '0.0.0.0', area: loopArea(code) },
            ...ifAddr.filter((i) => i.code === code).map((i) => ({ address: i.ip, wildcard: '0.0.0.0', area: i.area })),
          ],
          passive: [],
          defaultOriginate: 'off',
          redistributeStatic: false,
          referenceBandwidth: 100000,
          ldpSync: false,
          ldpAutoconfig: false,
        };
      }
      if (o.level === 'mpls') c.mpls.ldpRouterId = 'Loopback0';
    });
  }
  return topo;
}

// ---------------------------------------------------------------------------
// The J-series
// ---------------------------------------------------------------------------

export const ALL_SECTIONS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11A', 'S11B'];
const BOUNDARY_SITES = Object.keys(BOUNDARIES);

/** J1 jodhpur-core: junction / aggregation LSRs + boundary stations, joined by express paths. */
export function j1Core(level: JodhpurLevel = 'ip'): Topology {
  return generateJodhpur({
    name: 'J1 Jodhpur core',
    description:
      'J1: the IP-MPLS core of the Jodhpur division — LSRs at the junctions and aggregation stations (JU, RKB, PPR, MTD, DNA, PLC, JSM, LN, SMR, BME) and LERs at the division boundaries. Links are logical express paths (their km is the route length through the intermediate POPs; optics are not modelled on them). The core is a tree: dead-end branches have no second path inside the division.',
    sections: ALL_SECTIONS.filter((s) => !s.startsWith('S11')),
    sites: [...LSR_SITES, ...BOUNDARY_SITES],
    level,
  });
}

/** J2 ju-mtd-dna-fl: the CAMTECH case-study section, every POP from JU to FL. */
export function j2(level: JodhpurLevel = 'ip'): Topology {
  return generateJodhpur({
    name: 'J2 JU–MTD–DNA–FL',
    description:
      'J2: the CAMTECH case-study route JU – MTD – DNA – FL with every station on it (LSRs at JU, RKB, PPR, MTD, DNA; LERs / uCPEs elsewhere). FL hands off to the Jaipur division.',
    sections: ['S1', 'S2', 'S3'],
    level,
    boundaryClouds: true,
  });
}

export const BOARD_SECTIONS: Record<ControlBoard, string[]> = {
  North: ['S5'],
  Central: ['S6', 'S7', 'S8'],
  West: ['S9', 'S10'],
  East: ['S2', 'S3', 'S4'],
};

/** J3: one control board's sections. */
export function j3(board: ControlBoard, level: JodhpurLevel = 'ip'): Topology {
  return generateJodhpur({
    name: `J3 ${board} control board`,
    description: `J3: the ${board} control board sections (${BOARD_SECTIONS[board].join(', ')}) with the junctions where they meet the rest of the division.`,
    sections: BOARD_SECTIONS[board],
    level,
    boundaryClouds: true,
  });
}

/** J4 jodhpur-full: every station of the division. */
export function j4(level: JodhpurLevel = 'ip'): Topology {
  return generateJodhpur({
    name: 'J4 Jodhpur division (full)',
    description:
      'J4: the complete division — every station, LSRs at junctions / aggregation points, LERs at stations, uCPEs at halts, and the five boundary hand-offs.',
    sections: ALL_SECTIONS,
    level,
    multiArea: true,
    boundaryClouds: true,
  });
}
