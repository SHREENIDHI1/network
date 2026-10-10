import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B3',
  part: 'B',
  title: 'MPLS fundamentals: labels, FEC, PHP',
  summary: 'Label header ke 32 bits, FEC, LER vs LSR, push/swap/pop, LIB vs LFIB, PHP, explicit-null aur TTL — packet walk JU → MTD → DNA.',
  estMinutes: 50,
  blocks: [
    {
      kind: 'text',
      heading: 'Label kahan baithta hai?',
      body: 'Ethernet header aur IP header ke beech 4-byte "shim" header — isliye MPLS ko "Layer 2.5" kehte hain. EtherType 0x8847 batata hai ki aage label hai. Ek se zyada label ho sakte hain (label stack) — VPN mein do: upar transport label, neeche service label.',
    },
    { kind: 'widget', widget: 'label-header', caption: 'Label, TC (EXP), S aur TTL badlo — 32 bits kaise bante hain dekho.' },
    {
      kind: 'table',
      caption: 'Label stack entry (RFC 3032)',
      headers: ['Field', 'Bits', 'Kaam'],
      rows: [
        ['Label', '20', 'Local significance — har router apna number deta hai'],
        ['TC (EXP)', '3', 'QoS class (B9: DSCP → EXP)'],
        ['S', '1', '1 = stack ka aakhri label'],
        ['TTL', '8', 'Loop protection; IP TTL se copy (propagate-ttl)'],
      ],
    },
    {
      kind: 'text',
      heading: 'FEC, LER, LSR',
      body: 'FEC (Forwarding Equivalence Class): packets ka group jo ek hi tarah forward ho — LDP mein har IGP prefix (khaaskar har loopback /32) ek FEC.\nIngress LER: IP packet dekhkar FEC chunta hai aur label PUSH karta hai. LSR: sirf top label dekhkar SWAP. Egress: label hata kar (POP) IP forward.',
    },
    {
      kind: 'text',
      heading: 'LIB vs LFIB',
      body: 'LIB (Label Information Base): har FEC ke liye apna local label + har neighbour ka bataya label ("show mpls ldp bindings"). LFIB: sirf woh jo forwarding mein use hota hai — routing table ke next hop wale neighbour ka label ("show mpls forwarding-table").',
    },
    {
      kind: 'text',
      heading: 'PHP aur explicit-null',
      body: 'Egress router apne prefix ke liye implicit-null (label 3) advertise karta hai — matlab "mujhe label mat bhejo". Isliye aakhri se pehla router (penultimate) label POP karke plain IP bhejta hai: PHP. Egress ko sirf ek IP lookup. "mpls ldp explicit-null" se egress label 0 maangta hai — label (aur uska TC/QoS) egress tak pahunchta hai, phir egress pop karta hai.',
    },
    { kind: 'widget', widget: 'lsp-walk', caption: 'JU se DNA tak packet walk: PHP vs explicit-null, aur TTL propagation on/off.' },
    {
      kind: 'text',
      heading: 'TTL aur traceroute',
      body: 'Default: ingress IP TTL ko label TTL mein copy karta hai, har LSR label TTL ghatata hai — traceroute mein core ke hops dikhte hain, saath mein "[MPLS: Label 18 Exp 0]". "no mpls ip propagate-ttl" se label TTL 255 — core chhup jaata hai (customer ko sirf PE dikhte hain).',
    },
    {
      kind: 'analogy',
      body: 'Label = parcel par chipka route card. Har junction purana card hatakar naya chipkata hai (swap). Destination se ek pehle wala junction card hata deta hai (PHP) — destination station sirf parcel ka address padhta hai.',
    },
  ],
  flash: [
    {
      prompt: 'MPLS EtherType?',
      options: ['0x0800', '0x8847', '0x8100', '0x0806'],
      correctIndex: 1,
      explanation: '0x8847 = MPLS unicast.',
    },
    {
      prompt: 'Implicit-null ka label number?',
      options: ['0', '1', '3', '16'],
      correctIndex: 2,
      explanation: 'Label 3 = "pop karo", wire par kabhi nahi dikhta.',
    },
    {
      prompt: 'LSR packet forward karne ke liye kya dekhta hai?',
      options: ['Destination IP', 'Top label', 'TCP port', 'Source IP'],
      correctIndex: 1,
      explanation: 'LFIB: in-label → out-label.',
    },
    {
      prompt: 'S bit = 1 ka matlab?',
      options: ['Label stack ka aakhri label', 'High priority', 'Label expired', 'Explicit-null'],
      correctIndex: 0,
      explanation: 'Bottom of stack.',
    },
    {
      prompt: '"no mpls ip propagate-ttl" ka asar traceroute par?',
      options: ['Kuch nahi', 'Core ke LSR hops nahi dikhte', 'Traceroute band', 'Sab hops do baar'],
      correctIndex: 1,
      explanation: 'Label TTL 255 se shuru — core mein expire nahi hota.',
    },
  ],
  glossary: [
    { term: 'Label', en: '20-bit locally significant identifier in the MPLS header.', hi: '20-bit local number.' },
    { term: 'FEC', en: 'Forwarding Equivalence Class: packets forwarded the same way.', hi: 'Ek tarah forward hone wale packets.' },
    { term: 'LIB / LFIB', en: 'All label bindings / the forwarding subset in use.', hi: 'Sab bindings / jo forwarding mein use.' },
    { term: 'PHP', en: 'Penultimate hop popping: the hop before the egress removes the label.', hi: 'Aakhri se pehla router label hatata hai.' },
    { term: 'Explicit-null', en: 'Label 0: egress asks to receive a label (keeps EXP).', hi: 'Label 0 — egress tak label.' },
  ],
  practice: { labId: 'LB3.1', note: 'Lab LB3.1: J1 core par JU → DNA pehla LSP — push, swap, PHP dekho.' },
};
