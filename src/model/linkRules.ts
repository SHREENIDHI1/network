import type { Device, Link, LinkKind, OpticalParams, Port, VfRole } from './types';

/**
 * Physical connection rules. Every new link and every loaded file goes through
 * `checkLink`, so the canvas can never hold a physically impossible connection
 * (e.g. an STM-1 port fibred to an STM-4 port, or FXS wired to FXS).
 */

export interface LinkKindInfo {
  kind: LinkKind;
  label: string;
  /** Short label shown on the canvas edge. */
  short: string;
  description: string;
  optical: boolean;
  /** Default route length in km for a new link of this kind. */
  defaultLengthKm: number;
}

export const LINK_KINDS: LinkKindInfo[] = [
  {
    kind: 'ofc',
    label: 'OFC (optical fibre cable)',
    short: 'OFC',
    description: 'Single-mode G.652 fibre route between stations. Single core (BiDi) or 2-core (Tx/Rx pair).',
    optical: true,
    defaultLengthKm: 20,
  },
  {
    kind: 'cwdm-lambda',
    label: 'CWDM lambda (coloured patch)',
    short: 'λ',
    description: 'Patch from a coloured CWDM optic to the matching channel port of a CWDM mux.',
    optical: false,
    defaultLengthKm: 0.005,
  },
  {
    kind: 'e1-copper',
    label: 'E1 copper (G.703)',
    short: 'E1',
    description: '2.048 Mbit/s HDB3 electrical interface, 120 ohm balanced pair, inside the equipment room.',
    optical: false,
    defaultLengthKm: 0.01,
  },
  {
    kind: 'quad',
    label: 'Quad cable (VF)',
    short: 'Quad',
    description: 'Railway quad cable carrying 2-wire / 4-wire voice-frequency circuits.',
    optical: false,
    defaultLengthKm: 0.5,
  },
  {
    kind: 'cat6',
    label: 'Cat6 (copper Ethernet)',
    short: 'Cat6',
    description: 'Twisted-pair Ethernet, max 100 m.',
    optical: false,
    defaultLengthKm: 0.01,
  },
  { kind: 'sfp-1g', label: 'SFP 1G patch', short: '1G', description: 'Short optical/DAC patch, 1 Gbit/s.', optical: false, defaultLengthKm: 0.005 },
  { kind: 'sfp-10g', label: 'SFP+ 10G patch', short: '10G', description: 'Short optical/DAC patch, 10 Gbit/s.', optical: false, defaultLengthKm: 0.005 },
  { kind: 'sfp-25g', label: 'SFP28 25G patch', short: '25G', description: 'Short optical/DAC patch, 25 Gbit/s.', optical: false, defaultLengthKm: 0.005 },
  { kind: 'sfp-100g', label: 'QSFP28 100G patch', short: '100G', description: 'Short optical/DAC patch, 100 Gbit/s.', optical: false, defaultLengthKm: 0.005 },
];

const LINK_KIND_INFO = new Map(LINK_KINDS.map((k) => [k.kind, k]));

export function getLinkKindInfo(kind: LinkKind): LinkKindInfo {
  const info = LINK_KIND_INFO.get(kind);
  if (!info) throw new Error(`Unknown link kind: ${kind}`);
  return info;
}

export function isLinkKind(value: string): value is LinkKind {
  return LINK_KIND_INFO.has(value as LinkKind);
}

const SFP_SPEED: Partial<Record<LinkKind, number>> = {
  'sfp-1g': 1,
  'sfp-10g': 10,
  'sfp-25g': 25,
  'sfp-100g': 100,
};

/** Max Cat6 length for Ethernet (IEEE 802.3 channel limit). */
export const CAT6_MAX_KM = 0.1;

export type CheckResult = { ok: true } | { ok: false; reason: string };

const OK: CheckResult = { ok: true };
const fail = (reason: string): CheckResult => ({ ok: false, reason });

/**
 * Valid VF pairings. FXS supplies battery/ringing, so it must face a terminal
 * or an FXO; FXO must face an FXS (e.g. extending an exchange line).
 */
const VF_PAIRS: Array<[VfRole, VfRole]> = [
  ['FXS', 'TERM'],
  ['FXS', 'FXO'],
  ['2W', 'TERM'],
  ['2W', '2W'],
  ['4W', 'TERM'],
  ['4W', '4W'],
  ['E&M', 'E&M'],
];

function vfPairOk(a: VfRole | undefined, b: VfRole | undefined): boolean {
  if (!a || !b) return false;
  return VF_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

function sharedSpeed(a: Port, b: Port): number[] {
  const sa = a.speedsGbps ?? [];
  const sb = b.speedsGbps ?? [];
  return sa.filter((s) => sb.includes(s));
}

const rj45Like = (p: Port) => p.kind === 'rj45' || p.kind === 'combo';
const sfpLike = (p: Port) => p.kind === 'sfp' || p.kind === 'combo';

/** Can a link of `kind` join port `a` to port `b`? Pure port-level check. */
export function checkPortPair(kind: LinkKind, a: Port, b: Port): CheckResult {
  switch (kind) {
    case 'cat6':
      if (!rj45Like(a) || !rj45Like(b)) return fail('Cat6 needs RJ45 (or combo) ports on both ends.');
      return OK;

    case 'e1-copper':
      if (a.kind !== 'e1' || b.kind !== 'e1') return fail('E1 copper (G.703) needs E1 ports on both ends.');
      return OK;

    case 'quad': {
      const vf = ['vf2w', 'vf4w'];
      if (!vf.includes(a.kind) || !vf.includes(b.kind)) return fail('Quad cable needs VF (2W/4W) ports on both ends.');
      if (a.kind !== b.kind) return fail('Cannot wire a 2-wire port to a 4-wire port (use a 2W/4W hybrid).');
      if (!vfPairOk(a.vfRole, b.vfRole))
        return fail(`VF roles ${a.vfRole} and ${b.vfRole} are not compatible (e.g. FXS must face a phone or FXO).`);
      return OK;
    }

    case 'sfp-1g':
    case 'sfp-10g':
    case 'sfp-25g':
    case 'sfp-100g': {
      const speed = SFP_SPEED[kind]!;
      if (!sfpLike(a) || !sfpLike(b)) return fail('SFP patch needs SFP (or combo) ports on both ends.');
      if (!a.speedsGbps?.includes(speed) || !b.speedsGbps?.includes(speed))
        return fail(`Both SFP ports must support ${speed}G.`);
      return OK;
    }

    case 'cwdm-lambda': {
      const ch = a.kind === 'cwdm-ch' ? a : b.kind === 'cwdm-ch' ? b : undefined;
      const other = ch === a ? b : a;
      if (!ch) return fail('CWDM lambda patch must land on a CWDM channel port.');
      if (other.kind !== 'stm' && !sfpLike(other))
        return fail('The other end of a CWDM lambda must be a coloured STM or SFP optic.');
      return OK;
    }

    case 'ofc': {
      const opt = (p: Port) => (p.kind === 'combo' ? 'sfp' : p.kind);
      const optical = ['stm', 'sfp', 'cwdm-line'];
      if (!optical.includes(opt(a)) || !optical.includes(opt(b)))
        return fail('OFC must terminate on optical ports (STM, SFP or CWDM LINE).');
      if (opt(a) !== opt(b)) return fail(`Optical port types differ (${a.kind} vs ${b.kind}).`);
      if (a.kind === 'stm' && a.stmLevel !== b.stmLevel)
        return fail(`SDH rate mismatch: STM-${a.stmLevel} cannot be fibred to STM-${b.stmLevel}.`);
      if (opt(a) === 'sfp' && sharedSpeed(a, b).length === 0) return fail('SFP ports share no common speed.');
      return OK;
    }
  }
}

/** Port ids already used by links, as "deviceId|portId". */
export function usedPortKeys(links: Link[], excludeLinkId?: string): Set<string> {
  const used = new Set<string>();
  for (const l of links) {
    if (l.id === excludeLinkId) continue;
    used.add(`${l.a.deviceId}|${l.a.portId}`);
    used.add(`${l.b.deviceId}|${l.b.portId}`);
  }
  return used;
}

/** Full check of a link against the current topology. */
export function checkLink(link: Link, devices: Device[], links: Link[]): CheckResult {
  if (link.a.deviceId === link.b.deviceId) return fail('A link cannot connect a device to itself.');
  const da = devices.find((d) => d.id === link.a.deviceId);
  const db = devices.find((d) => d.id === link.b.deviceId);
  if (!da || !db) return fail('Link endpoint device does not exist.');
  const pa = da.ports.find((p) => p.id === link.a.portId);
  const pb = db.ports.find((p) => p.id === link.b.portId);
  if (!pa) return fail(`Port ${link.a.portId} not found on ${da.name}.`);
  if (!pb) return fail(`Port ${link.b.portId} not found on ${db.name}.`);
  const used = usedPortKeys(links, link.id);
  if (used.has(`${da.id}|${pa.id}`)) return fail(`${da.name} ${pa.name} is already connected.`);
  if (used.has(`${db.id}|${pb.id}`)) return fail(`${db.name} ${pb.name} is already connected.`);
  if (!Number.isFinite(link.lengthKm) || link.lengthKm < 0) return fail('Length must be a non-negative number.');
  if (link.kind === 'cat6' && link.lengthKm > CAT6_MAX_KM) return fail('Cat6 Ethernet is limited to 100 m.');
  return checkPortPair(link.kind, pa, pb);
}

/** Free ports on a device (not used by any link). */
export function freePorts(device: Device, links: Link[]): Port[] {
  const used = usedPortKeys(links);
  return device.ports.filter((p) => !used.has(`${device.id}|${p.id}`));
}

/** For each link kind, the free port pairs that would be valid between two devices. */
export function compatibleOptions(
  da: Device,
  db: Device,
  links: Link[],
): Array<{ kind: LinkKind; pairs: Array<[Port, Port]> }> {
  const fa = freePorts(da, links);
  const fb = freePorts(db, links);
  const out: Array<{ kind: LinkKind; pairs: Array<[Port, Port]> }> = [];
  for (const info of LINK_KINDS) {
    const pairs: Array<[Port, Port]> = [];
    for (const pa of fa) for (const pb of fb) if (checkPortPair(info.kind, pa, pb).ok) pairs.push([pa, pb]);
    if (pairs.length) out.push({ kind: info.kind, pairs });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Optic profiles (worst-case minimum Tx power, per standard where one exists)
// ---------------------------------------------------------------------------

export interface OpticProfile {
  id: string;
  label: string;
  source: string;
  wavelengthNm: number;
  txPowerDbm: number;
  rxSensitivityDbm: number;
  rxOverloadDbm: number;
}

export const OPTIC_PROFILES: OpticProfile[] = [
  { id: 'S-1.1', label: 'S-1.1 STM-1 short haul 1310 nm', source: 'ITU-T G.957', wavelengthNm: 1310, txPowerDbm: -15, rxSensitivityDbm: -28, rxOverloadDbm: -8 },
  { id: 'L-1.1', label: 'L-1.1 STM-1 long haul 1310 nm', source: 'ITU-T G.957', wavelengthNm: 1310, txPowerDbm: -5, rxSensitivityDbm: -34, rxOverloadDbm: -10 },
  { id: 'L-1.2', label: 'L-1.2 STM-1 long haul 1550 nm', source: 'ITU-T G.957', wavelengthNm: 1550, txPowerDbm: -5, rxSensitivityDbm: -34, rxOverloadDbm: -10 },
  { id: 'L-4.1', label: 'L-4.1 STM-4 long haul 1310 nm', source: 'ITU-T G.957', wavelengthNm: 1310, txPowerDbm: -3, rxSensitivityDbm: -28, rxOverloadDbm: -8 },
  { id: 'L-16.2', label: 'L-16.2 STM-16 long haul 1550 nm', source: 'ITU-T G.957', wavelengthNm: 1550, txPowerDbm: -2, rxSensitivityDbm: -28, rxOverloadDbm: -9 },
  { id: '1000BASE-LX', label: '1000BASE-LX 1310 nm (10 km)', source: 'IEEE 802.3 cl.38 (approx.)', wavelengthNm: 1310, txPowerDbm: -11, rxSensitivityDbm: -19, rxOverloadDbm: -3 },
  { id: '1000BASE-ZX', label: '1000BASE-ZX 1550 nm (80 km)', source: 'Vendor-typical (not IEEE)', wavelengthNm: 1550, txPowerDbm: 0, rxSensitivityDbm: -23, rxOverloadDbm: -3 },
  { id: '10GBASE-LR', label: '10GBASE-LR 1310 nm (10 km)', source: 'IEEE 802.3 cl.52 (approx.)', wavelengthNm: 1310, txPowerDbm: -8.2, rxSensitivityDbm: -14.4, rxOverloadDbm: 0.5 },
  { id: '10GBASE-ER', label: '10GBASE-ER 1550 nm (40 km)', source: 'IEEE 802.3 cl.52 (approx.)', wavelengthNm: 1550, txPowerDbm: -4.7, rxSensitivityDbm: -15.8, rxOverloadDbm: -1 },
  { id: 'CWDM-80', label: 'CWDM SFP 80 km', source: 'Vendor-typical', wavelengthNm: 1551, txPowerDbm: 0, rxSensitivityDbm: -28, rxOverloadDbm: -9 },
];

/** Typical G.652 attenuation at a given wavelength (cabled, incl. ageing). */
export function fibreLossDbPerKm(wavelengthNm: number): number {
  return wavelengthNm < 1400 ? 0.35 : 0.25;
}

/** OFC is laid in ~2 km drum lengths with one splice per drum joint. */
export function defaultSpliceCount(lengthKm: number): number {
  return Math.max(0, Math.ceil(lengthKm / 2) - 1);
}

/** Default optical parameters for a new OFC link between two ports. */
export function defaultOptical(a: Port, lengthKm: number): OpticalParams {
  let profileId = '1000BASE-LX';
  if (a.kind === 'stm') profileId = a.stmLevel === 16 ? 'L-16.2' : a.stmLevel === 4 ? 'L-4.1' : 'L-1.1';
  else if (a.kind === 'cwdm-line') profileId = 'CWDM-80';
  else if ((a.kind === 'sfp' || a.kind === 'combo') && a.speedsGbps?.some((s) => s >= 10)) profileId = '10GBASE-ER';
  const p = OPTIC_PROFILES.find((o) => o.id === profileId)!;
  return {
    profile: p.id,
    wavelengthNm: p.wavelengthNm,
    lossDbPerKm: fibreLossDbPerKm(p.wavelengthNm),
    connectors: 2,
    connectorLossDb: 0.5,
    splices: defaultSpliceCount(lengthKm),
    spliceLossDb: 0.1,
    // Mux + demux insertion loss when the route runs through CWDM filters.
    extraLossDb: a.kind === 'cwdm-line' ? 5 : 0,
    txPowerDbm: p.txPowerDbm,
    rxSensitivityDbm: p.rxSensitivityDbm,
    rxOverloadDbm: p.rxOverloadDbm,
  };
}

/** Applies an optic profile to existing params, keeping fibre plant values. */
export function applyOpticProfile(params: OpticalParams, profileId: string): OpticalParams {
  const p = OPTIC_PROFILES.find((o) => o.id === profileId);
  if (!p) return { ...params, profile: 'custom' };
  return {
    ...params,
    profile: p.id,
    wavelengthNm: p.wavelengthNm,
    lossDbPerKm: fibreLossDbPerKm(p.wavelengthNm),
    txPowerDbm: p.txPowerDbm,
    rxSensitivityDbm: p.rxSensitivityDbm,
    rxOverloadDbm: p.rxOverloadDbm,
  };
}
