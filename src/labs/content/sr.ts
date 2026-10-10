import { configure } from '../../engine/testing/fixtures';
import { lo } from '../../topologies/bgpLabs';
import { hostname } from '../../topologies/jodhpur/plan';
import { NET } from '../../topologies/teLabs';
import * as C from '../framework/checks';
import type { Lab } from '../framework/types';

/**
 * Segment Routing lab for lesson B14 (build phase P9). Checks read engine
 * state only. Same teaching ring as B10 (JU–PPR–MTD–DNA plus the labelled
 * JU–DNA lease), started with LDP; the learner migrates it to SR-MPLS.
 */

const CONF = ['enable', 'configure terminal'];
const JU = hostname('JU');
const PPR = hostname('PPR');
const MTD = hostname('MTD');
const DNA = hostname('DNA');
const RING = [JU, PPR, MTD, DNA];
/** Prefix-SID plan: index per station (label = SRGB base 16000 + index). */
export const SID_PLAN: Array<[string, string, number]> = [
  [JU, 'JU', 1],
  [PPR, 'PPR', 2],
  [MTD, 'MTD', 3],
  [DNA, 'DNA', 4],
];

export const srLines = (code: string, index: number, tiLfa: boolean) => [
  'segment-routing mpls',
  'connected-prefix-sid-map',
  'address-family ipv4',
  `${lo(code)}/32 index ${index} range 1`,
  'end',
  'configure terminal',
  'router ospf 1',
  'segment-routing mpls',
  ...(tiLfa ? ['fast-reroute per-prefix enable prefix-priority low', 'fast-reroute per-prefix ti-lfa'] : []),
  'exit',
];
const noLdpLines = ['interface te0/0/0', 'no mpls ip', 'interface te0/0/1', 'no mpls ip', 'exit'];

const b14: Lab = {
  id: 'LB14.1',
  part: 'B',
  level: 14,
  order: 1,
  lessonId: 'B14',
  title: 'Segment Routing: migrate the ring from LDP to SR-MPLS with TI-LFA',
  scenario:
    'JU–PPR–MTD–DNA ring (lease ke saath) abhi LDP par chal raha hai. Division ka naya design: LDP hata kar Segment Routing — labels OSPF hi baantega, alag protocol nahi. Kaam: har router par SR aur plan wala prefix-SID, LDP band, phir MTD par TI-LFA taaki koi bhi link kate to repair path pehle se ready ho.',
  concept:
    'Segment Routing (SR-MPLS): har router apne loopback ko ek "prefix SID" index deta hai. Label = SRGB base + index (yahan 16000 + index), aur yeh label poore network mein same rehta hai — LDP jaisa har hop par alag label nahi.\n' +
    'OSPF yeh index LSA mein le jaata hai, isliye LDP ki zaroorat nahi. Jab tak LDP bhi chal raha hai, router LDP label ko prefer karta hai (is simulator mein bhi).\n' +
    'TI-LFA: har prefix ke liye router pehle se calculate karta hai ki primary link kate to "post-convergence" path kya hoga, aur us path par pahunchane ke liye kaun se SIDs push karne honge (P-space / Q-space).\n' +
    'Railway analogy: prefix SID = har station ka fixed station code (JU, MTD) — kisi bhi junction par wahi code; LDP = har section par local token number.',
  objectives: ['SR with the planned prefix SIDs on all four routers', 'LDP removed, LSP ping MTD → JU over SR', 'TI-LFA computed on MTD-LSR'],
  topologyId: 'lab-b14-sr',
  requiredModules: ['topology', 'physical', 'sim', 'ip', 'ospf', 'mpls'],
  plan: {
    headers: ['Item', 'Value'],
    rows: [
      ['SRGB', '16000–23999 (default; no global-block change needed)'],
      ...SID_PLAN.map(([dev, code, i]): [string, string] => [`${dev} prefix SID`, `${lo(code)}/32 index ${i} → label ${16000 + i}`]),
      ['OSPF', 'segment-routing mpls under router ospf 1 on all four'],
      ['LDP', 'remove "mpls ip" from Te0/0/0 and Te0/0/1 on all four'],
      ['TI-LFA (MTD-LSR)', 'fast-reroute per-prefix enable prefix-priority low + fast-reroute per-prefix ti-lfa'],
      ['Proof', `ping mpls ipv4 ${lo('JU')}/32 from MTD-LSR, and ping JU-NVR (${NET.nvr}.10) from MTD-CAM1`],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'All four routers run Segment Routing and advertise their loopback with the planned SID index.',
      check: C.all(...SID_PLAN.map(([dev, code, i]) => C.srSid(dev, `${lo(code)}/32`, i))),
      points: 30,
    },
    {
      id: 't2',
      text: `LDP is gone from the ring, an LSP ping from MTD-LSR to ${lo('JU')}/32 succeeds over SR, and MTD-CAM1 reaches JU-NVR.`,
      check: C.all(C.noLdp(RING), C.lspPingSucceeds(MTD, `${lo('JU')}/32`), C.pingSucceeds('MTD-CAM1', `${NET.nvr}.10`)),
      points: 30,
    },
    {
      id: 't3',
      text: 'MTD-LSR has a TI-LFA repair path for every SR prefix.',
      check: C.tiLfaProtected(MTD),
      points: 20,
    },
  ],
  hints: [
    [
      'Global: segment-routing mpls → connected-prefix-sid-map → address-family ipv4 → <loopback>/32 index <n> range 1 → exit-address-family',
      'Then router ospf 1 → segment-routing mpls. "show mpls forwarding-table" now shows 16001–16004 labels.',
    ],
    [
      'LDP labels win while LDP runs: interface te0/0/0 → no mpls ip, interface te0/0/1 → no mpls ip, on every router.',
      `"show mpls ldp neighbor" must be empty. Then on MTD-LSR: ping mpls ipv4 ${lo('JU')}/32, and ping ${NET.nvr}.10 from MTD-CAM1.`,
    ],
    [
      'router ospf 1 → fast-reroute per-prefix enable prefix-priority low → fast-reroute per-prefix ti-lfa',
      'Select MTD-LSR: the LIVE "Segment Routing" panel lists the repair per prefix.',
    ],
  ],
  breakFix: {
    complaint: 'NOC JU: "DNA aur MTD ke loopback ka SR label gayab — kisi ne DNA par SID plan galat type kiya."',
    apply: (t) =>
      configure(t, DNA, (c) => {
        if (c.sr) c.sr.prefixSids = c.sr.prefixSids.map((p) => ({ ...p, index: 3 }));
      }),
    check: C.all(C.srSid(MTD, `${lo('MTD')}/32`, 3), C.srSid(DNA, `${lo('DNA')}/32`, 4)),
    hints: [
      'Select DNA-LSR or MTD-LSR: the LIVE Segment Routing panel lists the SID conflict — it removes BOTH prefixes.',
      `On DNA-LSR: segment-routing mpls → connected-prefix-sid-map → address-family ipv4 → ${lo('DNA')}/32 index 4 range 1`,
    ],
    fix: {
      cli: { [DNA]: [...CONF, 'segment-routing mpls', 'connected-prefix-sid-map', 'address-family ipv4', `${lo('DNA')}/32 index 4 range 1`, 'end'] },
    },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Which protocol distributes SR labels in this lab?',
      options: ['LDP', 'OSPF (prefix SIDs in its LSAs)', 'RSVP-TE', 'BGP'],
      correctIndex: 1,
      explanation: 'SR removes the separate label protocol — the IGP carries the SID index.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'SRGB base 16000, prefix SID index 4. Which label do neighbours use to reach that prefix?',
      options: ['4', '16004', '16000', 'A random local label'],
      correctIndex: 1,
      explanation: 'Label = base + index; same on every router that uses the same SRGB.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Two routers advertise the same SID index for different prefixes. What happens here?',
      options: ['The lower router ID wins', 'Both prefixes lose their SR label (conflict)', 'Labels are shared', 'Nothing'],
      correctIndex: 1,
      explanation:
        'The simulator rejects both conflicting prefixes; real routers apply a conflict-resolution rule, but a conflict is always a planning error.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'TI-LFA repairs follow…',
      options: [
        'Any loop-free path',
        'The post-convergence path (where traffic goes after the IGP reconverges)',
        'The longest path',
        'The RSVP backup tunnel',
      ],
      correctIndex: 1,
      explanation: 'Using the post-convergence path avoids a second change of path after convergence.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: `After the lab, run "show mpls forwarding-table" on MTD-LSR. Which local label is shown for ${lo('JU')}/32?`,
      options: ['16001', '16003', '17', 'Pop Label'],
      correctIndex: 0,
      explanation: 'Prefix SID index 1 → 16001 on every router (global label).',
    },
  ],
  estMinutes: 50,
  fieldNote:
    'Real gear: SR-MPLS with OSPF prefix SIDs and TI-LFA exists on most SP routers (IOS-XE / IOS-XR / Junos). Syntax here is IOS-XE style; NEON CLI is not public. Not modelled: adjacency SIDs as labels, SR-TE policies, mapping server / LDP interworking, SRGB mismatch between routers, microloop avoidance. TI-LFA is computed and shown; convergence after a cut is instant in the simulator, so the repair is not used by packets.\nInterview questions: "SR vs LDP?", "SRGB kya hai?", "TI-LFA aur LFA mein farak?"',
  solution: {
    cli: Object.fromEntries(SID_PLAN.map(([dev, code, i]) => [dev, [...CONF, ...noLdpLines, ...srLines(code, i, dev === MTD), 'end']])),
    lsp: [[MTD, `${lo('JU')}/32`]],
    pings: [['MTD-CAM1', `${NET.nvr}.10`]],
  },
};

export const SR_LABS: Lab[] = [b14];
