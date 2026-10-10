import { configure } from '../../engine/testing/fixtures';
import { lo } from '../../topologies/bgpLabs';
import { hostname } from '../../topologies/jodhpur/plan';
import { CCTV_NET, DL_NET } from '../../topologies/l2vpnLabs';
import * as C from '../framework/checks';
import type { Lab } from '../framework/types';

/**
 * L2VPN and TDM-pseudowire labs for lessons B7–B8 (build phase P6) on pieces
 * of the generated Jodhpur core. Checks read engine state only. Teaching
 * design on the track map — not the real RailTel / NWR network.
 */

const L2VPN: Lab['requiredModules'] = ['topology', 'physical', 'sim', 'ip', 'ospf', 'mpls', 'l2vpn'];
const CONF = ['enable', 'configure terminal'];
const JU = hostname('JU');
const MTD = hostname('MTD');
const DNA = hostname('DNA');
const FL = hostname('FL');
const KQW = hostname('KQW');
const REN = hostname('REN');
const JAC = hostname('JAC');

// ---------------------------------------------------------------------------
// LB7.1 VPWS for the MTD Data Logger (B7)
// ---------------------------------------------------------------------------

const DL_VC = 1301;
const xc = (peerCode: string) => [
  ...CONF,
  'interface gi0/3/2',
  'description Data Logger',
  `xconnect ${lo(peerCode)} ${DL_VC} encapsulation mpls`,
  'no shutdown',
  'end',
];

const b7: Lab = {
  id: 'LB7.1',
  part: 'B',
  level: 7,
  order: 1,
  lessonId: 'B7',
  title: 'VPWS: Data Logger Ethernet from MTD to JU',
  scenario:
    'Merta Road ka Data Logger (relay room events) JU ke central Data Logger server ke saath ek hi LAN mein hona chahiye — vendor software broadcast se logger dhoondhta hai, routing nahi jaanta. Purane SDH par yeh ek Ethernet-over-E1 circuit tha. Kaam: JU-LSR aur MTD-LSR ke beech VPWS pseudowire (VC ID 1301), aur MTD-DL se server tak ping.',
  concept:
    'VPWS (Virtual Private Wire Service) = MPLS core ke upar ek "virtual cable": ek PE ke port par jo bhi Ethernet frame aaye, woh as-is doosre PE ke port se nikalta hai. Router frame ko route nahi karta — IP address AC (attachment circuit) par nahi hota.\n' +
    'Do labels: upar transport label (LDP, remote PE ke loopback tak), neeche VC label (targeted LDP se remote PE ne diya — "is frame ko kis port par nikaalna hai").\n' +
    'Dono taraf same VC ID, peer = doosre PE ka loopback (LDP router-ID), aur MTU same — warna VC DOWN.\n' +
    'Railway analogy: VPWS = do stations ke beech dedicated "point-to-point" line, jaise purana leased circuit; beech ke stations (PPR) sirf label dekhte hain.',
  objectives: [
    'xconnect on both PEs with the same VC ID',
    'VC UP in "show mpls l2transport vc"',
    'Data Logger and server in one LAN across the core',
  ],
  topologyId: 'lab-b7-vpws',
  requiredModules: L2VPN,
  plan: {
    headers: ['Item', 'Value'],
    rows: [
      ['JU-LSR AC', `Gi0/3/2 → JU-DL-SRV ${DL_NET}.10/24`],
      ['MTD-LSR AC', `Gi0/3/2 → MTD-DL ${DL_NET}.20/24`],
      ['Pseudowire', `VC ID ${DL_VC}, peers = loopbacks ${lo('JU')} ↔ ${lo('MTD')}`],
      ['PPR-LSR', 'P router in between: no L2VPN config'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: `Bring up a VPWS pseudowire (VC ID ${DL_VC}) between JU-LSR Gi0/3/2 and MTD-LSR Gi0/3/2.`,
      check: C.pwUp(JU, MTD, DL_VC, 'vpws-eth'),
      points: 35,
    },
    { id: 't2', text: `MTD-DL must reach the central server (ping ${DL_NET}.10).`, check: C.pingSucceeds('MTD-DL', `${DL_NET}.10`), points: 25 },
  ],
  hints: [
    [
      `On JU-LSR: interface gi0/3/2 → xconnect ${lo('MTD')} ${DL_VC} encapsulation mpls → no shutdown`,
      `On MTD-LSR the mirror: xconnect ${lo('JU')} ${DL_VC} encapsulation mpls. "show mpls l2transport vc" shows the reason if it stays DOWN.`,
    ],
    ['From MTD-DL: ping ' + `${DL_NET}.10` + ' (the first ping may lose one packet to ARP — the ARP itself crosses the pseudowire).'],
  ],
  breakFix: {
    complaint: 'S&T JU: "MTD Data Logger ka data kal raat se nahi aa raha. MTD par kisi ne logger port par jumbo frames ke liye MTU badhaya tha."',
    apply: (t) =>
      configure(t, MTD, (c) => {
        c.interfaces['Gi0/3/2'] = { ...(c.interfaces['Gi0/3/2'] ?? {}), l2Mtu: 1600 };
      }),
    check: C.all(C.pwUp(JU, MTD, DL_VC, 'vpws-eth'), C.pingSucceeds('MTD-DL', `${DL_NET}.10`)),
    hints: [
      '"show mpls l2transport vc detail" on JU-LSR or MTD-LSR — compare "MTU: local …, remote …".',
      'On MTD-LSR: interface gi0/3/2 → no mtu (back to 1500), then ping again from MTD-DL.',
    ],
    fix: { cli: { [MTD]: [...CONF, 'interface gi0/3/2', 'no mtu', 'end'] }, pings: [['MTD-DL', `${DL_NET}.10`]] },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'What does the VC (inner) label tell the egress PE?',
      options: ['Which LSP to follow', 'Which attachment circuit / pseudowire the frame belongs to', 'The DSCP', 'The VLAN'],
      correctIndex: 1,
      explanation: 'The transport label gets the frame to the PE; the VC label picks the pseudowire.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Why is there no IP address on the attachment-circuit interface?',
      options: ['Forgotten', 'The PE does not route these frames — it carries them unchanged', 'IP is on the VC label', 'For security only'],
      correctIndex: 1,
      explanation: 'VPWS is a layer-2 service.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Which address is the xconnect peer?',
      options: ['Remote host IP', 'Remote PE loopback (LDP router-ID)', 'Next-hop interface IP', 'Any IP of the remote PE'],
      correctIndex: 1,
      explanation: 'Targeted LDP runs between the router-IDs.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'MTU 1500 on one AC, 1600 on the other. VC state?',
      options: ['UP', 'DOWN (MTU mismatch)', 'UP with fragmentation', 'Admin down'],
      correctIndex: 1,
      explanation: 'LDP signals the MTU; both ends must agree.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the lab, run "show mpls l2transport vc" on MTD-LSR. What is in the "Local circuit" column?',
      options: ['Ethernet', 'Eth VLAN 10', 'VFI', 'SATOP E1'],
      correctIndex: 0,
      explanation: 'A port-mode xconnect carries the whole Ethernet port.',
    },
  ],
  estMinutes: 40,
  fieldNote:
    'Real gear: the pseudowire control plane is computed (no targeted-LDP hellos, no PW status TLVs, no control word negotiation). VC labels come after the LDP labels on each PE. The Data Logger itself is legacy equipment; only its Ethernet port is simulated.\nInterview questions: "VPWS aur L3VPN mein farq?", "VC label kaun deta hai?", "PW down — pehle kya check karoge?"',
  solution: {
    cli: { [JU]: xc('MTD'), [MTD]: xc('JU') },
    pings: [['MTD-DL', `${DL_NET}.10`]],
  },
};

// ---------------------------------------------------------------------------
// LB7.2 VPLS for station CCTV (B7)
// ---------------------------------------------------------------------------

const CCTV_ID = 104;
const SITES = ['JU', 'MTD', 'DNA', 'FL'];
const camPortOf = (code: string) => (code === 'FL' ? 'gi0/1/4' : 'gi0/3/4');
const vfiLines = (code: string, vpnId = CCTV_ID) => [
  ...CONF,
  'l2 vfi CCTV manual',
  `vpn id ${vpnId}`,
  ...SITES.filter((s) => s !== code).map((s) => `neighbor ${lo(s)} encapsulation mpls`),
  'exit',
  `interface ${camPortOf(code)}`,
  'description CCTV camera',
  'xconnect vfi CCTV',
  'no shutdown',
  'end',
];
const cam = (code: string) => `${CCTV_NET}.${21 + ['MTD', 'DNA', 'FL'].indexOf(code)}`;

const b7b: Lab = {
  id: 'LB7.2',
  part: 'B',
  level: 7,
  order: 2,
  lessonId: 'B7',
  title: 'VPLS: one CCTV LAN across JU, MTD, DNA and FL',
  scenario:
    'JU ka NVR teen stations (MTD, DNA, FL) ke cameras record karta hai. Camera vendor ka discovery tool sirf ek LAN mein kaam karta hai. Kaam: VFI CCTV (VPN ID 104) — JU par pehle se bana hai — baaki teen PEs par banao, full mesh pseudowires ke saath, taaki NVR har camera tak aur cameras aapas mein bhi pahunchein.',
  concept:
    'VPLS = MPLS ke upar ek "virtual switch". Har PE par ek VFI (virtual forwarding instance) hota hai: woh MAC learn karta hai — local port par ya kisi pseudowire ke peeche. Unknown/broadcast frames sab ports aur sab pseudowires par flood.\n' +
    'Split horizon: jo frame pseudowire se aaya, woh kabhi doosre pseudowire par nahi bheja jaata (loop se bachne ke liye, STP ki zaroorat nahi). Isliye har PE ka har PE se pseudowire chahiye — full mesh: n×(n−1)/2.\n' +
    'Railway analogy: VPLS = ek bada platform jahan saare stations ke cameras ek hi LAN par; har station seedha har station se juda, beech mein relay nahi.',
  objectives: ['VFI CCTV with VPN ID 104 on every PE', 'Full mesh of pseudowires', 'NVR ↔ cameras and camera ↔ camera'],
  topologyId: 'lab-b7-vpls',
  requiredModules: L2VPN,
  plan: {
    headers: ['PE', 'Loopback', 'CCTV port', 'Device'],
    rows: [
      ['JU-LSR', lo('JU'), 'Gi0/3/4 (ready)', `JU-NVR ${CCTV_NET}.10`],
      ['MTD-LSR', lo('MTD'), 'Gi0/3/4', `MTD-CAM1 ${cam('MTD')}`],
      ['DNA-LSR', lo('DNA'), 'Gi0/3/4', `DNA-CAM1 ${cam('DNA')}`],
      ['FL-LER', lo('FL'), 'Gi0/1/4', `FL-CAM1 ${cam('FL')}`],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: `JU-LSR's three VPLS pseudowires (VPN ID ${CCTV_ID}) to MTD, DNA and FL must be UP.`,
      check: C.all(C.pwUp(JU, MTD, CCTV_ID, 'vpls'), C.pwUp(JU, DNA, CCTV_ID, 'vpls'), C.pwUp(JU, FL, CCTV_ID, 'vpls')),
      points: 25,
    },
    {
      id: 't2',
      text: 'Complete the full mesh: MTD–DNA, MTD–FL and DNA–FL pseudowires UP.',
      check: C.all(C.pwUp(MTD, DNA, CCTV_ID, 'vpls'), C.pwUp(MTD, FL, CCTV_ID, 'vpls'), C.pwUp(DNA, FL, CCTV_ID, 'vpls')),
      points: 20,
    },
    {
      id: 't3',
      text: 'JU-NVR must reach every camera.',
      check: C.all(...['MTD', 'DNA', 'FL'].map((c) => C.pingSucceeds('JU-NVR', cam(c)))),
      points: 20,
    },
    { id: 't4', text: `Camera to camera: MTD-CAM1 must reach FL-CAM1 (${cam('FL')}).`, check: C.pingSucceeds('MTD-CAM1', cam('FL')), points: 15 },
  ],
  hints: [
    [
      `JU is ready ("show vfi CCTV" on JU-LSR). On MTD-LSR: l2 vfi CCTV manual → vpn id ${CCTV_ID} → neighbor ${lo('JU')} encapsulation mpls (and the other PEs).`,
      'Attach the camera port: interface gi0/3/4 (FL: gi0/1/4) → xconnect vfi CCTV → no shutdown.',
    ],
    [
      'Each station PE needs a neighbor line for every other PE, not only JU.',
      '"show vfi" lists each neighbour with its status and the reason when it is down.',
    ],
    ['From JU-NVR: ping each camera. The first ping may lose one packet to ARP flooding.'],
    [
      'If MTD-CAM1 cannot reach FL-CAM1 while the NVR reaches both: split horizon. JU will not relay a frame from one pseudowire to another — MTD needs its own pseudowire to FL.',
    ],
  ],
  breakFix: {
    complaint: 'CCTV control JU: "Phulera ke cameras NVR par blank. FL-LER par kal naya VPLS template lagaya gaya."',
    apply: (t) =>
      configure(t, FL, (c) => {
        if (c.vfis.CCTV) c.vfis.CCTV.vpnId = 105;
      }),
    check: C.all(C.pwUp(JU, FL, CCTV_ID, 'vpls'), C.pingSucceeds('JU-NVR', cam('FL'))),
    hints: [
      '"show vfi CCTV" on JU-LSR: read the reason for the FL neighbour.',
      `On FL-LER: l2 vfi CCTV manual → vpn id ${CCTV_ID}, then ping again from JU-NVR.`,
    ],
    fix: { cli: { [FL]: [...CONF, 'l2 vfi CCTV manual', `vpn id ${CCTV_ID}`, 'end'] }, pings: [['JU-NVR', cam('FL')]] },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Why does VPLS need a full mesh of pseudowires?',
      options: ['Speed', 'Split horizon: a PE never forwards from one pseudowire to another', 'LDP needs it', 'For QoS'],
      correctIndex: 1,
      explanation: 'Without full mesh, sites behind different PEs cannot reach each other.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: "A frame with an unknown destination MAC arrives on a PE's CCTV port. What happens?",
      options: ['Dropped', 'Flooded to the other local ports and all pseudowires of the VFI', 'Sent to JU only', 'Routed'],
      correctIndex: 1,
      explanation: 'Like a switch: flood unknown unicast within the bridge domain.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'How many pseudowires does a 4-PE VPLS full mesh have?',
      options: ['3', '4', '6', '12'],
      correctIndex: 2,
      explanation: '4×3/2 = 6.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'VPLS or L3VPN for CCTV — which statement is right?',
      options: [
        'VPLS: cameras share one LAN (broadcast crosses the core); L3VPN: each station its own subnet, routed',
        'They are the same',
        'L3VPN carries broadcasts',
        'VPLS needs BGP VPNv4',
      ],
      correctIndex: 0,
      explanation: 'Broadcast domains over a WAN are convenient but grow risky; many designs prefer L3VPN for CCTV.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the lab, run "show vfi CCTV" on JU-LSR. How many neighbours are listed?',
      options: ['1', '2', '3', '4'],
      correctIndex: 2,
      explanation: 'MTD, DNA and FL — JU does not list itself.',
    },
  ],
  estMinutes: 55,
  fieldNote:
    'Real gear: the VFI is attached to the port directly here (port-based VPLS); IOS attaches a VFI to an SVI ("interface Vlan104 → xconnect vfi") and IOS-XE uses bridge-domains. MAC aging, MAC limits and BPDU handling are not simulated. H-VPLS (spokes) is not modelled.\nInterview questions: "VPLS split horizon kya hai?", "VPLS vs L3VPN for CCTV?", "Full mesh kitne PWs?"',
  solution: {
    cli: { [MTD]: vfiLines('MTD'), [DNA]: vfiLines('DNA'), [FL]: vfiLines('FL') },
    pings: [
      ['JU-NVR', cam('MTD')],
      ['JU-NVR', cam('DNA')],
      ['JU-NVR', cam('FL')],
      ['MTD-CAM1', cam('FL')],
    ],
  },
};

// ---------------------------------------------------------------------------
// LB8.1 E1 pseudowires: BPAC (SAToP) and section control (CESoPSN) (B8)
// ---------------------------------------------------------------------------

const BPAC_VC = 2101;
const CTRL_VC = 2102;

const b8: Lab = {
  id: 'LB8.1',
  part: 'B',
  level: 8,
  order: 1,
  lessonId: 'B8',
  title: 'E1 over MPLS: BPAC (SAToP) and control circuit (CESoPSN)',
  scenario:
    'MTD–DNA section par SDH hataana hai. Do purane E1 circuits MPLS par shift karne hain: (1) KQW–REN block section ka BPAC — poora E1 (SAToP), aur (2) MTD se JAC tak section control/emergency phones — E1 ke timeslots 1–4 (CESoPSN). KQW aur MTD par ek side pehle se configured hai. Kaam: doosri side configure karo aur dono pseudowires ko ping mpls pseudowire se prove karo.',
  concept:
    'TDM pseudowire = E1 ke bits ko packets mein kaat kar MPLS par bhejna, aur doosri taraf wapas wahi E1 banana.\n' +
    'SAToP (RFC 4553): poora E1 (2.048 Mbit/s, framing samet) bina samjhe — "unframed". BPAC jaise apne framing wale equipment ke liye.\n' +
    'CESoPSN (RFC 5086): sirf chune hue 64 kbit/s timeslots (1–31; TS0 framing hai). Control phones, jahan sirf kuch channels chahiye.\n' +
    'Dono taraf same type aur same timeslots, warna VC DOWN. Clock recovery aur jitter buffer asli duniya mein bahut important hain (simulator mein simplified).\n' +
    'Safety: BPAC safety-critical hai — asli migration disconnection memo / block working procedure ke saath hoti hai.',
  objectives: ['SAToP pseudowire for the BPAC E1', 'CESoPSN pseudowire for timeslots 1–4', 'Prove both with ping mpls pseudowire'],
  topologyId: 'lab-b8-tdm',
  requiredModules: L2VPN,
  plan: {
    headers: ['Circuit', 'A end', 'B end', 'Type / VC'],
    rows: [
      ['BPAC KQW–REN', 'KQW-LER E1 0/2/0 (ready)', 'REN-LER E1 0/2/0', `SAToP, unframed, VC ${BPAC_VC}`],
      ['Section control', 'MTD-LSR E1 0/4/0 (ready)', 'JAC-LER E1 0/2/1', `CESoPSN, timeslots 1-4, VC ${CTRL_VC}`],
    ],
  },
  tasks: [
    { id: 't1', text: `BPAC: SAToP pseudowire KQW-LER ↔ REN-LER (VC ${BPAC_VC}) UP.`, check: C.pwUp(KQW, REN, BPAC_VC, 'satop'), points: 25 },
    {
      id: 't2',
      text: `Control circuit: CESoPSN pseudowire MTD-LSR ↔ JAC-LER (VC ${CTRL_VC}, timeslots 1-4) UP.`,
      check: C.pwUp(MTD, JAC, CTRL_VC, 'cesopsn'),
      points: 25,
    },
    {
      id: 't3',
      text: `Prove both circuits: "ping mpls pseudowire" from REN-LER (to KQW, VC ${BPAC_VC}) and from JAC-LER (to MTD, VC ${CTRL_VC}).`,
      check: C.all(C.pwPingSucceeds(REN, lo('KQW'), BPAC_VC), C.pwPingSucceeds(JAC, lo('MTD'), CTRL_VC)),
      points: 15,
    },
  ],
  hints: [
    [
      'On REN-LER: controller E1 0/2/0 → cem-group 0 unframed → exit → interface CEM0/2/0 → cem 0 → xconnect ' +
        `${lo('KQW')} ${BPAC_VC} encapsulation mpls`,
      '"show mpls l2transport vc" on KQW-LER shows SATOP E1 and the reason while it is DOWN.',
    ],
    [
      'On JAC-LER: controller E1 0/2/1 → cem-group 0 timeslots 1-4 → exit → interface CEM0/2/1 → cem 0 → xconnect ' +
        `${lo('MTD')} ${CTRL_VC} encapsulation mpls`,
      'The timeslot list must match MTD exactly ("show controllers E1 0/4/0" on MTD-LSR).',
    ],
    [`On REN-LER: ping mpls pseudowire ${lo('KQW')} ${BPAC_VC}`, `On JAC-LER: ping mpls pseudowire ${lo('MTD')} ${CTRL_VC}`],
  ],
  breakFix: {
    complaint: 'Section controller MTD: "JAC station ka control phone dead. Kal JAC par E1 timeslot re-plan hua tha."',
    apply: (t) =>
      configure(t, JAC, (c) => {
        const g = c.e1Controllers['0/2/1']?.cemGroups['0'];
        if (g) g.timeslots = [1, 2, 3];
      }),
    check: C.pwUp(MTD, JAC, CTRL_VC, 'cesopsn'),
    hints: ['"show mpls l2transport vc" on MTD-LSR: read the RailMPLS Lab note.', 'On JAC-LER: controller E1 0/2/1 → cem-group 0 timeslots 1-4'],
    fix: { cli: { [JAC]: [...CONF, 'controller E1 0/2/1', 'cem-group 0 timeslots 1-4', 'end'] } },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Which pseudowire type carries a whole E1 including its framing?',
      options: ['CESoPSN', 'SAToP', 'VPLS', 'Ethernet'],
      correctIndex: 1,
      explanation: 'SAToP = Structure-Agnostic TDM over Packet.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Bandwidth of a CESoPSN circuit with timeslots 1-4 (payload only)?',
      options: ['64 kbit/s', '256 kbit/s', '2.048 Mbit/s', '1.984 Mbit/s'],
      correctIndex: 1,
      explanation: '4 × 64 kbit/s. Packet headers add overhead on top.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Why can timeslot 0 not be in a cem-group timeslot list?',
      options: ['It is reserved for signalling only', 'TS0 carries E1 frame alignment', 'It is always empty', 'It is the clock'],
      correctIndex: 1,
      explanation: 'TS0 = frame alignment / CRC-4; TS16 often carries CAS signalling.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'What matters most for a TDM pseudowire in a real network (beyond "VC UP")?',
      options: ['Colour of the cable', 'Clock recovery, jitter buffer and strict-priority QoS', 'BGP', 'VLAN ID'],
      correctIndex: 1,
      explanation: 'TDM equipment expects a steady bit clock; packet delay variation must be absorbed.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the lab, run "show mpls l2transport vc" on KQW-LER. What is in the "Local circuit" column?',
      options: ['Ethernet', 'CESoPSN Basic', 'SATOP E1', 'VFI'],
      correctIndex: 2,
      explanation: 'An unframed cem-group is carried as SAToP.',
    },
  ],
  estMinutes: 45,
  fieldNote:
    'Real gear: E1 controllers are logical in networking-only mode — no E1 cable, framer, alarms (LOS/AIS) or clock is simulated, and no TDM bits are carried; the VC state is computed from both ends\' configuration. Real migrations need clock recovery (adaptive/differential), jitter buffers, strict-priority QoS (P7) and the railway safety procedure for block circuits.\nInterview questions: "SAToP vs CESoPSN?", "TS0 aur TS16 kya hote hain?", "TDM PW ke liye QoS kyon zaroori?"',
  solution: {
    cli: {
      [REN]: [
        ...CONF,
        'controller E1 0/2/0',
        'cem-group 0 unframed',
        'exit',
        'interface CEM0/2/0',
        'cem 0',
        `xconnect ${lo('KQW')} ${BPAC_VC} encapsulation mpls`,
        'end',
        `ping mpls pseudowire ${lo('KQW')} ${BPAC_VC}`,
      ],
      [JAC]: [
        ...CONF,
        'controller E1 0/2/1',
        'cem-group 0 timeslots 1-4',
        'exit',
        'interface CEM0/2/1',
        'cem 0',
        `xconnect ${lo('MTD')} ${CTRL_VC} encapsulation mpls`,
        'end',
        `ping mpls pseudowire ${lo('MTD')} ${CTRL_VC}`,
      ],
    },
  },
};

export const L2VPN_LABS: Lab[] = [b7, b7b, b8];
