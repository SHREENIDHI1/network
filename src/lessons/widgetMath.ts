/**
 * Pure maths behind the LEARN widgets (kept out of React so it is tested).
 */

/** Speed of light in single-mode fibre ≈ c / 1.468 ≈ 204,000 km/s → ~4.9 µs per km. */
export const FIBRE_US_PER_KM = 4.9;

export type SizeUnit = 'KB' | 'MB' | 'GB';
export type RateUnit = 'kbps' | 'Mbps' | 'Gbps';

const SIZE_BYTES: Record<SizeUnit, number> = { KB: 1e3, MB: 1e6, GB: 1e9 };
const RATE_BPS: Record<RateUnit, number> = { kbps: 1e3, Mbps: 1e6, Gbps: 1e9 };

/** Serialisation time in seconds for `size` at `rate` (no protocol overhead). */
export function transferSeconds(size: number, sizeUnit: SizeUnit, rate: number, rateUnit: RateUnit): number {
  if (rate <= 0) return Infinity;
  return (size * SIZE_BYTES[sizeUnit] * 8) / (rate * RATE_BPS[rateUnit]);
}

/** One-way propagation delay in milliseconds over fibre. */
export function propagationMs(km: number): number {
  return (Math.max(0, km) * FIBRE_US_PER_KM) / 1000;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞';
  if (seconds < 1e-3) return `${(seconds * 1e6).toFixed(1)} µs`;
  if (seconds < 1) return `${(seconds * 1e3).toFixed(2)} ms`;
  if (seconds < 120) return `${seconds.toFixed(2)} s`;
  if (seconds < 7200) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

/** Parses a value written in base 2, 10 or 16; returns null if invalid or outside 0..255. */
export function parseOctet(text: string, base: 2 | 10 | 16): number | null {
  const t = text.trim().replace(/^0x/i, '').replace(/\s+/g, '');
  const re = base === 2 ? /^[01]{1,8}$/ : base === 10 ? /^\d{1,3}$/ : /^[0-9a-f]{1,2}$/i;
  if (!re.test(t)) return null;
  const n = parseInt(t, base);
  return n >= 0 && n <= 255 ? n : null;
}

export const toBin8 = (n: number) => n.toString(2).padStart(8, '0');
export const toHex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

/** Step-by-step decimal → binary using the subtract method (for teaching). */
export function subtractSteps(n: number): Array<{ place: number; bit: 0 | 1; remaining: number }> {
  let r = n;
  return [128, 64, 32, 16, 8, 4, 2, 1].map((place) => {
    const bit: 0 | 1 = r >= place ? 1 : 0;
    if (bit) r -= place;
    return { place, bit, remaining: r };
  });
}

/** Encapsulation stages shown by the stepper (sizes in bytes, typical/minimum headers). */
export interface EncapStage {
  layer: string;
  pdu: string;
  header: string;
  bytes: number;
  detail: string;
}

export function encapStages(mpls: boolean): EncapStage[] {
  const s: EncapStage[] = [
    {
      layer: 'L7 Application',
      pdu: 'Data',
      header: 'App data',
      bytes: 0,
      detail: 'Jaise UTS server ko ek request.',
    },
    {
      layer: 'L4 Transport',
      pdu: 'Segment',
      header: 'TCP header',
      bytes: 20,
      detail: 'Source/destination port (e.g. 443), sequence number.',
    },
    {
      layer: 'L3 Network',
      pdu: 'Packet',
      header: 'IPv4 header',
      bytes: 20,
      detail: 'Source/destination IP, TTL, protocol.',
    },
  ];
  if (mpls)
    s.push({
      layer: 'L2.5 MPLS',
      pdu: 'Labelled packet',
      header: 'MPLS label',
      bytes: 4,
      detail: 'Label (20 bits), TC (3), S (1), TTL (8).',
    });
  s.push(
    {
      layer: 'L2 Data link',
      pdu: 'Frame',
      header: 'Ethernet header + FCS',
      bytes: 18,
      detail: 'Destination/source MAC, EtherType (14 B) + FCS (4 B). 802.1Q tag hota to +4 B.',
    },
    {
      layer: 'L1 Physical',
      pdu: 'Bits',
      header: 'Preamble + SFD',
      bytes: 8,
      detail: 'Line par signal; preamble receiver ko sync karta hai.',
    },
  );
  return s;
}

// ---------------------------------------------------------------------------
// A4: hub vs switch MAC learning
// ---------------------------------------------------------------------------

/** One frame through a hub or a switch. Ports are 1..n; table maps MAC → port. */
export function forwardFrame(
  device: 'hub' | 'switch',
  ports: number,
  table: Readonly<Record<string, number>>,
  inPort: number,
  srcMac: string,
  dstMac: string,
): { outPorts: number[]; table: Record<string, number>; action: 'repeat' | 'learn+forward' | 'learn+flood' | 'filter' } {
  const others = Array.from({ length: ports }, (_, i) => i + 1).filter((p) => p !== inPort);
  if (device === 'hub') return { outPorts: others, table: { ...table }, action: 'repeat' };
  const next = { ...table, [srcMac]: inPort };
  const known = dstMac !== 'FF:FF:FF:FF:FF:FF' ? next[dstMac] : undefined;
  if (known === undefined) return { outPorts: others, table: next, action: 'learn+flood' };
  if (known === inPort) return { outPorts: [], table: next, action: 'filter' };
  return { outPorts: [known], table: next, action: 'learn+forward' };
}

// ---------------------------------------------------------------------------
// A5/A6: subnet calculator and VLSM planner
// ---------------------------------------------------------------------------

const ipToInt = (s: string): number | null => {
  const p = s.trim().split('.');
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return p.reduce((a, x) => ((a << 8) | Number(x)) >>> 0, 0);
};
const intToIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
const maskOf = (len: number) => (len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0);

export interface SubnetInfo {
  network: string;
  broadcast: string;
  mask: string;
  wildcard: string;
  firstHost: string;
  lastHost: string;
  usableHosts: number;
  prefixLen: number;
  /** Historical class of the first octet (classful addressing, for history only). */
  klass: 'A' | 'B' | 'C' | 'D (multicast)' | 'E (reserved)';
  isPrivate: boolean;
}

export function subnetInfo(ip: string, prefixLen: number): SubnetInfo | null {
  const a = ipToInt(ip);
  if (a === null || !Number.isInteger(prefixLen) || prefixLen < 0 || prefixLen > 32) return null;
  const m = maskOf(prefixLen);
  const net = (a & m) >>> 0;
  const bc = (net | (~m >>> 0)) >>> 0;
  const size = 2 ** (32 - prefixLen);
  const usable = prefixLen >= 31 ? (prefixLen === 31 ? 2 : 1) : size - 2;
  const first = prefixLen >= 31 ? net : net + 1;
  const last = prefixLen >= 31 ? bc : bc - 1;
  const o1 = a >>> 24;
  const o2 = (a >>> 16) & 255;
  const klass = o1 < 128 ? 'A' : o1 < 192 ? 'B' : o1 < 224 ? 'C' : o1 < 240 ? 'D (multicast)' : 'E (reserved)';
  const isPrivate = o1 === 10 || (o1 === 172 && o2 >= 16 && o2 <= 31) || (o1 === 192 && o2 === 168);
  return {
    network: intToIp(net),
    broadcast: intToIp(bc),
    mask: intToIp(m),
    wildcard: intToIp(~m >>> 0),
    firstHost: intToIp(first),
    lastHost: intToIp(last),
    usableHosts: usable,
    prefixLen,
    klass,
    isPrivate,
  };
}

/** Parses "10.52.20.0/24" or a dotted mask "10.52.20.0 255.255.255.0". */
export function parsePrefix(text: string): { ip: string; len: number } | null {
  const t = text.trim();
  const slash = /^(\S+)\s*\/\s*(\d{1,2})$/.exec(t);
  if (slash && ipToInt(slash[1]) !== null && Number(slash[2]) <= 32) return { ip: slash[1], len: Number(slash[2]) };
  const dotted = /^(\S+)\s+(\S+)$/.exec(t);
  if (dotted) {
    const m = ipToInt(dotted[2]);
    if (ipToInt(dotted[1]) === null || m === null) return null;
    const len = 32 - Math.log2((~m >>> 0) + 1);
    if (!Number.isInteger(len) || maskOf(len) !== m) return null;
    return { ip: dotted[1], len };
  }
  return null;
}

export interface VlsmRow {
  name: string;
  hosts: number;
  prefixLen: number;
  network: string;
  range: string;
  broadcast: string;
}

/** Largest-first VLSM allocation inside `block`. Returns null when the needs do not fit. */
export function vlsmPlan(block: string, needs: Array<{ name: string; hosts: number }>): VlsmRow[] | null {
  const b = parsePrefix(block);
  if (!b) return null;
  const base = (ipToInt(b.ip)! & maskOf(b.len)) >>> 0;
  const end = base + 2 ** (32 - b.len);
  let cursor = base;
  const rows: VlsmRow[] = [];
  for (const n of [...needs].sort((x, y) => y.hosts - x.hosts)) {
    if (!(n.hosts > 0)) return null;
    let len = 30;
    while (len > 0 && 2 ** (32 - len) - 2 < n.hosts) len--;
    const size = 2 ** (32 - len);
    cursor = Math.ceil(cursor / size) * size; // align to the subnet boundary
    if (cursor + size > end || len < b.len) return null;
    rows.push({
      name: n.name,
      hosts: n.hosts,
      prefixLen: len,
      network: intToIp(cursor),
      range: `${intToIp(cursor + 1)} – ${intToIp(cursor + size - 2)}`,
      broadcast: intToIp(cursor + size - 1),
    });
    cursor += size;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// A7: 802.1Q tag
// ---------------------------------------------------------------------------

/** 4-byte 802.1Q tag: TPID 0x8100 + TCI (PCP 3 bits, DEI 1 bit, VID 12 bits). */
export function dot1qTag(vlan: number, pcp = 0, dei = 0): { hex: string; tciBits: string } | null {
  if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094 || pcp < 0 || pcp > 7 || (dei !== 0 && dei !== 1)) return null;
  const tci = (pcp << 13) | (dei << 12) | vlan;
  const hex = `81 00 ${((tci >> 8) & 255).toString(16).padStart(2, '0')} ${(tci & 255).toString(16).padStart(2, '0')}`.toUpperCase();
  const bits = tci.toString(2).padStart(16, '0');
  return { hex, tciBits: `${bits.slice(0, 3)} ${bits.slice(3, 4)} ${bits.slice(4)}` };
}

// ---------------------------------------------------------------------------
// A8: root bridge election
// ---------------------------------------------------------------------------

export interface BridgeInput {
  name: string;
  priority: number;
  mac: string;
}

/** Lowest (priority, MAC) wins. Returns the winner's name, or null for invalid input. */
export function electRoot(bridges: BridgeInput[]): string | null {
  const norm = (m: string) => m.toLowerCase().replace(/[^0-9a-f]/g, '');
  if (!bridges.length || bridges.some((b) => b.priority % 4096 !== 0 || b.priority < 0 || b.priority > 61440 || norm(b.mac).length !== 12))
    return null;
  return [...bridges].sort((a, b) => a.priority - b.priority || (norm(a.mac) < norm(b.mac) ? -1 : 1))[0].name;
}
