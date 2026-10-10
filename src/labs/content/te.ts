import { configure } from '../../engine/testing/fixtures';
import { lo } from '../../topologies/bgpLabs';
import { hostname } from '../../topologies/jodhpur/plan';
import { LEASE, NET } from '../../topologies/teLabs';
import * as C from '../framework/checks';
import type { Lab } from '../framework/types';

/**
 * MPLS QoS and Traffic Engineering labs for lessons B9–B10 (build phase P7).
 * Checks read engine state only. Teaching design on the track map — the
 * JU–DNA lease that closes the B10 ring is a labelled teaching assumption.
 */

const CONF = ['enable', 'configure terminal'];
const JU = hostname('JU');
const PPR = hostname('PPR');
const MTD = hostname('MTD');
const DNA = hostname('DNA');
const APP = { sig: 'Signalling / safety data', voip: 'Control voice / VoIP', uts: 'UTS ticketing', cctv: 'CCTV video', rnet: 'Railnet / Internet' };

// ---------------------------------------------------------------------------
// LB9.1 MPLS QoS on the MTD–PPR span (B9)
// ---------------------------------------------------------------------------

const coreClasses = [
  'class-map match-any CORE-RT',
  'match mpls experimental topmost 5 6',
  'class-map match-any CORE-UTS',
  'match mpls experimental topmost 3',
  'class-map match-any CORE-VIDEO',
  'match mpls experimental topmost 4',
  'exit',
];
const corePolicy = [
  'policy-map CORE-OUT',
  'class CORE-RT',
  'priority percent 10',
  'class CORE-UTS',
  'bandwidth percent 10',
  'class CORE-VIDEO',
  'bandwidth percent 60',
  'exit',
  'exit',
  'interface te0/0/0',
  'service-policy output CORE-OUT',
  'exit',
];

const b9: Lab = {
  id: 'LB9.1',
  part: 'B',
  level: 9,
  order: 1,
  lessonId: 'B9',
  title: 'MPLS QoS: EXP marking and core queues on the MTD–PPR span',
  scenario:
    'Merta Road se JU tak sab kuch ek 1 Gbit/s lambda (MTD–PPR) par: signalling (RTU), control phones, UTS, 600 Mbit/s CCTV aur 500 Mbit/s Railnet. Abhi FIFO hai — sab ~15% loss. Railway order: Signalling > Voice > UTS > CCTV > Railnet. Kaam: MTD PE par signalling ko EXP 6 do (voice EXP 5 rahe), aur core interface par EXP ke hisaab se queues banao.',
  concept:
    'MPLS packet ke label mein 3-bit TC/EXP field hota hai. PE label lagate waqt (imposition) default mein IP precedence (DSCP ke upar 3 bit) copy karta hai: EF 46 → 5, CS5 40 → 5, AF41 34 → 4, AF31 26 → 3.\n' +
    'Core ke routers IP header nahi dekhte — sirf label. Isliye core policy mein "match mpls experimental topmost", "match dscp" nahi: labelled packet par match dscp kabhi hit nahi hota.\n' +
    'Signalling aur voice dono EXP 5 ho jaate hain; signalling ko alag pehchaan dene ke liye PE ki input policy mein "set mpls experimental imposition 6".\n' +
    'Railway analogy: label par EXP = parcel par "URGENT" stamp; beech ke stations sirf stamp dekhte hain, parcel nahi kholte.',
  objectives: ['EXP 6 for signalling at imposition', 'LLQ for EXP 5/6, guarantees for UTS and CCTV', 'Railnet absorbs the loss'],
  topologyId: 'lab-b9-qos',
  requiredModules: ['topology', 'physical', 'sim', 'ip', 'ospf', 'mpls', 'qos'],
  plan: {
    headers: ['Application (MTD → JU)', 'DSCP', 'Default EXP', 'Target EXP', 'Rate'],
    rows: [
      ['Signalling (MTD-RTU, Gi0/3/0)', 'CS5 (40)', '5', '6', '5 Mbit/s'],
      ['Control voice (MTD-PHONE)', 'EF (46)', '5', '5', '20 Mbit/s'],
      ['UTS (MTD-UTS1)', 'AF31 (26)', '3', '3', '50 Mbit/s'],
      ['CCTV (MTD-CAM1)', 'AF41 (34)', '4', '4', '600 Mbit/s'],
      ['Railnet (MTD-RAILNET-PC)', 'default (0)', '0', '0', '500 Mbit/s'],
    ],
  },
  tasks: [
    { id: 't1', text: 'Signalling from MTD-RTU must leave MTD-LSR with EXP 6.', check: C.qosFlowExp('MTD-RTU', APP.sig, MTD, 6), points: 20 },
    {
      id: 't2',
      text: 'No loss for signalling and control voice on the MTD–PPR span.',
      check: C.all(C.qosFlowOk('MTD-RTU', APP.sig, 0.1), C.qosFlowOk('MTD-PHONE', APP.voip, 0.1)),
      points: 25,
    },
    {
      id: 't3',
      text: 'No loss for UTS and CCTV either — only Railnet may lose traffic.',
      check: C.all(C.qosFlowOk('MTD-UTS1', APP.uts, 0.1), C.qosFlowOk('MTD-CAM1', APP.cctv, 0.1)),
      points: 20,
    },
  ],
  hints: [
    [
      'On MTD-LSR: class-map match-any SIGNALLING → match dscp cs5; policy-map PE-IN → class SIGNALLING → set mpls experimental imposition 6',
      'Apply it where signalling enters: interface gi0/3/0 → service-policy input PE-IN',
    ],
    [
      'Core class-maps must match labels: class-map match-any CORE-RT → match mpls experimental topmost 5 6',
      'policy-map CORE-OUT → class CORE-RT → priority percent 10; interface te0/0/0 → service-policy output CORE-OUT',
    ],
    ['Add CORE-UTS (EXP 3, bandwidth percent 10) and CORE-VIDEO (EXP 4, bandwidth percent 60). Check the QoS tab (bottom dock).'],
  ],
  breakFix: {
    complaint:
      'Section control MTD: "Control phones par awaaz kat rahi hai aur RTU data late. Kal core policy mein access-router wali class-map copy ki gayi thi."',
    apply: (t) =>
      configure(t, MTD, (c) => {
        const cm = c.qos.classMaps['CORE-RT'];
        if (cm) {
          cm.exp = [];
          cm.dscp = [40, 46];
        }
      }),
    check: C.all(C.qosFlowOk('MTD-RTU', APP.sig, 0.1), C.qosFlowOk('MTD-PHONE', APP.voip, 0.1)),
    hints: ['"show class-map" on MTD-LSR: what does CORE-RT match? Packets on te0/0/0 are labelled.', 'class-map match-any CORE-RT → no match dscp cs5 ef → match mpls experimental topmost 5 6'],
    fix: { cli: { [MTD]: [...CONF, 'class-map match-any CORE-RT', 'no match dscp cs5 ef', 'match mpls experimental topmost 5 6', 'end'] } },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Default EXP of an EF (DSCP 46) packet at label imposition?',
      options: ['0', '3', '5', '7'],
      correctIndex: 2,
      explanation: 'EXP = IP precedence = the top 3 bits of DSCP: 46 = 101110 → 5.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'A P router has "class-map match dscp ef" on its core interface. Voice is labelled. What happens?',
      options: ['Voice is prioritised', 'The class never matches — voice falls into class-default', 'DSCP is rewritten', 'Packets are dropped'],
      correctIndex: 1,
      explanation: 'The P router classifies on the label (match mpls experimental topmost).',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Why give signalling EXP 6 instead of leaving it at 5?',
      options: ['Bigger number is faster', 'So the core can tell it apart from voice and give it its own treatment', 'EXP 5 is invalid', 'For TE'],
      correctIndex: 1,
      explanation: 'CS5 and EF both map to 5 by default.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'How many EXP / TC values exist?',
      options: ['4', '8', '64', '256'],
      correctIndex: 1,
      explanation: '3 bits → 0–7. DSCP has 64 values, so the PE maps many DSCPs onto few EXPs.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the lab, open the QoS tab. Which application loses traffic on the MTD–PPR span?',
      options: ['Signalling', 'UTS ticketing', 'CCTV video', 'Railnet / Internet'],
      correctIndex: 3,
      explanation: 'It falls into class-default and gets what is left of the 1 Gbit/s (325 of 500 Mbit/s).',
    },
  ],
  estMinutes: 50,
  fieldNote:
    'Real gear: the QoS tab is a steady-state calculation (no burst, queue depth or WRED). EXP is copied from IP precedence at imposition, as on IOS by default; uniform/pipe/short-pipe DiffServ tunnelling modes are taught but not separately configurable. The 1 Gbit/s MTD–PPR span is a teaching assumption.\nInterview questions: "Core par match dscp kyon kaam nahi karta?", "EXP kitne bit ka?", "Signalling aur voice ko core mein alag kaise karoge?"',
  solution: {
    cli: {
      [MTD]: [
        ...CONF,
        'class-map match-any SIGNALLING',
        'match dscp cs5',
        'exit',
        'policy-map PE-IN',
        'class SIGNALLING',
        'set mpls experimental imposition 6',
        'exit',
        'exit',
        'interface gi0/3/0',
        'service-policy input PE-IN',
        'exit',
        ...coreClasses,
        ...corePolicy,
        'end',
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// LB10.1 TE tunnel around the busy JU–PPR span (B10)
// ---------------------------------------------------------------------------

const teMtd = [
  'mpls traffic-eng tunnels',
  'interface te0/0/0',
  'mpls traffic-eng tunnels',
  'ip rsvp bandwidth',
  'interface te0/0/1',
  'mpls traffic-eng tunnels',
  'ip rsvp bandwidth',
  'exit',
  'router ospf 1',
  'mpls traffic-eng router-id loopback0',
  'mpls traffic-eng area 0',
  'exit',
];

const b10: Lab = {
  id: 'LB10.1',
  part: 'B',
  level: 10,
  order: 1,
  lessonId: 'B10',
  title: 'RSVP-TE: steer MTD traffic around the busy JU–PPR span',
  scenario:
    'JU–PPR span sirf 1 Gbit/s ka hai, aur MTD se JU tak 600 Mbit/s CCTV + 500 Mbit/s Railnet jaata hai — IGP (OSPF) shortest path wahi hai, isliye ~9% loss. Ring ka doosra hissa (MTD–DNA aur leased DNA–JU lambda) khaali pada hai. Kaam: MTD par TE chalu karo aur JU tak ek tunnel banao jo DNA se hoke jaaye, 1.1 Gbit/s reserve kare, aur autoroute se MTD ka JU-bound traffic le jaaye.',
  concept:
    'IGP hamesha shortest path chunta hai, chahe woh bhara ho. Traffic Engineering (RSVP-TE) head-end ko raasta chunne deta hai: explicit path (hop-by-hop "next-address") ya CSPF (constraint: itni bandwidth chahiye).\n' +
    'Har link par "ip rsvp bandwidth" batata hai kitna reserve ho sakta hai; tunnel "bandwidth" maangta hai; RSVP Path/Resv har hop par reserve karke label deta hai.\n' +
    'Autoroute announce: tunnel ko IGP ek seedha link maan leta hai — tail ke peeche ke sab destinations tunnel se jaate hain.\n' +
    'Railway analogy: TE = goods train ko main line ki jagah chord line se bhejna, path pehle se block karke (reservation).',
  objectives: ['TE on MTD-LSR (OSPF TE extensions, RSVP)', 'Tunnel1 MTD → JU via DNA with 1.1 Gbit/s', 'No loss for MTD traffic'],
  topologyId: 'lab-b10-te',
  requiredModules: ['topology', 'physical', 'sim', 'ip', 'ospf', 'mpls', 'qos', 'te'],
  plan: {
    headers: ['Item', 'Value'],
    rows: [
      ['TE already on', 'JU-LSR, PPR-LSR, DNA-LSR (router-id Loopback0, area 0, ip rsvp bandwidth = 75%)'],
      ['IGP', 'OSPF cost of the 1G JU–PPR span is pinned to 10 by the plan, so OSPF keeps MTD → JU on it'],
      ['Ring links', `JU–PPR 10.254.0.0/31 (1G!), PPR–MTD 10.254.0.2/31, MTD–DNA 10.254.0.4/31, DNA–JU lease ${LEASE.dna}/${LEASE.ju} (OSPF cost 50)`],
      ['Tunnel1 on MTD-LSR', `destination ${lo('JU')} (JU loopback), bandwidth 1100000 kbps, explicit path VIA_DNA`],
      ['Explicit path VIA_DNA', `next-address 10.254.0.5 (DNA), next-address ${LEASE.ju} (JU)`],
    ],
  },
  tasks: [
    { id: 't1', text: 'Tunnel1 on MTD-LSR to JU-LSR is up and goes through DNA-LSR.', check: C.teTunnelUp(MTD, 'Tunnel1', { via: DNA }), points: 25 },
    { id: 't2', text: 'Tunnel1 reserves at least 1 Gbit/s (1000000 kbps).', check: C.teTunnelUp(MTD, 'Tunnel1', { minKbps: 1_000_000 }), points: 15 },
    {
      id: 't3',
      text: 'MTD CCTV and Railnet reach JU without loss, avoiding PPR.',
      check: C.all(C.qosFlowOk('MTD-CAM1', APP.cctv, 0.1), C.qosFlowOk('MTD-RAILNET-PC', APP.rnet, 0.1), C.qosFlowVia('MTD-CAM1', APP.cctv, PPR, true)),
      points: 25,
    },
  ],
  hints: [
    [
      'On MTD-LSR: mpls traffic-eng tunnels; on te0/0/0 and te0/0/1: mpls traffic-eng tunnels + ip rsvp bandwidth; router ospf 1 → mpls traffic-eng router-id loopback0 → mpls traffic-eng area 0',
      `ip explicit-path name VIA_DNA enable → next-address 10.254.0.5 → next-address ${LEASE.ju}`,
      `interface tunnel1 → ip unnumbered loopback0 → tunnel mode mpls traffic-eng → tunnel destination ${lo('JU')} → tunnel mpls traffic-eng path-option 1 explicit name VIA_DNA`,
    ],
    ['tunnel mpls traffic-eng bandwidth 1100000 (kbit/s). "show ip rsvp interface" shows what each link has left.'],
    ['tunnel mpls traffic-eng autoroute announce — then "show ip route" on MTD shows JU\'s networks via Tunnel1. The QoS tab shows the new path.'],
  ],
  breakFix: {
    complaint: 'NOC JU: "MTD ka CCTV phir se kat raha hai. DNA par kal lease interface ka RSVP \'tune\' kiya gaya."',
    apply: (t) =>
      configure(t, DNA, (c) => {
        c.interfaces['Te0/0/1'] = { ...(c.interfaces['Te0/0/1'] ?? {}), rsvpBandwidth: 100000 };
      }),
    check: C.teTunnelUp(MTD, 'Tunnel1', { via: DNA, minKbps: 1_000_000 }),
    hints: ['"show mpls traffic-eng tunnels brief" on MTD-LSR — read the note; then "show ip rsvp interface" on DNA-LSR.', 'On DNA-LSR: interface te0/0/1 → ip rsvp bandwidth'],
    fix: { cli: { [DNA]: [...CONF, 'interface te0/0/1', 'ip rsvp bandwidth', 'end'] } },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'What does CSPF add to plain SPF?',
      options: ['Faster timers', 'Constraints such as available bandwidth and excluded links', 'Load balancing', 'Encryption'],
      correctIndex: 1,
      explanation: 'Constrained SPF prunes links that cannot satisfy the tunnel, then runs SPF.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Which protocol reserves the bandwidth and hands out the TE labels?',
      options: ['LDP', 'RSVP-TE', 'BGP', 'OSPF'],
      correctIndex: 1,
      explanation: 'OSPF floods TE link information; RSVP-TE signals the LSP.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'What does "autoroute announce" do?',
      options: ['Advertises the tunnel to BGP', 'Lets the head end use the tunnel as a direct link to the tail in its routing', 'Creates a backup tunnel', 'Reserves bandwidth'],
      correctIndex: 1,
      explanation: 'Destinations at or behind the tail are routed into the tunnel.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: '"ip rsvp bandwidth" without a value on a 10G interface reserves up to…',
      options: ['10 Gbit/s', '7.5 Gbit/s (75%)', '1 Gbit/s', 'Nothing'],
      correctIndex: 1,
      explanation: 'IOS default is 75% of the interface bandwidth.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the lab, run "show mpls traffic-eng tunnels brief" on DNA-LSR. How does MTD-LSR_t1 appear there?',
      options: ['As a head end', 'As a midpoint (UP IF and DOWN IF both set)', 'As a tail', 'Not listed'],
      correctIndex: 1,
      explanation: 'DNA receives the LSP on Te0/0/0 and sends it on the lease Te0/0/1.',
    },
  ],
  estMinutes: 55,
  fieldNote:
    'Real gear: RSVP-TE is computed (no Path/Resv refresh, no setup/hold priorities or pre-emption, no affinities, no make-before-break timing). Autoroute here moves IGP routes whose path passes the tail. The JU–DNA lease is a teaching assumption.\nInterview questions: "TE kyon jab IGP hai?", "CSPF kya hai?", "autoroute vs static route into tunnel?"',
  solution: {
    cli: {
      [MTD]: [
        ...CONF,
        ...teMtd,
        'ip explicit-path name VIA_DNA enable',
        'next-address 10.254.0.5',
        `next-address ${LEASE.ju}`,
        'exit',
        'interface tunnel1',
        'ip unnumbered loopback0',
        'tunnel mode mpls traffic-eng',
        `tunnel destination ${lo('JU')}`,
        'tunnel mpls traffic-eng bandwidth 1100000',
        'tunnel mpls traffic-eng path-option 1 explicit name VIA_DNA',
        'tunnel mpls traffic-eng autoroute announce',
        'end',
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// LB10.2 FRR link protection on the PPR–JU span (B10)
// ---------------------------------------------------------------------------

const b10b: Lab = {
  id: 'LB10.2',
  part: 'B',
  level: 10,
  order: 2,
  lessonId: 'B10',
  title: 'Fast reroute: protect the PPR–JU span and survive a fibre cut',
  scenario:
    'MTD ka CCTV JU ke NVR tak ek TE tunnel se jaata hai (IGP path MTD–PPR–JU). PPR–JU fibre par road-widening ka kaam chal raha hai — kabhi bhi kat sakta hai. Kaam: MTD par primary tunnel (fast-reroute ke saath), PPR par backup tunnel jo PPR–JU span ko avoid kare, aur PPR ke JU-facing interface ko us backup se protect karo. Phir fibre kaato aur dekho traffic chalta rahe.',
  concept:
    'FRR (facility backup, RFC 4090): har link ke upstream router (PLR) par pehle se ek backup tunnel ready, jo us link ko chhod kar next hop (NHOP) ya next-next hop tak jaata hai.\n' +
    'Link kate to PLR turant (asli network mein < 50 ms) primary label ke upar backup ka label laga deta hai — head end ko pata chalne se pehle hi traffic bach jaata hai. Phir head end aaram se naya path signal karta hai (re-optimise / make-before-break).\n' +
    'Backup tunnel bandwidth reserve nahi karta (zero-bandwidth), sirf raasta pehle se tayyar.\n' +
    'Railway analogy: FRR = har block section ke liye pehle se tay "diversion route"; line block hote hi station master turant train ko diversion par bhejta hai, control office ka order baad mein aata hai.',
  objectives: ['Primary Tunnel1 MTD → JU with fast-reroute', 'Backup Tunnel2 on PPR avoiding the PPR–JU span', 'Fibre cut drill: traffic keeps flowing on the backup'],
  topologyId: 'lab-b10-frr',
  requiredModules: ['topology', 'physical', 'sim', 'ip', 'ospf', 'mpls', 'te'],
  plan: {
    headers: ['Item', 'Value'],
    rows: [
      ['TE', 'already on every LSR (router-id Loopback0, area 0, RSVP 75%)'],
      ['Tunnel1 (MTD-LSR)', `destination ${lo('JU')}, path-option 1 dynamic, autoroute, fast-reroute`],
      ['Tunnel2 (PPR-LSR, backup)', `destination ${lo('JU')}, explicit path AVOID_PPR_JU: exclude-address 10.254.0.0 (JU end of the span)`],
      ['Protected link', 'PPR-LSR Te0/0/0 → JU: mpls traffic-eng backup-path Tunnel2'],
      ['Drill', 'Cut the PPR–JU fibre (select the link → Cut), then ping JU-NVR from MTD-CAM1'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Tunnel1 on MTD-LSR is up, requests fast-reroute and is protected (FRR ready, or active after the cut).',
      check: C.teTunnelUp(MTD, 'Tunnel1', { frr: ['ready', 'active'] }),
      points: 25,
    },
    { id: 't2', text: 'Backup Tunnel2 on PPR-LSR is up and avoids the PPR–JU span (goes via DNA).', check: C.teTunnelUp(PPR, 'Tunnel2', { via: DNA }), points: 20 },
    {
      id: 't3',
      text: `Drill: with the PPR–JU fibre cut, Tunnel1 stays up on the backup (FRR active) and MTD-CAM1 still reaches JU-NVR (${NET.nvr}.10).`,
      check: C.all(C.linkCut(PPR, JU), C.teTunnelUp(MTD, 'Tunnel1', { frr: ['active'] }), C.pingSucceeds('MTD-CAM1', `${NET.nvr}.10`)),
      points: 25,
    },
  ],
  hints: [
    [
      `On MTD-LSR: interface tunnel1 → ip unnumbered loopback0 → tunnel mode mpls traffic-eng → tunnel destination ${lo('JU')} → tunnel mpls traffic-eng path-option 1 dynamic → tunnel mpls traffic-eng autoroute announce → tunnel mpls traffic-eng fast-reroute`,
      '"show mpls traffic-eng tunnels tunnel1" shows "Protection: none" until a PLR on the path has a backup.',
    ],
    [
      'On PPR-LSR: ip explicit-path name AVOID_PPR_JU enable → exclude-address 10.254.0.0',
      `interface tunnel2 → ip unnumbered loopback0 → tunnel mode mpls traffic-eng → tunnel destination ${lo('JU')} → tunnel mpls traffic-eng path-option 1 explicit name AVOID_PPR_JU`,
      'interface te0/0/0 → mpls traffic-eng backup-path tunnel2. Check "show mpls traffic-eng fast-reroute database" on PPR.',
    ],
    [
      'Select the PPR–JU link on the canvas → Cut. Then from MTD-CAM1: ping ' + `${NET.nvr}.10`,
      'Packet Inspector: at PPR the step says FAST REROUTE — the packet goes back via MTD and DNA. Afterwards "mpls traffic-eng reoptimize" on MTD moves Tunnel1 to MTD–DNA–JU.',
    ],
  ],
  breakFix: {
    complaint: 'NOC JU: "PPR par backup tunnel down dikha raha hai. Kal kisi ne explicit path \'saaf\' kiya."',
    apply: (t) =>
      configure(t, PPR, (c) => {
        const p = c.explicitPaths.AVOID_PPR_JU;
        if (p) p.entries = [{ kind: 'exclude', address: '10.254.0.3' }];
      }),
    check: C.teTunnelUp(PPR, 'Tunnel2', { via: DNA }),
    hints: ['"show ip explicit-paths" on PPR-LSR: which link does it exclude now?', 'no ip explicit-path name AVOID_PPR_JU, then ip explicit-path name AVOID_PPR_JU enable → exclude-address 10.254.0.0'],
    fix: { cli: { [PPR]: [...CONF, 'no ip explicit-path name AVOID_PPR_JU', 'ip explicit-path name AVOID_PPR_JU enable', 'exclude-address 10.254.0.0', 'end'] } },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Who switches traffic onto the backup tunnel when the link fails?',
      options: ['The head end', 'The point of local repair (router just upstream of the failure)', 'The tail', 'The NMS'],
      correctIndex: 1,
      explanation: 'Local repair is why FRR is fast — no signalling back to the head first.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Typical FRR switchover target?',
      options: ['< 50 ms', '1 s', '10 s', '1 min'],
      correctIndex: 0,
      explanation: 'Comparable to SDH protection — why railways ask for it on safety circuits.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Link protection ends the backup tunnel at…',
      options: ['The head end', 'The next hop (NHOP) after the protected link', 'Any router', 'The PLR itself'],
      correctIndex: 1,
      explanation: 'Node protection would end it at the next-next hop (NNHOP).',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'After FRR kicks in, what should happen next?',
      options: ['Nothing — stay on the backup forever', 'The head end re-optimises onto a new primary path', 'Reboot the PLR', 'Disable TE'],
      correctIndex: 1,
      explanation: 'The backup is a temporary detour; it may be long (here it goes back through MTD).',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the drill, run "mpls traffic-eng reoptimize" on MTD-LSR, then "show mpls traffic-eng tunnels tunnel1". Which path does Tunnel1 take?',
      options: ['MTD → PPR → JU', 'MTD → DNA → JU', 'MTD → PPR → MTD → DNA → JU', 'Down'],
      correctIndex: 1,
      explanation: 'With PPR–JU cut, CSPF finds MTD–DNA–JU (over the lease).',
    },
  ],
  estMinutes: 55,
  fieldNote:
    'Real gear: FRR is modelled as facility backup with link protection (next hop or next-next hop merge); the switchover is immediate in the model, and the head end stays on the backup until "mpls traffic-eng reoptimize" so you can study it — real head ends re-signal automatically within seconds (make-before-break). Detour (one-to-one) backup, node-protection SRLGs and BFD are not modelled.\nInterview questions: "FRR ka PLR kaun?", "link vs node protection?", "backup tunnel bandwidth kyon zero?"',
  solution: {
    cli: {
      [MTD]: [
        ...CONF,
        'interface tunnel1',
        'ip unnumbered loopback0',
        'tunnel mode mpls traffic-eng',
        `tunnel destination ${lo('JU')}`,
        'tunnel mpls traffic-eng path-option 1 dynamic',
        'tunnel mpls traffic-eng autoroute announce',
        'tunnel mpls traffic-eng fast-reroute',
        'end',
      ],
      [PPR]: [
        ...CONF,
        'ip explicit-path name AVOID_PPR_JU enable',
        'exclude-address 10.254.0.0',
        'exit',
        'interface tunnel2',
        'ip unnumbered loopback0',
        'tunnel mode mpls traffic-eng',
        `tunnel destination ${lo('JU')}`,
        'tunnel mpls traffic-eng path-option 1 explicit name AVOID_PPR_JU',
        'exit',
        'interface te0/0/0',
        'mpls traffic-eng backup-path tunnel2',
        'end',
      ],
    },
    cuts: [[PPR, JU]],
    pings: [
      ['MTD-CAM1', `${NET.nvr}.10`],
      ['MTD-CAM1', `${NET.nvr}.10`],
    ],
  },
};

export const TE_LABS: Lab[] = [b9, b10, b10b];
