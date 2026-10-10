import { configure, setIf } from '../../engine/testing/fixtures';
import { updateDevice } from '../../model/topologyOps';
import type { Topology } from '../../model/types';
import { ASN, lo, rtOf, vrfLines, vrfNet } from '../../topologies/bgpLabs';
import { CAP_PES, DL_SERVICE, DL_VC, UTS_SRV } from '../../topologies/grandCapstone';
import { hostname } from '../../topologies/jodhpur/plan';
import { NMS_IP, POLL } from '../../topologies/opsLabs';
import * as C from '../framework/checks';
import type { BreakFix, Lab } from '../framework/types';

/**
 * LB15.1 grand capstone for lesson B15 (build phase P9): the J2 JU–FL
 * backbone with every POP. Build the services, then close fault tickets drawn
 * by seed from a catalog. Teaching design on the track map.
 */

const CONF = ['enable', 'configure terminal'];
const h = hostname;
const JU = h('JU');
const MTD = h('MTD');
const DNA = h('DNA');
const FL = h('FL');
/** Every router on J2, JU to FL. */
export const J2_ROUTERS = [
  'JU',
  'RKB',
  'BNO',
  'JWL',
  'AAS',
  'KSW',
  'PPR',
  'SWF',
  'UMED',
  'KXG',
  'GOTN',
  'JOM',
  'MTD',
  'KQW',
  'REN',
  'JAC',
  'JACN',
  'DNA',
  'GCH',
  'BSRL',
  'BOW',
  'MKN',
  'KMNC',
  'NAC',
  'SBR',
  'GDH',
  'FL',
].map((c) => h(c));
const BASELINE = [`snmp-server community ${POLL} ro`, `logging host ${NMS_IP}`];
const utsHost = (code: string) => `${vrfNet(code, 'UTS')}.11`;
const svc = (code: string) => CAP_PES.find((p) => p[0] === code)![3];
const byName = (t: Topology, n: string) => t.devices.find((d) => d.name === n)!.id;

const peLines = (code: string, port: string) => [
  ...vrfLines(code, 'UTS'),
  `interface ${port}`,
  'vrf forwarding UTS',
  `ip address ${vrfNet(code, 'UTS')}.1 255.255.255.0`,
  'no shutdown',
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
  'exit',
];

function solutionCli(): Record<string, string[]> {
  const cli: Record<string, string[]> = Object.fromEntries(J2_ROUTERS.map((r) => [r, [...CONF, ...BASELINE]]));
  cli[h('KXG')].push('interface te0/0/1', 'mpls ip', 'exit');
  for (const [code, pe, port] of CAP_PES) cli[pe].push(...peLines(code, port));
  cli[MTD].push('interface gi0/3/2', `xconnect ${lo('JU')} ${DL_VC} encapsulation mpls`, 'exit');
  for (const r of J2_ROUTERS) cli[r].push('end');
  return cli;
}

const T = (complaint: string, apply: BreakFix['apply'], check: BreakFix['check'], hints: string[], fix: BreakFix['fix']): BreakFix => ({
  complaint,
  apply,
  check,
  hints,
  fix,
});

const allGreen = C.all(C.allServicesUp(), C.nmsNoAlarms());

/** Fault catalog (P9): each run draws 10 of these in an order fixed by its seed. */
export const GRAND_TICKETS: BreakFix[] = [
  T(
    'Test Room JU: "MTD ke UTS counters aur Data Logger dono band. Raat ko MTD par JOM wali fibre ka patch-cord badla gaya."',
    (t) => configure(t, MTD, (c) => setIf(c, 'Te0/0/0', { mplsIp: undefined })),
    C.all(C.ldpOnAllAdjacencies(), allGreen),
    ['OSPF neighbours are FULL, so look one layer up: "show mpls ldp neighbor" on MTD-LSR.', 'On MTD-LSR: interface te0/0/0 → mpls ip.'],
    { cli: { [MTD]: [...CONF, 'interface te0/0/0', 'mpls ip', 'end'] } },
  ),
  T(
    'DNA booking: "DNA ke UTS counter server se connect nahi ho rahe. Baaki stations theek. Kal VRF ka audit hua tha."',
    (t) => configure(t, DNA, (c) => void (c.vrfs.UTS.importRts = [`${ASN}:199`])),
    C.serviceUp(svc('DNA')),
    [
      '"show ip route vrf UTS" on DNA-LSR: is the JU server subnet there?',
      '"show vrf detail UTS" / running-config: compare the import route-target with the plan.',
    ],
    {
      cli: {
        [DNA]: [
          ...CONF,
          'vrf definition UTS',
          'address-family ipv4',
          `no route-target import ${ASN}:199`,
          `route-target import ${rtOf('UTS')}`,
          'end',
        ],
      },
    },
  ),
  T(
    'NOC JU: "PPR ke aage ke saare stations NMS par red. PPR aur SWF dono par power aur link theek."',
    (t) => configure(t, h('PPR'), (c) => setIf(c, 'Te0/0/1', { ospfHello: 5 })),
    allGreen,
    [
      'Link up, everything behind PPR unreachable: "show ip ospf neighbor" on PPR-LSR and SWF-LER.',
      '"show ip ospf interface te0/0/1" on both: compare Hello/Dead timers.',
    ],
    { cli: { [h('PPR')]: [...CONF, 'interface te0/0/1', 'no ip ospf hello-interval', 'end'] } },
  ),
  T(
    'FL station: "Phulera ka UTS band. DNA tak sab theek. GCH par kisi ne interface tuning ki thi."',
    (t) => configure(t, DNA, (c) => setIf(c, 'Te0/0/1', { mtu: 1400 })),
    C.serviceUp(svc('FL')),
    [
      '"show ip ospf neighbor" on DNA-LSR: the neighbour towards GCH is stuck before FULL.',
      'Compare "ip mtu" on DNA-LSR Te0/0/1 and GCH-LER Te0/0/0.',
    ],
    { cli: { [DNA]: [...CONF, 'interface te0/0/1', 'no ip mtu', 'end'] } },
  ),
  T(
    'NOC JU: "BOW ke aage MKN se FL tak sab unreachable. BOW par koi alarm LED nahi."',
    (t) => configure(t, h('BOW'), (c) => setIf(c, 'Te0/0/1', { shutdown: true })),
    C.serviceUp(svc('FL')),
    ['NMS root cause: a link is down at BOW. "show ip interface brief" on BOW-LER.', 'interface te0/0/1 → no shutdown.'],
    { cli: { [h('BOW')]: [...CONF, 'interface te0/0/1', 'no shutdown', 'end'] } },
  ),
  T(
    'SBR station master: "Equipment room mein UPS trip hua, router ki lights band." NMS: GDH aur FL unreachable.',
    (t) => updateDevice(t, byName(t, h('SBR')), { fault: { power: true } }),
    C.serviceUp(svc('FL')),
    ['NMS tab: POWER alarm on SBR-LER is the root cause.', 'Select SBR-LER → Fault injection → Restore power.'],
    { repair: [h('SBR')] },
  ),
  T(
    'NOC JU: "JWL ke dono taraf links down — field staff ne line card ka LED red bataya."',
    (t) => updateDevice(t, byName(t, h('JWL')), { fault: { cards: ['Te0/0/'] } }),
    allGreen,
    ['NMS: CARD-FAIL on JWL-LER is the root cause; everything behind JWL follows.', 'Select JWL-LER → Fault injection → Repair card.'],
    { repair: [h('JWL')] },
  ),
  T(
    'S&T MTD: "Data Logger ka data JU nahi pahunch raha. Aaj subah circuit ID badalne ka order aaya tha."',
    (t) => configure(t, MTD, (c) => setIf(c, 'Gi0/3/2', { xconnect: { peer: lo('JU'), vcId: 1310 } })),
    C.pwUp(MTD, JU, DL_VC),
    [
      '"show mpls l2transport vc" on MTD-LSR and JU-LSR: compare the VC IDs.',
      `On MTD-LSR gi0/3/2: no xconnect → xconnect ${lo('JU')} ${DL_VC} encapsulation mpls.`,
    ],
    { cli: { [MTD]: [...CONF, 'interface gi0/3/2', 'no xconnect', `xconnect ${lo('JU')} ${DL_VC} encapsulation mpls`, 'end'] } },
  ),
  T(
    'S&T MTD: "Data Logger link phir down. Vendor engineer ne port par jumbo frames enable kiye."',
    (t) => configure(t, MTD, (c) => setIf(c, 'Gi0/3/2', { l2Mtu: 1600 })),
    C.pwUp(MTD, JU, DL_VC),
    ['"show mpls l2transport vc detail" on MTD-LSR: look at the MTU of both ends.', 'interface gi0/3/2 → mtu 1500 (match JU).'],
    { cli: { [MTD]: [...CONF, 'interface gi0/3/2', 'mtu 1500', 'end'] } },
  ),
  T(
    'NMS cell: "DNA-LSR NMS par grey ho gaya — not managed. Services chal rahe hain."',
    (t) => configure(t, DNA, (c) => void delete c.mgmt.snmpCommunities[POLL]),
    C.nmsManaged(DNA),
    ['NMS device list: "not managed" means the polling community is missing on the device.', `On DNA-LSR: snmp-server community ${POLL} ro.`],
    { cli: { [DNA]: [...CONF, `snmp-server community ${POLL} ro`, 'end'] } },
  ),
  T(
    'NMS cell: "GCH-LER not managed. Kal kisi ne community string \'update\' ki."',
    (t) =>
      configure(t, h('GCH'), (c) => {
        delete c.mgmt.snmpCommunities[POLL];
        c.mgmt.snmpCommunities['RAILNMS-R0'] = 'ro';
      }),
    C.nmsManaged(h('GCH')),
    [
      '"show running-config | include snmp" on GCH-LER: read the community letter by letter.',
      `no snmp-server community RAILNMS-R0 → snmp-server community ${POLL} ro.`,
    ],
    { cli: { [h('GCH')]: [...CONF, 'no snmp-server community RAILNMS-R0', `snmp-server community ${POLL} ro`, 'end'] } },
  ),
  T(
    'Commercial MTD: "MTD counter se FL ke counter ka inter-station booking check fail. Dono ka JU server theek chal raha hai."',
    (t) => configure(t, JU, (c) => void (c.bgp!.neighbors[lo('FL')].rrClientVpnv4 = undefined)),
    C.pingSucceeds('MTD-UTS1', utsHost('FL')),
    [
      'Each PE reaches JU but not each other: who passes PE routes between PEs? "show ip route vrf UTS" on MTD-LSR.',
      `On JU-LSR: router bgp ${ASN} → address-family vpnv4 → neighbor ${lo('FL')} route-reflector-client. Then ping ${utsHost('FL')} from MTD-UTS1.`,
    ],
    {
      cli: { [JU]: [...CONF, `router bgp ${ASN}`, 'address-family vpnv4', `neighbor ${lo('FL')} route-reflector-client`, 'end'] },
      pings: [['MTD-UTS1', utsHost('FL')]],
    },
  ),
  T(
    'DNA booking: "UTS phir band. BGP wale engineer ne DNA par config \'cleanup\' kiya."',
    (t) => configure(t, DNA, (c) => void (c.bgp!.neighbors[lo('JU')].updateSource = undefined)),
    C.serviceUp(svc('DNA')),
    [
      '"show bgp vpnv4 unicast all summary" on JU-LSR: is DNA Established?',
      `On DNA-LSR: router bgp ${ASN} → neighbor ${lo('JU')} update-source loopback0.`,
    ],
    { cli: { [DNA]: [...CONF, `router bgp ${ASN}`, `neighbor ${lo('JU')} update-source loopback0`, 'end'] } },
  ),
  T(
    'MTD booking: "UTS counter ka gateway ping nahi ho raha — router par port ka config badla."',
    (t) => configure(t, MTD, (c) => setIf(c, 'Gi0/3/0', { vrf: undefined })),
    C.serviceUp(svc('MTD')),
    ['"show ip vrf interfaces" on MTD-LSR: is Gi0/3/0 in VRF UTS?', '"vrf forwarding UTS" removes the IP address — put both back.'],
    { cli: { [MTD]: [...CONF, 'interface gi0/3/0', 'vrf forwarding UTS', `ip address ${vrfNet('MTD', 'UTS')}.1 255.255.255.0`, 'end'] } },
  ),
  T(
    'FL station: "Phulera ka UTS aur NMS dono gaye. OSPF neighbour FULL dikha raha hai."',
    (t) => configure(t, FL, (c) => void (c.ospf!.networks = c.ospf!.networks.filter((n) => n.address !== lo('FL')))),
    C.serviceUp(svc('FL')),
    [
      'FULL but no LDP / BGP: can JU reach FL\'s loopback? "show ip route" on JU-LSR.',
      `On FL-LER: router ospf 1 → network ${lo('FL')} 0.0.0.0 area 0.`,
    ],
    { cli: { [FL]: [...CONF, 'router ospf 1', `network ${lo('FL')} 0.0.0.0 area 0`, 'end'] } },
  ),
  T(
    'FL station: "UTS band. Inter-division hand-off ki planning mein kisi ne FL ka BGP chheda."',
    (t) => configure(t, FL, (c) => void (c.bgp!.neighbors[lo('JU')].remoteAs = 65001)),
    C.serviceUp(svc('FL')),
    ['"show bgp vpnv4 unicast all summary" on FL-LER: what AS does it expect for JU?', `router bgp ${ASN} → neighbor ${lo('JU')} remote-as ${ASN}.`],
    { cli: { [FL]: [...CONF, `router bgp ${ASN}`, `neighbor ${lo('JU')} remote-as ${ASN}`, 'end'] } },
  ),
  T(
    'NMS cell: "MTD-LSR ke syslog messages aana band. Audit mein compliance fail."',
    (t) => configure(t, MTD, (c) => void (c.mgmt.loggingHosts = [])),
    C.configHasLines([MTD], [`^logging host ${NMS_IP.replace(/\./g, '\\.')}$`]),
    ['Automation tab → Compliance, or "show running-config | include logging" on MTD-LSR.', `logging host ${NMS_IP}`],
    { cli: { [MTD]: [...CONF, `logging host ${NMS_IP}`, 'end'] } },
  ),
  T(
    'MTD booking: "Sirf MTD ke counters JU server tak nahi pahunchte. Security team ne JU par ek naya filter lagaya."',
    (t) =>
      configure(t, JU, (c) => {
        c.acls['UTS-GUARD'] = {
          kind: 'extended',
          entries: [
            { action: 'deny', protocol: 'ip', src: { address: `${vrfNet('MTD', 'UTS')}.0`, wildcard: '0.0.0.255' } },
            { action: 'permit', protocol: 'ip' },
          ],
        };
        setIf(c, 'Gi0/3/1', { aclOut: 'UTS-GUARD' });
      }),
    C.pingSucceeds('MTD-UTS1', UTS_SRV),
    [
      'The NMS path service stays UP — it checks the routed path, not filters. Ping from MTD-UTS1 and read where it stops.',
      '"show ip interface gi0/3/1" on JU-LSR — any access list? interface gi0/3/1 → no ip access-group UTS-GUARD out, then ping again.',
    ],
    { cli: { [JU]: [...CONF, 'interface gi0/3/1', 'no ip access-group UTS-GUARD out', 'end'] }, pings: [['MTD-UTS1', UTS_SRV]] },
  ),
  T(
    'DNA booking: "Naya UTS terminal lagaya, network setting copy ki — ab server nahi milta."',
    (t) => configure(t, 'DNA-UTS1', (c) => void (c.defaultGateway = `${vrfNet('DNA', 'UTS')}.254`)),
    C.serviceUp(svc('DNA')),
    ['"ipconfig" on DNA-UTS1: is the gateway the PE address?', `Set the default gateway to ${vrfNet('DNA', 'UTS')}.1.`],
    { hosts: { 'DNA-UTS1': { ip: utsHost('DNA'), mask: '255.255.255.0', gateway: `${vrfNet('DNA', 'UTS')}.1` } } },
  ),
  T(
    'NOC JU: "Poora division NMS par red — JU ke bahar sab. RKB par kisi ne OSPF hardening ki."',
    (t) => configure(t, h('RKB'), (c) => void c.ospf!.passive.push('Te0/0/0')),
    allGreen,
    ['"show ip ospf interface" on RKB-LSR Te0/0/0: passive?', 'router ospf 1 → no passive-interface te0/0/0.'],
    { cli: { [h('RKB')]: [...CONF, 'router ospf 1', 'no passive-interface te0/0/0', 'end'] } },
  ),
  T(
    'FL booking: "UTS counter bahut slow, ticket print beech mein atak jaata hai." Router port par late collisions.',
    (t) => configure(t, FL, (c) => setIf(c, 'Gi0/1/0', { duplex: 'full' })),
    C.noDuplexMismatch(),
    ['Slow + late collisions = duplex. "show interfaces gi0/1/0" on FL-LER.', 'interface gi0/1/0 → duplex auto.'],
    { cli: { [FL]: [...CONF, 'interface gi0/1/0', 'duplex auto', 'end'] } },
  ),
  T(
    'NMS cell: "Sirf JU-LSR managed dikh raha hai, baaki 26 routers unreachable. Railway services chal rahi hain."',
    (t) => configure(t, JU, (c) => void (c.ospf!.networks = c.ospf!.networks.filter((n) => n.address !== '10.80.1.0'))),
    C.nmsManaged(FL),
    [
      '"unreachable" = the community is there but the NMS has no path. Is the NMS LAN 10.80.1.0/24 in OSPF? "show ip route 10.80.1.0" on FL-LER.',
      'On JU-LSR: router ospf 1 → network 10.80.1.0 0.0.0.255 area 0.',
    ],
    { cli: { [JU]: [...CONF, 'router ospf 1', 'network 10.80.1.0 0.0.0.255 area 0', 'end'] } },
  ),
  T(
    'NOC JU: "DNA ke aage GCH–FL ke saare LDP sessions gaye, OSPF FULL hai. Kal DNA par MPLS template push hua."',
    (t) => configure(t, DNA, (c) => setIf(c, 'Te0/0/1', { mplsIp: undefined })),
    C.all(C.ldpOnAllAdjacencies(), C.serviceUp(svc('FL'))),
    ['"show mpls interfaces" on DNA-LSR: which core link lost MPLS?', 'interface te0/0/1 → mpls ip.'],
    { cli: { [DNA]: [...CONF, 'interface te0/0/1', 'mpls ip', 'end'] } },
  ),
];

const b15: Lab = {
  id: 'LB15.1',
  part: 'B',
  level: 15,
  order: 1,
  lessonId: 'B15',
  title: 'Grand capstone: Jodhpur division backbone JU–FL',
  scenario:
    'Poora J2 section — JU se Phulera tak har station (27 routers). OSPF aur LDP chal rahe hain, lekin purane contractor ne ek label gap chhod diya hai. JU par route reflector, UTS server, NMS aur Data Logger server ready hain. Tumhara kaam: MTD, DNA aur FL ke UTS counters ko VPN se JU server tak jodna, MTD Data Logger ka VPWS, har router NMS par managed (SNMP + syslog), aur NMS dashboard bilkul saaf. Phir Test Room se seed ke hisaab se 10 fault tickets aayenge.',
  concept:
    'Capstone = sab kuch ek saath: IGP (OSPF) → labels (LDP) → services (L3VPN, VPWS) → operations (NMS, syslog).\n' +
    'Troubleshooting order hamesha neeche se upar: link/power → OSPF neighbour → LDP → BGP session → VRF/RT → service. NMS ka "root cause" alarm pehle dekho, impact alarms baad mein khud saaf ho jaate hain.\n' +
    'Seed: har attempt mein ticket alag order mein aate hain (catalog mein 20+ faults). Wahi seed dobara doge to wahi set milega — trainer aur trainee ek hi paper solve kar sakte hain.',
  objectives: [
    'Close the inherited label gap',
    'UTS VPN from MTD, DNA and FL to the JU server',
    'Data Logger VPWS MTD ↔ JU',
    'All 27 routers managed by JU-NMS, syslog to the NMS',
    'Clean NMS dashboard, then close 10 seeded fault tickets',
  ],
  topologyId: 'lab-b15-capstone',
  requiredModules: ['topology', 'physical', 'sim', 'ip', 'ospf', 'mpls', 'bgp', 'l2vpn', 'nms'],
  plan: {
    headers: ['Item', 'Value'],
    rows: [
      ['Route reflector', `JU-LSR ${lo('JU')} (AS ${ASN}), clients MTD / DNA / FL already configured on JU`],
      ['VRF UTS', `RD <PE loopback>:100, RT import/export ${rtOf('UTS')}`],
      ...CAP_PES.map(([code, pe, port]): [string, string] => [
        `${pe} ${port}`,
        `VRF UTS ${vrfNet(code, 'UTS')}.1/24 (counter ${code}-UTS1 = ${utsHost(code)})`,
      ]),
      ['UTS server', `JU-UTS-SRV ${UTS_SRV} (VRF UTS on JU)`],
      ['Data Logger', `MTD-LSR Gi0/3/2 ↔ JU-LSR Gi0/3/2, VPWS VC ${DL_VC} (JU side done)`],
      ['NMS baseline (every router)', BASELINE.join(' ; ')],
      ['Tip', 'Automation tab: push the baseline template to all routers at once'],
    ],
  },
  tasks: [
    { id: 't1', text: 'Every FULL OSPF adjacency on J2 also has an LDP session (no label gap).', check: C.ldpOnAllAdjacencies(), points: 15 },
    {
      id: 't2',
      text: `The UTS counters at MTD, DNA and FL reach JU-UTS-SRV (${UTS_SRV}) over the UTS VPN.`,
      check: C.all(...CAP_PES.map(([code]) => C.pingSucceeds(`${code}-UTS1`, UTS_SRV))),
      points: 25,
    },
    { id: 't3', text: `The Data Logger pseudowire MTD ↔ JU (VC ${DL_VC}) is UP.`, check: C.pwUp(MTD, JU, DL_VC), points: 15 },
    {
      id: 't4',
      text: `All 27 routers are managed by JU-NMS and send syslog to ${NMS_IP}.`,
      check: C.all(...J2_ROUTERS.map((r) => C.nmsManaged(r)), C.configHasLines(J2_ROUTERS, [`^logging host ${NMS_IP.replace(/\./g, '\\.')}$`])),
      points: 20,
    },
    { id: 't5', text: 'NMS dashboard: every railway service UP and no critical or major alarm.', check: allGreen, points: 15 },
  ],
  hints: [
    ['NMS tab or "show mpls ldp neighbor" along the chain: which OSPF neighbours have no LDP session?', 'On KXG-LER: interface te0/0/1 → mpls ip.'],
    [
      'On each PE: vrf definition UTS (rd, route-targets), interface → vrf forwarding UTS → ip address, router bgp 65000 → neighbor JU loopback (remote-as, update-source loopback0) → address-family vpnv4 activate + send-community extended → address-family ipv4 vrf UTS → redistribute connected.',
      'Then ping the server from each counter.',
    ],
    [`On MTD-LSR: interface gi0/3/2 → xconnect ${lo('JU')} ${DL_VC} encapsulation mpls`],
    ['Automation tab: a template with the two baseline lines, target all routers, Push. Then the NMS device list shows "managed".'],
    ['Root-cause alarms first; impact alarms (PW-DOWN, SERVICE-DOWN) clear by themselves.'],
  ],
  tickets: GRAND_TICKETS,
  ticketDraw: 10,
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'All services beyond one station go DOWN together. What do you check first?',
      options: ['VRF route-targets', 'Power / link / OSPF at the first station where things stop', 'SNMP', 'QoS'],
      correctIndex: 1,
      explanation: 'J2 is a chain: one broken hop cuts everything behind it. Start at the bottom layer at that point.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'OSPF is FULL on a link but the VPN beyond it fails. Likely cause?',
      options: ['Wrong RD', 'No LDP on that link — a label gap', 'NTP', 'Duplex'],
      correctIndex: 1,
      explanation: 'Without labels on one hop the VPN label has no transport LSP.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'What does the ticket seed give you?',
      options: ['Harder faults', 'The same 10 tickets in the same order for the same seed', 'Extra points', 'Nothing'],
      correctIndex: 1,
      explanation: 'Repeatable drills: a trainer can hand out a seed and know which faults come.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'The NMS shows a device as "unreachable" although it has the polling community. What is missing?',
      options: ['The syslog host', 'A path from the NMS to the device and back', 'An NTP server', 'A VRF'],
      correctIndex: 1,
      explanation: 'An SNMP poll needs the request to arrive and the reply to come back.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: `After the build, run "show bgp vpnv4 unicast all summary" on JU-LSR. How many VPNv4 neighbours are listed?`,
      options: ['1', '2', '3', '27'],
      correctIndex: 2,
      explanation: 'JU reflects to the three PEs MTD, DNA and FL.',
    },
  ],
  estMinutes: 120,
  fieldNote:
    'Real gear: a real division backbone has ring protection and redundant RRs; J2 here is the CAMTECH case-study chain with no second path, so every fault cuts what is behind it. Convergence is instant. NEON CLI is not public — IOS-XE style syntax.\nInterview questions: "VPN down — kaun si layer pehle?", "root cause vs impact alarm?", "RR client kya karta hai?"',
  solution: {
    cli: solutionCli(),
    pings: CAP_PES.map(([code]) => [`${code}-UTS1`, UTS_SRV] as [string, string]),
  },
};

export const GRAND_LABS: Lab[] = [b15];
void DL_SERVICE;
