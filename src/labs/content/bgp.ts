import { configure } from '../../engine/testing/fixtures';
import { ASN, lo, rdOf, rtOf, vrfNet } from '../../topologies/bgpLabs';
import { hostname } from '../../topologies/jodhpur/plan';
import * as C from '../framework/checks';
import type { Lab } from '../framework/types';

/**
 * BGP / MP-BGP / L3VPN labs for lessons B5–B6 (build phase P5) on pieces of
 * the generated Jodhpur core. Checks read engine state only. Teaching design
 * on the track map — not the real RailTel / NWR network.
 */

const BGP: Lab['requiredModules'] = ['topology', 'physical', 'sim', 'ip', 'ospf', 'mpls', 'bgp'];
const CONF = ['enable', 'configure terminal'];
const JU = hostname('JU');
const MTD = hostname('MTD');
const DNA = hostname('DNA');
const FL = hostname('FL');

// ---------------------------------------------------------------------------
// LB5.1 iBGP route reflector + eBGP hand-off (B5)
// ---------------------------------------------------------------------------

const clientLines = (rrCode: string) => [
  `router bgp ${ASN}`,
  `neighbor ${lo(rrCode)} remote-as ${ASN}`,
  `neighbor ${lo(rrCode)} update-source loopback0`,
];

const b5: Lab = {
  id: 'LB5.1',
  part: 'B',
  level: 5,
  order: 1,
  lessonId: 'B5',
  title: 'iBGP with a route reflector at JU, eBGP hand-off at Phulera',
  scenario:
    'Jaipur division (AS 65002) Phulera (FL) par apna LAN 172.16.10.0/24 BGP se dena chahta hai. Jodhpur division AS 65000 hai. Har PE ko har PE se iBGP full-mesh karna 150+ POPs par namumkin hai, isliye JU route reflector banega. Kaam: FL par eBGP, JU par RR, MTD/DNA/FL clients — aur MTD se Jaipur LAN tak ping.',
  concept:
    'BGP do tarah ka: eBGP (alag AS ke beech, seedha juda neighbour) aur iBGP (ek hi AS ke andar, loopback se loopback, "update-source loopback0").\n' +
    'iBGP rule: iBGP se seekha route doosre iBGP neighbour ko aage nahi diya jaata — isliye full-mesh chahiye (n×(n−1)/2 sessions: 150 POPs = 11 175!). Route reflector (RR) yeh rule todta hai: client ka route sab ko "reflect".\n' +
    'Next hop: eBGP se aaya route iBGP mein next hop wahi rakhta hai (Jaipur ka address) — jo IGP mein nahi hai. Isliye border router par "next-hop-self".\n' +
    'Railway analogy: RR = divisional control office; har station har station ko phone nahi karta, control sab ko message relay karta hai.',
  objectives: ['eBGP FL ↔ Jaipur', 'RR at JU with MTD, DNA, FL as clients', 'Jaipur LAN usable from MTD (next-hop-self)'],
  topologyId: 'lab-b5-core',
  requiredModules: BGP,
  plan: {
    headers: ['Router', 'AS', 'Role', 'BGP source'],
    rows: [
      ['JU-LSR', String(ASN), 'Route reflector', `Loopback0 ${lo('JU')}`],
      ['MTD-LSR', String(ASN), 'RR client', `Loopback0 ${lo('MTD')}`],
      ['DNA-LSR', String(ASN), 'RR client', `Loopback0 ${lo('DNA')}`],
      ['FL-LER', String(ASN), 'RR client + eBGP border', `Loopback0 ${lo('FL')}; eBGP from 192.0.2.1`],
      ['JP-R1', '65002', 'Jaipur division (ready)', '192.0.2.2, announces 172.16.10.0/24'],
    ],
  },
  tasks: [
    { id: 't1', text: `Bring up eBGP between FL-LER (AS ${ASN}) and JP-R1 (AS 65002).`, check: C.bgpSessionUp(FL, 'JP-R1'), points: 15 },
    {
      id: 't2',
      text: 'Make JU-LSR a route reflector with MTD-LSR, DNA-LSR and FL-LER as clients (iBGP between loopbacks).',
      check: C.all(C.bgpSessionUp(JU, MTD), C.bgpSessionUp(JU, DNA), C.bgpSessionUp(JU, FL), C.bgpSessionUp(MTD, JU)),
      points: 25,
    },
    {
      id: 't3',
      text: 'MTD-LSR must install the Jaipur LAN 172.16.10.0/24 as a BGP route.',
      check: C.routeExists(MTD, '172.16.10.0/24', 'bgp'),
      points: 15,
    },
    { id: 't4', text: 'Ping 172.16.10.1 from MTD-LSR.', check: C.pingSucceeds(MTD, '172.16.10.1'), points: 10 },
  ],
  hints: [
    [
      `On FL-LER: router bgp ${ASN} → neighbor 192.0.2.2 remote-as 65002`,
      '"show ip bgp summary" on FL-LER: the State/PfxRcd column shows a number when the session is up.',
    ],
    [
      `On JU-LSR: router bgp ${ASN} → for each client: neighbor <loopback> remote-as ${ASN} / update-source loopback0 / route-reflector-client.`,
      `On MTD, DNA and FL: router bgp ${ASN} → neighbor ${lo('JU')} remote-as ${ASN} → neighbor ${lo('JU')} update-source loopback0. Both ends must use loopbacks.`,
    ],
    [
      '"show ip bgp" on MTD-LSR: is 172.16.10.0/24 there but without ">"? Its next hop 192.0.2.2 is not in the IGP.',
      `On FL-LER: neighbor ${lo('JU')} next-hop-self`,
    ],
    ['On MTD-LSR: ping 172.16.10.1 (the reply comes back over OSPF; JP-R1 has a route to 10.0.0.0/8).'],
  ],
  breakFix: {
    complaint:
      'NOC JU: "Jaipur division ka LAN MTD aur DNA se nahi dikh raha. show ip bgp mein route hai par best (>) nahi. Kal FL par BGP config \'tidy\' kiya gaya tha."',
    apply: (t) =>
      configure(t, FL, (c) => {
        const n = c.bgp?.neighbors[lo('JU')];
        if (n) delete n.nextHopSelf;
      }),
    check: C.routeExists(MTD, '172.16.10.0/24', 'bgp'),
    hints: [
      '"show ip bgp" on MTD-LSR: which next hop does 172.16.10.0/24 have? Is it reachable ("show ip route <next hop>")?',
      `FL-LER must rewrite the next hop towards the RR: neighbor ${lo('JU')} next-hop-self`,
    ],
    fix: { cli: { [FL]: [...CONF, `router bgp ${ASN}`, `neighbor ${lo('JU')} next-hop-self`, 'end'] } },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'How many iBGP sessions does a full mesh of 150 PEs need?',
      options: ['150', '300', '11 175', '22 500'],
      correctIndex: 2,
      explanation: 'n×(n−1)/2 = 150×149/2 = 11 175 — why route reflectors are used.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Why "update-source loopback0" on iBGP sessions?',
      options: ['Faster', 'The session survives a link failure as long as any path to the loopback exists', 'Needed for eBGP', 'For MPLS labels'],
      correctIndex: 1,
      explanation: 'Loopbacks stay up; the IGP finds another path.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Administrative distance of iBGP routes (Cisco style)?',
      options: ['20', '110', '115', '200'],
      correctIndex: 3,
      explanation: 'eBGP 20, iBGP 200.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'What stops a route from looping between two route reflectors?',
      options: ['TTL', 'ORIGINATOR_ID and CLUSTER_LIST', 'MED', 'Weight'],
      correctIndex: 1,
      explanation: 'An RR drops paths whose cluster list already contains its own cluster ID.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the lab, run "show ip bgp summary" on JU-LSR. How many neighbours are listed?',
      options: ['1', '2', '3', '4'],
      correctIndex: 2,
      explanation: 'MTD-LSR, DNA-LSR and FL-LER — JU has no session to JP-R1.',
    },
  ],
  estMinutes: 50,
  fieldNote:
    'Real gear: BGP here is computed (no OPEN/UPDATE/KEEPALIVE, no timers, no MRAI). The division design uses an RR pair (JU + MTD); this lab uses one RR to keep it small. Inter-division hand-off is shown as plain eBGP; Inter-AS Option A/B comes in B13.\nInterview questions: "iBGP split horizon kya hai?", "Route reflector kyon?", "next-hop-self kab chahiye?"',
  solution: {
    cli: {
      [FL]: [...CONF, ...clientLines('JU'), 'neighbor 192.0.2.2 remote-as 65002', `neighbor ${lo('JU')} next-hop-self`, 'end'],
      [JU]: [
        ...CONF,
        `router bgp ${ASN}`,
        ...['MTD', 'DNA', 'FL'].flatMap((c) => [
          `neighbor ${lo(c)} remote-as ${ASN}`,
          `neighbor ${lo(c)} update-source loopback0`,
          `neighbor ${lo(c)} route-reflector-client`,
        ]),
        'end',
      ],
      [MTD]: [...CONF, ...clientLines('JU'), 'end'],
      [DNA]: [...CONF, ...clientLines('JU'), 'end'],
    },
    pings: [[MTD, '172.16.10.1']],
  },
};

// ---------------------------------------------------------------------------
// LB6.1 UTS and Railnet VRFs (B6)
// ---------------------------------------------------------------------------

const peLines = (code: string, opts: { utsImport?: string } = {}) => [
  ...CONF,
  `vrf definition UTS`,
  `rd ${rdOf(code, 'UTS')}`,
  'address-family ipv4',
  `route-target export ${rtOf('UTS')}`,
  `route-target import ${opts.utsImport ?? rtOf('UTS')}`,
  'exit-address-family',
  'exit',
  `vrf definition RAILNET`,
  `rd ${rdOf(code, 'RAILNET')}`,
  'address-family ipv4',
  `route-target both ${rtOf('RAILNET')}`,
  'exit-address-family',
  'exit',
  'interface gi0/3/0',
  'vrf forwarding UTS',
  `ip address ${vrfNet(code, 'UTS')}.1 255.255.255.0`,
  'interface gi0/3/1',
  'vrf forwarding RAILNET',
  `ip address ${vrfNet(code, 'RAILNET')}.1 255.255.255.0`,
  'exit',
  `router bgp ${ASN}`,
  'no bgp default ipv4-unicast',
  `neighbor ${lo('JU')} remote-as ${ASN}`,
  `neighbor ${lo('JU')} update-source loopback0`,
  'address-family vpnv4',
  `neighbor ${lo('JU')} activate`,
  `neighbor ${lo('JU')} send-community extended`,
  'exit-address-family',
  'address-family ipv4 vrf UTS',
  'redistribute connected',
  'exit-address-family',
  'address-family ipv4 vrf RAILNET',
  'redistribute connected',
  'end',
];

const ip = (code: string, vrf: string, last: number) => `${vrfNet(code, vrf)}.${last}`;

const b6: Lab = {
  id: 'LB6.1',
  part: 'B',
  level: 6,
  order: 1,
  lessonId: 'B6',
  title: 'L3VPN: UTS and Railnet VRFs at MTD and DNA',
  scenario:
    'Ek hi MPLS core par UTS ticketing aur Railnet (office/internet) chalana hai — par dono kabhi milne nahi chahiye. JU par UTS server aur Railnet internet ka firewall pehle se hai, aur JU VPNv4 route reflector hai. Merta Road (MTD) aur Degana (DNA) ke PE routers par VRFs banao, counters ko jodo, aur sabit karo ki Railnet se UTS tak koi raasta nahi.',
  concept:
    'VRF = router ke andar alag routing table. Interface "vrf forwarding UTS" ke baad sirf UTS table mein.\n' +
    'RD (route distinguisher) prefix ko unique banata hai (do VRF same 10.x use kar sakte); RT (route target) batata hai route kis VRF mein import ho — "export 65000:100" = yeh route UTS ka, "import 65000:100" = mujhe UTS ke routes chahiye.\n' +
    'MP-BGP VPNv4 PE ke VRF routes RR ke through doosre PEs tak le jaata hai, saath mein VPN label. Packet core mein do label lekar chalta hai: upar LDP transport label (PE tak), neeche VPN label (kaunsa VRF). Beech ke P router (PPR) ko BGP chahiye hi nahi.\n' +
    'Railway analogy: ek hi track par alag-alag rakes (VRF); RT = rake ka destination board, RD = coach number jo duplicate na ho.',
  objectives: [
    'UTS and RAILNET VRFs (RD/RT per plan) on MTD and DNA',
    'VPNv4 to the RR',
    'UTS counters reach the UTS server',
    'Railnet isolated from UTS, with internet via JU',
  ],
  topologyId: 'lab-b6-vpn',
  requiredModules: BGP,
  plan: {
    headers: ['VRF', 'RT', 'RD on MTD / DNA', 'MTD block', 'DNA block'],
    rows: [
      [
        'UTS',
        rtOf('UTS'),
        `${rdOf('MTD', 'UTS')} / ${rdOf('DNA', 'UTS')}`,
        `${vrfNet('MTD', 'UTS')}.0/24 (Gi0/3/0)`,
        `${vrfNet('DNA', 'UTS')}.0/24 (Gi0/3/0)`,
      ],
      [
        'RAILNET',
        rtOf('RAILNET'),
        `${rdOf('MTD', 'RAILNET')} / ${rdOf('DNA', 'RAILNET')}`,
        `${vrfNet('MTD', 'RAILNET')}.0/24 (Gi0/3/1)`,
        `${vrfNet('DNA', 'RAILNET')}.0/24 (Gi0/3/1)`,
      ],
      ['RR', '—', `JU-LSR ${lo('JU')}`, `UTS server ${ip('JU', 'UTS', 10)}`, `Internet test 198.51.100.10`],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Define VRFs UTS and RAILNET (RD and RT per the plan) on MTD-LSR and DNA-LSR.',
      check: C.all(C.vrfDefined(MTD, 'UTS'), C.vrfDefined(MTD, 'RAILNET'), C.vrfDefined(DNA, 'UTS'), C.vrfDefined(DNA, 'RAILNET')),
      points: 20,
    },
    {
      id: 't2',
      text: 'Put the counter ports in their VRFs and peer MTD-LSR and DNA-LSR with the RR (JU-LSR) for VPNv4.',
      check: C.all(
        C.bgpSessionUp(MTD, JU, { af: 'vpnv4' }),
        C.bgpSessionUp(DNA, JU, { af: 'vpnv4' }),
        C.vrfHasRoute(MTD, 'UTS', `${vrfNet('MTD', 'UTS')}.0/24`),
      ),
      points: 20,
    },
    {
      id: 't3',
      text: `MTD-UTS1 must reach the UTS server (${ip('JU', 'UTS', 10)}), and DNA-UTS1 must reach MTD-UTS1.`,
      check: C.all(C.pingSucceeds('MTD-UTS1', ip('JU', 'UTS', 10)), C.pingSucceeds('DNA-UTS1', ip('MTD', 'UTS', 11))),
      points: 20,
    },
    {
      id: 't4',
      text: 'Prove isolation: MTD-RAILNET-PC cannot reach the UTS server, and the UTS and RAILNET tables on MTD-LSR share no routes.',
      check: C.all(C.pingFails('MTD-RAILNET-PC', ip('JU', 'UTS', 10)), C.vrfIsolated(MTD, 'UTS', 'RAILNET')),
      points: 10,
    },
    {
      id: 't5',
      text: 'MTD-RAILNET-PC reaches the internet test host 198.51.100.10 through the JU firewall.',
      check: C.pingSucceeds('MTD-RAILNET-PC', '198.51.100.10'),
      points: 10,
    },
  ],
  hints: [
    [
      `vrf definition UTS → rd ${rdOf('MTD', 'UTS')} → address-family ipv4 → route-target both ${rtOf('UTS')} (same for RAILNET with ${rtOf('RAILNET')}).`,
      'RD must be unique per PE (the plan uses <loopback>:<100+VRF>); the RT is the same everywhere for one VRF. Check with "show vrf detail UTS".',
    ],
    [
      'interface gi0/3/0 → vrf forwarding UTS → ip address … (the address is removed when the VRF is applied — type it again).',
      `router bgp ${ASN} → neighbor ${lo('JU')} remote-as ${ASN} / update-source loopback0 → address-family vpnv4 → neighbor ${lo('JU')} activate. Then address-family ipv4 vrf UTS → redistribute connected (same for RAILNET).`,
    ],
    [
      '"show ip route vrf UTS" on MTD-LSR: you should see JU’s UTS subnet as a B route via the JU loopback.',
      'Then ping from MTD-UTS1 and from DNA-UTS1. "show bgp vpnv4 unicast all" shows the RDs.',
    ],
    [
      `From MTD-RAILNET-PC: ping ${ip('JU', 'UTS', 10)} — it must fail.`,
      '"show ip route vrf RAILNET" has no UTS prefixes: different RTs, so nothing is imported.',
    ],
    [
      'JU already exports a default route in RAILNET (towards the firewall). Is 0.0.0.0/0 in "show ip route vrf RAILNET" on MTD?',
      'From MTD-RAILNET-PC: ping 198.51.100.10',
    ],
  ],
  breakFix: {
    complaint:
      'DNA booking office: "Degana ke UTS counter se Merta Road ke counter tak ticket sync nahi ho raha. JU server bhi nahi milta. Kal DNA router par VRF config dobara likha gaya tha."',
    apply: (t) =>
      configure(t, DNA, (c) => {
        if (c.vrfs.UTS) c.vrfs.UTS.importRts = [`${ASN}:10`];
      }),
    check: C.all(C.pingSucceeds('DNA-UTS1', ip('MTD', 'UTS', 11)), C.vrfHasRoute(DNA, 'UTS', `${vrfNet('MTD', 'UTS')}.0/24`)),
    hints: [
      '"show ip route vrf UTS" on DNA-LSR: only connected routes? Then nothing is imported.',
      `"show vrf detail UTS" — compare the import route-target with the plan (${rtOf('UTS')}).`,
    ],
    fix: {
      cli: {
        [DNA]: [
          ...CONF,
          'vrf definition UTS',
          'address-family ipv4',
          `no route-target import ${ASN}:10`,
          `route-target import ${rtOf('UTS')}`,
          'end',
        ],
      },
      pings: [['DNA-UTS1', ip('MTD', 'UTS', 11)]],
    },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Which attribute decides which VRF imports a VPNv4 route?',
      options: ['RD', 'Route target', 'Next hop', 'MED'],
      correctIndex: 1,
      explanation: 'RD only makes the prefix unique; RTs control import/export.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'How many labels does a VPN packet carry between MTD and PPR?',
      options: ['0', '1', '2', '3'],
      correctIndex: 2,
      explanation: 'Transport label (LDP, towards the PE) on top, VPN label (which VRF) at the bottom.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Does the P router PPR need BGP for the VPN to work?',
      options: ['Yes, VPNv4', 'Yes, IPv4', 'No — it only switches the transport label (BGP-free core)', 'Only as RR'],
      correctIndex: 2,
      explanation: 'Only PEs and the RR run MP-BGP.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'You type "vrf forwarding UTS" on an interface with an IP address. What happens?',
      options: ['Nothing', 'The IP address is removed; configure it again', 'The router reloads', 'The VRF is deleted'],
      correctIndex: 1,
      explanation: 'IOS removes the address when the interface changes routing table.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the lab, run "show ip route vrf RAILNET" on MTD-LSR. What is the code of the 0.0.0.0/0 route?',
      options: ['S*', 'B*', 'O*E2', 'C'],
      correctIndex: 1,
      explanation: 'The default route is a VPNv4 route from JU (BGP), marked as candidate default.',
    },
  ],
  estMinutes: 70,
  fieldNote:
    'Real gear: VPN labels here are per-prefix from 1000 upwards; real PEs use per-prefix or per-VRF labels from the shared label space. The Railnet firewall is a simple NAT router (stateless ACLs); real breakouts use stateful firewalls and proxies at the divisional HQ.\nInterview questions: "RD vs RT?", "VPN packet mein kitne labels?", "BGP-free core kya hai?"',
  solution: {
    cli: { [MTD]: peLines('MTD'), [DNA]: peLines('DNA') },
    pings: [
      ['MTD-UTS1', ip('JU', 'UTS', 10)],
      ['DNA-UTS1', ip('MTD', 'UTS', 11)],
      ['MTD-RAILNET-PC', ip('JU', 'UTS', 10)],
      ['MTD-RAILNET-PC', '198.51.100.10'],
    ],
  },
};

// ---------------------------------------------------------------------------
// LB6.2 PE–CE eBGP + shared NMS (B6)
// ---------------------------------------------------------------------------

const CE_LAN = `${vrfNet('MTD', 'SCADA')}.128/25`;
const CE_LAN_IP = `${vrfNet('MTD', 'SCADA')}.129`;
const CE_ADDR = `${vrfNet('MTD', 'SCADA')}.2`;

const b6b: Lab = {
  id: 'LB6.2',
  part: 'B',
  level: 6,
  order: 2,
  lessonId: 'B6',
  title: 'PE–CE eBGP for SCADA and a shared NMS service',
  scenario:
    'Merta Road traction substation ka SCADA site apna CE router (AS 65201) chalata hai aur apna RTU LAN BGP se deta hai. JU par SCADA server aur divisional NMS hain. Kaam: MTD PE par CE ke saath eBGP, SCADA server se RTU LAN tak raasta, aur NMS ko SCADA site dikhna chahiye — par JU ka SCADA VRF aur NMS VRF aapas mein na milein.',
  concept:
    'PE–CE routing: CE router customer jaisa hai — woh MPLS/VRF nahi jaanta, bas PE ke saath eBGP (ya static/OSPF). PE par yeh session VRF ke andar: "address-family ipv4 vrf SCADA → neighbor <CE> remote-as 65201".\n' +
    'Shared services (route leaking): NMS ko har VRF dikhna chahiye. Tareeka: NMS VRF SCADA ka RT import kare, aur SCADA VRF NMS ka RT import kare. Ek-tarfa sirf utna hi khulta hai jitna RT kehte hain.\n' +
    'Railway analogy: divisional control (NMS) har section ka status dekhta hai, par sections ek-doosre ke circuits mein nahi ghuste.',
  objectives: ['PE–CE eBGP in VRF SCADA', 'SCADA server ↔ RTU LAN', 'NMS sees the SCADA site via RT import'],
  topologyId: 'lab-b6-scada',
  requiredModules: BGP,
  plan: {
    headers: ['Item', 'Value'],
    rows: [
      ['MTD-LSR VRF SCADA', `Gi0/3/0 ${vrfNet('MTD', 'SCADA')}.1/30, RD ${rdOf('MTD', 'SCADA')}, RT ${rtOf('SCADA')}`],
      ['MTD-SCADA-CE', `AS 65201, ${CE_ADDR}, RTU LAN ${CE_LAN}`],
      ['JU-SCADA-SRV', `${ip('JU', 'SCADA', 10)} (VRF SCADA)`],
      ['JU-NMS', `${ip('JU', 'NMS-MGMT', 100)} (VRF NMS-MGMT, RT ${rtOf('NMS-MGMT')})`],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Bring up eBGP between MTD-LSR (VRF SCADA) and MTD-SCADA-CE.',
      check: C.bgpSessionUp(MTD, 'MTD-SCADA-CE', { vrf: 'SCADA' }),
      points: 20,
    },
    {
      id: 't2',
      text: `JU-SCADA-SRV must reach the RTU LAN (ping ${CE_LAN_IP}).`,
      check: C.all(C.vrfHasRoute(JU, 'SCADA', CE_LAN), C.pingSucceeds('JU-SCADA-SRV', CE_LAN_IP)),
      points: 20,
    },
    {
      id: 't3',
      text: `Shared service: JU-NMS must reach the RTU LAN (${CE_LAN_IP}) by route-target import on both sides.`,
      check: C.all(C.vrfHasRoute(JU, 'NMS-MGMT', CE_LAN), C.pingSucceeds('JU-NMS', CE_LAN_IP)),
      points: 20,
    },
    {
      id: 't4',
      text: 'Leak only the remote SCADA site into NMS-MGMT: JU’s own SCADA and NMS-MGMT VRFs must stay isolated from each other.',
      check: C.all(C.vrfHasRoute(JU, 'NMS-MGMT', CE_LAN), C.vrfIsolated(JU, 'SCADA', 'NMS-MGMT')),
      points: 10,
    },
  ],
  hints: [
    [
      `On MTD-LSR: router bgp ${ASN} → address-family ipv4 vrf SCADA → neighbor ${CE_ADDR} remote-as 65201`,
      '"show bgp vpnv4 unicast all summary" lists the VRF neighbour too.',
    ],
    [
      'JU already exports SCADA. Does MTD send the CE’s route on? "show bgp vpnv4 unicast all" on JU-LSR should show the RTU LAN under MTD’s RD.',
      `From JU-SCADA-SRV: ping ${CE_LAN_IP}`,
    ],
    [
      `On JU-LSR: vrf definition NMS-MGMT → address-family ipv4 → route-target import ${rtOf('SCADA')}.`,
      `On MTD-LSR: vrf definition SCADA → address-family ipv4 → route-target import ${rtOf('NMS-MGMT')} (so the RTU LAN can answer the NMS).`,
    ],
    ['Did you add the SCADA RT to JU’s SCADA VRF import, or NMS’s RT to JU’s SCADA VRF? Only the remote SCADA site should import NMS.'],
  ],
  breakFix: {
    complaint:
      'SCADA control JU: "Merta Road substation ka RTU data band. MTD par CE router ka BGP neighbour Idle dikha raha hai. Kal PE par CE ka AS number \'update\' kiya gaya."',
    apply: (t) =>
      configure(t, MTD, (c) => {
        const n = c.bgp?.vrfs.SCADA?.neighbors[CE_ADDR];
        if (n) n.remoteAs = 65200;
      }),
    check: C.all(C.bgpSessionUp(MTD, 'MTD-SCADA-CE', { vrf: 'SCADA' }), C.vrfHasRoute(JU, 'SCADA', CE_LAN)),
    hints: [
      '"show bgp vpnv4 unicast all summary" on MTD-LSR — read the RailMPLS Lab note under the table.',
      `address-family ipv4 vrf SCADA → neighbor ${CE_ADDR} remote-as 65201`,
    ],
    fix: { cli: { [MTD]: [...CONF, `router bgp ${ASN}`, 'address-family ipv4 vrf SCADA', `neighbor ${CE_ADDR} remote-as 65201`, 'end'] } },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Does the CE router need MPLS or VRF configuration?',
      options: ['Yes, both', 'Only MPLS', 'No — it runs plain eBGP (or static) with the PE', 'Only VRF'],
      correctIndex: 2,
      explanation: 'The VPN is the provider’s job; the CE sees an ordinary router.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'For the NMS to reach the SCADA site, which imports are needed?',
      options: ['Only NMS imports SCADA’s RT', 'Only SCADA imports NMS’s RT', 'Both directions — the reply needs a route back', 'None'],
      correctIndex: 2,
      explanation: 'Traffic must be routable both ways.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Where is the PE–CE eBGP neighbour configured on the PE?',
      options: ['Under router bgp, global neighbors', 'Under address-family ipv4 vrf SCADA', 'Under the interface', 'In vrf definition'],
      correctIndex: 1,
      explanation: 'VRF-aware BGP: the session lives in the VRF.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'Why give every VRF its own RD on each PE?',
      options: ['Not needed', 'So the RR can keep the same prefix from different PEs/VRFs apart', 'For QoS', 'For LDP'],
      correctIndex: 1,
      explanation: 'RD + prefix = unique VPNv4 route.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: `After the lab, run "show ip route vrf NMS-MGMT" on JU-LSR. Which route to ${CE_LAN} is shown?`,
      options: [`C ${CE_LAN}`, `B ${CE_LAN} [200/0] via ${lo('MTD')}`, `S ${CE_LAN}`, 'No route'],
      correctIndex: 1,
      explanation: 'Imported by RT from MTD’s SCADA VRF; next hop is MTD’s loopback.',
    },
  ],
  estMinutes: 50,
  fieldNote:
    'Real gear: PE–CE OSPF and route leaking between two VRFs on the same PE (local import) are not simulated yet; shared services here work between PEs. Real designs often use a dedicated "shared services" VRF with export maps.\nInterview questions: "PE–CE routing options?", "Route leaking kaise?", "CE ko MPLS pata hota hai?"',
  solution: {
    cli: {
      [MTD]: [
        ...CONF,
        'vrf definition SCADA',
        'address-family ipv4',
        `route-target import ${rtOf('NMS-MGMT')}`,
        'exit-address-family',
        'exit',
        `router bgp ${ASN}`,
        'address-family ipv4 vrf SCADA',
        `neighbor ${CE_ADDR} remote-as 65201`,
        'end',
      ],
      [JU]: [...CONF, 'vrf definition NMS-MGMT', 'address-family ipv4', `route-target import ${rtOf('SCADA')}`, 'end'],
    },
    pings: [
      ['JU-SCADA-SRV', CE_LAN_IP],
      ['JU-NMS', CE_LAN_IP],
    ],
  },
};

export const BGP_LABS: Lab[] = [b5, b6, b6b];
