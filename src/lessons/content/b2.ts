import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B2',
  part: 'B',
  title: 'IGP for the MPLS core',
  summary: 'Core IGP ka ek hi kaam: har loopback sabko pata ho. Jodhpur core par OSPF/IS-IS, control board ke hisaab se areas, cost aur BFD ka idea.',
  estMinutes: 40,
  blocks: [
    {
      kind: 'text',
      heading: 'IGP sirf infrastructure ke liye',
      body: 'MPLS core mein IGP (OSPF ya IS-IS) sirf PE/P routers ke loopbacks aur core links carry karta hai. Customer/station routes (UTS LAN, CCTV LAN) IGP mein NAHI — woh VRF + MP-BGP (B5–B6) mein. Isse core chhota, stable aur fast rehta hai.',
    },
    {
      kind: 'text',
      heading: 'Jodhpur design: areas per control board',
      body: 'Division ke chaar control boards: North (MTD–BKN), Central (RKB–PLC–JSM, JU–LN–MJ), West (LN–SMR–BME–MBF, SMR–BLDI), East (MTD–DNA–FL, DNA–RTGH). Design: JU core (JU–MTD trunk, MTD–DNA, JU–LN) = area 0; North = 1, Central = 2, West = 3, East = 4. Har area area 0 ko ek junction ABR par chhoota hai (MTD, DNA, RKB, LN). IS-IS mein yahi L1 (board) / L2 (core) se hota hai.',
    },
    {
      kind: 'table',
      caption: 'Multi-area ka fayda aur keemat',
      headers: ['Fayda', 'Keemat'],
      rows: [
        ['LSA flooding area tak seemit — ek board ka flap doosre ko kam hilata hai', 'ABR par zyada config, inter-area routes'],
        ['Har board ki team apna area sambhale', 'Galat area = neighbour nahi banega'],
        ['SPF chhota', 'Summarisation sochi-samjhi chahiye (MPLS mein loopback summarise mat karo!)'],
      ],
    },
    {
      kind: 'text',
      heading: 'Cost aur reference bandwidth',
      body: 'Default reference bandwidth 100 Mbit/s — matlab 1G, 10G, 100G sab cost 1! Core par "auto-cost reference-bandwidth 100000" (100G) lagao taaki 10G = cost 10, 1G = cost 100. Generated Jodhpur topologies yahi use karti hain.',
    },
    {
      kind: 'text',
      heading: 'Tree topology aur single-homing',
      body: 'Track map par division ka network ek "tree" hai: PPR–BARA, MTD–MEC, BME–MBF, PLC–JSM aur boundary ki taraf ke sections ka sirf ek raasta. Fibre cut = station isolate. Options: alag route par dual fibre, adjacent division ke through ring closure, ya radio backup. BFD (Bidirectional Forwarding Detection) failure ko millisecond mein pakadta hai (B10).',
    },
    { kind: 'widget', widget: 'spf', caption: 'SPF yaad karo: costs badalkar dekho JU se best path kaise badalta hai.' },
    {
      kind: 'analogy',
      body: 'Area = control board ka section chart. Har board apne section ki detail rakhta hai; divisional control (area 0) ko sirf summary chahiye ki kaunsa station kis board se pahunchega.',
    },
  ],
  flash: [
    {
      prompt: 'MPLS core IGP mein kya carry karte hain?',
      options: ['Customer LANs', 'Loopbacks + core links', 'Internet table', 'MAC addresses'],
      correctIndex: 1,
      explanation: 'Customer routes VRF/BGP mein jaate hain.',
    },
    {
      prompt: 'Non-backbone area ko kya chhoona zaroori?',
      options: ['Doosra non-backbone area', 'Area 0 (ABR ke through)', 'Internet', 'Kuch nahi'],
      correctIndex: 1,
      explanation: 'Har area area 0 se ABR ke zariye juda hona chahiye.',
    },
    {
      prompt: 'Default reference bandwidth par 10G link ki OSPF cost?',
      options: ['1', '10', '100', '1000'],
      correctIndex: 0,
      explanation: '100M/10G < 1 → minimum 1. Isliye reference badhate hain.',
    },
    {
      prompt: 'MPLS core mein loopbacks ko summarise karna…',
      options: ['Hamesha achha', 'Galat — LDP ko har /32 FEC chahiye', 'Zaroori', 'Sirf area 0 mein'],
      correctIndex: 1,
      explanation: 'Summary se /32 FEC kho jaata hai aur LSP toot jaata hai.',
    },
    {
      prompt: 'Fibre cut ko tez pakadne ka protocol?',
      options: ['ARP', 'BFD', 'DHCP', 'NTP'],
      correctIndex: 1,
      explanation: 'BFD millisecond-level failure detection deta hai.',
    },
  ],
  glossary: [
    { term: 'IGP', en: 'Interior Gateway Protocol (OSPF, IS-IS) inside one network.', hi: 'Ek network ke andar ka routing protocol.' },
    { term: 'ABR', en: 'Area Border Router: connects an OSPF area to area 0.', hi: 'Area ko area 0 se jodne wala router.' },
    { term: 'Reference bandwidth', en: 'Speed that has OSPF cost 1; cost = reference / link speed.', hi: 'Cost nikalne ka base.' },
    { term: 'BFD', en: 'Bidirectional Forwarding Detection: fast link/path failure detection.', hi: 'Tez failure detection.' },
  ],
  practice: { labId: 'LB2.1', note: 'Lab LB2.1: J1 core par West side (LN, SMR, BME, MJ, BLDI) ko OSPF mein laao.' },
};
