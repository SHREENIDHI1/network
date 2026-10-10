import { configure, setIf } from '../../engine/testing/fixtures';
import { hostname, ipPlan } from '../../topologies/jodhpur/plan';
import * as C from '../framework/checks';
import type { Lab } from '../framework/types';

/**
 * IP-MPLS labs for lessons B1–B4 (build phase P4) on the generated Jodhpur
 * division topologies. Checks read engine state only. Teaching design on the
 * track map — not the real RailTel / NWR network.
 */

const CORE: Lab['requiredModules'] = ['topology', 'physical', 'sim', 'ip', 'ospf'];
const MPLS: Lab['requiredModules'] = [...CORE, 'mpls'];
const CONF = ['enable', 'configure terminal'];
const lo = (code: string) => ipPlan().loopbacks.get(code)!;
const fec = (code: string) => `${lo(code)}/32`;

// ---------------------------------------------------------------------------
// LB1.1 Commission a station router (B1)
// ---------------------------------------------------------------------------

const b1: Lab = {
  id: 'LB1.1',
  part: 'B',
  level: 1,
  order: 1,
  lessonId: 'B1',
  title: 'Commission BNO-LER (station router basics)',
  scenario:
    'Banar (BNO) par naya NEON-LER station router laga hai — factory default. JU aur RKB taraf ka fibre aur Jajiwal (JWL) taraf ka fibre already patch hai. Division IP plan ke hisaab se loopback aur dono core links address karo, neighbours tak ping karo, aur config save karna mat bhoolna — warna power cycle par sab gaya.',
  concept:
    'Service-provider router par sabse pehle: Loopback0 (router ki pehchaan, /32, kabhi down nahi hota), core links (point-to-point /31 — sirf 2 address, broadcast nahi), aur "no shutdown".\n' +
    'Interface naming slot/sub-slot/port: Te0/0/0 = 10G port. NEON ka asli CLI public nahi, isliye simulator generic SP CLI (IOS-XE style) use karta hai.\n' +
    'Running-config RAM mein hota hai; "write memory" se startup-config (NVRAM) mein jaata hai. Save na kiya to reload par config gayab.\n' +
    'Railway analogy: naye station par equipment lagane ke baad "charge handing over" register mein entry — tabhi woh official hai.',
  objectives: ['Loopback0 per the IP plan', 'Address both core links (/31)', 'Reach both neighbours', 'Save the configuration'],
  topologyId: 'lab-b1-bno',
  requiredModules: CORE,
  plan: {
    headers: ['Interface', 'Faces', 'Address'],
    rows: [
      ['Loopback0', '—', `${lo('BNO')}/32`],
      ['Te0/0/0', 'RKB-LSR (10.255.1.2)', '10.255.1.3/31'],
      ['Te0/0/1', 'JWL-LER (10.255.1.5)', '10.255.1.4/31'],
    ],
  },
  tasks: [
    { id: 't1', text: `Configure Loopback0 ${lo('BNO')}/32 on BNO-LER.`, check: C.ipInSubnet('BNO-LER', 'Loopback0', `${lo('BNO')}/32`), points: 15 },
    {
      id: 't2',
      text: 'Address Te0/0/0 (towards RKB) and Te0/0/1 (towards JWL) with their /31 addresses and bring them up.',
      check: C.all(C.ipInSubnet('BNO-LER', 'Te0/0/0', '10.255.1.2/31'), C.ipInSubnet('BNO-LER', 'Te0/0/1', '10.255.1.4/31')),
      points: 20,
    },
    {
      id: 't3',
      text: 'From BNO-LER, ping RKB-LSR (10.255.1.2) and JWL-LER (10.255.1.5).',
      check: C.all(C.pingSucceeds('BNO-LER', '10.255.1.2'), C.pingSucceeds('BNO-LER', '10.255.1.5')),
      points: 15,
    },
    {
      id: 't4',
      text: 'Save the running configuration of BNO-LER.',
      check: C.all(C.ipInSubnet('BNO-LER', 'Loopback0', `${lo('BNO')}/32`), C.configSaved('BNO-LER')),
      points: 10,
    },
  ],
  hints: [
    [
      'enable → configure terminal → interface loopback0 → ip address ' + lo('BNO') + ' 255.255.255.255',
      'A /32 mask is 255.255.255.255. Check with "show ip interface brief".',
    ],
    [
      'interface te0/0/0 → ip address 10.255.1.3 255.255.255.254 → no shutdown',
      'A /31 mask is 255.255.255.254: both addresses are usable on a point-to-point link (RFC 3021).',
    ],
    [
      'From BNO-LER (privileged EXEC): ping 10.255.1.2, then ping 10.255.1.5',
      'The first packet may be lost while ARP resolves; the last ping counts.',
    ],
    ['write memory (or copy running-config startup-config)', '"show startup-config" should now match the running config.'],
  ],
  breakFix: {
    complaint:
      'Control JU: "BNO ka JWL taraf link down dikh raha hai. Raat ko kisi ne port test karne ke liye band kiya tha — aur reload ke baad bhi wahi haal hai."',
    apply: (t) =>
      configure(t, 'BNO-LER', (c) => {
        setIf(c, 'Te0/0/1', { shutdown: true });
        if (c.startup) c.startup.interfaces['Te0/0/1'] = { ...c.startup.interfaces['Te0/0/1'], shutdown: true };
      }),
    check: C.all(C.pingSucceeds('BNO-LER', '10.255.1.5'), C.configSaved('BNO-LER')),
    hints: [
      '"show ip interface brief": which interface is administratively down?',
      'no shutdown on it, test the ping, then save — otherwise the next reload brings the fault back.',
    ],
    fix: { cli: { 'BNO-LER': [...CONF, 'interface te0/0/1', 'no shutdown', 'end', 'write memory'] }, pings: [['BNO-LER', '10.255.1.5']] },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Why is the router identity put on a loopback and not on a fibre interface?',
      options: ['Loopbacks are faster', 'A loopback stays up while any path to the router exists', 'Loopbacks need no IP', 'It saves ports'],
      correctIndex: 1,
      explanation: 'A fibre cut takes an interface address down; the loopback stays reachable over the other path.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'How many usable host addresses does a /31 have on a point-to-point link?',
      options: ['0', '1', '2', '4'],
      correctIndex: 2,
      explanation: 'RFC 3021: no network/broadcast on /31, both addresses are hosts.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'You configured everything but did not save. The router reloads. What happens?',
      options: ['Nothing changes', 'The running config is lost; startup-config is loaded', 'The router asks to save', 'Only interfaces are lost'],
      correctIndex: 1,
      explanation: 'Running config lives in RAM; only startup-config survives a reload.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'In "Te0/0/1", what does Te mean?',
      options: ['Telnet', 'TenGigabitEthernet (10G port)', 'Tunnel', 'Test port'],
      correctIndex: 1,
      explanation: 'Te = 10 Gbit/s Ethernet; numbers are slot/sub-slot/port.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the lab, run "show ip interface brief" on BNO-LER. What does the Loopback0 line show?',
      options: [`${lo('BNO')}, up / up`, 'unassigned, up / up', `${lo('BNO')}, administratively down`, 'Loopback0 is not listed'],
      correctIndex: 0,
      explanation: 'A configured loopback is always up/up (unless shut down).',
    },
  ],
  estMinutes: 35,
  fieldNote:
    'Real gear: NEON routers have their own CLI (not public); real commissioning follows the OEM manual, the zonal IP plan and a MOP with rollback. Interface names here follow the generic SP CLI, not NEON naming.\nInterview questions: "Loopback kyon?", "/31 kab use karte hain?", "Running vs startup config?"',
  solution: {
    cli: {
      'BNO-LER': [
        ...CONF,
        'interface loopback0',
        `ip address ${lo('BNO')} 255.255.255.255`,
        'interface te0/0/0',
        'ip address 10.255.1.3 255.255.255.254',
        'no shutdown',
        'interface te0/0/1',
        'ip address 10.255.1.4 255.255.255.254',
        'no shutdown',
        'end',
        'write memory',
      ],
    },
    pings: [
      ['BNO-LER', '10.255.1.2'],
      ['BNO-LER', '10.255.1.5'],
    ],
  },
};

// ---------------------------------------------------------------------------
// LB2.1 IGP for the core (B2)
// ---------------------------------------------------------------------------

const WEST = ['LN', 'SMR', 'BME', 'MJ', 'BLDI'].map((c) => hostname(c));
const OSPF_ALL = ['router ospf 1', 'network 10.0.0.0 0.255.255.255 area 0', 'end'];

const b2: Lab = {
  id: 'LB2.1',
  part: 'B',
  level: 2,
  order: 1,
  lessonId: 'B2',
  title: 'Bring the West side into the core IGP (J1)',
  scenario:
    'J1 core par OSPF JU se MTD/DNA/PLC tak chal raha hai, par Luni (LN), Samdari (SMR), Barmer (BME), Marwar Jn (MJ) aur Bhildi (BLDI) ke routers abhi OSPF mein nahi hain — Barmer ka loopback JU se dikhta hi nahi. MPLS ke liye pehli shart: har loopback IGP se reachable.',
  concept:
    'MPLS core ka IGP (OSPF ya IS-IS) ek hi kaam karta hai: har router ka loopback /32 sab ko pata ho, aur raasta sabse sasta ho. Customer routes IGP mein nahi daalte — woh BGP/VRF ka kaam hai (B5–B6).\n' +
    'Router-ID = loopback; network statement se loopback aur core links OSPF mein. Reference bandwidth badhao (10G/100G links) taaki cost sahi bane.\n' +
    'Neighbour FULL na ho to: area, subnet, hello/dead, MTU mismatch (EXSTART par atakna) check karo.\n' +
    'Railway analogy: control chart par har station ka naam hona zaroori — tabhi section controller usse path de sakta hai.',
  objectives: ['OSPF on LN, SMR, BME, MJ, BLDI', 'Loopbacks reachable from JU', 'End-to-end ping JU → BME loopback'],
  topologyId: 'lab-b2-core',
  requiredModules: CORE,
  plan: {
    headers: ['Router', 'Loopback0', 'Neighbours'],
    rows: [
      ['LN-LSR', lo('LN'), 'JU, MJ, SMR'],
      ['SMR-LSR', lo('SMR'), 'LN, BME, BLDI'],
      ['BME-LSR', lo('BME'), 'SMR'],
      ['MJ-LER', lo('MJ'), 'LN'],
      ['BLDI-LER', lo('BLDI'), 'SMR'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Run OSPF area 0 on the West routers so that JU–LN, LN–SMR, SMR–BME, LN–MJ and SMR–BLDI are FULL.',
      check: C.all(
        C.ospfNeighborFull('JU-LSR', 'LN-LSR'),
        C.ospfNeighborFull('LN-LSR', 'SMR-LSR'),
        C.ospfNeighborFull('SMR-LSR', 'BME-LSR'),
        C.ospfNeighborFull('LN-LSR', 'MJ-LER'),
        C.ospfNeighborFull('SMR-LSR', 'BLDI-LER'),
      ),
      points: 25,
    },
    {
      id: 't2',
      text: 'JU-LSR must learn every West loopback (/32) via OSPF.',
      check: C.all(...['LN', 'SMR', 'BME', 'MJ', 'BLDI'].map((c) => C.routeExists('JU-LSR', fec(c), 'ospf'))),
      points: 15,
    },
    { id: 't3', text: `Ping BME-LSR's loopback (${lo('BME')}) from JU-LSR.`, check: C.pingSucceeds('JU-LSR', lo('BME')), points: 15 },
  ],
  hints: [
    [
      'On each West router: router ospf 1 → network 10.0.0.0 0.255.255.255 area 0 (covers the loopback and the 10.254.0.x core links).',
      'Optional but good practice: router-id <its loopback>, and auto-cost reference-bandwidth 100000. Check with "show ip ospf neighbor".',
    ],
    [
      '"show ip route ospf" on JU-LSR: look for the 10.0.x.y/32 loopbacks of LN, SMR, BME, MJ and BLDI.',
      'A missing one = that router is not in OSPF yet, or its loopback is not covered by a network statement.',
    ],
    [`On JU-LSR (privileged EXEC): ping ${lo('BME')}`],
  ],
  breakFix: {
    complaint:
      'NOC JU: "Barmer (BME) ka loopback route gayab hai. SMR par show ip ospf neighbor mein BME EXSTART par atka hai. Kal BME taraf ek naya transponder laga tha."',
    // Te0/0/1 is SMR-LSR's port towards BME-LSR in the generated J1 core.
    apply: (t) => configure(t, 'SMR-LSR', (c) => setIf(c, 'Te0/0/1', { mtu: 1400 })),
    check: C.all(C.ospfNeighborFull('SMR-LSR', 'BME-LSR'), C.routeExists('JU-LSR', fec('BME'), 'ospf')),
    hints: [
      '"show ip ospf neighbor" on SMR-LSR: EXSTART usually means an MTU mismatch. Compare "show running-config" of both ends of the SMR–BME link.',
      'Remove the odd value on SMR-LSR: interface … → no ip mtu.',
    ],
    fix: { cli: { 'SMR-LSR': [...CONF, 'interface te0/0/1', 'no ip mtu', 'end'] } },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Which prefixes must the core IGP carry for MPLS?',
      options: ['All customer LAN routes', 'Loopbacks and core link addresses of the PE/P routers', 'Internet routes', 'Only default route'],
      correctIndex: 1,
      explanation: 'LDP needs IGP routes to the loopbacks (FECs and transport addresses); customer routes go into VRFs via BGP.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Two OSPF neighbours are stuck in EXSTART. Most likely cause?',
      options: ['Area mismatch', 'MTU mismatch', 'Duplicate hostname', 'Wrong DNS'],
      correctIndex: 1,
      explanation: 'DBD exchange fails when interface MTUs differ.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Why raise "auto-cost reference-bandwidth" on a 10G/100G core?',
      options: ['To save CPU', 'So 1G, 10G and 100G links get different costs instead of all cost 1', 'It is required for LDP', 'To enable IS-IS'],
      correctIndex: 1,
      explanation: 'With the default 100 Mbit/s every link ≥ 100M has cost 1.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'Per the division design, the West control board would be which OSPF area in J4?',
      options: ['0', '1', '3', '4'],
      correctIndex: 2,
      explanation: 'North 1, Central 2, West 3, East 4; the JU core is area 0 (see the Jodhpur plan page).',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the lab, run "show ip ospf neighbor" on SMR-LSR. How many neighbours are listed?',
      options: ['1', '2', '3', '4'],
      correctIndex: 2,
      explanation: 'LN-LSR, BME-LSR and BLDI-LER.',
    },
  ],
  estMinutes: 40,
  fieldNote:
    'Real gear: J1 links here are logical express paths through the intermediate POPs (km = route length); in the field each span is a separate OFC hop (see J2/J4). Real core designs add BFD for fast failure detection and authentication on OSPF.\nInterview questions: "IGP mein customer routes kyon nahi?", "EXSTART ka matlab?", "Reference bandwidth kyon badhate hain?"',
  solution: { cli: Object.fromEntries(WEST.map((n) => [n, [...CONF, ...OSPF_ALL]])), pings: [['JU-LSR', lo('BME')]] },
};

// ---------------------------------------------------------------------------
// LB3.1 First LSP JU → DNA (B3)
// ---------------------------------------------------------------------------

const PATH = ['JU', 'RKB', 'PPR', 'MTD', 'DNA'].map((c) => hostname(c));

const b3: Lab = {
  id: 'LB3.1',
  part: 'B',
  level: 3,
  order: 1,
  lessonId: 'B3',
  title: 'First LSP: JU → RKB → PPR → MTD → DNA',
  scenario:
    'J1 core par OSPF chal raha hai, par packets abhi plain IP mein route ho rahe hain. CAMTECH case study ki tarah JU se Degana (DNA) tak label switched path banao: JU, RKB, PPR, MTD aur DNA par MPLS chalu karo, aur dekho kaun label push, swap aur pop karta hai.',
  concept:
    'MPLS mein packet ke aage 4-byte label lagta hai (20-bit label, 3-bit TC/EXP, 1-bit bottom-of-stack, 8-bit TTL). Ingress LER label push karta hai, beech ke LSR sirf label swap karte hain (IP header dekhte bhi nahi), aur aakhri se pehla router label pop kar deta hai — PHP (penultimate hop popping), kyunki egress ne implicit-null (label 3) advertise kiya.\n' +
    'FEC = ek hi tarah forward hone wale packets ka group; yahan har loopback /32 ek FEC.\n' +
    'LIB = sab neighbours se mile labels; LFIB = sirf best next-hop ka label (forwarding table).\n' +
    'Railway analogy: label = rake ka route card — har junction par card badal jaata hai (swap), aakhri junction card nikaal leta hai (pop), destination station ko sirf parcel milta hai.',
  objectives: ['Enable MPLS on the JU–DNA path', 'LDP sessions on every hop', 'PHP at MTD for DNA’s loopback', 'Labelled traffic and an LSP ping'],
  topologyId: 'lab-b3-core',
  requiredModules: MPLS,
  plan: {
    headers: ['Hop', 'Router', 'Loopback (FEC)', 'Role for FEC ' + fec('DNA')],
    rows: [
      ['1', 'JU-LSR', lo('JU'), 'ingress: push'],
      ['2', 'RKB-LSR', lo('RKB'), 'swap'],
      ['3', 'PPR-LSR', lo('PPR'), 'swap'],
      ['4', 'MTD-LSR', lo('MTD'), 'penultimate: pop (PHP)'],
      ['5', 'DNA-LSR', lo('DNA'), 'egress (advertises implicit-null)'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Enable MPLS (LDP) so that the sessions JU–RKB, RKB–PPR, PPR–MTD and MTD–DNA are operational.',
      check: C.all(
        C.ldpSessionUp('JU-LSR', 'RKB-LSR'),
        C.ldpSessionUp('RKB-LSR', 'PPR-LSR'),
        C.ldpSessionUp('PPR-LSR', 'MTD-LSR'),
        C.ldpSessionUp('MTD-LSR', 'DNA-LSR'),
      ),
      points: 25,
    },
    {
      id: 't2',
      text: `MTD-LSR must pop the label for DNA's loopback (${fec('DNA')}) — penultimate hop popping.`,
      check: C.phpOnPenultimate(PATH, fec('DNA')),
      points: 15,
    },
    {
      id: 't3',
      text: `JU-LSR pushes a label for ${fec('DNA')}; ping DNA's loopback from JU-LSR.`,
      check: C.all(C.labelledPath('JU-LSR', fec('DNA')), C.pingSucceeds('JU-LSR', lo('DNA'))),
      points: 15,
    },
    { id: 't4', text: `Run an LSP ping from JU-LSR to ${fec('DNA')}.`, check: C.lspPingSucceeds('JU-LSR', fec('DNA')), points: 15 },
  ],
  hints: [
    [
      'On each of the five routers, on the interfaces of the path: mpls ip. Shortcut: router ospf 1 → mpls ldp autoconfig (all OSPF interfaces).',
      'Good practice: mpls ldp router-id loopback0 force. Check with "show mpls ldp neighbor" (State: Oper).',
    ],
    [
      `"show mpls forwarding-table" on MTD-LSR: the ${fec('DNA')} line should say "Pop Label".`,
      'Why? DNA advertised implicit-null for its own loopback ("show mpls ldp bindings" on MTD).',
    ],
    [
      `"show mpls forwarding-table ${lo('DNA')}" on JU-LSR, then ping ${lo('DNA')}.`,
      `"traceroute ${lo('DNA')}" shows "[MPLS: Label …]" on each LSR hop.`,
    ],
    [`ping mpls ipv4 ${fec('DNA')}`],
  ],
  breakFix: {
    complaint: 'MTD NOC: "JU se Degana ka LSP ping fail ho raha hai, par normal ping chal raha hai! PPR par kal ek interface replace hua tha."',
    apply: (t) =>
      configure(t, 'PPR-LSR', (c) => {
        for (const ic of Object.values(c.interfaces)) delete ic.mplsIp;
        if (c.ospf) c.ospf.ldpAutoconfig = false;
      }),
    check: C.all(C.ldpSessionUp('PPR-LSR', 'MTD-LSR'), C.lspPingSucceeds('JU-LSR', fec('DNA'))),
    hints: [
      '"show mpls ldp neighbor" on PPR-LSR: who is missing? "show mpls interfaces".',
      'Enable "mpls ip" on PPR\'s core interfaces again (or mpls ldp autoconfig), then LSP ping from JU-LSR.',
    ],
    fix: { cli: { 'PPR-LSR': [...CONF, 'router ospf 1', 'mpls ldp autoconfig', 'end'] }, lsp: [['JU-LSR', fec('DNA')]] },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'How many bits is the MPLS label field?',
      options: ['8', '16', '20', '32'],
      correctIndex: 2,
      explanation: 'Label 20 bits, TC 3, S 1, TTL 8 = 32 bits per entry.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Why does the penultimate router pop the label?',
      options: [
        'To save bandwidth on every link',
        'Because the egress advertised implicit-null, so it does only one IP lookup',
        'Because TTL expired',
        'To hide the core',
      ],
      correctIndex: 1,
      explanation: 'PHP saves the egress a label lookup followed by an IP lookup.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'What does a transit LSR look at to forward a labelled packet?',
      options: ['Destination IP', 'Top label (LFIB)', 'Source MAC', 'DSCP only'],
      correctIndex: 1,
      explanation: 'Label switching: in-label → out-label + next hop.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'LIB vs LFIB?',
      options: ['Same thing', 'LIB = all bindings from all peers; LFIB = the one used for forwarding', 'LFIB = BGP table', 'LIB = ARP table'],
      correctIndex: 1,
      explanation: 'Liberal retention keeps all bindings; only the next-hop’s label is installed.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: `After the lab, run "show mpls forwarding-table" on MTD-LSR. What is the Outgoing Label for ${fec('DNA')}?`,
      options: ['16', 'Pop Label', 'No Label', 'exp-null'],
      correctIndex: 1,
      explanation: 'MTD is the penultimate hop towards DNA; DNA advertised implicit-null.',
    },
  ],
  estMinutes: 50,
  fieldNote:
    'Real gear: labels here are allocated from 16 upwards in prefix order per router; real routers allocate in learning order, so numbers differ — only their meaning matters. LDP is computed (no Hello/Init/Mapping messages or timers).\nInterview questions: "PHP kya hai?", "LIB vs LFIB?", "MPLS label header ke fields?"',
  solution: {
    cli: Object.fromEntries(PATH.map((n) => [n, [...CONF, 'mpls ldp router-id loopback0 force', 'router ospf 1', 'mpls ldp autoconfig', 'end']])),
    pings: [['JU-LSR', lo('DNA')]],
    lsp: [['JU-LSR', fec('DNA')]],
  },
};

// ---------------------------------------------------------------------------
// LB4.1 LDP troubleshooting on J2 (B4)
// ---------------------------------------------------------------------------

const b4: Lab = {
  id: 'LB4.1',
  part: 'B',
  level: 4,
  order: 1,
  lessonId: 'B4',
  title: 'LDP troubleshooting on J2 (JU → FL)',
  scenario:
    'J2 (JU–MTD–DNA–FL) par MPLS chalu hai, par NOC ke paas do shikayat hain: Gotan (GOTN) aur Jogi Magra (JOM) ke beech LDP neighbour nahi ban raha, aur Kheduli (KQW) ke dono LDP sessions down hain. JU se Phulera (FL) ka LSP ping fail. Dono faults dhoondho aur theek karo.',
  concept:
    'LDP troubleshooting ka kram:\n' +
    '1) Discovery: dono taraf interface par "mpls ip"? ("show mpls interfaces", "show mpls ldp discovery")\n' +
    '2) Session: peer ka LDP router-ID (transport address) routing table mein hai? (loopback IGP mein advertise?)\n' +
    '3) Bindings: "show mpls ldp bindings" mein remote label aaya?\n' +
    '4) Forwarding: "show mpls forwarding-table" mein "No Label" kahan hai?\n' +
    '5) Test: "ping mpls ipv4" / "traceroute mpls ipv4".\n' +
    'LDP-IGP sync: LDP session na ho to IGP us link ko max cost deta hai — traffic label-less link par black-hole nahi hota.\n' +
    'Railway analogy: block instrument dono stations par "line clear" dene ke liye dono taraf chalu hona chahiye (mpls ip dono taraf), aur telephone line (transport address tak route) bhi theek ho.',
  objectives: ['Fix the GOTN–JOM discovery fault', 'Fix the KQW session fault', 'End-to-end LSP JU → FL'],
  topologyId: 'lab-b4-j2',
  requiredModules: MPLS,
  plan: {
    headers: ['Item', 'Value'],
    rows: [
      ['JU-LSR loopback', lo('JU')],
      ['FL-LER loopback (FEC)', fec('FL')],
      ['KQW-LER loopback', lo('KQW')],
      ['Path', 'JU · RKB · BNO · … · MTD · KQW · … · DNA · … · FL (26 hops)'],
    ],
  },
  tasks: [
    { id: 't1', text: 'Bring up the LDP session between GOTN-LER and JOM-LER.', check: C.ldpSessionUp('GOTN-LER', 'JOM-LER'), points: 20 },
    {
      id: 't2',
      text: 'Bring up both LDP sessions of KQW-LER (to MTD-LSR and REN-LER).',
      check: C.all(C.ldpSessionUp('KQW-LER', 'MTD-LSR'), C.ldpSessionUp('KQW-LER', 'REN-LER')),
      points: 20,
    },
    { id: 't3', text: `LSP ping from JU-LSR to FL-LER (${fec('FL')}) must succeed.`, check: C.lspPingSucceeds('JU-LSR', fec('FL')), points: 15 },
    {
      id: 't4',
      text: `Run an MPLS traceroute from JU-LSR to ${fec('FL')} that reaches FL.`,
      check: C.lspPingSucceeds('JU-LSR', fec('FL'), 'trace'),
      points: 10,
    },
  ],
  hints: [
    [
      '"show mpls ldp discovery" on GOTN-LER and JOM-LER: on which interface is GOTN only "xmit" with nobody, or not listed at all?',
      '"show mpls interfaces" on GOTN-LER: one core interface is missing "mpls ip".',
    ],
    [
      '"show mpls ldp neighbor" on MTD-LSR shows the reason under "hellos seen but no session".',
      `Is ${lo('KQW')}/32 in MTD's routing table? On KQW-LER add the loopback to OSPF: router ospf 1 → network ${lo('KQW')} 0.0.0.0 area 0.`,
    ],
    [`On JU-LSR: ping mpls ipv4 ${fec('FL')}`],
    [`traceroute mpls ipv4 ${fec('FL')} — 'L' = labelled transit hop, '!' = egress reached.`],
  ],
  breakFix: {
    complaint:
      'Night shift NOC: "MTD-LSR ke saare LDP sessions down! OSPF neighbours FULL hain. Shaam ko kisi ne MTD par OSPF network statements \'cleanup\' kiye the."',
    apply: (t) =>
      configure(t, 'MTD-LSR', (c) => {
        c.ospf!.networks = c.ospf!.networks.filter((n) => n.address !== lo('MTD'));
      }),
    check: C.all(C.ldpSessionUp('MTD-LSR', 'JOM-LER'), C.lspPingSucceeds('JU-LSR', fec('FL'))),
    hints: [
      'Transport address = LDP router-ID = Loopback0. Can the neighbours reach MTD\'s loopback? ("show ip route" on JOM-LER)',
      `router ospf 1 → network ${lo('MTD')} 0.0.0.0 area 0 on MTD-LSR, then LSP ping again.`,
    ],
    fix: { cli: { 'MTD-LSR': [...CONF, 'router ospf 1', `network ${lo('MTD')} 0.0.0.0 area 0`, 'end'] }, lsp: [['JU-LSR', fec('FL')]] },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'LDP hellos are seen but the session stays down. First check?',
      options: ['DNS', 'Is the peer’s LDP router-ID (transport address) reachable via the IGP?', 'QoS', 'Duplex'],
      correctIndex: 1,
      explanation: 'The TCP session is built between the transport addresses.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: '"No Label" in the forwarding table means…',
      options: ['Label 0', 'The next hop gave no binding — the packet leaves unlabelled', 'PHP', 'Error'],
      correctIndex: 1,
      explanation: 'The LSP is broken there; labelled services (VPNs) fail at that hop.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Why use LDP-IGP synchronization?',
      options: ['To speed up OSPF', 'So the IGP avoids a link until LDP is up on it (no label black-hole)', 'To encrypt LDP', 'To elect a DR'],
      correctIndex: 1,
      explanation: 'With sync, the link carries max metric while LDP is not operational.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'Normal ping works but LSP ping fails. What does this tell you?',
      options: ['Everything is fine', 'IP routing works, but the label path is broken somewhere', 'The destination is down', 'ICMP is blocked'],
      correctIndex: 1,
      explanation: 'LSP ping travels with labels and fails at a hop with no label.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: `After the fix, run "traceroute mpls ipv4 ${fec('FL')}" on JU-LSR. How many lines start with "L" before the "!" line?`,
      options: ['23', '24', '25', '26'],
      correctIndex: 2,
      explanation: 'J2 has 27 POPs from JU to FL: 25 transit LSRs answer "L", FL answers "!".',
    },
  ],
  estMinutes: 55,
  fieldNote:
    'Real gear: LDP sessions use TCP 646 and hellos UDP 646; here they are computed, so there are no timers or flaps. Label numbers are local to each router. MRU, DDMAP and multipath details of real MPLS traceroute are not simulated.\nInterview questions: "LDP session kaise banta hai?", "No Label ka matlab?", "LDP-IGP sync kyon?"',
  solution: {
    cli: {
      'GOTN-LER': [...CONF, 'interface te0/0/1', 'mpls ip', 'end'],
      'KQW-LER': [...CONF, 'router ospf 1', `network ${lo('KQW')} 0.0.0.0 area 0`, 'end'],
    },
    lsp: [['JU-LSR', fec('FL')]],
    lspTrace: [['JU-LSR', fec('FL')]],
  },
};

export const MPLS_LABS: Lab[] = [b1, b2, b3, b4];
