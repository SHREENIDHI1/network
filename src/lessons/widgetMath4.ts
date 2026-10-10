/** Maths behind the P4 (IP-MPLS) lesson widgets. */

// ---------------------------------------------------------- B3: label header

export interface LabelEntry {
  label: number;
  tc: number;
  s: 0 | 1;
  ttl: number;
}

/** RFC 3032 label stack entry: 20-bit label | 3-bit TC | 1-bit S | 8-bit TTL. */
export function encodeLabel(e: LabelEntry): { value: number; hex: string; bits: string } | string {
  if (!Number.isInteger(e.label) || e.label < 0 || e.label > 0xfffff) return 'Label must be 0 – 1 048 575 (20 bits).';
  if (!Number.isInteger(e.tc) || e.tc < 0 || e.tc > 7) return 'TC (EXP) must be 0 – 7 (3 bits).';
  if (!Number.isInteger(e.ttl) || e.ttl < 0 || e.ttl > 255) return 'TTL must be 0 – 255 (8 bits).';
  const value = ((e.label << 12) | (e.tc << 9) | (e.s << 8) | e.ttl) >>> 0;
  const b = value.toString(2).padStart(32, '0');
  return { value, hex: `0x${value.toString(16).padStart(8, '0')}`, bits: `${b.slice(0, 20)} ${b.slice(20, 23)} ${b.slice(23, 24)} ${b.slice(24)}` };
}

export function decodeLabel(value: number): LabelEntry {
  const v = value >>> 0;
  return { label: v >>> 12, tc: (v >>> 9) & 7, s: ((v >>> 8) & 1) as 0 | 1, ttl: v & 0xff };
}

/** Reserved label values (RFC 3032) with their meaning. */
export function reservedLabel(label: number): string | null {
  return (
    (
      { 0: 'IPv4 explicit-null', 1: 'router alert', 2: 'IPv6 explicit-null', 3: 'implicit-null (never on the wire — means "pop")' } as Record<
        number,
        string
      >
    )[label] ?? (label < 16 ? 'reserved' : null)
  );
}

// ------------------------------------------------------------- B3: LSP walk

export interface WalkHop {
  router: string;
  action: string;
  labelOut: string;
  labelTtl: string;
  ipTtl: number;
}

/**
 * Packet walk along an LSP of LSRs [ingress, …, egress] for the egress loopback.
 * Local labels are illustrative (16 + position); the egress advertises
 * implicit-null (PHP) or explicit-null. propagateTtl copies the IP TTL into the label.
 */
export function lspWalk(path: string[], opts: { explicitNull: boolean; propagateTtl: boolean; ipTtl?: number }): WalkHop[] {
  const n = path.length;
  if (n < 2) return [];
  const label = (i: number) => (i === n - 1 ? (opts.explicitNull ? 0 : 3) : 16 + i * 3);
  let ipTtl = opts.ipTtl ?? 64;
  let labelTtl = 0;
  const hops: WalkHop[] = [];
  for (let i = 0; i < n; i++) {
    const r = path[i];
    if (i === 0) {
      ipTtl -= 1;
      const out = label(1);
      labelTtl = opts.propagateTtl ? ipTtl : 255;
      if (out === 3) hops.push({ router: r, action: 'Next hop is the egress (implicit-null): send plain IP', labelOut: '—', labelTtl: '—', ipTtl });
      else hops.push({ router: r, action: `PUSH label ${out}`, labelOut: String(out), labelTtl: String(labelTtl), ipTtl });
      continue;
    }
    if (i === n - 1) {
      const hadLabel = opts.explicitNull;
      if (hadLabel) {
        labelTtl -= 1;
        if (opts.propagateTtl) ipTtl = Math.min(ipTtl, labelTtl);
        hops.push({ router: r, action: 'POP explicit-null (label 0), then IP lookup — egress', labelOut: '—', labelTtl: '—', ipTtl });
      } else
        hops.push({ router: r, action: 'Receives plain IP (label already popped) — egress, one IP lookup', labelOut: '—', labelTtl: '—', ipTtl });
      continue;
    }
    labelTtl -= 1;
    const out = label(i + 1);
    if (out === 3) {
      if (opts.propagateTtl) ipTtl = Math.min(ipTtl, labelTtl);
      hops.push({ router: r, action: `POP label ${label(i)} (penultimate hop popping)`, labelOut: '—', labelTtl: '—', ipTtl });
    } else hops.push({ router: r, action: `SWAP ${label(i)} → ${out}`, labelOut: String(out), labelTtl: String(labelTtl), ipTtl });
  }
  return hops;
}
