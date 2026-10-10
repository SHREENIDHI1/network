import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B8',
  part: 'B',
  title: 'TDM over MPLS (E1 pseudowire)',
  summary:
    'Purane E1 circuits (BPAC, block, control phones) ko MPLS par: SAToP (poora E1) aur CESoPSN (kuch timeslots), packetisation, clock aur jitter buffer, QoS aur safety procedure.',
  estMinutes: 45,
  blocks: [
    {
      kind: 'text',
      heading: 'E1 ko packet mein kaise?',
      body: 'E1 = 2.048 Mbit/s, har 125 µs mein ek frame, 32 timeslots × 8 bit. TS0 frame alignment, TS16 aksar signalling (CAS); TS1–15 aur 17–31 voice/data, har ek 64 kbit/s. TDM pseudowire PE par E1 ke bits ko jama karke packet banata hai (kuch frames ek packet mein), MPLS labels lagata hai, aur doosre PE par wapas usi rate se E1 nikaalta hai.',
    },
    {
      kind: 'table',
      caption: 'SAToP vs CESoPSN',
      headers: ['', 'SAToP (RFC 4553)', 'CESoPSN (RFC 5086)'],
      rows: [
        ['Kya le jaata hai', 'Poora E1, framing samet ("unframed")', 'Sirf chune hue timeslots'],
        ['Bandwidth', '2.048 Mbit/s + overhead', 'N × 64 kbit/s + overhead'],
        ['Kab', 'Equipment apna framing khud karta hai (BPAC, block E1)', 'Kuch channels: control/emergency phones'],
        ['IOS config', 'controller E1 x → cem-group 0 unframed', 'controller E1 x → cem-group 0 timeslots 1-4'],
        ['Pseudowire', 'interface CEMx → cem 0 → xconnect <peer> <vc> encapsulation mpls', 'Same'],
      ],
    },
    { kind: 'widget', widget: 'tdm-pw', caption: 'Packetisation: frames per packet, delay aur bandwidth' },
    {
      kind: 'text',
      heading: 'Clock, jitter buffer aur QoS',
      body: 'TDM equipment ek steady clock maangta hai. Packet network mein har packet thoda alag delay se aata hai (jitter). Egress PE jitter buffer mein packets rok kar ek-saar rate se E1 bhejta hai, aur clock recover karta hai (adaptive: packet rate se; differential: dono taraf common reference). Buffer khaali hua = bit slip / errors. Isliye TDM PW ko core mein strict-priority queue (P7 MPLS QoS) aur protected path chahiye.',
    },
    {
      kind: 'note',
      tone: 'safety',
      body: 'BPAC aur block circuits safety-critical hain. Asli migration disconnection memo, block working ki alternate vyavastha aur S&T supervisor ke saath hoti hai; testing ke dauran live block circuit par kuch nahi chhedte. Yeh simulator sirf concept sikhata hai.',
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator (networking-only mode): E1 controllers logical hain (NEON profile ke E1-0/2/x, E1-0/4/x) — E1 cable, framer, LOS/AIS alarms, clock aur asli TDM bits simulate nahi hote. VC state dono taraf ke config se calculate hota hai; "ping mpls pseudowire" asli MPLS echo VC label ke saath bhejta hai.',
    },
    {
      kind: 'analogy',
      body: 'TDM PW = paani ki steady pipeline ko baltiyon mein bhar kar truck se bhejna, aur doosri taraf ek tank (jitter buffer) se phir steady dhaar nikaalna. Baltiyan der se aayi aur tank khaali hua = dhaar toot gayi (slip).',
    },
  ],
  flash: [
    {
      prompt: 'Poora E1 framing samet bhejne wala PW type?',
      options: ['CESoPSN', 'SAToP', 'VPLS', 'EoMPLS'],
      correctIndex: 1,
      explanation: 'Structure-Agnostic TDM over Packet.',
    },
    {
      prompt: 'CESoPSN timeslots 1-6 ka payload rate?',
      options: ['64 kbit/s', '384 kbit/s', '2.048 Mbit/s', '1.92 Mbit/s'],
      correctIndex: 1,
      explanation: '6 × 64 = 384 kbit/s.',
    },
    {
      prompt: 'E1 ka TS0 kis kaam aata hai?',
      options: ['Voice', 'Frame alignment', 'Data', 'Khaali'],
      correctIndex: 1,
      explanation: 'Isliye cem-group timeslots 1–31 hi le sakta hai.',
    },
    {
      prompt: 'Jitter buffer ka kaam?',
      options: ['Encryption', 'Packet delay variation sokh kar steady E1 dena', 'Routing', 'Label allocate'],
      correctIndex: 1,
      explanation: 'Buffer khaali = slips.',
    },
    {
      prompt: 'Ek PE par timeslots 1-4, doosre par 1-3. VC?',
      options: ['UP', 'DOWN (timeslot mismatch)', 'UP par 3 channels', 'Admin down'],
      correctIndex: 1,
      explanation: 'Dono taraf same CEM structure chahiye.',
    },
  ],
  glossary: [
    { term: 'E1', en: '2.048 Mbit/s TDM circuit: 32 timeslots of 64 kbit/s (G.704).', hi: '32 timeslot wala 2 Mbps circuit.' },
    { term: 'SAToP', en: 'Structure-Agnostic TDM over Packet (RFC 4553): whole E1.', hi: 'Poora E1 packet mein.' },
    { term: 'CESoPSN', en: 'Circuit Emulation over PSN (RFC 5086): selected timeslots.', hi: 'Kuch timeslots packet mein.' },
    { term: 'CEM', en: 'Circuit emulation: the PE function and interface that packetises TDM.', hi: 'TDM ko packet banane wala hissa.' },
    { term: 'Jitter buffer', en: 'Egress buffer that absorbs packet delay variation.', hi: 'Delay variation sokhne wala buffer.' },
  ],
  practice: { labId: 'LB8.1', note: 'Lab LB8.1: KQW–REN BPAC (SAToP) aur MTD–JAC control circuit (CESoPSN).' },
};
