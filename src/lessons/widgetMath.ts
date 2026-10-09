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
