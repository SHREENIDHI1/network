/**
 * Small IPv4/CIDR helpers used by lab checks (IP plans, overlap detection).
 * Pure functions; no engine dependency.
 */

export interface Cidr {
  network: number; // unsigned 32-bit
  prefixLen: number;
}

export function parseIpv4(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

export function maskOf(prefixLen: number): number {
  return prefixLen === 0 ? 0 : (0xffffffff << (32 - prefixLen)) >>> 0;
}

/** Parses "a.b.c.d/len". Host bits are cleared, so "10.1.1.5/24" -> 10.1.1.0/24. */
export function parseCidr(cidr: string): Cidr | null {
  const [ip, len, extra] = cidr.trim().split('/');
  if (extra !== undefined || len === undefined || !/^\d{1,2}$/.test(len)) return null;
  const prefixLen = Number(len);
  const addr = parseIpv4(ip);
  if (addr === null || prefixLen > 32) return null;
  return { network: (addr & maskOf(prefixLen)) >>> 0, prefixLen };
}

export function formatIpv4(n: number): string {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
}

export function formatCidr(c: Cidr): string {
  return `${formatIpv4(c.network)}/${c.prefixLen}`;
}

export function cidrContains(outer: Cidr, ip: number): boolean {
  return ((ip & maskOf(outer.prefixLen)) >>> 0) === outer.network;
}

export function cidrsOverlap(a: Cidr, b: Cidr): boolean {
  const len = Math.min(a.prefixLen, b.prefixLen);
  const m = maskOf(len);
  return ((a.network & m) >>> 0) === ((b.network & m) >>> 0);
}

/** True if `inner` lies entirely within `outer`. */
export function cidrWithin(inner: Cidr, outer: Cidr): boolean {
  return inner.prefixLen >= outer.prefixLen && cidrContains(outer, inner.network);
}

/** Returns every overlapping pair among the given CIDR strings (invalid entries are skipped). */
export function findOverlaps(cidrs: string[]): Array<[string, string]> {
  const parsed = cidrs.map((s) => ({ s, c: parseCidr(s) })).filter((x): x is { s: string; c: Cidr } => x.c !== null);
  const out: Array<[string, string]> = [];
  for (let i = 0; i < parsed.length; i++)
    for (let j = i + 1; j < parsed.length; j++) if (cidrsOverlap(parsed[i].c, parsed[j].c)) out.push([parsed[i].s, parsed[j].s]);
  return out;
}

/** Same subnet test for two host addresses in CIDR form ("10.1.1.1/24", "10.1.1.2/24"). */
export function sameSubnet(a: string, b: string): boolean {
  const ca = parseCidr(a);
  const cb = parseCidr(b);
  return !!ca && !!cb && ca.prefixLen === cb.prefixLen && ca.network === cb.network;
}

// ---------------------------------------------------------------------------
// Dotted-mask helpers (IOS-style "ip address A.B.C.D M.M.M.M")
// ---------------------------------------------------------------------------

/** Converts a dotted mask to a prefix length; null if the mask is not contiguous. */
export function maskToPrefix(mask: string): number | null {
  const m = parseIpv4(mask);
  if (m === null) return null;
  const inv = ~m >>> 0;
  // Contiguous masks have inverse of the form 0…01…1, i.e. inv & (inv + 1) === 0.
  if ((inv & (inv + 1)) >>> 0 !== 0) return null;
  let len = 0;
  for (let b = 31; b >= 0; b--) if ((m >>> b) & 1) len++;
  return len;
}

export function prefixToMask(prefixLen: number): string {
  return formatIpv4(maskOf(prefixLen));
}

export function networkOf(ip: number, prefixLen: number): number {
  return (ip & maskOf(prefixLen)) >>> 0;
}

export function broadcastOf(ip: number, prefixLen: number): number {
  return (networkOf(ip, prefixLen) | (~maskOf(prefixLen) >>> 0)) >>> 0;
}

export function inSubnet(ip: number, network: number, prefixLen: number): boolean {
  return networkOf(ip, prefixLen) === network;
}

/**
 * Validates a host address for an interface. Returns an IOS-like error text
 * or null when the address is usable.
 */
/** IOS address checks; `/32` only where allowed (loopbacks). */
export function validateHostAddress(address: string, mask: string, allowHost32 = false): string | null {
  const ip = parseIpv4(address);
  if (ip === null) return `% Invalid IP address ${address}`;
  const len = maskToPrefix(mask);
  if (len === null) return `% Bad mask ${mask} for address ${address}`;
  if (len === 0 || (len === 32 && !allowHost32)) return `% Bad mask /${len} for address ${address}`;
  if (len < 31) {
    if (ip === networkOf(ip, len)) return `% Bad mask /${len} for address ${address}`;
    if (ip === broadcastOf(ip, len)) return `% Bad mask /${len} for address ${address}`;
  }
  const first = ip >>> 24;
  if (first === 0 || first === 127 || first >= 224) return `% Invalid IP address ${address}`;
  return null;
}
