import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B15',
  part: 'B',
  title: 'Grand capstone: Jodhpur division backbone',
  summary:
    'Poore J2 section (JU se Phulera, 27 routers) par sab kuch ek saath: IGP, LDP, L3VPN, VPWS, NMS. Phir seed se chune gaye 10 fault tickets — systematic troubleshooting ki pariksha.',
  estMinutes: 30,
  blocks: [
    {
      kind: 'text',
      heading: 'Capstone ka kaam',
      body: 'J2 woh route hai jo CAMTECH case study mein hai: JU – RKB – PPR – MTD – DNA – FL, beech ke har station par LER. Network ek chain hai — koi second path nahi — isliye ek jagah ka fault us ke peeche sab kuch kaat deta hai. Pehle build: label gap theek karo, MTD/DNA/FL ke UTS counters ko VPN se JU server tak, MTD Data Logger ka VPWS, aur 27 routers NMS par managed. Phir tickets.',
    },
    {
      kind: 'table',
      caption: 'Troubleshooting order (neeche se upar)',
      headers: ['Layer', 'Kya dekho', 'Command / jagah'],
      rows: [
        ['Power / card / link', 'Device down? port down?', 'NMS root-cause alarms, show ip interface brief'],
        ['OSPF', 'Neighbour FULL? hello, MTU, passive, loopback advertised', 'show ip ospf neighbor / interface'],
        ['LDP', 'Har OSPF neighbour par LDP session', 'show mpls ldp neighbor, show mpls interfaces'],
        ['BGP', 'PE–RR session Established? update-source, remote-as, RR client', 'show bgp vpnv4 unicast all summary'],
        ['VRF', 'RD, RT import/export, interface VRF mein', 'show ip route vrf UTS, show vrf detail'],
        ['Service / host', 'Gateway, ACL, duplex, PW VC-ID / MTU', 'ping, show mpls l2transport vc'],
      ],
    },
    {
      kind: 'text',
      heading: 'Seeded tickets',
      body: 'Catalog mein 20+ faults hain. Har attempt ek seed leta hai; seed se 10 tickets aur unka order tay hota hai. Lab panel seed dikhata hai — wahi seed dobara doge to wahi paper. Trainer sabko ek seed de sakta hai (barabar pariksha), ya har trainee alag seed le (copy nahi chalegi).',
    },
    { kind: 'widget', widget: 'ticket-seed', caption: 'Seed badlo: kaun se 10 tickets aayenge' },
    {
      kind: 'note',
      tone: 'info',
      body: 'NMS ka "path" service routing path check karta hai (aur jawab ka raasta NMS tak), ACL nahi. Isliye ek ticket mein NMS UP dikhega par counter fail — tab user-side test (ping) hi sach hai. Teaching design: J2 track map par hai, asli RailTel / NWR network nahi.',
    },
    {
      kind: 'analogy',
      body: 'Capstone = section ka annual inspection: pehle line ko chalne layak banao (build), phir Test Room ek-ek karke "fault messages" bhejta hai. Achha maintainer pehle dekhta hai ki fault kis block section se shuru hua, phir signal, phir point — order se.',
    },
  ],
  flash: [
    {
      prompt: 'J2 par BOW ke aage sab down. Pehle kya dekhoge?',
      options: ['VRF RT', 'BOW par link / power / OSPF', 'SNMP', 'QoS'],
      correctIndex: 1,
      explanation: 'Chain mein jahan se band, wahan neeche ki layer.',
    },
    {
      prompt: 'OSPF FULL, VPN fail, LDP neighbour missing. Fault?',
      options: ['RD', '"mpls ip" missing — label gap', 'Duplex', 'NTP'],
      correctIndex: 1,
      explanation: 'Har hop par label chahiye.',
    },
    {
      prompt: 'NMS par device "unreachable" (community hai). Kya check?',
      options: ['Community string', 'NMS se device tak aur wapas route', 'Duplex', 'VC-ID'],
      correctIndex: 1,
      explanation: 'Poll aur reply dono ka raasta chahiye.',
    },
    {
      prompt: 'Ek PE ka UTS fail, baaki theek, BGP Established. Shak?',
      options: ['OSPF', 'Us PE ka VRF RT / interface VRF / gateway', 'Power', 'LDP poore core mein'],
      correctIndex: 1,
      explanation: 'Sirf ek service = us service ki config.',
    },
    {
      prompt: 'Same seed dobara diya to?',
      options: ['Naye tickets', 'Wahi tickets wahi order mein', 'Koi ticket nahi', 'Random'],
      correctIndex: 1,
      explanation: 'Deterministic draw.',
    },
  ],
  glossary: [
    { term: 'Label gap', en: 'A hop with OSPF but no LDP: labelled traffic cannot cross it.', hi: 'Ek hop par label nahi.' },
    { term: 'Seed', en: 'Number that fixes a pseudo-random draw so it can be repeated.', hi: 'Random ko dohrane layak banane wala number.' },
    { term: 'Root cause', en: 'The lowest failed layer; other alarms follow from it.', hi: 'Asli kaaran.' },
  ],
  practice: { labId: 'LB15.1', note: 'Lab LB15.1: J2 backbone build + 10 seeded fault tickets (catalog 23).' },
};
