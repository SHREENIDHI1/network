import type { Lesson } from './types';

/**
 * Curriculum outline: every lesson of Part A (foundations) and Part B
 * (IP-MPLS). `phase` = build phase that delivers it. Only lessons with a
 * loader are available; the rest are listed so learners see the road ahead.
 */

export interface CurriculumItem {
  id: string;
  part: 'A' | 'B';
  title: string;
  phase: number;
}

export const CURRICULUM: CurriculumItem[] = [
  { id: 'A0', part: 'A', title: 'What is a network?', phase: 1 },
  { id: 'A1', part: 'A', title: 'OSI and TCP/IP models', phase: 1 },
  {
    id: 'A2',
    part: 'A',
    title: 'Physical layer: copper, fibre, SFPs, optical budget',
    phase: 1,
  },
  {
    id: 'A3',
    part: 'A',
    title: 'Number systems: binary, decimal, hex',
    phase: 1,
  },
  { id: 'A4', part: 'A', title: 'Ethernet & MAC addresses', phase: 2 },
  { id: 'A5', part: 'A', title: 'IPv4 addressing', phase: 2 },
  {
    id: 'A6',
    part: 'A',
    title: 'Subnetting & VLSM (Jodhpur IP plan)',
    phase: 2,
  },
  { id: 'A7', part: 'A', title: 'Switching basics & VLANs', phase: 2 },
  {
    id: 'A8',
    part: 'A',
    title: 'Switching resilience & security (STP, LACP, port security)',
    phase: 2,
  },
  { id: 'A9', part: 'A', title: 'Routing basics', phase: 3 },
  {
    id: 'A10',
    part: 'A',
    title: 'Dynamic routing: RIP, OSPF, IS-IS',
    phase: 3,
  },
  {
    id: 'A11',
    part: 'A',
    title: 'Network services: DHCP, DNS, NAT, NTP, SNMP, Syslog, SSH',
    phase: 3,
  },
  {
    id: 'A12',
    part: 'A',
    title: 'Security basics: ACLs, firewall zones',
    phase: 3,
  },
  { id: 'A13', part: 'A', title: 'Redundancy: HSRP/VRRP', phase: 3 },
  { id: 'A14', part: 'A', title: 'QoS basics', phase: 3 },
  {
    id: 'A15',
    part: 'A',
    title: 'Foundations capstone: MTD station + JU HQ',
    phase: 3,
  },
  { id: 'B0', part: 'B', title: 'Why MPLS for Railways', phase: 4 },
  {
    id: 'B1',
    part: 'B',
    title: 'Router OS basics on SP routers (NEON profiles)',
    phase: 4,
  },
  { id: 'B2', part: 'B', title: 'IGP for the MPLS core', phase: 4 },
  {
    id: 'B3',
    part: 'B',
    title: 'MPLS fundamentals: labels, FEC, PHP',
    phase: 4,
  },
  { id: 'B4', part: 'B', title: 'LDP', phase: 4 },
  { id: 'B5', part: 'B', title: 'BGP and MP-BGP', phase: 5 },
  { id: 'B6', part: 'B', title: 'L3VPN for Railways', phase: 5 },
  { id: 'B7', part: 'B', title: 'L2VPN: VPWS and VPLS', phase: 6 },
  { id: 'B8', part: 'B', title: 'TDM over MPLS (E1 pseudowire)', phase: 6 },
  { id: 'B9', part: 'B', title: 'MPLS QoS', phase: 7 },
  { id: 'B10', part: 'B', title: 'Traffic Engineering & resilience', phase: 7 },
  { id: 'B11', part: 'B', title: 'Operations & NMS', phase: 8 },
  { id: 'B12', part: 'B', title: 'Automation', phase: 8 },
  { id: 'B13', part: 'B', title: 'Inter-division hand-off', phase: 8 },
  { id: 'B14', part: 'B', title: 'Segment Routing (optional)', phase: 9 },
  {
    id: 'B15',
    part: 'B',
    title: 'Grand capstone: Jodhpur division backbone',
    phase: 9,
  },
];

/** Lazy loaders: each lesson is its own chunk. */
export const LESSON_LOADERS: Record<string, () => Promise<Lesson>> = {
  A0: () => import('./content/a0').then((m) => m.lesson),
  A1: () => import('./content/a1').then((m) => m.lesson),
  A2: () => import('./content/a2').then((m) => m.lesson),
  A3: () => import('./content/a3').then((m) => m.lesson),
  A4: () => import('./content/a4').then((m) => m.lesson),
  A5: () => import('./content/a5').then((m) => m.lesson),
  A6: () => import('./content/a6').then((m) => m.lesson),
  A7: () => import('./content/a7').then((m) => m.lesson),
  A8: () => import('./content/a8').then((m) => m.lesson),
  A9: () => import('./content/a9').then((m) => m.lesson),
  A10: () => import('./content/a10').then((m) => m.lesson),
  A11: () => import('./content/a11').then((m) => m.lesson),
  A12: () => import('./content/a12').then((m) => m.lesson),
  A13: () => import('./content/a13').then((m) => m.lesson),
  A14: () => import('./content/a14').then((m) => m.lesson),
  A15: () => import('./content/a15').then((m) => m.lesson),
  B0: () => import('./content/b0').then((m) => m.lesson),
  B1: () => import('./content/b1').then((m) => m.lesson),
  B2: () => import('./content/b2').then((m) => m.lesson),
  B3: () => import('./content/b3').then((m) => m.lesson),
  B4: () => import('./content/b4').then((m) => m.lesson),
  B5: () => import('./content/b5').then((m) => m.lesson),
  B6: () => import('./content/b6').then((m) => m.lesson),
  B7: () => import('./content/b7').then((m) => m.lesson),
  B8: () => import('./content/b8').then((m) => m.lesson),
  B9: () => import('./content/b9').then((m) => m.lesson),
  B10: () => import('./content/b10').then((m) => m.lesson),
  B11: () => import('./content/b11').then((m) => m.lesson),
  B12: () => import('./content/b12').then((m) => m.lesson),
  B13: () => import('./content/b13').then((m) => m.lesson),
};

export function isAvailable(id: string): boolean {
  return id in LESSON_LOADERS;
}
