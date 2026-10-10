import { configure, setIf } from '../../engine/testing/fixtures';
import * as C from '../framework/checks';
import type { Lab } from '../framework/types';

/**
 * Foundation labs for lessons A4–A8 (build phase P2). Every check reads only
 * engine state from the snapshot. Detail messages say what is missing, never
 * the answer; hints teach step by step.
 */

const ETH: Lab['requiredModules'] = ['topology', 'physical', 'sim', 'ethernet'];
const ETH_IP: Lab['requiredModules'] = [...ETH, 'ip'];

// ---------------------------------------------------------------------------
// L4.1 Hub vs switch (A4)
// ---------------------------------------------------------------------------

const l4: Lab = {
  id: 'L4.1',
  level: 4,
  order: 1,
  lessonId: 'A4',
  title: 'Hub vs switch: who receives your frame?',
  scenario:
    'SSE/Tele JU ke store mein ek purana hub mila hai. Trainee bol raha hai "hub aur switch ek hi cheez hai". Aaj hum dono ko side-by-side chala kar dekhenge ki frame kis-kis ko milta hai, aur switch MAC address kaise seekhta hai.',
  concept:
    'Hub Layer 1 device hai: jo signal ek port par aaya, woh baaki sab ports par repeat kar deta hai. Sab devices ek hi collision domain mein hain aur sab ko har frame milta hai.\n' +
    'Switch Layer 2 device hai: har frame ka source MAC padh kar MAC table banata hai ("yeh MAC is port par hai"). Destination MAC pata ho to frame sirf usi port par jaata hai; pata na ho ya broadcast ho to flood.\n' +
    'Railway analogy: hub = station ka loudspeaker — announcement sab sunte hain. Switch = parcel office — parcel sirf us aadmi ko diya jaata hai jiska naam label par hai.',
  objectives: [
    'Connect a PC to a hub',
    'Ping on both sides',
    'See MAC learning on the switch',
    'Compare who receives a frame in the Packet Inspector',
  ],
  topologyId: 'lab-hub-vs-switch',
  requiredModules: ETH_IP,
  plan: {
    headers: ['Device', 'IP (already set)', 'Connected to'],
    rows: [
      ['PC1 / PC2 / PC3', '10.1.1.1 / .2 / .3', 'HUB1 (PC3 not cabled yet)'],
      ['PC4 / PC5 / PC6', '10.1.1.4 / .5 / .6', 'SW1 Gi0/1–3'],
    ],
  },
  tasks: [
    { id: 't1', text: 'Connect PC3 to HUB1 with a Cat6 cable.', check: C.linkExists('PC3', 'HUB1', 'cat6'), points: 10 },
    { id: 't2', text: 'From PC1, ping PC3 (10.1.1.3).', check: C.pingSucceeds('PC1', '10.1.1.3'), points: 15 },
    { id: 't3', text: 'From PC4, ping PC6 (10.1.1.6).', check: C.pingSucceeds('PC4', '10.1.1.6'), points: 15 },
    {
      id: 't4',
      text: 'Check that SW1 has learned at least two MAC addresses ("show mac address-table").',
      check: C.macLearned('SW1', 2),
      points: 10,
    },
  ],
  hints: [
    ['Hover PC3, drag from its blue handle and drop on HUB1.', 'In the dialog choose link type Cat6 and any free hub port.'],
    ['Select PC1 → Open CLI. Type: ping 10.1.1.3', 'If it fails, is PC3 really cabled? Check the link on the canvas.'],
    ['Open CLI on PC4 and type: ping 10.1.1.6'],
    ['A switch learns MACs from frames it receives. After the ping in task 3, open SW1 CLI.', 'Type: enable, then show mac address-table'],
  ],
  breakFix: {
    complaint:
      'SM/JU office: "PC5 se kuch bhi nahi chal raha, kal safai wale aaye the." Pata karo kya hua aur PC4 se PC5 ko ping karke confirm karo.',
    apply: (t) => {
      const sw = t.devices.find((d) => d.name === 'SW1')!;
      const pc5 = t.devices.find((d) => d.name === 'PC5')!;
      return { ...t, links: t.links.filter((l) => !([l.a.deviceId, l.b.deviceId].includes(sw.id) && [l.a.deviceId, l.b.deviceId].includes(pc5.id))) };
    },
    check: C.all(C.linkExists('PC5', 'SW1', 'cat6'), C.pingSucceeds('PC4', '10.1.1.5')),
    hints: ['Look at PC5 on the canvas: is anything plugged into it?', 'Reconnect PC5 to a free SW1 port with Cat6, then ping 10.1.1.5 from PC4.'],
    fix: { links: [['PC5', 'eth0', 'SW1', 'Gi0/2']], pings: [['PC4', '10.1.1.5']] },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'PC1 sends a unicast frame to PC2 through HUB1. Who receives the electrical signal?',
      options: ['Only PC2', 'PC2 and PC3 (every other hub port)', 'Nobody until ARP finishes', 'Only the hub'],
      correctIndex: 1,
      explanation: 'A hub repeats bits out of every other port; each NIC then discards frames not addressed to it.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Which field does a switch use to fill its MAC table?',
      options: ['Destination MAC', 'Source MAC', 'Destination IP', 'TTL'],
      correctIndex: 1,
      explanation: 'The switch learns "source MAC X lives on the port this frame came in on".',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'What does a switch do with a frame whose destination MAC is not in its table?',
      options: ['Drops it', 'Floods it in the same VLAN (not back out the incoming port)', 'Sends it to the router', 'Waits for ARP'],
      correctIndex: 1,
      explanation: 'Unknown unicast is flooded within the VLAN, like a broadcast.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'How many collision domains does an 8-port switch with 8 PCs have (full duplex)?',
      options: ['1', '8 (one per port)', '0', '2'],
      correctIndex: 1,
      explanation: 'Every switch port is its own collision domain; with full duplex there are no collisions at all.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'Ping PC4 → PC6, then open the Packet Inspector on the echo-request. Did PC5 receive it?',
      options: [
        'Yes, the switch flooded it',
        'No — after ARP the switch knew PC6’s port and sent it only there',
        'Only the first one',
        'The Packet Inspector cannot show this',
      ],
      correctIndex: 1,
      explanation: 'The ARP request was broadcast, but by the time the echo-request travels SW1 has learned PC6’s MAC and forwards it out one port.',
    },
  ],
  estMinutes: 25,
  fieldNote:
    'Real gear: hubs are not sold any more; you may still meet them in old store rooms or cheap "switches" that are really hubs. Real hubs are half duplex and suffer collisions under load — this simulator repeats frames without timing collisions (see Model Limitations).\nInterview questions: "Collision domain aur broadcast domain mein kya fark hai?", "Switch MAC table kaise banata hai?", "Unknown unicast flooding kya hai?"',
  solution: {
    links: [['PC3', 'eth0', 'HUB1', 'Port3']],
    pings: [
      ['PC1', '10.1.1.3'],
      ['PC4', '10.1.1.6'],
    ],
  },
};

// ---------------------------------------------------------------------------
// L5.1 Address the MTD station LAN (A5)
// ---------------------------------------------------------------------------

const l5: Lab = {
  id: 'L5.1',
  level: 5,
  order: 1,
  lessonId: 'A5',
  title: 'Address the MTD station LAN',
  scenario:
    'MTD (Merta Road Jn) par naya station LAN laga hai. Cable aur switch ready hain, lekin kisi device ko IP address nahi mila. Aapko teaching plan ke hisaab se router aur sab terminals ko address dena hai, taki UTS counters gateway tak pahunch sakein.',
  concept:
    'IPv4 address 32 bits ka hota hai, 4 octets mein likhte hain (10.52.1.11). Subnet mask batata hai kitne bits network ke hain: /24 = 255.255.255.0, yaani pehle 3 octets network, last octet host.\n' +
    'Same subnet wale devices seedhe baat karte hain (ARP se MAC dhoondh kar). Doosre network ke liye packet default gateway (router) ko jaata hai.\n' +
    'Network address (.0) aur broadcast (.255) kisi device ko nahi dete.\n' +
    'Railway analogy: subnet = ek station yard; IP = yard mein line number; gateway = yard se bahar jaane wala signal/cabin.',
  objectives: [
    'Give the router LAN interface an IP and bring it up',
    'Address every terminal in 10.52.1.0/24 with the router as gateway',
    'Avoid duplicate addresses',
    'Prove reachability with ping',
  ],
  topologyId: 'lab-mtd-station-lan',
  requiredModules: ETH_IP,
  plan: {
    headers: ['Device', 'Interface', 'IP / mask', 'Gateway'],
    rows: [
      ['MTD-R1', 'Gi0/0', '10.52.1.1 / 255.255.255.0', '—'],
      ['MTD-UTS1', 'eth0', '10.52.1.11 / 255.255.255.0', '10.52.1.1'],
      ['MTD-UTS2', 'eth0', '10.52.1.12 / 255.255.255.0', '10.52.1.1'],
      ['MTD-FOIS1', 'eth0', '10.52.1.21 / 255.255.255.0', '10.52.1.1'],
      ['MTD-SM-PC', 'eth0', '10.52.1.31 / 255.255.255.0', '10.52.1.1'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Configure MTD-R1 Gi0/0 as 10.52.1.1/24 and bring it up.',
      check: C.all(C.ipInSubnet('MTD-R1', 'Gi0/0', '10.52.1.0/24')),
      points: 15,
    },
    {
      id: 't2',
      text: 'Address MTD-UTS1, MTD-UTS2, MTD-FOIS1 and MTD-SM-PC in 10.52.1.0/24.',
      check: C.all(
        C.ipInSubnet('MTD-UTS1', 'eth0', '10.52.1.0/24'),
        C.ipInSubnet('MTD-UTS2', 'eth0', '10.52.1.0/24'),
        C.ipInSubnet('MTD-FOIS1', 'eth0', '10.52.1.0/24'),
        C.ipInSubnet('MTD-SM-PC', 'eth0', '10.52.1.0/24'),
      ),
      points: 20,
    },
    {
      id: 't3',
      text: 'Set the default gateway of every terminal to the router.',
      check: C.all(
        C.gatewayOnDevice('MTD-UTS1', 'MTD-R1'),
        C.gatewayOnDevice('MTD-UTS2', 'MTD-R1'),
        C.gatewayOnDevice('MTD-FOIS1', 'MTD-R1'),
        C.gatewayOnDevice('MTD-SM-PC', 'MTD-R1'),
      ),
      points: 15,
    },
    {
      id: 't4',
      text: 'No two devices may share an IP address.',
      check: C.all(C.noDuplicateIps(), C.ipInSubnet('MTD-UTS1', 'eth0', '10.52.1.0/24')),
      points: 10,
    },
    { id: 't5', text: 'From MTD-UTS1, ping the gateway successfully.', check: C.pingReachesDevice('MTD-UTS1', 'MTD-R1'), points: 15 },
  ],
  hints: [
    [
      'Open CLI on MTD-R1: enable → configure terminal → interface gi0/0',
      'Then: ip address 10.52.1.1 255.255.255.0 and no shutdown (router ports start shut down).',
    ],
    ['Select a terminal → IP Configuration in the right panel → Static.', 'Use the plan table: 10.52.1.11, .12, .21, .31 with mask 255.255.255.0.'],
    ['Gateway = the router’s address in the same subnet.', 'Gateway field: 10.52.1.1'],
    ['Each host needs its own last octet — compare with the plan table.'],
    ['Open CLI on MTD-UTS1 and type: ping 10.52.1.1', 'If it fails: is Gi0/0 up? (show ip interface brief on the router). Is the gateway set?'],
  ],
  breakFix: {
    complaint:
      'SM/MTD: "UTS counter 2 kabhi chalta hai kabhi nahi, aur counter 1 bhi beech-beech mein atak jaata hai." Kisi ne naya terminal lagaya tha. Problem dhoondho aur theek karo.',
    apply: (t) => configure(t, 'MTD-UTS2', (c) => setIf(c, 'eth0', { ip: { address: '10.52.1.11', mask: '255.255.255.0' } })),
    check: C.all(C.noDuplicateIps(), C.ipInSubnet('MTD-UTS2', 'eth0', '10.52.1.0/24'), C.pingReachesDevice('MTD-UTS2', 'MTD-R1')),
    hints: [
      'Two terminals that disturb each other often share something. Compare their IP settings.',
      'Give MTD-UTS2 back its own address from the plan, then ping the gateway from it.',
    ],
    fix: { hosts: { 'MTD-UTS2': { ip: '10.52.1.12', mask: '255.255.255.0', gateway: '10.52.1.1' } }, pings: [['MTD-UTS2', '10.52.1.1']] },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'In 10.52.1.0/24, which address can NOT be given to a UTS terminal?',
      options: ['10.52.1.11', '10.52.1.254', '10.52.1.255', '10.52.1.1'],
      correctIndex: 2,
      explanation: '.255 is the broadcast address of a /24. (.1 is valid; here it is used by the router.)',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'What does a host do before sending to another host in its own subnet?',
      options: ['Sends to the gateway', 'ARP for the destination MAC', 'DNS lookup', 'Nothing'],
      correctIndex: 1,
      explanation: 'Same subnet → ARP for the destination itself. Different subnet → ARP for the gateway.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: '10.x.x.x addresses are…',
      options: ['Public, routed on the Internet', 'Private (RFC 1918), used inside organisations', 'Multicast', 'Loopback'],
      correctIndex: 1,
      explanation: '10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16 are private ranges.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'Why do new router interfaces need "no shutdown"?',
      options: ['To save the config', 'Router ports start administratively down on IOS', 'To enable ARP', 'To set the mask'],
      correctIndex: 1,
      explanation: 'IOS router interfaces are shut down by default; switch ports are up by default.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'Ping 10.52.1.1 from MTD-UTS1 twice. After the first ping, run "arp -a" on MTD-UTS1. Which IP is in the ARP cache?',
      options: ['10.52.1.1 (the gateway)', '10.52.1.255', 'Nothing', '0.0.0.0'],
      correctIndex: 0,
      explanation: 'The host resolved the gateway’s MAC with ARP and cached it.',
    },
  ],
  estMinutes: 35,
  fieldNote:
    'Real gear: Windows terminals are addressed in Network settings (or netsh); here you use the properties panel. Many stations use DHCP (A11). Keep an IP register for every station — duplicate IPs are a common field fault after "a new terminal was added".\nInterview questions: "/24 mein kitne usable host?", "Default gateway kya hota hai?", "ARP kis layer par kaam karta hai?"',
  solution: {
    cli: { 'MTD-R1': ['enable', 'configure terminal', 'interface gi0/0', 'ip address 10.52.1.1 255.255.255.0', 'no shutdown', 'end'] },
    hosts: {
      'MTD-UTS1': { ip: '10.52.1.11', mask: '255.255.255.0', gateway: '10.52.1.1' },
      'MTD-UTS2': { ip: '10.52.1.12', mask: '255.255.255.0', gateway: '10.52.1.1' },
      'MTD-FOIS1': { ip: '10.52.1.21', mask: '255.255.255.0', gateway: '10.52.1.1' },
      'MTD-SM-PC': { ip: '10.52.1.31', mask: '255.255.255.0', gateway: '10.52.1.1' },
    },
    pings: [
      ['MTD-UTS1', '10.52.1.1'],
      ['MTD-UTS2', '10.52.1.1'],
    ],
  },
};

// ---------------------------------------------------------------------------
// L6.1 VLSM plan for MTD (A6)
// ---------------------------------------------------------------------------

const VLSM_IFS: Array<[string, string]> = [
  ['MTD-R1', 'Gi0/0'],
  ['MTD-R1', 'Gi0/1'],
  ['MTD-R1', 'Gi0/2'],
];

const l6: Lab = {
  id: 'L6.1',
  level: 6,
  order: 1,
  lessonId: 'A6',
  title: 'VLSM: carve the MTD station block',
  scenario:
    'Division IT cell ne MTD ko sirf ek block diya hai: 10.52.20.0/24. Isi mein teen LAN banane hain — UTS/PRS (20 terminals), CCTV (50 cameras) aur management (5 devices). Address barbaad nahi karne, kyunki aage aur services aayengi.',
  concept:
    'VLSM (Variable Length Subnet Mask) = har LAN ko utna hi bada subnet do jitna chahiye. Usable hosts = 2^(32 − prefix) − 2.\n' +
    '/26 = 62 hosts, /27 = 30 hosts, /28 = 14, /29 = 6, /30 = 2.\n' +
    'Sabse bade LAN se shuru karo, block ke shuru se allot karo, phir agla bada — overlap nahi hona chahiye.\n' +
    'Railway analogy: ek goods yard ki lines — bade rake ko lambi line, chhote ko chhoti; ek line do rakes ko nahi de sakte.',
  objectives: [
    'Pick the smallest subnet for each LAN',
    'Configure the three router interfaces without overlap',
    'Address one host per LAN and prove it reaches the router',
  ],
  topologyId: 'lab-mtd-vlsm',
  requiredModules: ETH_IP,
  plan: {
    headers: ['LAN', 'Router port', 'Hosts needed', 'Your subnet'],
    rows: [
      ['CCTV', 'Gi0/1', '50', '? (largest first)'],
      ['UTS/PRS', 'Gi0/0', '20', '?'],
      ['Management', 'Gi0/2', '5', '?'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Give MTD-R1 Gi0/1 (CCTV, 50 hosts) the right-sized subnet inside 10.52.20.0/24.',
      check: C.subnetSizedFor('MTD-R1', 'Gi0/1', 50, '10.52.20.0/24'),
      points: 15,
    },
    {
      id: 't2',
      text: 'Give MTD-R1 Gi0/0 (UTS/PRS, 20 hosts) the right-sized subnet.',
      check: C.subnetSizedFor('MTD-R1', 'Gi0/0', 20, '10.52.20.0/24'),
      points: 15,
    },
    {
      id: 't3',
      text: 'Give MTD-R1 Gi0/2 (management, 5 hosts) the right-sized subnet.',
      check: C.subnetSizedFor('MTD-R1', 'Gi0/2', 5, '10.52.20.0/24'),
      points: 15,
    },
    { id: 't4', text: 'The three subnets must not overlap.', check: C.noOverlap(VLSM_IFS), points: 10 },
    {
      id: 't5',
      text: 'Address MTD-CAM1 in the CCTV subnet (gateway = router) and ping the router from it.',
      check: C.all(C.gatewayOnDevice('MTD-CAM1', 'MTD-R1'), C.pingReachesDevice('MTD-CAM1', 'MTD-R1')),
      points: 15,
    },
  ],
  hints: [
    [
      '50 hosts: which prefix gives at least 50 usable addresses? Try the subnet calculator in lesson A6.',
      '/26 gives 62 usable. Start at the beginning of the block: 10.52.20.0/26 → router can take 10.52.20.1 255.255.255.192. Remember no shutdown.',
    ],
    [
      '20 hosts → /27 (30 usable). The next free block after a /26 at .0 starts at .64.',
      'Router: interface gi0/0 → ip address 10.52.20.65 255.255.255.224 → no shutdown',
    ],
    ['5 hosts → /29 (6 usable). Next free after .64/27 is .96.', 'Router: interface gi0/2 → ip address 10.52.20.97 255.255.255.248 → no shutdown'],
    ['Write each subnet as start–end. If one range touches another, move it to the next free block.'],
    [
      'Camera IP must be in the CCTV subnet, e.g. 10.52.20.10 / 255.255.255.192, gateway = router Gi0/1 address.',
      'Then open CLI on MTD-CAM1: ping <router Gi0/1 address>',
    ],
  ],
  breakFix: {
    complaint:
      'Control/JU: "MTD ka management laptop router tak nahi pahunch raha, aur kisi ne kal router config badla tha." Router config check karo.',
    apply: (t) =>
      configure(t, 'MTD-R1', (c) =>
        setIf(c, 'Gi0/2', { ip: { address: c.interfaces['Gi0/2']?.ip?.address ?? '10.52.20.97', mask: '255.255.255.0' } }),
      ),
    check: C.all(C.subnetSizedFor('MTD-R1', 'Gi0/2', 5, '10.52.20.0/24'), C.noOverlap(VLSM_IFS)),
    hints: [
      'show running-config on MTD-R1 — look at the masks.',
      'One interface has a /24 mask now: it covers the whole block and overlaps the others. Put back the /29 mask.',
    ],
    fix: { cli: { 'MTD-R1': ['enable', 'configure terminal', 'interface gi0/2', 'ip address 10.52.20.97 255.255.255.248', 'end'] } },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'How many usable hosts in a /27?',
      options: ['32', '30', '27', '62'],
      correctIndex: 1,
      explanation: '2^(32−27) = 32 addresses, minus network and broadcast = 30.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Mask for /26?',
      options: ['255.255.255.192', '255.255.255.224', '255.255.255.128', '255.255.255.240'],
      correctIndex: 0,
      explanation: '26 one-bits: 255.255.255.11000000 = .192',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Why allocate the largest subnet first?',
      options: [
        'It is faster to type',
        'Big blocks must start on their own boundary; doing them first avoids gaps and overlaps',
        'Routers require it',
        'It saves CPU',
      ],
      correctIndex: 1,
      explanation: 'A /26 must start at .0, .64, .128 or .192. Placing it first keeps the rest of the block contiguous.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'A point-to-point link between two routers needs 2 addresses. Smallest classic subnet?',
      options: ['/24', '/29', '/30 (or /31 on supported routers)', '/32'],
      correctIndex: 2,
      explanation: '/30 = 2 usable. RFC 3021 allows /31 on point-to-point links; the Jodhpur backbone plan (P4) uses /31.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'Run "show ip interface brief" on MTD-R1 after finishing. How many interfaces show Status up and Protocol up with an IP?',
      options: ['1', '2', '3', '0'],
      correctIndex: 2,
      explanation: 'Gi0/0, Gi0/1 and Gi0/2 are addressed, cabled to their switches and not shut down.',
    },
  ],
  estMinutes: 40,
  fieldNote:
    'Real gear: the real Jodhpur IP plan (Division → control board → section → station → application) is generated in P4. Always keep the station block register; never "borrow" addresses from a neighbour block.\nInterview questions: "VLSM kyon?", "/29 mein kitne host?", "Subnet overlap ka kya nuksan?"',
  solution: {
    cli: {
      'MTD-R1': [
        'enable',
        'configure terminal',
        'interface gi0/1',
        'ip address 10.52.20.1 255.255.255.192',
        'no shutdown',
        'interface gi0/0',
        'ip address 10.52.20.65 255.255.255.224',
        'no shutdown',
        'interface gi0/2',
        'ip address 10.52.20.97 255.255.255.248',
        'no shutdown',
        'end',
      ],
    },
    hosts: { 'MTD-CAM1': { ip: '10.52.20.10', mask: '255.255.255.192', gateway: '10.52.20.1' } },
    pings: [['MTD-CAM1', '10.52.20.1']],
  },
};

// ---------------------------------------------------------------------------
// L7.1 VLANs per application at MTD (A7)
// ---------------------------------------------------------------------------

const l7: Lab = {
  id: 'L7.1',
  level: 7,
  order: 1,
  lessonId: 'A7',
  title: 'VLANs per application at MTD',
  scenario:
    'MTD par UTS, PRS aur CCTV sab ek hi LAN (VLAN 1) par chal rahe hain. Security audit ne bola: har application apne VLAN mein ho. Booking office switch (MTD-SW1) aur equipment room switch (MTD-SW2) ke beech sirf ek cable hai — usko trunk banana hoga.',
  concept:
    'VLAN ek switch ko kai alag "virtual switches" mein baant deta hai. Alag VLAN = alag broadcast domain; ek VLAN ka frame doosre VLAN mein nahi jaata.\n' +
    'Access port ek hi VLAN ka hota hai (end device ke liye). Trunk port kai VLANs le jaata hai; har frame par 802.1Q tag (4 bytes, VLAN ID) lagta hai.\n' +
    'Native VLAN ke frames trunk par bina tag jaate hain — dono taraf same hona chahiye. Best practice: native VLAN ko kisi unused VLAN (jaise 99) par rakho.\n' +
    'Teaching plan: UTS 10, PRS 20, FOIS 30, CCTV 40, Railnet 50, VoIP 60, SCADA 70, Mgmt 99.\n' +
    'Railway analogy: ek hi track par alag-alag rake — har wagon par rake number (tag) likha hai; station par sirf apne rake ke wagon utarte hain.',
  objectives: [
    'Create VLANs 10, 20, 40 and 99 on both switches',
    'Put each host port in its VLAN',
    'Make Gi0/24 a trunk with native VLAN 99',
    'Prove UTS1↔UTS2 and PRS1↔PRS2 still work across the trunk',
  ],
  topologyId: 'lab-mtd-vlans',
  requiredModules: ETH_IP,
  plan: {
    headers: ['Switch', 'Port', 'Device', 'VLAN'],
    rows: [
      ['MTD-SW1', 'Gi0/1', 'MTD-UTS1 (10.52.10.11)', '10 UTS'],
      ['MTD-SW1', 'Gi0/2', 'MTD-PRS1 (10.52.20.11)', '20 PRS'],
      ['MTD-SW2', 'Gi0/1', 'MTD-UTS2 (10.52.10.12)', '10 UTS'],
      ['MTD-SW2', 'Gi0/2', 'MTD-PRS2 (10.52.20.12)', '20 PRS'],
      ['MTD-SW2', 'Gi0/3', 'MTD-CAM1 (10.52.40.11)', '40 CCTV'],
      ['both', 'Gi0/24', 'trunk', 'allowed 10,20,40 · native 99'],
    ],
  },
  tasks: [
    {
      id: 't1',
      text: 'Create VLANs 10 (UTS), 20 (PRS), 40 (CCTV) and 99 (MGMT) on both switches.',
      check: C.all(...['MTD-SW1', 'MTD-SW2'].flatMap((s) => [10, 20, 40, 99].map((v) => C.vlanDefined(s, v)))),
      points: 15,
    },
    {
      id: 't2',
      text: 'Make every host port an access port in its VLAN (see plan).',
      check: C.all(
        C.vlanOnPort('MTD-SW1', 'Gi0/1', 10),
        C.vlanOnPort('MTD-SW1', 'Gi0/2', 20),
        C.vlanOnPort('MTD-SW2', 'Gi0/1', 10),
        C.vlanOnPort('MTD-SW2', 'Gi0/2', 20),
        C.vlanOnPort('MTD-SW2', 'Gi0/3', 40),
      ),
      points: 20,
    },
    {
      id: 't3',
      text: 'Make Gi0/24 a trunk on both switches, allowing VLANs 10, 20 and 40.',
      check: C.all(C.trunkAllows('MTD-SW1', 'Gi0/24', [10, 20, 40]), C.trunkAllows('MTD-SW2', 'Gi0/24', [10, 20, 40])),
      points: 15,
    },
    {
      id: 't4',
      text: 'Set the native VLAN of both trunk ends to 99.',
      check: C.all(C.nativeVlanIs('MTD-SW1', 'Gi0/24', 99), C.nativeVlanIs('MTD-SW2', 'Gi0/24', 99)),
      points: 10,
    },
    {
      id: 't5',
      text: 'Ping MTD-UTS1 → MTD-UTS2 (10.52.10.12) and MTD-PRS1 → MTD-PRS2 (10.52.20.12) after the change.',
      check: C.all(C.vlanOnPort('MTD-SW2', 'Gi0/1', 10), C.pingSucceeds('MTD-UTS1', '10.52.10.12'), C.pingSucceeds('MTD-PRS1', '10.52.20.12')),
      points: 15,
    },
  ],
  hints: [
    ['On each switch: enable → configure terminal → vlan 10 → name UTS → exit', 'Repeat for 20 PRS, 40 CCTV, 99 MGMT. Check with "show vlan brief".'],
    [
      'interface gi0/1 → switchport mode access → switchport access vlan 10',
      'Use "interface range gi0/1 - 2" to save typing where two ports share settings… but here each port has its own VLAN.',
    ],
    [
      'interface gi0/24 → switchport mode trunk → switchport trunk allowed vlan 10,20,40',
      'Do it on BOTH switches; check with "show interfaces trunk".',
    ],
    ['On the trunk port: switchport trunk native vlan 99 (both ends must match).'],
    ['Open CLI on MTD-UTS1: ping 10.52.10.12', 'If it fails: is VLAN 10 allowed on both trunk ends and does it exist on both switches?'],
  ],
  breakFix: {
    complaint:
      'Booking clerk MTD: "Counter 1 se UTS server (counter 2 side) nahi khul raha, PRS theek chal raha hai." Equipment room mein kal kisi ne switch par kaam kiya tha.',
    apply: (t) => configure(t, 'MTD-SW2', (c) => setIf(c, 'Gi0/24', { trunkAllowed: [20, 40] })),
    check: C.all(C.trunkAllows('MTD-SW2', 'Gi0/24', [10, 20, 40]), C.pingSucceeds('MTD-UTS1', '10.52.10.12')),
    hints: [
      'Only UTS (VLAN 10) is broken. Where does VLAN 10 cross between the switches?',
      'On MTD-SW2: show interfaces trunk — compare the allowed list with the plan.',
    ],
    fix: {
      cli: { 'MTD-SW2': ['enable', 'configure terminal', 'interface gi0/24', 'switchport trunk allowed vlan 10,20,40', 'end'] },
      pings: [['MTD-UTS1', '10.52.10.12']],
    },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'How big is the 802.1Q tag inserted in an Ethernet frame?',
      options: ['2 bytes', '4 bytes', '8 bytes', '12 bits'],
      correctIndex: 1,
      explanation: '4 bytes: TPID 0x8100 + PCP (3 bits) + DEI (1) + VLAN ID (12 bits).',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'How many VLAN IDs can 12 bits carry (usable range)?',
      options: ['1–1024', '1–4094', '1–255', '0–65535'],
      correctIndex: 1,
      explanation: '12 bits = 4096 values; 0 and 4095 are reserved, so 1–4094.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'UTS1 (VLAN 10) and CAM1 (VLAN 40) are on the same switch. Can they talk without a router?',
      options: [
        'Yes, same switch',
        'No — different VLANs are different broadcast domains; you need inter-VLAN routing (A9)',
        'Only with a trunk',
        'Only via broadcast',
      ],
      correctIndex: 1,
      explanation: 'VLANs isolate Layer 2. Traffic between VLANs must be routed.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'Why move the native VLAN away from VLAN 1?',
      options: [
        'VLAN 1 is slower',
        'Untagged traffic on trunks is a security risk (VLAN hopping); an unused native VLAN limits it',
        'IOS requires it',
        'To save bandwidth',
      ],
      correctIndex: 1,
      explanation: 'Keeping native traffic in an unused VLAN reduces double-tagging/VLAN-hopping risk.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'Run "show vlan brief" on MTD-SW2 after the lab. Which port is listed under VLAN 40?',
      options: ['Gi0/24', 'Gi0/3', 'Gi0/1', 'None'],
      correctIndex: 1,
      explanation: 'CAM1’s access port Gi0/3 is in VLAN 40. Trunk ports are not listed in show vlan brief.',
    },
  ],
  estMinutes: 45,
  fieldNote:
    'Real gear: on Catalyst switches DTP may negotiate trunks automatically; this simulator only uses "switchport mode trunk" (static). Use "switchport nonegotiate" on real gear. Real VLAN numbers per application come from the zonal/divisional plan; the ones here are a teaching plan.\nInterview questions: "Access aur trunk port mein fark?", "Native VLAN mismatch ka kya asar?", "802.1Q tag mein kya hota hai?"',
  solution: {
    cli: {
      'MTD-SW1': [
        'enable',
        'configure terminal',
        'vlan 10',
        'name UTS',
        'vlan 20',
        'name PRS',
        'vlan 40',
        'name CCTV',
        'vlan 99',
        'name MGMT',
        'exit',
        'interface gi0/1',
        'switchport mode access',
        'switchport access vlan 10',
        'interface gi0/2',
        'switchport mode access',
        'switchport access vlan 20',
        'interface gi0/24',
        'switchport mode trunk',
        'switchport trunk allowed vlan 10,20,40',
        'switchport trunk native vlan 99',
        'end',
      ],
      'MTD-SW2': [
        'enable',
        'configure terminal',
        'vlan 10',
        'name UTS',
        'vlan 20',
        'name PRS',
        'vlan 40',
        'name CCTV',
        'vlan 99',
        'name MGMT',
        'exit',
        'interface gi0/1',
        'switchport mode access',
        'switchport access vlan 10',
        'interface gi0/2',
        'switchport mode access',
        'switchport access vlan 20',
        'interface gi0/3',
        'switchport mode access',
        'switchport access vlan 40',
        'interface gi0/24',
        'switchport mode trunk',
        'switchport trunk allowed vlan 10,20,40',
        'switchport trunk native vlan 99',
        'end',
      ],
    },
    pings: [
      ['MTD-UTS1', '10.52.10.12'],
      ['MTD-PRS1', '10.52.20.12'],
    ],
  },
};

// ---------------------------------------------------------------------------
// L8.1 STP root, EtherChannel, port security (A8)
// ---------------------------------------------------------------------------

const l8: Lab = {
  id: 'L8.1',
  level: 8,
  order: 1,
  lessonId: 'A8',
  title: 'STP root, EtherChannel and port security at MTD',
  scenario:
    'MTD par redundancy ke liye teen switch triangle mein lage hain, aur core–counter ke beech do cable hain. Abhi spanning tree ne root "lowest MAC" se chun liya hai aur ek cable bekaar padi hai (blocked). Saath hi audit ne bola: UTS counter port par koi bahar ka laptop nahi lagna chahiye.',
  concept:
    'Do switches ke beech ek se zyada raste ho to loop banta hai — broadcast frames ghoomte rehte hain (broadcast storm). STP/RSTP har loop mein ek port block kar deta hai.\n' +
    'Root bridge = sabse kam bridge ID (priority + MAC). Root ko design se chuno (core switch), luck se nahi: priority kam karo (jaise 4096).\n' +
    'EtherChannel (LACP, 802.3ad) do-teen cables ko ek logical link (Port-channel) bana deta hai: STP use ek port maanta hai, dono cables traffic le jaati hain, ek cable kati to bhi link chalta hai.\n' +
    'Port security: access port par sirf allowed MAC(s); naya device laga to port err-disabled (shutdown mode).\n' +
    'Railway analogy: STP = route relay interlocking jo conflicting routes ek saath set nahi hone deta; EtherChannel = double line jisme dono lines chalti hain.',
  objectives: [
    'Make MTD-SW-CORE the root bridge on purpose',
    'Bundle the two core–counter cables with LACP',
    'Lock the UTS counter port to one MAC',
    'Prove UTS1 still reaches the server',
  ],
  topologyId: 'lab-mtd-resilience',
  requiredModules: ETH_IP,
  plan: {
    headers: ['Item', 'Setting'],
    rows: [
      ['Root bridge', 'MTD-SW-CORE, priority 4096'],
      ['Port-channel 1', 'CORE Gi0/23–24 ↔ COUNTER Gi0/23–24, LACP active'],
      ['Port security', 'MTD-SW-COUNTER Gi0/1, max 1 MAC, violation shutdown'],
      ['Test', 'MTD-UTS1 (10.52.10.11) → MTD-SRV (10.52.10.100)'],
    ],
  },
  tasks: [
    { id: 't1', text: 'Make MTD-SW-CORE the root bridge by lowering its priority.', check: C.stpRootIs('MTD-SW-CORE'), points: 15 },
    {
      id: 't2',
      text: 'Bundle CORE Gi0/23–24 and COUNTER Gi0/23–24 into Port-channel 1 with LACP (both members bundled on both switches).',
      check: C.all(C.etherChannelBundled('MTD-SW-CORE', 'Po1', 2), C.etherChannelBundled('MTD-SW-COUNTER', 'Po1', 2)),
      points: 25,
    },
    {
      id: 't3',
      text: 'Enable port security on MTD-SW-COUNTER Gi0/1 with a maximum of 1 MAC.',
      check: C.portSecurityOn('MTD-SW-COUNTER', 'Gi0/1', 1),
      points: 15,
    },
    {
      id: 't4',
      text: 'Ping MTD-SRV (10.52.10.100) from MTD-UTS1.',
      check: C.all(C.portSecurityOn('MTD-SW-COUNTER', 'Gi0/1', 1), C.pingSucceeds('MTD-UTS1', '10.52.10.100')),
      points: 15,
    },
  ],
  hints: [
    [
      'First look: "show spanning-tree" on each switch — who is root now, and why?',
      'On MTD-SW-CORE: configure terminal → spanning-tree vlan 1 priority 4096',
    ],
    [
      'On MTD-SW-CORE: interface range gi0/23 - 24 → channel-group 1 mode active',
      'Do the same on MTD-SW-COUNTER (active or passive). Check with "show etherchannel summary": both ports should show (P).',
    ],
    [
      'On MTD-SW-COUNTER: interface gi0/1 → switchport mode access → switchport port-security',
      'Default maximum is 1 and violation is shutdown. Check with "show port-security".',
    ],
    ['Open CLI on MTD-UTS1 → ping 10.52.10.100', 'If the port went err-disabled, another MAC was seen: shutdown / no shutdown recovers it.'],
  ],
  breakFix: {
    complaint:
      'Night shift ESM/MTD: "Core aur counter switch ke beech ek cable ki light jal rahi hai par show etherchannel mein kuch \'s\' dikh raha hai. Kisi ne config copy-paste kiya tha." Bundle wapas laao.',
    apply: (t) =>
      configure(t, 'MTD-SW-COUNTER', (c) => {
        for (const p of ['Gi0/23', 'Gi0/24']) setIf(c, p, { channelGroup: { id: 1, mode: 'on' } });
      }),
    check: C.all(
      C.etherChannelBundled('MTD-SW-CORE', 'Po1', 2),
      C.etherChannelBundled('MTD-SW-COUNTER', 'Po1', 2),
      C.pingSucceeds('MTD-UTS1', '10.52.10.100'),
    ),
    hints: [
      'show etherchannel summary on both switches — read the RailMPLS Lab note at the bottom.',
      'One side is "on", the other is LACP. Set COUNTER members back to "channel-group 1 mode active", then ping again.',
    ],
    fix: {
      cli: { 'MTD-SW-COUNTER': ['enable', 'configure terminal', 'interface range gi0/23 - 24', 'channel-group 1 mode active', 'end'] },
      pings: [['MTD-UTS1', '10.52.10.100']],
    },
  },
  quiz: [
    {
      id: 'q1',
      kind: 'mcq',
      prompt: 'The bridge ID is made of…',
      options: ['IP address + MAC', 'Priority + MAC address', 'Port number + cost', 'VLAN + IP'],
      correctIndex: 1,
      explanation: 'Lowest priority wins; on a tie, lowest MAC wins.',
    },
    {
      id: 'q2',
      kind: 'mcq',
      prompt: 'Which LACP mode pair does NOT form a bundle?',
      options: ['active + active', 'active + passive', 'passive + passive', 'on + on'],
      correctIndex: 2,
      explanation: 'Passive only answers LACP; if both are passive nobody starts the negotiation.',
    },
    {
      id: 'q3',
      kind: 'mcq',
      prompt: 'Why is a two-cable EtherChannel better than two separate STP links?',
      options: [
        'It uses no power',
        'STP sees one logical link, so both cables carry traffic and one can fail without reconvergence',
        'It removes the need for VLANs',
        'It doubles the MAC table',
      ],
      correctIndex: 1,
      explanation: 'Without bundling, STP blocks one of the parallel cables.',
    },
    {
      id: 'q4',
      kind: 'mcq',
      prompt: 'Port security in shutdown mode sees a second MAC on a max-1 port. Result?',
      options: ['Frame dropped, port stays up', 'Port goes err-disabled', 'MAC table cleared', 'Nothing'],
      correctIndex: 1,
      explanation: 'Shutdown mode err-disables the port; restrict/protect just drop frames.',
    },
    {
      id: 'q5',
      kind: 'practical',
      prompt: 'After the lab, run "show spanning-tree" on MTD-SW-COUNTER. Which interface is the Root port?',
      options: ['Gi0/22', 'Po1', 'Gi0/1', 'None — it is the root'],
      correctIndex: 1,
      explanation: 'The bundle to the core (cost of 2 × 1G) is the best path to the root, and STP sees it as Po1.',
    },
  ],
  estMinutes: 50,
  fieldNote:
    'Real gear: STP in this simulator converges instantly and runs one instance for all VLANs (real Catalyst default is Rapid PVST+, one instance per VLAN). LACP is computed, not negotiated with LACPDUs/timers; PAgP is not simulated. On real switches "channel-group mode on" facing LACP can cause loops — EtherChannel misconfig guard err-disables it.\nInterview questions: "Root bridge kaise chuna jaata hai?", "LACP active/passive?", "Port security violation modes?"',
  solution: {
    cli: {
      'MTD-SW-CORE': [
        'enable',
        'configure terminal',
        'spanning-tree vlan 1 priority 4096',
        'interface range gi0/23 - 24',
        'channel-group 1 mode active',
        'end',
      ],
      'MTD-SW-COUNTER': [
        'enable',
        'configure terminal',
        'interface range gi0/23 - 24',
        'channel-group 1 mode active',
        'interface gi0/1',
        'switchport mode access',
        'switchport port-security',
        'end',
      ],
    },
    pings: [['MTD-UTS1', '10.52.10.100']],
  },
};

export const FOUNDATION_LABS: Lab[] = [l4, l5, l6, l7, l8];
