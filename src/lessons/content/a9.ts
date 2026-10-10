import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A9',
  part: 'A',
  title: 'Routing basics',
  summary: 'Router kya karta hai, routing table, connected/static/default routes, longest-prefix match, AD aur metric, inter-VLAN routing.',
  estMinutes: 55,
  blocks: [
    {
      kind: 'text',
      heading: 'Router ka kaam',
      body: 'Switch ek network (subnet/VLAN) ke andar frames le jaata hai. Router alag-alag networks ko jodta hai: packet ka destination IP padhta hai, routing table mein dekhta hai, TTL ek kam karta hai, aur sahi interface se next hop ko bhej deta hai. Har hop par naya Layer 2 frame banta hai, IP header (TTL ke alawa) wahi rehta hai.',
    },
    {
      kind: 'analogy',
      body: 'Router = junction station ka cabin. Har train (packet) par destination station code likha hai. Cabin ka register (routing table) batata hai: "BKN ke liye MTD wali line, FL ke liye DNA wali line, baaki sab JU". Sabse specific entry jeetti hai.',
    },
    {
      kind: 'table',
      caption: 'Routing table ke route types',
      headers: ['Code', 'Type', 'Kaise aata hai'],
      rows: [
        ['C', 'Connected', 'Interface par IP + no shutdown + link up'],
        ['L', 'Local', 'Router ka apna address (/32)'],
        ['S', 'Static', '"ip route" command — admin ne haath se likha'],
        ['S*', 'Default static', '"ip route 0.0.0.0 0.0.0.0 next-hop" — baaki sab ke liye'],
        ['O / i / R', 'Dynamic', 'OSPF / IS-IS / RIP se seekha (A10)'],
      ],
    },
    {
      kind: 'text',
      heading: 'Longest-prefix match, AD aur metric',
      body: 'Destination ke liye kai routes match kar sakte hain (0.0.0.0/0, 10.52.0.0/16, 10.52.10.0/24). Rule 1: sabse lamba prefix (sabse specific) jeetta hai — /24 > /16 > /0. Rule 2: same prefix do sources se aaya to kam Administrative Distance (AD) wala table mein jaata hai. Rule 3: same protocol ke andar kam metric wala.',
    },
    {
      kind: 'table',
      caption: 'Default administrative distance (Cisco)',
      headers: ['Source', 'AD'],
      rows: [
        ['Connected', '0'],
        ['Static', '1'],
        ['eBGP', '20'],
        ['OSPF', '110'],
        ['IS-IS', '115'],
        ['RIP', '120'],
        ['iBGP', '200'],
      ],
    },
    { kind: 'widget', widget: 'lpm', caption: 'Destination badlo aur dekho kaunsa route jeetta hai aur kyon. AD badal kar bhi try karo.' },
    {
      kind: 'text',
      heading: 'Static routes — kab aur kaise',
      body: '"ip route 10.52.20.0 255.255.255.0 10.255.0.1" = is network ke liye next hop 10.255.0.1. Chhote station (ek uplink) ke liye default route kaafi: "ip route 0.0.0.0 0.0.0.0 10.255.0.1". Kami: link toote to static route apne aap dusra rasta nahi dhoondhta — isliye bade network mein dynamic routing (A10).',
    },
    {
      kind: 'text',
      heading: 'Inter-VLAN routing',
      body: 'Alag VLANs = alag subnets, beech mein router chahiye. Tareeka 1 — router-on-a-stick: switch se router tak ek trunk; router par har VLAN ka subinterface (Gi0/0.10 "encapsulation dot1Q 10", IP = us VLAN ka gateway). Tareeka 2 — L3 switch: "ip routing" + har VLAN ka SVI (interface vlan 10). L3 switch hardware mein route karta hai, bade stations ke liye behtar.',
    },
    { kind: 'diagram', diagram: 'router-on-a-stick', caption: 'Ek trunk par do VLANs; router ke subinterfaces dono ke gateway.' },
    {
      kind: 'note',
      tone: 'info',
      body: 'Router pehle packet ko ARP ke liye drop karta hai — isliye router se pehla ping aksar ".!!!!" dikhata hai. Simulator yeh IOS behaviour dikhata hai.',
    },
  ],
  flash: [
    {
      prompt: 'Routes 10.52.0.0/16 (OSPF) aur 10.52.10.0/24 (OSPF) dono hain. Packet 10.52.10.5 ke liye kaunsa?',
      options: ['/16 kyunki pehle aaya', '/24 — longest prefix match', 'Dono par load share', 'Default route'],
      correctIndex: 1,
      explanation: 'Sabse specific (lamba) prefix hamesha jeetta hai, AD/metric baad mein.',
    },
    {
      prompt: 'Same prefix: static (AD 1) aur OSPF (AD 110). Table mein kaun?',
      options: ['OSPF', 'Static', 'Dono', 'Jiska metric kam'],
      correctIndex: 1,
      explanation: 'Kam AD = zyada bharosemand source.',
    },
    {
      prompt: 'Default route ka prefix kya hota hai?',
      options: ['255.255.255.255/32', '0.0.0.0/0', '127.0.0.1/8', '10.0.0.0/8'],
      correctIndex: 1,
      explanation: '0.0.0.0/0 sab addresses ko match karta hai — "gateway of last resort".',
    },
    {
      prompt: 'Router-on-a-stick mein VLAN 20 ka gateway kahan configure hota hai?',
      options: ['Switch ke access port par', 'Router ke subinterface Gi0/0.20 par (encapsulation dot1Q 20)', 'PC par', 'DNS server par'],
      correctIndex: 1,
      explanation: 'Har VLAN ka ek subinterface, uska IP us VLAN ka gateway.',
    },
    {
      prompt: 'Router packet forward karte waqt kya badalta hai?',
      options: ['Destination IP', 'TTL (−1) aur Layer 2 header', 'Source IP (hamesha)', 'Payload'],
      correctIndex: 1,
      explanation: 'NAT na ho to IP addresses same; TTL kam hota hai, naya frame banta hai.',
    },
  ],
  glossary: [
    { term: 'Routing table', en: 'List of known networks and how to reach them.', hi: 'Networks aur unke raste ki list.' },
    { term: 'Next hop', en: 'Neighbouring router the packet is handed to.', hi: 'Agla router jisko packet diya jaata hai.' },
    { term: 'Administrative distance', en: 'Trust value of a route source; lower wins.', hi: 'Route source par bharosa; kam jeetta hai.' },
    { term: 'Metric', en: 'Cost of a route inside one protocol.', hi: 'Ek protocol ke andar route ki keemat.' },
    { term: 'Default route', en: '0.0.0.0/0 — used when nothing more specific matches.', hi: '0.0.0.0/0 — jab kuch aur match na ho.' },
    { term: 'Subinterface', en: 'Logical interface on a router port, one per VLAN (802.1Q).', hi: 'Router port par VLAN-wise logical interface.' },
    { term: 'SVI', en: 'Switch virtual interface (interface vlan N) on an L3 switch.', hi: 'L3 switch par VLAN ka routed interface.' },
  ],
  practice: { labId: 'L9.1', note: 'Lab L9.1: MTD par router-on-a-stick, static route JU tak, aur default route.' },
};
