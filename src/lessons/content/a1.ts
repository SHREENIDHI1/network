import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A1',
  part: 'A',
  title: 'OSI and TCP/IP models',
  summary: 'Data layers mein kaise bant ta hai, encapsulation kya hai, aur MPLS ko "Layer 2.5" kyon kehte hain.',
  estMinutes: 40,
  blocks: [
    {
      kind: 'text',
      heading: 'Layers kyon?',
      body: 'Network ka kaam bahut bada hai: bijli/light ka signal, frame banana, address dekhna, rasta chunna, data poora pahunchana. Isko chhote-chhote kaamon (layers) mein baant diya gaya. Har layer apna kaam karti hai aur sirf apne upar-neeche wali layer se baat karti hai. Isse troubleshooting aasaan hoti hai: "link LED band hai" = Layer 1 problem, "IP galat hai" = Layer 3 problem.',
    },
    {
      kind: 'diagram',
      diagram: 'osi-stack',
      caption: 'OSI ke 7 layers aur TCP/IP ke 4 layers ka mapping. MPLS label L2 aur L3 ke beech lagta hai.',
    },
    {
      kind: 'table',
      caption: 'OSI layers — railway example ke saath',
      headers: ['#', 'Layer', 'Kaam', 'Example / device'],
      rows: [
        ['7', 'Application', 'User ka actual data/service', 'UTS/PRS app, web, SNMP'],
        ['6', 'Presentation', 'Format, encryption', 'TLS, character encoding'],
        ['5', 'Session', 'Baat-cheet shuru/khatam', '(TCP/IP mein app ke andar)'],
        ['4', 'Transport', 'End-to-end delivery, ports', 'TCP, UDP'],
        ['3', 'Network', 'Logical address (IP), routing', 'Router, L3 switch'],
        ['2', 'Data link', 'Frame, MAC address, ek link par delivery', 'Switch, Ethernet, VLAN'],
        ['1', 'Physical', 'Bits ko signal mein badalna', 'Cat6, OFC, SFP, hub'],
      ],
    },
    {
      kind: 'analogy',
      body: 'Parcel booking socho: Application = aapka saamaan; Transport = parcel office jo packing aur receipt deta hai; Network = destination station code (pura route kaun sa); Data link = agle station tak ka wagon label; Physical = actual track aur wheels. Har station par wagon label badalta hai (L2), lekin final destination code (L3) wahi rehta hai.',
    },
    {
      kind: 'text',
      heading: 'TCP/IP model — jo asal mein chalta hai',
      body: 'Internet aur Railway IP networks TCP/IP model follow karte hain: Application (OSI 5-7), Transport (4), Internet (3), Link/Network access (1-2). OSI padhane aur troubleshooting ke liye useful hai; protocols TCP/IP ke hain.',
    },
    {
      kind: 'text',
      heading: 'Encapsulation — lifafe ke andar lifafa',
      body: 'Bhejte waqt har layer data ke aage apna header lagati hai: app data → TCP/UDP segment (ports) → IP packet (source/destination IP) → Ethernet frame (MAC addresses + FCS) → bits. Receive karne wala ulta karta hai (de-encapsulation). Router har hop par L2 header hata kar naya lagata hai, lekin IP header (TTL ke alawa) wahi rehta hai.',
    },
    {
      kind: 'widget',
      widget: 'encapsulation',
      caption: 'Step button dabao: dekho har layer kaunsa header jodti hai, aur "MPLS" on karke label kahan lagta hai.',
    },
    {
      kind: 'keyterms',
      terms: [
        {
          term: 'PDU',
          meaning: 'Protocol Data Unit — har layer par data ka naam: bits (L1), frame (L2), packet (L3), segment/datagram (L4).',
        },
        {
          term: 'Header',
          meaning: 'Layer ki control information jo data ke aage lagti hai (address, type, length).',
        },
        {
          term: 'Encapsulation',
          meaning: 'Upar ki layer ka data neeche ki layer ke andar wrap karna.',
        },
        {
          term: 'FCS',
          meaning: 'Frame Check Sequence — Ethernet frame ke end mein error check (CRC).',
        },
      ],
    },
    {
      kind: 'text',
      heading: 'MPLS = "Layer 2.5"',
      body: 'MPLS ek 4-byte label Ethernet header aur IP header ke beech lagata hai (isliye L2.5). Core routers (LSR) poora IP header nahi dekhte; sirf label dekh kar label badal kar aage bhej dete hain. Label = "is train ka rake number", jo har junction par naya assign ho sakta hai. Details B3 mein.',
    },
    {
      kind: 'table',
      caption: 'MPLS label (32 bits)',
      headers: ['Field', 'Bits', 'Kaam'],
      rows: [
        ['Label', '20', 'Forwarding ke liye number'],
        ['TC (EXP)', '3', 'Traffic class / QoS'],
        ['S', '1', 'Bottom of stack (last label?)'],
        ['TTL', '8', 'Loop se bachav'],
      ],
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator mein MPLS forwarding Phase 4 (B3/B4) se aayegi; abhi encapsulation widget sirf concept dikhata hai.',
    },
  ],
  flash: [
    {
      prompt: 'IP address kis OSI layer ka hai?',
      options: ['Layer 1 Physical', 'Layer 2 Data link', 'Layer 3 Network', 'Layer 4 Transport'],
      correctIndex: 2,
      explanation: 'IP logical address aur routing Layer 3 (Network) ka kaam hai.',
    },
    {
      prompt: 'Switch normally kis layer par frames forward karta hai?',
      options: ['Layer 1', 'Layer 2 (MAC address se)', 'Layer 4', 'Layer 7'],
      correctIndex: 1,
      explanation: 'L2 switch destination MAC address dekh kar frame forward karta hai. Hub Layer 1 par sirf signal repeat karta hai.',
    },
    {
      prompt: 'Encapsulation ka sahi order (bhejte waqt) kaunsa hai?',
      options: ['Frame → packet → segment → data', 'Data → segment → packet → frame → bits', 'Bits → packet → frame', 'Packet → data → frame'],
      correctIndex: 1,
      explanation: 'Upar se neeche: app data, phir TCP/UDP segment, phir IP packet, phir Ethernet frame, phir bits.',
    },
    {
      prompt: 'MPLS label kahan lagta hai?',
      options: ['IP header ke andar', 'Ethernet (L2) header aur IP (L3) header ke beech', 'TCP header ke baad', 'Frame ke FCS ke baad'],
      correctIndex: 1,
      explanation: 'Isiliye MPLS ko "Layer 2.5" kehte hain.',
    },
    {
      prompt: 'Router ek hop se doosre hop par packet bhejte waqt kya badalta hai?',
      options: ['Destination IP address', 'Source IP address', 'Layer 2 header (MAC addresses) — aur TTL ek kam hota hai', 'Application data'],
      correctIndex: 2,
      explanation: 'Har hop par naya L2 frame banta hai; IP addresses same rehte hain (NAT na ho to), TTL 1 kam hota hai.',
    },
  ],
  glossary: [
    {
      term: 'OSI model',
      en: 'Seven-layer reference model for network functions.',
      hi: 'Network ke kaam ko 7 layers mein samjhane ka model.',
    },
    {
      term: 'TCP/IP model',
      en: 'Four-layer model used by real Internet protocols.',
      hi: 'Asal protocols wala 4-layer model.',
    },
    {
      term: 'Encapsulation',
      en: 'Adding a lower layer header around upper layer data.',
      hi: 'Upar ki layer ke data par neeche ki layer ka header lagana.',
    },
    {
      term: 'Frame',
      en: 'Layer 2 PDU (e.g. Ethernet frame).',
      hi: 'Layer 2 ka data unit.',
    },
    {
      term: 'Packet',
      en: 'Layer 3 PDU (e.g. IPv4 packet).',
      hi: 'Layer 3 ka data unit.',
    },
    {
      term: 'MPLS label',
      en: '32-bit shim header between L2 and L3 used for forwarding.',
      hi: 'L2 aur L3 ke beech 4-byte label jisse forward hota hai.',
    },
  ],
  practice: {
    note: 'Sandbox mein do PC jodkar ping karo aur Packet Inspector mein headers dekho (Ethernet, ARP, IP, ICMP). Guided lab Phase 2 mein.',
  },
};
