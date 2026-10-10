import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B4',
  part: 'B',
  title: 'LDP',
  summary:
    'LDP discovery, session, label bindings, LDP-IGP sync, LSP ping/trace, aur troubleshooting: router-id unreachable, "mpls ip" missing, MTU.',
  estMinutes: 50,
  blocks: [
    {
      kind: 'table',
      caption: 'LDP ke chaar kadam',
      headers: ['Kadam', 'Kya hota hai', 'Check'],
      rows: [
        ['1. Discovery', 'Link hellos (UDP 646) har "mpls ip" interface par', 'show mpls ldp discovery'],
        ['2. Session', 'Transport address (LDP router-ID) par TCP 646 session', 'show mpls ldp neighbor'],
        ['3. Bindings', 'Har FEC ka label sab neighbours ko (downstream unsolicited)', 'show mpls ldp bindings'],
        ['4. Forwarding', 'Next hop ke label se LFIB', 'show mpls forwarding-table'],
      ],
    },
    {
      kind: 'text',
      heading: 'LDP router-ID',
      body: 'Default: sabse bada loopback IP. Best practice: "mpls ldp router-id Loopback0 force". Yahi transport address hai — peer ko iska route IGP se chahiye. Loopback OSPF mein advertise nahi = hellos dikhte hain par session kabhi nahi banta.',
    },
    {
      kind: 'text',
      heading: 'LDP-IGP synchronization',
      body: 'Problem: link up, OSPF FULL, par LDP session abhi nahi — IGP traffic us link par bhejega aur wahan label nahi → VPN traffic black-hole. "mpls ldp sync" (router ospf ke andar): jab tak LDP up nahi, OSPF us link ko max cost (65535) se advertise karta hai.',
    },
    {
      kind: 'text',
      heading: 'LSP ping aur traceroute',
      body: 'Normal ping sirf IP path test karta hai. "ping mpls ipv4 10.0.3.10/32" MPLS echo request (UDP 3503, IP destination 127.0.0.1) usi label ke saath bhejta hai jo FEC ke liye LFIB mein hai — LSP toota to fail. "traceroute mpls ipv4" label TTL 1, 2, 3… bhejkar har hop ka jawab dikhata hai: L = labelled transit, ! = egress pahunch gaye, Q = label hi nahi (bheja nahi).',
    },
    {
      kind: 'table',
      caption: 'Field fault → symptom → check',
      headers: ['Fault', 'Symptom', 'Check / fix'],
      rows: [
        ['"mpls ip" ek side missing', 'Discovery nahi, neighbour list mein peer gayab', 'show mpls interfaces → mpls ip'],
        ['Loopback IGP mein nahi', 'Hellos haan, session nahi', 'show ip route <peer router-id> → network statement'],
        ['Duplicate LDP router-ID', 'Session nahi', 'Unique loopbacks'],
        ['MTU chhota (labels +4 byte each)', 'Bade packets drop, ping chalta', 'MPLS MTU / core MTU badhao (simulator mein modelled nahi)'],
        ['LDP down, IGP up (bina sync)', 'VPN black-hole', 'mpls ldp sync'],
      ],
    },
    {
      kind: 'analogy',
      body: 'Discovery = do stations ke beech block instrument ka "bell code" sunai dena. Session = dono ke beech dedicated control phone line (transport address tak route). Bindings = har train ke liye line number ki list share karna.',
    },
  ],
  flash: [
    {
      prompt: 'LDP session kis address par banta hai?',
      options: ['Interface IP', 'Transport address = LDP router-ID', 'MAC', 'Default gateway'],
      correctIndex: 1,
      explanation: 'Isliye router-ID ka route zaroori.',
    },
    {
      prompt: 'LDP hellos ka port?',
      options: ['UDP 53', 'UDP/TCP 646', 'TCP 179', 'UDP 3503'],
      correctIndex: 1,
      explanation: 'Hellos UDP 646, session TCP 646. 3503 = LSP ping.',
    },
    {
      prompt: 'traceroute mpls mein "Q" ka matlab?',
      options: ['Success', 'Request not sent — FEC ka label nahi', 'Timeout', 'Egress'],
      correctIndex: 1,
      explanation: 'Ingress par hi label nahi mila.',
    },
    {
      prompt: '"mpls ldp sync" kya karta hai?',
      options: ['LDP fast karta hai', 'LDP down link ko IGP mein max cost', 'Labels sync', 'NTP sync'],
      correctIndex: 1,
      explanation: 'Traffic label-less link se bachta hai.',
    },
    {
      prompt: 'Normal ping chal raha, LSP ping fail. Matlab?',
      options: ['Sab theek', 'IP path theek, label path kahin toota', 'Destination down', 'DNS problem'],
      correctIndex: 1,
      explanation: 'Kisi hop par "No Label".',
    },
  ],
  glossary: [
    { term: 'LDP', en: 'Label Distribution Protocol: distributes FEC-to-label bindings.', hi: 'Labels baantne ka protocol.' },
    { term: 'Transport address', en: 'Address used for the LDP TCP session (router-ID).', hi: 'LDP session ka address.' },
    { term: 'LSP', en: 'Label Switched Path from ingress to egress for a FEC.', hi: 'Label ka raasta.' },
    { term: 'LDP-IGP sync', en: 'IGP avoids links whose LDP session is not up.', hi: 'LDP na ho to IGP link avoid kare.' },
    { term: 'LSP ping', en: 'MPLS echo request along the LSP (RFC 8029).', hi: 'Label path ka ping.' },
  ],
  practice: { labId: 'LB4.1', note: 'Lab LB4.1: J2 par do LDP faults dhoondho aur JU → FL LSP chalao.' },
};
