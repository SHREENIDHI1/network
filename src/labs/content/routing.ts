import { configure, setIf } from '../../engine/testing/fixtures';
import * as C from '../framework/checks';
import type { Lab } from '../framework/types';

/**
 * Routing, services, security, redundancy and QoS labs for lessons A9–A14
 * (build phase P3). Every check reads only engine state from the snapshot
 * (or the device configuration). Detail messages say what is missing, never
 * the answer; hints teach step by step.
 */

const IP: Lab['requiredModules'] = ['topology', 'physical', 'sim', 'ethernet', 'ip'];
const OSPF: Lab['requiredModules'] = [...IP, 'ospf'];
const SERVICES: Lab['requiredModules'] = [...IP, 'services'];

const CONF = ['enable', 'configure terminal'];

// ---------------------------------------------------------------------------
// L9.1 Router-on-a-stick + default route (A9)
// ---------------------------------------------------------------------------

const l9: Lab = {
  id: 'L9.1',
  level: 9,
  order: 1,
  lessonId: 'A9',
  title: 'Router-on-a-stick and a default route at MTD',
  scenario:
    'MTD par switch mein VLAN 10 (UTS) aur VLAN 20 (PRS) ban chuke hain, trunk bhi taiyaar hai. Par router abhi khaali hai — UTS counter PRS counter ko ping nahi kar pa raha, aur JU ka server bhi nahi milta. ESM ko bataya gaya: "ek hi cable par dono VLANs ka gateway banao, aur JU ki taraf default route do."',
  concept:
    'Har VLAN alag subnet hai, aur subnets ke beech router chahiye. Router-on-a-stick: router ki ek physical port (trunk) par har VLAN ka ek sub-interface (Gi0/0.10, Gi0/0.20), har sub-interface ka apna IP = us VLAN ka gateway.\n' +
    '"encapsulation dot1Q 10" batata hai ki yeh sub-interface VLAN 10 ke tagged frames lega.\n' +
    'Default route (0.0.0.0/0): "jo network mujhe nahi pata, use is next hop ko bhej do" — chhote station router ke liye JU ki taraf ek hi raasta kaafi hai.\n' +
    'Railway analogy: ek hi platform (trunk) par alag-alag trains (VLANs) aati hain; har train ka apna coach number (tag) hai, aur station master (router) ek train se doosri mein passengers badalwata hai.',
  objectives: [
    'Create one sub-interface per VLAN as gateway',
    'Address the uplink to JU',
    'Add a default route',
    'Prove inter-VLAN and MTD→JU reachability',
  ],
  topologyId: 'lab-mtd-roas',
  requiredModules: IP,
  plan: {
    headers: ['Interface', 'VLAN', 'Address'],
    rows: [
      ['MTD-R1 Gi0/0.10', '10 (UTS)', '10.52.10.1/24'],
      ['MTD-R1 Gi0/0.20', '20 (PRS)', '10.52.20.1/24'],
      ['MTD-R1 Gi0/1', 'uplink', '10.255.0.2/30 (JU-R1 = .1)'],
      ['Default route', '—', '0.0.0.0/0 → 10.255.0.1'],
      ['Test', '—', 'MTD-UTS1 → 10.52.20.11 and → JU-SRV 10.1.1.10'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Create sub-interfaces Gi0/0.10 and Gi0/0.20 on MTD-R1 as the VLAN 10 and VLAN 20 gateways.',
      check: C.all(C.ipInSubnet('MTD-R1', 'Gi0/0.10', '10.52.10.0/24'), C.ipInSubnet('MTD-R1', 'Gi0/0.20', '10.52.20.0/24')),
      points: 20,
    },
    {
      id: 't2',
      text: 'Address the uplink Gi0/1 and add a default route towards JU-R1.',
      check: C.all(C.ipInSubnet('MTD-R1', 'Gi0/1', '10.255.0.0/30'), C.routeExists('MTD-R1', '0.0.0.0/0', 'static')),
      points: 15,
    },
    { id: 't3', text: 'Ping MTD-PRS1 (10.52.20.11) from MTD-UTS1.', check: C.pingSucceeds('MTD-UTS1', '10.52.20.11'), points: 15 },
    { id: 't4', text: 'Ping JU-SRV (10.1.1.10) from MTD-UTS1.', check: C.pingSucceeds('MTD-UTS1', '10.1.1.10'), points: 15 },
  ],
  hints: [
    [
      'On MTD-R1: interface gi0/0 → no shutdown (the parent port must be up).',
      'Then: interface gi0/0.10 → encapsulation dot1Q 10 → ip address 10.52.10.1 255.255.255.0. Same for .20 with VLAN 20.',
    ],
    [
      'interface gi0/1 → ip address 10.255.0.2 255.255.255.252 → no shutdown',
      'Global config: ip route 0.0.0.0 0.0.0.0 10.255.0.1. Check with "show ip route" (S* line).',
    ],
    [
      'Open CLI on MTD-UTS1 → ping 10.52.20.11',
      'Fails? "show ip interface brief" on MTD-R1 — are both sub-interfaces up/up? Is the switch port Gi0/24 a trunk?',
    ],
    ['Open CLI on MTD-UTS1 → ping 10.1.1.10', 'JU-R1 already has a route back to 10.52.0.0/16. If it fails, check the default route on MTD-R1.'],
  ],
  breakFix: {
    complaint:
      'MTD booking office se call: "UTS chal raha hai, par PRS counter (MTD-PRS1) ka JU server se connection kal raat se band hai. Raat ko kisi ne router par kuch change kiya tha."',
    apply: (t) =>
      configure(t, 'MTD-R1', (c) => {
        setIf(c, 'Gi0/0.20', { encapsulation: { vlan: 30, native: false } });
      }),
    check: C.pingSucceeds('MTD-PRS1', '10.1.1.10'),
    hints: [
      'Ping from MTD-PRS1 to its own gateway 10.52.20.1 first. Fails? The problem is between the PRS VLAN and the router.',
      '"show running-config" on MTD-R1: which VLAN does Gi0/0.20 take? Compare with "show vlan brief" on MTD-SW1.',
    ],
    fix: {
      cli: { 'MTD-R1': [...CONF, 'interface gi0/0.20', 'encapsulation dot1Q 20', 'end'] },
      pings: [['MTD-PRS1', '10.1.1.10']],
    },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Why does the router need one sub-interface per VLAN?',
      options: [
        'To double the speed',
        'Each VLAN is a separate subnet and needs its own gateway address',
        'Sub-interfaces are needed for STP',
        'For DHCP only',
      ],
      correctIndex: 1,
      explanation: 'One IP subnet per VLAN; the sub-interface holds that subnet’s gateway.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'What does "encapsulation dot1Q 20" on Gi0/0.20 do?',
      options: ['Sets the IP address', 'Maps the sub-interface to frames tagged with VLAN 20', 'Creates VLAN 20 on the switch', 'Enables routing'],
      correctIndex: 1,
      explanation: 'The router accepts and sends VLAN-20-tagged frames on this sub-interface.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'A router has routes to 10.52.10.0/24, 10.0.0.0/8 and 0.0.0.0/0. A packet goes to 10.52.10.5. Which route is used?',
      options: ['0.0.0.0/0', '10.0.0.0/8', '10.52.10.0/24', 'All three (load share)'],
      correctIndex: 2,
      explanation: 'Longest prefix match: /24 is the most specific.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'The switch port facing the router-on-a-stick must be…',
      options: ['An access port in VLAN 1', 'A trunk carrying the station VLANs', 'Shut down', 'A routed port'],
      correctIndex: 1,
      explanation: 'All VLANs ride one cable, so the port must tag them (802.1Q trunk).',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the lab, run "show ip interface brief" on MTD-R1. What is shown for Gi0/0.20?',
      options: ['unassigned, administratively down', '10.52.20.1, up / up', '10.52.10.1, up / up', '10.255.0.2, up / down'],
      correctIndex: 1,
      explanation: 'The sub-interface has the PRS gateway address and follows the parent port (up/up).',
    },
  ],
  estMinutes: 45,
  fieldNote:
    'Real gear: big stations use an L3 switch with SVIs (A15) instead of router-on-a-stick, because one trunk port carries all inter-VLAN traffic twice. Real addressing comes from the divisional IP plan; 10.52.x.x here is a teaching plan.\nInterview questions: "Router-on-a-stick kya hai?", "Default route kab use karte hain?", "Longest prefix match samjhao."',
  solution: {
    cli: {
      'MTD-R1': [
        ...CONF,
        'interface gi0/0',
        'no shutdown',
        'interface gi0/0.10',
        'encapsulation dot1Q 10',
        'ip address 10.52.10.1 255.255.255.0',
        'interface gi0/0.20',
        'encapsulation dot1Q 20',
        'ip address 10.52.20.1 255.255.255.0',
        'interface gi0/1',
        'ip address 10.255.0.2 255.255.255.252',
        'no shutdown',
        'exit',
        'ip route 0.0.0.0 0.0.0.0 10.255.0.1',
        'end',
      ],
    },
    pings: [
      ['MTD-UTS1', '10.52.20.11'],
      ['MTD-UTS1', '10.1.1.10'],
    ],
  },
};

// ---------------------------------------------------------------------------
// L10.1 OSPF ring (A10)
// ---------------------------------------------------------------------------

const RING_OSPF = ['router ospf 1', 'network 10.0.0.0 0.255.255.255 area 0', 'end'];

const l10: Lab = {
  id: 'L10.1',
  level: 10,
  order: 1,
  lessonId: 'A10',
  title: 'OSPF ring JU–BNO–JWL–AAS with a backup link',
  scenario:
    'Division ke chaar station routers ek ring mein jude hain. Abhi koi routing protocol nahi chal raha, isliye JU ka server AAS tak nahi pahunchta. Plan: OSPF chalao taaki raste apne aap seekhe jaayen, AAS–JU link ko sirf backup rakho (cost 100), aur fibre cut par traffic khud doosre raste se jaaye.',
  concept:
    'Static routes har router par haath se likhne padte hain aur link girne par apne aap nahi badalte. OSPF (link-state) mein har router apne links ki khabar (LSA) sabko bhejta hai; sab ke paas poora map hota hai aur har router Dijkstra (SPF) se sabse sasta raasta nikalta hai.\n' +
    'Neighbour banne ke liye area, subnet, hello/dead timers match hone chahiye. State FULL = database sync.\n' +
    'Cost = reference bandwidth / link speed; "ip ospf cost" se haath se bhi set kar sakte ho — zyada cost = kam pasand.\n' +
    'Railway analogy: har station control office ko apne sections ki haalat batata hai; control chart (LSDB) sabke paas same hai, aur har train sabse kam "cost" wale route se jaati hai. Section block hua to naya route turant.',
  objectives: [
    'Run OSPF area 0 on all four routers',
    'Make the AAS–JU link a backup with cost 100',
    'Prove end-to-end reachability',
    'Prove reroute after a fibre cut',
  ],
  topologyId: 'lab-ospf-ring',
  requiredModules: OSPF,
  plan: {
    headers: ['Link', 'Subnet', 'Note'],
    rows: [
      ['JU Gi0/1 – BNO Gi0/0', '10.255.1.0/30', ''],
      ['BNO Gi0/1 – JWL Gi0/0', '10.255.1.4/30', 'cut this one in task 5'],
      ['JWL Gi0/1 – AAS Gi0/0', '10.255.1.8/30', ''],
      ['AAS Gi0/1 – JU Gi0/2', '10.255.1.12/30', 'backup: cost 100 both ends'],
      ['Loopbacks', '10.0.0.1–4/32', 'JU, BNO, JWL, AAS'],
      ['LANs', 'JU 10.1.1.0/24, AAS 10.4.1.0/24', 'JU-SRV .10, AAS-PC .10'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Run OSPF area 0 so that all four ring links have FULL neighbours.',
      check: C.all(
        C.ospfNeighborFull('JU-R1', 'BNO-R1'),
        // After the planned cut in task 4 this link is down on purpose.
        C.any('BNO-R1 and JWL-R1 are not OSPF neighbours.', C.ospfNeighborFull('BNO-R1', 'JWL-R1'), C.linkCut('BNO-R1', 'JWL-R1')),
        C.ospfNeighborFull('JWL-R1', 'AAS-R1'),
        C.ospfNeighborFull('AAS-R1', 'JU-R1'),
      ),
      points: 25,
    },
    {
      id: 't2',
      text: 'Set OSPF cost 100 on both ends of the AAS–JU link, so JU reaches the AAS LAN via BNO.',
      check: C.all(
        C.ospfCostIs('JU-R1', 'Gi0/2', 100),
        C.ospfCostIs('AAS-R1', 'Gi0/1', 100),
        C.any('JU-R1 does not reach the AAS LAN via BNO-R1.', C.routeVia('JU-R1', '10.4.1.0/24', '10.255.1.2'), C.linkCut('BNO-R1', 'JWL-R1')),
      ),
      points: 15,
    },
    { id: 't3', text: 'Ping AAS-PC (10.4.1.10) from JU-SRV.', check: C.pingSucceeds('JU-SRV', '10.4.1.10'), points: 10 },
    {
      id: 't4',
      text: 'Cut the BNO–JWL link and prove JU-SRV still reaches AAS-PC (over the backup link).',
      check: C.all(C.linkCut('BNO-R1', 'JWL-R1'), C.routeVia('JU-R1', '10.4.1.0/24', '10.255.1.13'), C.pingSucceeds('JU-SRV', '10.4.1.10')),
      points: 20,
    },
  ],
  hints: [
    [
      'On each router: router ospf 1 → network 10.0.0.0 0.255.255.255 area 0 (covers every 10.x interface).',
      'Check with "show ip ospf neighbor": every ring neighbour should be FULL.',
    ],
    [
      'On JU-R1: interface gi0/2 → ip ospf cost 100. On AAS-R1: interface gi0/1 → ip ospf cost 100.',
      '"show ip route 10.4.1.0" on JU-R1 — the next hop should be BNO-R1 (10.255.1.2).',
    ],
    ['Open CLI on JU-SRV → ping 10.4.1.10'],
    [
      'Click the BNO–JWL cable, then "Cut" in the side panel.',
      'Look at "show ip route" on JU-R1 again: the AAS LAN now goes via 10.255.1.13. Ping again from JU-SRV.',
    ],
  ],
  breakFix: {
    complaint:
      'Control office JU: "JWL aur AAS ke beech OSPF neighbour nahi ban raha — show ip ospf neighbor mein AAS dikhta hi nahi. Traffic abhi backup link se chal raha hai. Kal kisi ne timers \'tune\' kiye the."',
    apply: (t) => configure(t, 'JWL-R1', (c) => setIf(c, 'Gi0/1', { ospfHello: 5 })),
    check: C.ospfNeighborFull('JWL-R1', 'AAS-R1'),
    hints: [
      '"show ip ospf interface gi0/1" on JWL-R1 and "show ip ospf interface gi0/0" on AAS-R1: compare the Hello and Dead timers.',
      'Remove the odd timer: interface gi0/1 → no ip ospf hello-interval.',
    ],
    fix: { cli: { 'JWL-R1': [...CONF, 'interface gi0/1', 'no ip ospf hello-interval', 'end'] } },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Which value must match for two OSPF routers to become neighbours?',
      options: ['Hostname', 'Area, subnet and hello/dead timers', 'Router ID', 'Interface name'],
      correctIndex: 1,
      explanation: 'Router IDs must be different; area, subnet and timers must match.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Default OSPF cost of a GigabitEthernet link (reference bandwidth 100 Mb/s)?',
      options: ['1', '10', '100', '1000'],
      correctIndex: 0,
      explanation: '100 / 1000 rounds up to the minimum, 1. Many networks raise the reference bandwidth.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'OSPF administrative distance on Cisco-style routers?',
      options: ['1', '90', '110', '120'],
      correctIndex: 2,
      explanation: 'Static 1, OSPF 110, IS-IS 115, RIP 120.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'Why do we give each router a loopback address?',
      options: [
        'Loopbacks are faster',
        'A loopback never goes down, so it is a stable router ID and management address',
        'It is needed for VLANs',
        'It replaces the default route',
      ],
      correctIndex: 1,
      explanation: 'It stays up while any physical path exists.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the cut in task 4, run "show ip route" on JU-R1. What is the next hop for 10.4.1.0/24?',
      options: ['10.255.1.2', '10.255.1.13', '10.255.1.6', 'No route'],
      correctIndex: 1,
      explanation: 'With BNO–JWL down, the only path left is the backup link to AAS-R1 (10.255.1.13).',
    },
  ],
  estMinutes: 55,
  fieldNote:
    'Real gear: OSPF here converges instantly (no hello/dead waiting, no SPF throttling) and runs a single area. Real ring designs also use BFD for fast failure detection. Links on the real network follow the OFC route, not the track map used here.\nInterview questions: "OSPF neighbour states?", "DR/BDR kab banta hai?", "Cost kaise nikalte hain?"',
  solution: {
    cli: {
      'JU-R1': [...CONF, 'interface gi0/2', 'ip ospf cost 100', 'exit', ...RING_OSPF],
      'BNO-R1': [...CONF, ...RING_OSPF],
      'JWL-R1': [...CONF, ...RING_OSPF],
      'AAS-R1': [...CONF, 'interface gi0/1', 'ip ospf cost 100', 'exit', ...RING_OSPF],
    },
    cuts: [['BNO-R1', 'JWL-R1']],
    pings: [['JU-SRV', '10.4.1.10']],
  },
};

// ---------------------------------------------------------------------------
// L10.2 IS-IS triangle (A10)
// ---------------------------------------------------------------------------

const isisLines = (net: string, ifs: string[]) => [
  ...CONF,
  'router isis',
  `net ${net}`,
  'exit',
  ...ifs.flatMap((i) => [`interface ${i}`, 'ip router isis']),
  'end',
];

const l10b: Lab = {
  id: 'L10.2',
  level: 10,
  order: 2,
  lessonId: 'A10',
  title: 'IS-IS triangle: two areas, L1 and L2',
  scenario:
    'Service provider (jaise RailTel) ke core mein aksar IS-IS chalta hai. Training ke liye JU, MTD aur DNA ka ek triangle hai: JU aur MTD ek area (49.0001) mein, DNA doosre area (49.0002) mein. IS-IS chalao aur dekho kaunsi adjacency Level-1 banti hai aur kaunsi Level-2.',
  concept:
    'IS-IS bhi link-state protocol hai (OSPF jaisa), par OSI se aaya hai. Router ki pehchaan NET address se: 49.0001.0000.0000.0001.00 = area 49.0001 + system ID 0000.0000.0001.\n' +
    'Level-1 = area ke andar, Level-2 = areas ke beech (backbone). Default router L1/L2 hota hai. Same area ke routers L1 aur L2 dono adjacency banate hain; alag area ke sirf L2.\n' +
    'Interface par "ip router isis" lagana zaroori — warna woh interface IS-IS mein nahi.\n' +
    'Railway analogy: L1 = division ke andar ki line; L2 = zones ke beech trunk route. Division ke andar ki baat division ke andar, zone ke bahar ka traffic trunk se.',
  objectives: [
    'Configure NET addresses per the plan',
    'Bring up L1 inside area 49.0001 and L2 between areas',
    'Learn every loopback via IS-IS',
    'Ping DNA’s loopback from JU',
  ],
  topologyId: 'lab-isis-triangle',
  requiredModules: OSPF,
  plan: {
    headers: ['Router', 'NET', 'Loopback'],
    rows: [
      ['JU-R1', '49.0001.0000.0000.0001.00', '10.0.0.1/32'],
      ['MTD-R1', '49.0001.0000.0000.0002.00', '10.0.0.2/32'],
      ['DNA-R1', '49.0002.0000.0000.0003.00', '10.0.0.3/32'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Configure IS-IS on JU-R1 and MTD-R1 so they form a Level-1 adjacency.',
      check: C.isisAdjacent('JU-R1', 'MTD-R1', 1),
      points: 20,
    },
    {
      id: 't2',
      text: 'Configure DNA-R1 (area 49.0002) so that it forms Level-2 adjacencies with both MTD-R1 and JU-R1.',
      check: C.all(C.isisAdjacent('DNA-R1', 'MTD-R1', 2), C.isisAdjacent('DNA-R1', 'JU-R1', 2)),
      points: 20,
    },
    {
      id: 't3',
      text: 'Make every loopback known: JU-R1 must learn 10.0.0.3/32 via IS-IS.',
      check: C.all(C.routeExists('JU-R1', '10.0.0.3/32', 'isis'), C.routeExists('DNA-R1', '10.0.0.2/32', 'isis')),
      points: 15,
    },
    { id: 't4', text: 'Ping 10.0.0.3 (DNA-R1 loopback) from JU-R1.', check: C.pingSucceeds('JU-R1', '10.0.0.3'), points: 10 },
  ],
  hints: [
    [
      'router isis → net 49.0001.0000.0000.0001.00 (JU-R1). Then on each link interface: ip router isis.',
      '"show isis neighbors" — look at the Type column (L1, L2 or L1L2).',
    ],
    ['DNA-R1 uses area 49.0002: net 49.0002.0000.0000.0003.00.', 'Between different areas only Level-2 adjacencies form. That is expected.'],
    [
      'Loopbacks are interfaces too: interface loopback0 → ip router isis (on all three).',
      '"show ip route isis" on JU-R1 should list 10.0.0.2 and 10.0.0.3.',
    ],
    ['On JU-R1 (privileged EXEC): ping 10.0.0.3'],
  ],
  breakFix: {
    complaint:
      'NOC: "MTD aur DNA ke beech IS-IS adjacency gayab hai, logs mein \'duplicate system ID\' aa raha hai. Kisi ne MTD router ka config DNA se copy karke banaya tha."',
    apply: (t) =>
      configure(t, 'MTD-R1', (c) => {
        if (c.isis) c.isis.net = '49.0001.0000.0000.0003.00';
      }),
    check: C.all(C.isisAdjacent('MTD-R1', 'DNA-R1', 2), C.routeExists('MTD-R1', '10.0.0.3/32', 'isis')),
    hints: [
      '"show running-config | section isis" on MTD-R1 and DNA-R1: compare the system-ID part of the NET.',
      'router isis → no net <old> → net 49.0001.0000.0000.0002.00',
    ],
    fix: { cli: { 'MTD-R1': [...CONF, 'router isis', 'no net 49.0001.0000.0000.0003.00', 'net 49.0001.0000.0000.0002.00', 'end'] } },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'In NET 49.0002.0000.0000.0003.00, what is the area?',
      options: ['49', '49.0002', '0000.0000.0003', '00'],
      correctIndex: 1,
      explanation: 'Area = everything before the last 6 bytes of system ID and the 00 selector.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Two L1/L2 routers in DIFFERENT areas form which adjacency?',
      options: ['L1 only', 'L2 only', 'L1 and L2', 'None'],
      correctIndex: 1,
      explanation: 'Level-1 needs the same area; Level-2 does not.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'IS-IS administrative distance (Cisco style)?',
      options: ['90', '110', '115', '120'],
      correctIndex: 2,
      explanation: 'OSPF 110, IS-IS 115, RIP 120.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'Why do many service providers prefer IS-IS in the core?',
      options: [
        'It runs over IP only',
        'It is simple to scale, runs directly over Layer 2 and is protocol-independent',
        'It needs no configuration',
        'It has no areas',
      ],
      correctIndex: 1,
      explanation: 'IS-IS does not depend on IP for its own packets and scales well with two levels.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the lab, run "show isis neighbors" on MTD-R1. What type is DNA-R1’s adjacency?',
      options: ['L1', 'L2', 'L1L2', 'Not listed'],
      correctIndex: 1,
      explanation: 'DNA is in another area, so only Level-2 forms.',
    },
  ],
  estMinutes: 45,
  fieldNote:
    'Real gear: IS-IS here is computed, not timed (no hellos, no LSP aging); metric is the narrow default 10 per link; pseudonode/DIS election is modelled simply. Real provider cores usually use wide metrics and often Level-2 only.\nInterview questions: "NET address samjhao", "L1 aur L2 mein fark?", "OSPF vs IS-IS?"',
  solution: {
    cli: {
      'JU-R1': isisLines('49.0001.0000.0000.0001.00', ['loopback0', 'gi0/1', 'gi0/2']),
      'MTD-R1': isisLines('49.0001.0000.0000.0002.00', ['loopback0', 'gi0/0', 'gi0/1']),
      'DNA-R1': isisLines('49.0002.0000.0000.0003.00', ['loopback0', 'gi0/0', 'gi0/1']),
    },
    pings: [['JU-R1', '10.0.0.3']],
  },
};

// ---------------------------------------------------------------------------
// L11.1 Network services at JU HQ (A11)
// ---------------------------------------------------------------------------

const l11: Lab = {
  id: 'L11.1',
  level: 11,
  order: 1,
  lessonId: 'A11',
  title: 'JU HQ services: DHCP relay, DNS, NAT, NTP, syslog, SSH',
  scenario:
    'JU HQ mein naya DNS/DHCP/NTP server (JU-DNS) aur NMS laga hai. Kaam ki list: MTD ke PRS counter ko JU server se DHCP address milna chahiye, naam se lookup chalna chahiye, admin PC ka internet NAT se, router ka time NTP se, events NMS par, aur router par sirf SSH (Telnet band).',
  concept:
    'DHCP broadcast router paar nahi karta — MTD router par "ip helper-address" (relay) use unicast mein badal kar JU server tak bhejta hai. Pool mein gateway aur DNS bhi diye jaate hain.\n' +
    'NAT/PAT: private 10.x addresses internet par nahi chalte; JU-R1 unhe apne public address (203.0.113.2) se badalta hai, ports se alag pehchanta hai.\n' +
    'NTP se sab ka time ek; syslog/SNMP traps se NMS ko khabar; SSH se encrypted login.\n' +
    'Railway analogy: helper-address = parcel ko local counter se divisional office forward karna; NAT = sab staff ka bahar ka courier ek hi office address se jaata hai, andar register mein naam se baanta jaata hai.',
  objectives: [
    'DHCP relay from MTD to the JU server',
    'Name resolution',
    'Internet via PAT for the HQ LAN',
    'NTP sync, syslog and traps to the NMS',
    'SSH-only management',
  ],
  topologyId: 'lab-ju-services',
  requiredModules: SERVICES,
  plan: {
    headers: ['Item', 'Value'],
    rows: [
      ['JU-DNS', '10.1.1.53 (DNS, DHCP, NTP stratum 2)'],
      ['JU-NMS', '10.1.1.100 (syslog, SNMP traps)'],
      ['DHCP pool MTD-PRS', '10.52.20.0/24, gw 10.52.20.1, DNS 10.1.1.53'],
      ['NAT', 'inside Gi0/0 + Gi0/1, outside Gi0/2 (203.0.113.2), ACL 1 = 10.0.0.0/8'],
      ['Internet test host', '198.51.100.10'],
      ['SSH', 'domain nwr.lab, RSA 2048, user admin'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'MTD-PRS1 must get its address from the JU-DNS server (DHCP pool on the server + relay on MTD-R1).',
      check: C.dhcpBound('MTD-PRS1'),
      points: 20,
    },
    {
      id: 't2',
      text: 'From MTD-PRS1, resolve the name ju-nms with nslookup.',
      check: C.appSucceeds('MTD-PRS1', 'dns', 'ju-nms', '10.1.1.100'),
      points: 10,
    },
    {
      id: 't3',
      text: 'Configure PAT on JU-R1 and ping the internet host 198.51.100.10 from JU-ADMIN.',
      check: C.all(C.natTranslationFor('JU-R1', '10.1.1.20'), C.pingSucceeds('JU-ADMIN', '198.51.100.10')),
      points: 20,
    },
    { id: 't4', text: 'Synchronise JU-R1’s clock with JU-DNS via NTP.', check: C.ntpSynced('JU-R1', 3), points: 10 },
    {
      id: 't5',
      text: 'Send JU-R1’s syslog and SNMP traps to JU-NMS, then bounce an interface so an event is reported.',
      check: C.all(C.nmsReceived('JU-NMS', 'syslog'), C.nmsReceived('JU-NMS', 'traps')),
      points: 15,
    },
    {
      id: 't6',
      text: 'Make JU-R1 SSH-only with local users, and log in from JU-ADMIN with SSH.',
      check: C.all(C.sshOnly('JU-R1'), C.appSucceeds('JU-ADMIN', 'ssh', 'JU-R1')),
      points: 15,
    },
  ],
  hints: [
    [
      'Select JU-DNS → DHCP pools: add network 10.52.20.0 mask 255.255.255.0, gateway 10.52.20.1, DNS 10.1.1.53.',
      'On MTD-R1: interface gi0/0 → ip helper-address 10.1.1.53. Then on MTD-PRS1: ipconfig /renew.',
    ],
    ['The DNS server address reaches PRS1 through the DHCP pool. Check with "ipconfig /all".', 'On MTD-PRS1: nslookup ju-nms'],
    [
      'JU-R1: interface gi0/0 and gi0/1 → ip nat inside; interface gi0/2 → ip nat outside.',
      'access-list 1 permit 10.0.0.0 0.255.255.255 → ip nat inside source list 1 interface gi0/2 overload. Then ping from JU-ADMIN and "show ip nat translations".',
    ],
    ['JU-R1 global config: ntp server 10.1.1.53', '"show ntp status": synchronised, stratum 3 (one more than the server).'],
    [
      'logging host 10.1.1.100 · snmp-server community rlnms RO · snmp-server host 10.1.1.100 version 2c rlnms · snmp-server enable traps',
      'Messages are sent only when something happens: shut and no shut an interface (e.g. Gi0/2), then look at JU-NMS → NMS inbox.',
    ],
    [
      'ip domain-name nwr.lab → crypto key generate rsa modulus 2048 → username admin privilege 15 secret <pwd>',
      'line vty 0 4 → login local → transport input ssh. Then on JU-ADMIN: ssh admin@10.1.1.1',
    ],
  ],
  breakFix: {
    complaint:
      'JU admin section: "Subah se kisi bhi PC se internet nahi chal raha. Router par kal raat koi interface kaam hua tha." (NMS par koi link-down alarm nahi hai.)',
    apply: (t) => configure(t, 'JU-R1', (c) => setIf(c, 'Gi0/0', { natRole: undefined })),
    check: C.pingSucceeds('JU-ADMIN', '198.51.100.10'),
    hints: [
      '"show ip nat translations" is empty? Then translation is not happening. Which interfaces are marked inside/outside? ("show running-config")',
      'interface gi0/0 → ip nat inside, then ping again from JU-ADMIN.',
    ],
    fix: {
      cli: { 'JU-R1': [...CONF, 'interface gi0/0', 'ip nat inside', 'end'] },
      pings: [['JU-ADMIN', '198.51.100.10']],
    },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Why does MTD-R1 need "ip helper-address" for PRS1 to get an address?',
      options: ['To encrypt DHCP', 'DHCP Discover is a broadcast; routers do not forward broadcasts', 'To give a DNS server', 'For NAT'],
      correctIndex: 1,
      explanation: 'The relay turns the broadcast into a unicast towards the server.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Which address does the internet host see as source when JU-ADMIN pings it?',
      options: ['10.1.1.20', '203.0.113.2', '10.1.1.1', '198.51.100.10'],
      correctIndex: 1,
      explanation: 'PAT translates to the outside interface address.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'NTP server is stratum 2. After sync, JU-R1 is stratum…',
      options: ['1', '2', '3', '16'],
      correctIndex: 2,
      explanation: 'Each hop away from the reference adds one.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'SNMP traps go from the device to the NMS on which port?',
      options: ['UDP 161', 'UDP 162', 'UDP 514', 'TCP 22'],
      correctIndex: 1,
      explanation: '161 = polling, 162 = traps, 514 = syslog.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After task 3, run "show ip nat translations" on JU-R1. What is the Inside global address for 10.1.1.20?',
      options: ['10.1.1.20', '203.0.113.1', '203.0.113.2', '198.51.100.10'],
      correctIndex: 2,
      explanation: 'Overload uses the address of Gi0/2, 203.0.113.2.',
    },
  ],
  estMinutes: 70,
  fieldNote:
    'Real gear: SSH/Telnet here only test the connection and login rules — there is no remote shell. NAT is stateless per flow and only for pings/UDP apps in this simulator. Real Railnet internet goes through firewalls/proxies at the divisional HQ; this is a teaching topology.\nInterview questions: "DORA samjhao", "NAT aur PAT mein fark?", "Telnet kyon band karte hain?"',
  solution: {
    pools: { 'JU-DNS': [{ name: 'MTD-PRS', network: '10.52.20.0', mask: '255.255.255.0', gateway: '10.52.20.1', dns: '10.1.1.53' }] },
    cli: {
      'MTD-R1': [...CONF, 'interface gi0/0', 'ip helper-address 10.1.1.53', 'end'],
      'JU-R1': [
        ...CONF,
        'interface gi0/0',
        'ip nat inside',
        'interface gi0/1',
        'ip nat inside',
        'interface gi0/2',
        'ip nat outside',
        'exit',
        'access-list 1 permit 10.0.0.0 0.255.255.255',
        'ip nat inside source list 1 interface gi0/2 overload',
        'ntp server 10.1.1.53',
        'logging host 10.1.1.100',
        'snmp-server community rlnms RO',
        'snmp-server host 10.1.1.100 version 2c rlnms',
        'snmp-server enable traps',
        'ip domain-name nwr.lab',
        'crypto key generate rsa modulus 2048',
        'username admin privilege 15 secret Rail@123',
        'line vty 0 4',
        'login local',
        'transport input ssh',
        'end',
        'show ntp status',
      ],
    },
    flaps: [['JU-R1', 'gi0/2']],
    renew: ['MTD-PRS1'],
    pings: [['JU-ADMIN', '198.51.100.10']],
    hostCli: { 'MTD-PRS1': ['nslookup ju-nms'], 'JU-ADMIN': ['ssh admin@10.1.1.1'] },
  },
};

// ---------------------------------------------------------------------------
// L12.1 ACLs and management-plane security at MTD (A12)
// ---------------------------------------------------------------------------

const ACL110 = ['access-list 110 deny ip 10.52.50.0 0.0.0.255 10.52.10.0 0.0.0.255', 'access-list 110 permit ip any any'];

const l12: Lab = {
  id: 'L12.1',
  level: 12,
  order: 1,
  lessonId: 'A12',
  title: 'Keep Railnet away from UTS; SSH only from management',
  scenario:
    'Audit report MTD: "Railnet office PC se UTS terminal ping ho raha hai — financial system khula hai. Aur L3 switch par Telnet kisi bhi VLAN se chalta hai." Kaam: UTS ko Railnet se alag karo bina baaki services tode, aur switch ka management sirf SSH se aur sirf management VLAN se.',
  concept:
    'Extended ACL source, destination aur protocol dekhta hai. Lines upar se neeche, pehli match ka faisla; end mein chhupa "deny any".\n' +
    'Railnet → UTS rokna hai: Railnet VLAN ke gateway (Vlan50) par inbound ACL — kachra source ke paas hi ruk jaata hai.\n' +
    'Management plane: vty lines par "transport input ssh", "login local", aur "access-class" (standard ACL) se sirf mgmt subnet.\n' +
    'Railway analogy: booking office ka cash room — sirf authorised staff andar (ACL), aur chaabi sirf Station Master ke register se (access-class).',
  objectives: ['Block Railnet → UTS', 'Keep other traffic working', 'SSH-only management restricted to VLAN 99'],
  topologyId: 'lab-mtd-security',
  requiredModules: SERVICES,
  plan: {
    headers: ['VLAN', 'Subnet', 'Who'],
    rows: [
      ['10 UTS', '10.52.10.0/24', 'MTD-UTS1 .11'],
      ['50 Railnet', '10.52.50.0/24', 'MTD-RAILNET-PC .11'],
      ['99 MGMT', '10.52.99.0/24', 'MTD-MGMT-LT .11, MTD-NMS .100'],
      ['ACL 110', 'on Vlan50 in', 'deny Railnet→UTS, permit the rest'],
      ['ACL 10', 'vty access-class', 'permit 10.52.99.0/24 only'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Apply an extended ACL on Vlan50 (inbound) so MTD-RAILNET-PC can no longer ping MTD-UTS1.',
      check: C.all(C.aclApplied('MTD-L3SW', 'Vlan50', 'in'), C.pingFails('MTD-RAILNET-PC', '10.52.10.11')),
      points: 25,
    },
    {
      id: 't2',
      text: 'Everything else must keep working: MTD-RAILNET-PC and MTD-UTS1 both still reach MTD-NMS (10.52.99.100).',
      check: C.all(
        C.aclApplied('MTD-L3SW', 'Vlan50', 'in'),
        C.pingSucceeds('MTD-RAILNET-PC', '10.52.99.100'),
        C.pingSucceeds('MTD-UTS1', '10.52.99.100'),
      ),
      points: 15,
    },
    {
      id: 't3',
      text: 'Make MTD-L3SW SSH-only (local users), restrict vty with an access-class, and SSH in from MTD-MGMT-LT.',
      check: C.all(C.sshOnly('MTD-L3SW'), C.vtyAccessClass('MTD-L3SW'), C.appSucceeds('MTD-MGMT-LT', 'ssh', 'MTD-L3SW')),
      points: 20,
    },
    {
      id: 't4',
      text: 'Prove that SSH from MTD-RAILNET-PC to the switch is refused.',
      check: C.all(C.vtyAccessClass('MTD-L3SW'), C.appFails('MTD-RAILNET-PC', 'ssh', 'MTD-L3SW')),
      points: 10,
    },
  ],
  hints: [
    [
      'Global config: access-list 110 deny ip 10.52.50.0 0.0.0.255 10.52.10.0 0.0.0.255',
      'Then the line that keeps everything else alive, and: interface vlan50 → ip access-group 110 in. Test from MTD-RAILNET-PC: ping 10.52.10.11.',
    ],
    [
      'Did you forget the last line? Every ACL ends with an invisible "deny any".',
      'access-list 110 permit ip any any — then ping 10.52.99.100 from both PCs.',
    ],
    [
      'ip domain-name nwr.lab → crypto key generate rsa modulus 2048 → username admin privilege 15 secret <pwd>',
      'access-list 10 permit 10.52.99.0 0.0.0.255 → line vty 0 4 → login local → transport input ssh → access-class 10 in. Then from MTD-MGMT-LT: ssh admin@10.52.99.1',
    ],
    ['From MTD-RAILNET-PC: ssh admin@10.52.50.1 — it should be refused.'],
  ],
  breakFix: {
    complaint:
      'Security audit dobara: "Railnet PC se UTS phir se ping ho raha hai! ACL to laga hua hai." Kisi ne ACL ko \'saaf\' karke dobara likha tha.',
    apply: (t) =>
      configure(t, 'MTD-L3SW', (c) => {
        const a = c.acls['110'];
        if (a) a.entries = [...a.entries].reverse();
      }),
    check: C.all(C.aclApplied('MTD-L3SW', 'Vlan50', 'in'), C.pingFails('MTD-RAILNET-PC', '10.52.10.11')),
    hints: [
      '"show access-lists 110": read the lines from the top. Which line matches a Railnet → UTS packet first?',
      'Order matters: no access-list 110, then write the deny line first and the permit line last. Test the ping again.',
    ],
    fix: {
      cli: { 'MTD-L3SW': [...CONF, 'no access-list 110', ...ACL110, 'end'] },
      pings: [['MTD-RAILNET-PC', '10.52.10.11']],
    },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Why is ACL 110 applied inbound on Vlan50 and not on Vlan10?',
      options: [
        'Vlan10 cannot have ACLs',
        'Extended ACLs go close to the source, so unwanted traffic is dropped early',
        'Inbound is faster always',
        'It must be on the trunk',
      ],
      correctIndex: 1,
      explanation: 'Filtering at the Railnet gateway stops the traffic before it is routed.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'ACL 110 has only the deny line. What happens to Railnet → NMS traffic?',
      options: ['Permitted', 'Denied by the implicit deny', 'Logged only', 'Sent to UTS'],
      correctIndex: 1,
      explanation: 'Every ACL ends with a hidden deny any.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Wildcard for the host 10.52.99.11 only?',
      options: ['255.255.255.255', '0.0.0.0', '0.0.0.255', '255.255.255.0'],
      correctIndex: 1,
      explanation: 'All bits must match: 0.0.0.0 (or the keyword "host").',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: '"access-class 10 in" on the vty lines controls…',
      options: ['Traffic through the switch', 'Which source addresses may open SSH/Telnet sessions to the switch', 'DHCP', 'Routing updates'],
      correctIndex: 1,
      explanation: 'It filters management sessions, not transit traffic.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After task 4, open the CLI on MTD-RAILNET-PC and run "ssh admin@10.52.50.1". What does the result say?',
      options: ['Login successful', 'Connection refused', 'Request timed out', 'Host name not found'],
      correctIndex: 1,
      explanation: 'The switch answers with a reset: the source address is not permitted by access-class 10.',
    },
  ],
  estMinutes: 55,
  fieldNote:
    'Real gear: ACLs here are stateless and have no hit counters per line; real firewalls are stateful. Management VLANs on real networks are also kept off user ports and protected with AAA (TACACS+/RADIUS).\nInterview questions: "Standard vs extended ACL?", "Wildcard mask nikalo /27 ke liye", "Implicit deny kya hai?"',
  solution: {
    cli: {
      'MTD-L3SW': [
        ...CONF,
        ...ACL110,
        'interface vlan50',
        'ip access-group 110 in',
        'exit',
        'ip domain-name nwr.lab',
        'crypto key generate rsa modulus 2048',
        'username admin privilege 15 secret Rail@123',
        'access-list 10 permit 10.52.99.0 0.0.0.255',
        'line vty 0 4',
        'login local',
        'transport input ssh',
        'access-class 10 in',
        'end',
      ],
    },
    pings: [
      ['MTD-RAILNET-PC', '10.52.10.11'],
      ['MTD-RAILNET-PC', '10.52.99.100'],
      ['MTD-UTS1', '10.52.99.100'],
    ],
    hostCli: { 'MTD-MGMT-LT': ['ssh admin@10.52.99.1'], 'MTD-RAILNET-PC': ['ssh admin@10.52.50.1'] },
  },
};

// ---------------------------------------------------------------------------
// L13.1 HSRP with tracking (A13)
// ---------------------------------------------------------------------------

const l13: Lab = {
  id: 'L13.1',
  level: 13,
  order: 1,
  lessonId: 'A13',
  title: 'HSRP gateway redundancy at MTD',
  scenario:
    'MTD junction par do routers lage hain, dono ka apna uplink JU tak. Par UTS terminal ka gateway 10.52.10.1 abhi kisi router par nahi hai, isliye ticketing band hai. Plan: HSRP se virtual gateway banao — MTD-R1 main, MTD-R2 standby — aur R1 ka uplink kate to R2 apne aap le le.',
  concept:
    'HSRP do routers ko ek virtual IP (gateway) deta hai. Zyada priority wala Active, doosra Standby. Preempt on ho to behtar router role wapas le leta hai.\n' +
    'Tracking: "standby 10 track Gi0/1 decrement 20" — uplink gira to priority 110 se 90; R2 (100, preempt) Active ban jaata hai. Bina tracking ke R1 Active rehta aur traffic black-hole hota.\n' +
    'Railway analogy: SM aur Deputy SM ek hi office phone number; SM ka block instrument fail ho to woh khud duty Deputy ko de deta hai.',
  objectives: [
    'HSRP group 10 with virtual IP 10.52.10.1',
    'MTD-R1 Active by priority, with preempt',
    'Track the uplink',
    'Prove failover after an uplink cut',
  ],
  topologyId: 'lab-mtd-hsrp',
  requiredModules: [...OSPF, 'resilience'],
  plan: {
    headers: ['Router', 'LAN address', 'HSRP 10'],
    rows: [
      ['MTD-R1', '10.52.10.2', 'priority 110, preempt, track Gi0/1 decrement 20'],
      ['MTD-R2', '10.52.10.3', 'priority 100 (default), preempt'],
      ['Virtual gateway', '10.52.10.1', 'MTD-UTS1 already uses it'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Configure HSRP group 10 (virtual IP 10.52.10.1) on both routers, with MTD-R1 Active.',
      // After the planned uplink cut in task 3, MTD-R2 is Active on purpose.
      check: C.any(
        'MTD-R1 is not the Active router of HSRP group 10 with virtual IP 10.52.10.1 (and both routers in the group).',
        C.fhrpActiveIs('hsrp', 10, 'MTD-R1', '10.52.10.1'),
        C.all(C.linkCut('MTD-R1', 'JU-R1'), C.fhrpActiveIs('hsrp', 10, 'MTD-R2', '10.52.10.1')),
      ),
      points: 25,
    },
    {
      id: 't2',
      text: 'Ping JU-SRV (10.1.1.10) from MTD-UTS1 through the virtual gateway.',
      check: C.pingSucceeds('MTD-UTS1', '10.1.1.10'),
      points: 10,
    },
    {
      id: 't3',
      text: 'Cut the MTD-R1–JU-R1 uplink. MTD-R2 must become Active and MTD-UTS1 must still reach JU-SRV.',
      check: C.all(C.linkCut('MTD-R1', 'JU-R1'), C.fhrpActiveIs('hsrp', 10, 'MTD-R2'), C.pingSucceeds('MTD-UTS1', '10.1.1.10')),
      points: 25,
    },
  ],
  hints: [
    [
      'MTD-R1: interface gi0/0 → standby 10 ip 10.52.10.1 → standby 10 priority 110 → standby 10 preempt',
      'MTD-R2: interface gi0/0 → standby 10 ip 10.52.10.1 → standby 10 preempt. Check with "show standby brief".',
    ],
    ['Open CLI on MTD-UTS1 → ping 10.1.1.10'],
    [
      'Without tracking, MTD-R1 stays Active even when its uplink is dead. On MTD-R1 gi0/0: standby 10 track gi0/1 decrement 20',
      'Then click the MTD-R1–JU-R1 cable → Cut. "show standby brief" on MTD-R2, then ping again (the first ping may lose a packet to ARP).',
    ],
  ],
  breakFix: {
    complaint:
      'MTD night shift: "Router 1 restart hua to UTS 10 minute band raha — Router 2 ne gateway nahi liya. show standby mein dono routers \'Active\' dikha rahe the!"',
    apply: (t) =>
      configure(t, 'MTD-R2', (c) => {
        const i = c.interfaces['Gi0/0'];
        if (i?.fhrp) i.fhrp = i.fhrp.map((g) => ({ ...g, group: 20 }));
      }),
    check: C.fhrpActiveIs('hsrp', 10, 'MTD-R1', '10.52.10.1'),
    hints: [
      '"show standby brief" on both routers: compare the Grp column.',
      'On MTD-R2 gi0/0: no standby 20 → standby 10 ip 10.52.10.1 → standby 10 preempt',
    ],
    fix: { cli: { 'MTD-R2': [...CONF, 'interface gi0/0', 'no standby 20', 'standby 10 ip 10.52.10.1', 'standby 10 preempt', 'end'] } },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Both routers have priority 100 and no preempt. Which becomes Active first?',
      options: ['The one with the lower IP', 'The one with the higher interface IP', 'Both', 'Neither'],
      correctIndex: 1,
      explanation: 'On a priority tie, the higher interface address wins.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Why must MTD-R2 also have preempt in this design?',
      options: ['It is not needed', 'So R2 takes over when R1’s priority drops by tracking while R1 is still alive', 'For OSPF', 'To speed up ARP'],
      correctIndex: 1,
      explanation: 'Without preempt, R2 waits until R1 disappears completely.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Which MAC address answers ARP for 10.52.10.1 (HSRP group 10)?',
      options: ['MTD-R1’s own MAC', '0000.0c07.ac0a', 'ffff.ffff.ffff', '0000.5e00.010a'],
      correctIndex: 1,
      explanation: 'HSRPv1 virtual MAC 0000.0c07.acXX with XX = group in hex.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'R1 priority 110 tracks its uplink with decrement 20. The uplink fails. R1’s priority becomes…',
      options: ['110', '100', '90', '20'],
      correctIndex: 2,
      explanation: '110 − 20 = 90, lower than R2’s 100.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the cut in task 3, run "show standby brief" on MTD-R2. What is its State?',
      options: ['Standby', 'Active', 'Init', 'Listen'],
      correctIndex: 1,
      explanation: 'R1 dropped to 90, R2 (100, preempt) took over.',
    },
  ],
  estMinutes: 50,
  fieldNote:
    'Real gear: failover here is instant (no hello/hold timers) and HSRP messages are not simulated as packets. Real designs tune timers (e.g. 1/3 s) or use BFD, and VRRP is the multi-vendor choice.\nInterview questions: "HSRP vs VRRP?", "Preempt kyon?", "Tracking kya karta hai?"',
  solution: {
    cli: {
      'MTD-R1': [
        ...CONF,
        'interface gi0/0',
        'standby 10 ip 10.52.10.1',
        'standby 10 priority 110',
        'standby 10 preempt',
        'standby 10 track gi0/1 decrement 20',
        'end',
      ],
      'MTD-R2': [...CONF, 'interface gi0/0', 'standby 10 ip 10.52.10.1', 'standby 10 preempt', 'end'],
    },
    cuts: [['MTD-R1', 'JU-R1']],
    pings: [
      ['MTD-UTS1', '10.1.1.10'],
      ['MTD-UTS1', '10.1.1.10'],
    ],
  },
};

// ---------------------------------------------------------------------------
// L14.1 QoS on a congested uplink (A14)
// ---------------------------------------------------------------------------

const QOS_POLICY = [
  'class-map match-any VOICE',
  'match dscp ef',
  'class-map match-any UTS',
  'match dscp af31',
  'class-map match-any CCTV',
  'match dscp af41',
  'policy-map WAN-OUT',
  'class VOICE',
  'priority percent 20',
  'class UTS',
  'bandwidth percent 30',
  'class CCTV',
  'bandwidth percent 40',
  'exit',
  'exit',
];

const l14: Lab = {
  id: 'L14.1',
  level: 14,
  order: 1,
  lessonId: 'A14',
  title: 'QoS: protect voice and UTS on the MTD–JU uplink',
  scenario:
    'MTD–JU link sirf 10 Mb/s ka hai (teaching value). Naye CCTV camera ki video chalu hui to control phone ki awaaz tootne lagi aur UTS ticket printing slow ho gayi. Bina link badhaye: voice aur UTS ko CCTV se pehle rakho.',
  concept:
    'Link congested ho (offered > capacity) to bina QoS sab flows barabar girte hain (FIFO). QoS policy congestion mein faisla karti hai: LLQ (priority) voice ko pehle bhejta hai (limit tak), CBWFQ (bandwidth) har class ko guaranteed hissa deta hai.\n' +
    'Cisco MQC: class-map (match dscp), policy-map (priority / bandwidth), service-policy output (interface par).\n' +
    'Railway analogy: single line par Rajdhani (voice) ko hamesha path, mail/express (UTS) ko fixed slots, goods (CCTV) bache hue time mein.',
  objectives: [
    'Classify voice, UTS and CCTV by DSCP',
    'Build an LLQ/CBWFQ policy',
    'Attach it outbound on the uplink',
    'Voice and UTS lossless under congestion',
  ],
  topologyId: 'lab-mtd-qos',
  requiredModules: [...IP, 'qos'],
  plan: {
    headers: ['Traffic', 'DSCP', 'Rate', 'Treatment'],
    rows: [
      ['Control phone → JU-SRV', 'EF (46)', '1 Mb/s', 'priority 20%'],
      ['UTS → JU-SRV', 'AF31 (26)', '2 Mb/s', 'bandwidth 30%'],
      ['CCTV → JU-NVR', 'AF41 (34)', '8 Mb/s', 'bandwidth 40%'],
      ['Uplink', '—', '10 Mb/s', 'MTD-R1 Gi0/1 output'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Build class-maps and a policy-map, and attach it outbound on MTD-R1 Gi0/1.',
      check: C.servicePolicyApplied('MTD-R1', 'Gi0/1', 'output'),
      points: 20,
    },
    {
      id: 't2',
      text: 'Voice from MTD-PHONE1 must lose no more than 0.5% (QoS tab).',
      check: C.qosFlowOk('MTD-PHONE1', 'Control voice / VoIP', 0.5),
      points: 20,
    },
    { id: 't3', text: 'UTS traffic from MTD-UTS1 must lose no more than 0.5%.', check: C.qosFlowOk('MTD-UTS1', 'UTS ticketing', 0.5), points: 20 },
  ],
  hints: [
    [
      'Open the QoS tab first: all three flows lose the same share (FIFO). On MTD-R1: class-map match-any VOICE → match dscp ef (same for UTS af31 and CCTV af41).',
      'policy-map WAN-OUT → class VOICE → priority percent 20 → class UTS → bandwidth percent 30 → class CCTV → bandwidth percent 40. Then interface gi0/1 → service-policy output WAN-OUT.',
    ],
    ['Voice must be in a priority class. Check the QoS tab: queue of MTD-R1 Gi0/1.', 'Is the policy attached on the uplink in the OUTPUT direction?'],
    ['UTS needs a bandwidth guarantee bigger than its 2 Mb/s (30% of 10 = 3 Mb/s).'],
  ],
  breakFix: {
    complaint:
      'Section Controller JU: "Control phone par MTD se awaaz phir kat-kat kar aa rahi hai. Kal router par \'cleanup\' hua tha." (Link up hai, ping chal raha hai.)',
    apply: (t) => configure(t, 'MTD-R1', (c) => setIf(c, 'Gi0/1', { servicePolicyOut: undefined })),
    check: C.all(C.qosFlowOk('MTD-PHONE1', 'Control voice / VoIP', 0.5), C.qosFlowOk('MTD-UTS1', 'UTS ticketing', 0.5)),
    hints: [
      'QoS tab: is there a policy on MTD-R1 Gi0/1? "show policy-map interface gi0/1".',
      'The policy-map still exists — attach it again: interface gi0/1 → service-policy output WAN-OUT.',
    ],
    fix: { cli: { 'MTD-R1': [...CONF, 'interface gi0/1', 'service-policy output WAN-OUT', 'end'] } },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Without any policy, how is loss shared on the congested uplink?',
      options: ['Voice first', 'All flows lose the same fraction (FIFO)', 'CCTV only', 'No loss'],
      correctIndex: 1,
      explanation: 'One queue, first come first served.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Why is the priority queue limited ("priority percent 20")?',
      options: ['To save power', 'So voice cannot starve all other classes', 'It is not limited', 'For DSCP marking'],
      correctIndex: 1,
      explanation: 'LLQ is policed to its percentage.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Total offered is 11 Mb/s on a 10 Mb/s link with the policy. Which class loses traffic?',
      options: ['Voice', 'UTS', 'CCTV', 'None'],
      correctIndex: 2,
      explanation: 'Voice and UTS fit their guarantees; CCTV gets what is left.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'QoS policy for congestion is attached in which direction on the uplink?',
      options: ['input', 'output', 'both always', 'on the VLAN'],
      correctIndex: 1,
      explanation: 'Queues form where packets leave towards the slow link.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'Open the QoS tab at the start of the lab. Which interface is the bottleneck for all three flows?',
      options: ['MTD-SW1 Gi0/24', 'MTD-R1 Gi0/1', 'JU-R1 Gi0/0', 'MTD-R1 Gi0/0'],
      correctIndex: 1,
      explanation: 'The 10 Mb/s uplink out of MTD-R1 is where traffic queues.',
    },
  ],
  estMinutes: 45,
  fieldNote:
    'Real gear: the QoS tab is a steady-state ("fluid") average-rate analysis — no jitter, bursts or shaper timing. Real railway QoS plans come from the zonal design; DSCP values here follow common RFC 4594 practice.\nInterview questions: "LLQ vs CBWFQ?", "Trust boundary kahan?", "Policing vs shaping?"',
  solution: {
    cli: { 'MTD-R1': [...CONF, ...QOS_POLICY, 'interface gi0/1', 'service-policy output WAN-OUT', 'end'] },
  },
};

export const ROUTING_LABS: Lab[] = [l9, l10, l10b, l11, l12, l13, l14];
