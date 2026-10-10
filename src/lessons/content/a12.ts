import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A12',
  part: 'A',
  title: 'Security basics: ACLs, firewall zones',
  summary:
    'Standard aur extended ACL, wildcard mask, first-match aur implicit deny, UTS ko Railnet se alag rakhna, firewall zones aur management-plane security.',
  estMinutes: 60,
  blocks: [
    {
      kind: 'text',
      heading: 'ACL = router ka gatekeeper',
      body: 'Access Control List (ACL) lines ki list hai: har line permit ya deny. Packet upar se neeche check hota hai; pehli matching line ka faisla final (first match). Koi line match na ho to end mein chhupi "deny any" (implicit deny) — isliye aakhri mein "permit ip any any" bhoolna classic galti hai.',
    },
    {
      kind: 'analogy',
      body: 'ACL = level crossing gate ka register: gateman upar se padhta hai — "ambulance: allow", "truck 20 ton se zyada: deny" — pehli matching entry ke hisaab se faisla. Register mein naam nahi to gate band (implicit deny).',
    },
    {
      kind: 'table',
      caption: 'Standard vs extended',
      headers: ['', 'Standard (1–99)', 'Extended (100–199)'],
      rows: [
        ['Kya dekhta hai', 'Sirf source address', 'Protocol, source, destination, port'],
        ['Kahan lagao', 'Destination ke paas', 'Source ke paas (kachra jaldi roko)'],
        ['Example', 'access-list 10 permit 10.52.99.0 0.0.0.255', 'access-list 110 deny ip 10.52.10.0 0.0.0.255 10.52.50.0 0.0.0.255'],
      ],
    },
    {
      kind: 'text',
      heading: 'Wildcard mask',
      body: 'Wildcard = ulta mask: 0 bit = "match karna zaroori", 1 bit = "kuch bhi". 0.0.0.255 = last octet kuch bhi (/24). 0.0.0.0 = exact host ("host 10.1.1.1"). 255.255.255.255 = sab ("any"). Trick: wildcard = 255.255.255.255 − subnet mask.',
    },
    {
      kind: 'widget',
      widget: 'acl-eval',
      caption: 'ACL lines likho, packet badlo — dekho kaunsi line pehle match hoti hai (simulator ka hi ACL engine).',
    },
    {
      kind: 'text',
      heading: 'UTS ko Railnet se alag rakhna',
      body: 'UTS ticketing ek financial system hai; office ke Railnet PCs (jahan email/internet chalta hai) se UTS VLAN tak koi raasta nahi hona chahiye. Extended ACL Railnet VLAN ke gateway par inbound: "deny ip <Railnet subnet> <UTS subnet>", phir "permit ip any any". Interface par lagao: "ip access-group 110 in".',
    },
    {
      kind: 'text',
      heading: 'Firewall zones',
      body: 'Firewall network ko zones mein baantta hai: inside (trusted, railway LANs), outside (Internet), DMZ (public servers). Policy: inside → outside allowed, outside → inside blocked, sirf zaroori return traffic. Asli firewalls stateful hote hain (session yaad rakhte hain, reply apne aap allow). Simulator ka firewall ek router hai jismein stateless ACLs — return traffic ke liye bhi rule chahiye (Model Limitations).',
    },
    {
      kind: 'text',
      heading: 'Management-plane security',
      body: 'Devices ko configure karne ka rasta bhi bachao: Telnet band, sirf SSH ("transport input ssh"), local usernames ("login local"), vty par "access-class" se sirf NMS/admin subnet, SNMP community default "public" nahi, NTP se sahi time (logs ke liye). Aur unused switch ports shutdown + port security (A8).',
    },
  ],
  flash: [
    {
      prompt: 'ACL mein sirf "deny ip 10.52.10.0 0.0.0.255 any" hai. Baaki traffic ka kya?',
      options: ['Sab allow', 'Sab deny — implicit deny any', 'Router error deta hai', 'Sirf ICMP allow'],
      correctIndex: 1,
      explanation: 'Har ACL ke end mein chhupa "deny any" hota hai; "permit ip any any" jodo.',
    },
    {
      prompt: '/24 subnet ka wildcard?',
      options: ['255.255.255.0', '0.0.0.255', '0.0.0.0', '255.0.0.0'],
      correctIndex: 1,
      explanation: '255.255.255.255 − 255.255.255.0 = 0.0.0.255.',
    },
    {
      prompt: 'Extended ACL kahan lagana best hai?',
      options: ['Destination ke paas', 'Source ke paas', 'Kahin bhi', 'Sirf outside interface par'],
      correctIndex: 1,
      explanation: 'Unwanted traffic ko jaldi rok do, bandwidth bachti hai. Standard ACL destination ke paas.',
    },
    {
      prompt: 'ACL lines: 1) permit ip any any 2) deny ip 10.52.50.0 0.0.0.255 any. Railnet (10.52.50.x) ka traffic?',
      options: ['Deny', 'Permit — pehli line hi match ho gayi', 'Error', 'Half'],
      correctIndex: 1,
      explanation: 'First match wins; order bahut important hai.',
    },
    {
      prompt: 'vty par "access-class 10 in" ka kaam?',
      options: ['Interface traffic filter', 'Sirf ACL 10 mein permitted addresses router par SSH/Telnet kar sakte', 'NAT', 'QoS'],
      correctIndex: 1,
      explanation: 'Management access ko chuninda subnets tak seemit karta hai.',
    },
  ],
  glossary: [
    { term: 'ACL', en: 'Ordered permit/deny list matched first-hit.', hi: 'Permit/deny ki list, pehli match se faisla.' },
    { term: 'Implicit deny', en: 'Hidden "deny any" at the end of every ACL.', hi: 'Har ACL ke end mein chhupa deny.' },
    { term: 'Wildcard mask', en: '0 = must match, 1 = ignore; inverse of a subnet mask.', hi: '0 = match zaroori, 1 = kuch bhi.' },
    { term: 'Stateful firewall', en: 'Tracks sessions and allows replies automatically.', hi: 'Session yaad rakhta hai, reply allow.' },
    { term: 'access-class', en: 'ACL applied to vty lines (who may log in remotely).', hi: 'Remote login kaun kar sakta.' },
  ],
  practice: { labId: 'L12.1', note: 'Lab L12.1: MTD par UTS ko Railnet se alag karo aur management sirf SSH + NMS subnet se.' },
};
