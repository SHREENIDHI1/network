import type { AclConfig, AclEntry } from '../config/netConfig';
import type { Ipv4Packet } from '../core/types';
import { formatIpv4, parseIpv4 } from '../ip/ipv4';

/**
 * IPv4 access control lists (IOS semantics): entries are evaluated top-down,
 * first match wins, and every ACL ends with an implicit "deny any".
 * Standard ACLs match the source address only; extended ACLs match
 * protocol, source, destination, UDP/TCP destination port and ICMP type.
 */

export type AclKind = 'standard' | 'extended';

/** Numbered ACL ranges: 1-99 / 1300-1999 standard, 100-199 / 2000-2699 extended. */
export function numberedKind(name: string): AclKind | null {
  if (!/^\d+$/.test(name)) return null;
  const n = Number(name);
  if ((n >= 1 && n <= 99) || (n >= 1300 && n <= 1999)) return 'standard';
  if ((n >= 100 && n <= 199) || (n >= 2000 && n <= 2699)) return 'extended';
  return null;
}

const PORTS: Record<string, number> = {
  bootps: 67,
  bootpc: 68,
  domain: 53,
  ntp: 123,
  snmp: 161,
  snmptrap: 162,
  syslog: 514,
  tftp: 69,
  www: 80,
  ssh: 22,
  telnet: 23,
  ftp: 21,
  smtp: 25,
};

const ICMP_TYPES = ['echo', 'echo-reply', 'unreachable', 'time-exceeded'] as const;

type Addr = { address: string; wildcard: string };

/** Reads an address spec at tokens[i]: any | host A | A W (| A alone for standard). */
function readAddr(t: string[], i: number, allowBare: boolean): { addr: Addr; next: number } | string {
  const w = t[i]?.toLowerCase();
  if (w === undefined) return '% Incomplete command.';
  if (w === 'any') return { addr: { address: '0.0.0.0', wildcard: '255.255.255.255' }, next: i + 1 };
  if (w === 'host') {
    if (parseIpv4(t[i + 1] ?? '') === null) return '% Invalid host address';
    return { addr: { address: t[i + 1], wildcard: '0.0.0.0' }, next: i + 2 };
  }
  if (parseIpv4(t[i]) === null) return `% Invalid input "${t[i]}"`;
  if (t[i + 1] !== undefined && parseIpv4(t[i + 1]) !== null) {
    // Normalise: clear address bits covered by the wildcard (IOS does the same).
    const a = parseIpv4(t[i])!;
    const wc = parseIpv4(t[i + 1])!;
    return { addr: { address: formatIpv4((a & ~wc) >>> 0), wildcard: t[i + 1] }, next: i + 2 };
  }
  if (!allowBare) return '% Incomplete command.';
  return { addr: { address: t[i], wildcard: '0.0.0.0' }, next: i + 1 };
}

/**
 * Parses the part of an ACL line after the list name, e.g.
 *   "permit 10.1.1.0 0.0.0.255"                         (standard)
 *   "deny icmp 10.10.0.0 0.0.255.255 host 10.50.0.5 echo" (extended)
 *   "permit udp any any eq bootps"
 *   "remark Block UTS to Railnet"
 * Returns the entry or an IOS-like error string.
 */
export function parseAclLine(kind: AclKind, tokens: string[]): AclEntry | string {
  const action = tokens[0]?.toLowerCase();
  if (action === 'remark') return { action: 'remark', protocol: 'ip', text: tokens.slice(1).join(' ').slice(0, 100) };
  if (action !== 'permit' && action !== 'deny') return "% Invalid input detected at '^' marker.";
  if (kind === 'standard') {
    const a = readAddr(tokens, 1, true);
    if (typeof a === 'string') return a;
    if (a.next < tokens.length && tokens[a.next].toLowerCase() !== 'log') return "% Invalid input detected at '^' marker.";
    return { action, protocol: 'ip', src: a.addr };
  }
  const proto = tokens[1]?.toLowerCase();
  if (proto !== 'ip' && proto !== 'icmp' && proto !== 'udp' && proto !== 'tcp') return '% Protocol must be ip, icmp, udp or tcp in this simulator.';
  const s = readAddr(tokens, 2, false);
  if (typeof s === 'string') return s;
  let i = s.next;
  if ((proto === 'udp' || proto === 'tcp') && tokens[i]?.toLowerCase() === 'eq') i += 2; // source port: accepted, not used
  const d = readAddr(tokens, i, false);
  if (typeof d === 'string') return d;
  i = d.next;
  const entry: AclEntry = { action, protocol: proto, src: s.addr, dst: d.addr };
  if ((proto === 'udp' || proto === 'tcp') && tokens[i]?.toLowerCase() === 'eq') {
    const p = tokens[i + 1]?.toLowerCase();
    const port = p === undefined ? NaN : /^\d+$/.test(p) ? Number(p) : (PORTS[p] ?? NaN);
    if (!Number.isInteger(port) || port < 0 || port > 65535) return '% Invalid port';
    entry.dstPort = port;
    i += 2;
  }
  if (proto === 'icmp' && tokens[i] && (ICMP_TYPES as readonly string[]).includes(tokens[i].toLowerCase())) {
    entry.icmpType = tokens[i].toLowerCase() as AclEntry['icmpType'];
    i++;
  }
  if (tokens[i]?.toLowerCase() === 'log') i++;
  if (i < tokens.length) return "% Invalid input detected at '^' marker.";
  return entry;
}

function addrMatch(ip: number, a: Addr | undefined): boolean {
  if (!a) return true;
  const base = parseIpv4(a.address)!;
  const care = ~parseIpv4(a.wildcard)! >>> 0;
  return ((ip & care) >>> 0) === ((base & care) >>> 0);
}

const ICMP_OF: Record<string, AclEntry['icmpType']> = {
  'echo-request': 'echo',
  'echo-reply': 'echo-reply',
  'dest-unreachable': 'unreachable',
  'time-exceeded': 'time-exceeded',
};

export function entryMatches(e: AclEntry, pkt: Ipv4Packet): boolean {
  if (e.action === 'remark') return false;
  if (e.protocol !== 'ip' && e.protocol !== pkt.protocol) return false;
  if (!addrMatch(pkt.src, e.src)) return false;
  if (!addrMatch(pkt.dst, e.dst)) return false;
  if (e.dstPort !== undefined && (pkt.udp?.dstPort ?? pkt.tcp?.dstPort) !== e.dstPort) return false;
  if (e.icmpType && (!pkt.icmp || ICMP_OF[pkt.icmp.type] !== e.icmpType)) return false;
  return true;
}

export interface AclVerdict {
  permit: boolean;
  /** Index of the matching entry, or -1 for the implicit deny. */
  index: number;
}

export function evaluateAcl(acl: AclConfig, pkt: Ipv4Packet): AclVerdict {
  for (let i = 0; i < acl.entries.length; i++) {
    const e = acl.entries[i];
    if (entryMatches(e, pkt)) return { permit: e.action === 'permit', index: i };
  }
  return { permit: false, index: -1 };
}

function fmtAddr(a: Addr | undefined, standard: boolean): string {
  if (!a || a.wildcard === '255.255.255.255') return 'any';
  if (a.wildcard === '0.0.0.0') return standard ? a.address : `host ${a.address}`;
  return `${a.address} ${a.wildcard}`;
}

const PORT_NAME = Object.fromEntries(Object.entries(PORTS).map(([k, v]) => [v, k]));

export function formatAclEntry(kind: AclKind, e: AclEntry): string {
  if (e.action === 'remark') return `remark ${e.text ?? ''}`;
  if (kind === 'standard') return `${e.action} ${fmtAddr(e.src, true)}`;
  const port = e.dstPort !== undefined ? ` eq ${PORT_NAME[e.dstPort] ?? e.dstPort}` : '';
  return `${e.action} ${e.protocol} ${fmtAddr(e.src, false)} ${fmtAddr(e.dst, false)}${port}${e.icmpType ? ` ${e.icmpType}` : ''}`;
}

/** "show access-lists" block for one ACL. `hits[i]` = match count of entry i. */
export function showAcl(name: string, acl: AclConfig, hits: number[]): string {
  const numbered = numberedKind(name) !== null;
  const head = `${acl.kind === 'standard' ? 'Standard' : 'Extended'} IP access list ${name}`;
  const lines = [head];
  let seq = 10;
  acl.entries.forEach((e, i) => {
    if (e.action === 'remark') return;
    const h = hits[i] ? ` (${hits[i]} match${hits[i] === 1 ? '' : 'es'})` : '';
    lines.push(`    ${numbered ? `${seq}` : `${seq}`} ${formatAclEntry(acl.kind, e)}${h}`);
    seq += 10;
  });
  return lines.join('\n');
}
