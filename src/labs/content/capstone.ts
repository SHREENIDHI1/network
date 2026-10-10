import { configure, setIf } from '../../engine/testing/fixtures';
import * as C from '../framework/checks';
import type { Lab } from '../framework/types';

/**
 * Part A capstone (lesson A15, build phase P3): finish the MTD + JU design,
 * then close five fault tickets one after another. Each ticket injects one
 * root cause into the learner's working network; its check passes only when
 * the service the complaint is about works again.
 */

const CONF = ['enable', 'configure terminal'];

const l15: Lab = {
  id: 'L15.1',
  level: 15,
  order: 1,
  lessonId: 'A15',
  title: 'Capstone: MTD station + JU HQ, and 5 fault tickets',
  scenario:
    'Merta Road Jn (MTD) ka naya station LAN aur JU divisional HQ jodna hai. Switching aur addressing ho chuki hai. Tumhara kaam: routing (OSPF), DHCP relay, Railnet ke liye internet (sirf Railnet — UTS ko internet nahi), aur NMS par logs. Design poora hote hi Test Room se ek-ek karke 5 fault tickets aayenge.',
  concept:
    'Yeh Part A ka saar hai: VLAN/trunk (A7), L3 switch SVIs (A9), OSPF (A10), DHCP/DNS/NAT/syslog (A11), ACL logic (A12), troubleshooting (A15).\n' +
    'Troubleshooting ka tareeka: complaint padho (kaun, kya, kab se, sab ya ek?), neeche se upar jao — link → VLAN → IP/gateway → route → service → security. Har step ek command, ek nateeja. Fix ke baad wahi test dobara chalao jo complaint mein fail tha.\n' +
    'Railway analogy: signal failure mein pehle power aur cable, phir relay, phir route setting, phir interlocking logic — ek-ek karke.',
  objectives: [
    'OSPF between MTD-L3SW and JU-R1, with a default route for MTD',
    'DHCP relay for UTS and PRS',
    'Internet via PAT for Railnet only',
    'Name lookup and syslog to the NMS',
    'Close five fault tickets',
  ],
  topologyId: 'lab-capstone-mtd-ju',
  requiredModules: ['topology', 'physical', 'sim', 'ethernet', 'ip', 'ospf', 'services'],
  plan: {
    headers: ['Item', 'Value'],
    rows: [
      ['VLAN 10 UTS', '10.52.10.0/24, gateway Vlan10 .1, DHCP'],
      ['VLAN 20 PRS', '10.52.20.0/24, gateway Vlan20 .1, DHCP'],
      ['VLAN 50 Railnet', '10.52.50.0/24, gateway Vlan50 .1, MTD-RAILNET-PC .11 static'],
      ['MTD–JU uplink', 'MTD-L3SW Gi1/0/1 10.255.0.2 ↔ JU-R1 Gi0/1 10.255.0.1 (/30), OSPF area 0'],
      ['JU HQ LAN', '10.1.1.0/24: JU-DNS .53 (pools ready), JU-NMS .100'],
      ['Internet', 'JU-R1 Gi0/2 203.0.113.2 → ISP; test host 198.51.100.10'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Run OSPF area 0 between MTD-L3SW and JU-R1. JU-R1 must learn the MTD VLANs, and advertise a default route to MTD-L3SW.',
      check: C.all(
        C.ospfNeighborFull('MTD-L3SW', 'JU-R1'),
        C.routeExists('JU-R1', '10.52.10.0/24', 'ospf'),
        C.routeExists('MTD-L3SW', '0.0.0.0/0', 'ospf'),
      ),
      points: 20,
    },
    {
      id: 't2',
      text: 'MTD-UTS1 and MTD-PRS1 must get addresses from JU-DNS (relay on the MTD gateways).',
      check: C.all(C.dhcpBound('MTD-UTS1'), C.dhcpBound('MTD-PRS1')),
      points: 20,
    },
    {
      id: 't3',
      text: 'From MTD-UTS1, resolve the name uts-server with nslookup.',
      check: C.appSucceeds('MTD-UTS1', 'dns', 'uts-server', '10.1.1.10'),
      points: 10,
    },
    {
      id: 't4',
      text: 'PAT on JU-R1 for Railnet only: MTD-RAILNET-PC reaches 198.51.100.10, MTD-UTS1 must NOT.',
      check: C.all(
        C.natTranslationFor('JU-R1', '10.52.50.11'),
        C.pingSucceeds('MTD-RAILNET-PC', '198.51.100.10'),
        C.pingFails('MTD-UTS1', '198.51.100.10'),
      ),
      points: 20,
    },
    { id: 't5', text: 'Send JU-R1’s syslog to JU-NMS and get at least one message there.', check: C.nmsReceived('JU-NMS', 'syslog'), points: 10 },
  ],
  hints: [
    [
      'Both sides: router ospf 1 → network 10.0.0.0 0.255.255.255 area 0. "show ip ospf neighbor" must say FULL.',
      'JU-R1 has the static default to the ISP. In router ospf 1 on JU-R1: default-information originate.',
    ],
    [
      'The DHCP pools already exist on JU-DNS. What is missing between the VLANs and the server?',
      'MTD-L3SW: interface vlan10 → ip helper-address 10.1.1.53 (same on vlan20). Then ipconfig /renew on both terminals.',
    ],
    ['The DNS server comes with the DHCP lease ("ipconfig /all").', 'On MTD-UTS1: nslookup uts-server'],
    [
      'JU-R1: gi0/1 → ip nat inside, gi0/2 → ip nat outside.',
      'access-list 1 permit 10.52.50.0 0.0.0.255 (Railnet only!) → ip nat inside source list 1 interface gi0/2 overload. Test both pings.',
    ],
    [
      'JU-R1: logging host 10.1.1.100',
      'A message is sent only when something happens: shut / no shut an interface such as Gi0/2, then check JU-NMS → NMS inbox.',
    ],
  ],
  tickets: [
    {
      complaint:
        'Ticket 1 — MTD PRS counter: "PRS terminal restart kiya, ab address 169.254 wala aa raha hai, reservation nahi ho raha. UTS wale counters theek hain."',
      apply: (t) => configure(t, 'MTD-L3SW', (c) => setIf(c, 'Vlan20', { helpers: undefined })),
      check: C.dhcpBound('MTD-PRS1'),
      hints: [
        '169.254 = APIPA: no DHCP server answered. UTS works, so the server and routing are fine. What is different for VLAN 20?',
        'Compare "show running-config" of interface vlan10 and vlan20 on MTD-L3SW. Then ipconfig /renew on MTD-PRS1.',
      ],
      fix: { cli: { 'MTD-L3SW': [...CONF, 'interface vlan20', 'ip helper-address 10.1.1.53', 'end'] }, renew: ['MTD-PRS1'] },
    },
    {
      complaint: 'Ticket 2 — MTD office: "Railnet par internet subah se band hai. Railway ke andar ke sites (JU NMS) khul rahe hain."',
      apply: (t) => configure(t, 'JU-R1', (c) => setIf(c, 'Gi0/2', { natRole: undefined })),
      check: C.pingSucceeds('MTD-RAILNET-PC', '198.51.100.10'),
      hints: [
        'Inside traffic works, only the internet fails: look at the edge. "show ip nat translations" on JU-R1 after a ping.',
        'Which interface is the NAT outside? Check "show running-config" for ip nat inside/outside.',
      ],
      fix: { cli: { 'JU-R1': [...CONF, 'interface gi0/2', 'ip nat outside', 'end'] }, pings: [['MTD-RAILNET-PC', '198.51.100.10']] },
    },
    {
      complaint: 'Ticket 3 — MTD booking: "Sabhi UTS counters band! PRS aur Railnet chal rahe hain. Raat ko switch par kaam hua tha."',
      apply: (t) => configure(t, 'MTD-SW1', (c) => setIf(c, 'Gi0/24', { trunkAllowed: [20, 50] })),
      check: C.all(C.dhcpBound('MTD-UTS1'), C.pingSucceeds('MTD-UTS1', '10.1.1.100')),
      hints: [
        'Only one VLAN is broken, so not the cable. Check "show interfaces trunk" on MTD-SW1.',
        'Allow VLAN 10 on the trunk again, then ipconfig /renew and ping 10.1.1.100 from MTD-UTS1.',
      ],
      fix: {
        cli: { 'MTD-SW1': [...CONF, 'interface gi0/24', 'switchport trunk allowed vlan add 10', 'end'] },
        renew: ['MTD-UTS1'],
        pings: [['MTD-UTS1', '10.1.1.100']],
      },
    },
    {
      complaint: 'Ticket 4 — Test Room JU: "MTD ke saare systems JU se kat gaye — UTS, PRS, Railnet sab. Link light jal rahi hai, fibre theek hai."',
      apply: (t) => configure(t, 'JU-R1', (c) => setIf(c, 'Gi0/1', { ospfHello: 5 })),
      check: C.all(C.ospfNeighborFull('MTD-L3SW', 'JU-R1'), C.pingSucceeds('MTD-RAILNET-PC', '10.1.1.100')),
      hints: [
        'Link is up, everything behind it is unreachable: check the routing protocol. "show ip ospf neighbor" on both ends.',
        '"show ip ospf interface" on JU-R1 Gi0/1 and MTD-L3SW Gi1/0/1: compare Hello/Dead.',
      ],
      fix: { cli: { 'JU-R1': [...CONF, 'interface gi0/1', 'no ip ospf hello-interval', 'end'] }, pings: [['MTD-RAILNET-PC', '10.1.1.100']] },
    },
    {
      complaint:
        'Ticket 5 — MTD PRS counter: "PRS bahut slow hai, kabhi-kabhi ticket print beech mein atak jaata hai. Doosre counters theek." (Switch port ki late-collision counter badh rahi hai.)',
      apply: (t) => configure(t, 'MTD-SW1', (c) => setIf(c, 'Gi0/2', { duplex: 'full' })),
      check: C.all(C.noDuplexMismatch(), C.pingSucceeds('MTD-PRS1', '10.1.1.100')),
      hints: [
        'Slow + late collisions on one port = Layer 1/2 problem on that port. "show interfaces status" on MTD-SW1.',
        'One side is forced full duplex, the terminal is auto (falls back to half). Set the port back to auto, then ping from MTD-PRS1.',
      ],
      fix: { cli: { 'MTD-SW1': [...CONF, 'interface gi0/2', 'duplex auto', 'end'] }, renew: ['MTD-PRS1'], pings: [['MTD-PRS1', '10.1.1.100']] },
    },
  ],
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'Only UTS counters fail; PRS and Railnet work. Where do you look first?',
      options: ['Fibre to JU', 'Trunk allowed list / VLAN 10 / its gateway', 'NAT', 'NTP'],
      correctIndex: 1,
      explanation: 'One VLAN broken while others work points to that VLAN’s L2/L3 config.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Why does the NAT ACL permit only 10.52.50.0/24?',
      options: [
        'NAT supports one subnet only',
        'Policy: only Railnet may use the internet; UTS/PRS must stay off it',
        'To save addresses',
        'OSPF needs it',
      ],
      correctIndex: 1,
      explanation: 'The NAT ACL decides who gets translated — and so who reaches the internet.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: '"default-information originate" on JU-R1 does what?',
      options: ['Creates a static route', 'Advertises JU-R1’s default route into OSPF', 'Starts DHCP', 'Enables NAT'],
      correctIndex: 1,
      explanation: 'MTD learns 0.0.0.0/0 from JU instead of needing its own static route.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'When is a ticket really closed?',
      options: ['When the config is changed', 'When the test from the complaint (ping, lease, lookup) passes again', 'After a reboot', 'Next day'],
      correctIndex: 1,
      explanation: 'Service restored = the user-side test works.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After task 1, run "show ip route" on MTD-L3SW. Which code is shown for the 0.0.0.0/0 route?',
      options: ['S*', 'O*E2', 'C', 'O IA'],
      correctIndex: 1,
      explanation: 'A default route originated into OSPF is an external type-2 route (O*E2).',
    },
  ],
  estMinutes: 90,
  fieldNote:
    'Real gear: a real divisional design also has redundancy (A8, A13), QoS (A14) and firewalls between Railnet and application VLANs; the capstone keeps the topology small so the faults stay readable. The MTD–JU link here is a teaching link on the track map, not the real OFC route.\nInterview questions: "Bottom-up troubleshooting kaise karte ho?", "APIPA address dikhe to kya check karoge?", "Ek VLAN down, baaki up — kya dekhoge?"',
  solution: {
    cli: {
      'MTD-L3SW': [
        ...CONF,
        'interface vlan10',
        'ip helper-address 10.1.1.53',
        'interface vlan20',
        'ip helper-address 10.1.1.53',
        'exit',
        'router ospf 1',
        'network 10.0.0.0 0.255.255.255 area 0',
        'end',
      ],
      'JU-R1': [
        ...CONF,
        'router ospf 1',
        'network 10.0.0.0 0.255.255.255 area 0',
        'default-information originate',
        'exit',
        'interface gi0/1',
        'ip nat inside',
        'interface gi0/2',
        'ip nat outside',
        'exit',
        'access-list 1 permit 10.52.50.0 0.0.0.255',
        'ip nat inside source list 1 interface gi0/2 overload',
        'logging host 10.1.1.100',
        'end',
      ],
    },
    flaps: [['JU-R1', 'gi0/2']],
    renew: ['MTD-UTS1', 'MTD-PRS1'],
    pings: [
      ['MTD-RAILNET-PC', '198.51.100.10'],
      ['MTD-UTS1', '198.51.100.10'],
    ],
    hostCli: { 'MTD-UTS1': ['nslookup uts-server'] },
  },
};

export const CAPSTONE_LABS: Lab[] = [l15];
