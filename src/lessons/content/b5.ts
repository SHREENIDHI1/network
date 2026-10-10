import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B5',
  part: 'B',
  title: 'BGP and MP-BGP',
  summary: 'eBGP vs iBGP, 150+ POPs ka full-mesh problem, route reflector pair (JU + MTD), best-path ke kadam, aur MP-BGP VPNv4 — L3VPN ki neev.',
  estMinutes: 55,
  blocks: [
    {
      kind: 'text',
      heading: 'BGP kyon, jab OSPF hai?',
      body: 'OSPF/IS-IS core ke andar loopbacks aur links ka raasta jaanta hai — kuch hazaar routes tak theek. Par station/application ke routes (UTS, PRS, SCADA…) aur doosre network (Jaipur division, ISP) ke routes IGP mein daalne se core bhaari aur nazuk ho jaata hai. BGP routes ko "policy" ke saath le jaata hai, TCP 179 par, aur sirf badlav bhejta hai. Core IGP sirf loopbacks jaane — baaki BGP.',
    },
    {
      kind: 'table',
      caption: 'eBGP vs iBGP',
      headers: ['', 'eBGP', 'iBGP'],
      rows: [
        ['Peer', 'Doosra AS (e.g. JP division AS 65002)', 'Apna hi AS (65000)'],
        ['Session address', 'Usually directly connected interface IP', 'Loopback (update-source Loopback0), IGP se reachable'],
        ['Next hop', 'Badalta hai (apna IP)', 'Nahi badalta — isliye border par "next-hop-self"'],
        ['Loop rokna', 'AS-path mein apna AS dikha to reject', 'iBGP se seekha route doosre iBGP peer ko aage nahi (split horizon)'],
        ['AD (IOS)', '20', '200'],
      ],
    },
    {
      kind: 'text',
      heading: 'Full-mesh problem',
      body: 'iBGP split horizon ki wajah se har iBGP router ko har doosre se session chahiye: n × (n − 1) / 2. Division mein 150+ POPs = 11 000+ sessions, aur har naye station par saare routers ka config badalna. Hal: route reflector (RR). RR clients ke routes doosre clients ko "reflect" kar deta hai. Har POP sirf RR pair (JU aur MTD) se baat kare — naya station = sirf 2 sessions.',
    },
    { kind: 'widget', widget: 'ibgp-mesh', caption: 'Full mesh vs route reflectors: sessions ginno' },
    {
      kind: 'text',
      heading: 'RR ke niyam (RFC 4456)',
      body: 'Client se aaya route → sab clients aur non-clients ko. Non-client se aaya → sirf clients ko. eBGP se aaya → sabko. Loop rokne ke liye RR do attributes jodta hai: ORIGINATOR_ID (route kisne shuru kiya) aur CLUSTER_LIST (kaun-kaun se RR se guzra). RR next hop nahi badalta — isliye traffic RR se hoke nahi jaata, seedha PE se PE (MPLS LSP par).',
    },
    {
      kind: 'table',
      caption: 'Best path — pehla farq jahan mile wahin faisla (simulator ka order)',
      headers: ['#', 'Attribute', 'Behtar'],
      rows: [
        ['1', 'Weight (Cisco local)', 'Zyada'],
        ['2', 'LOCAL_PREF', 'Zyada (default 100)'],
        ['3', 'Locally originated', 'Apna route'],
        ['4', 'AS_PATH length', 'Chhota'],
        ['5', 'ORIGIN', 'IGP < EGP < incomplete'],
        ['6', 'MED', 'Kam'],
        ['7', 'eBGP vs iBGP', 'eBGP'],
        ['8', 'IGP cost to next hop', 'Kam'],
        ['9', 'Router-ID / ORIGINATOR_ID, phir peer IP', 'Kam'],
      ],
    },
    {
      kind: 'text',
      heading: 'MP-BGP aur VPNv4',
      body: 'Multiprotocol BGP ek hi session par kai "address families" le jaata hai: ipv4 unicast, vpnv4 unicast, l2vpn… VPNv4 route = RD (8 byte) + IPv4 prefix, saath mein route-target (extended community) aur VPN label. RD do VRFs ke same prefix (10.1.1.0/24 UTS aur 10.1.1.0/24 PRS) ko alag banata hai; RT batata hai kaunsa VRF use import kare. Core P routers BGP nahi chalate ("BGP-free core") — woh sirf transport label dekhte hain.',
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator: BGP state computed hai (sessions + best path), timers/keepalives aur message counters nahi — show output mein woh "-" hain. Session na bane to "show ip bgp summary" ke neeche RailMPLS Lab note asli wajah batata hai (remote-as mismatch, update-source mismatch, peer unreachable…).',
    },
    {
      kind: 'analogy',
      body: 'RR = divisional control office. Har station master har doosre station ko phone nahi karta; sab control ko batate hain aur control sabko relay karta hai. Par gaadi control office se hoke nahi jaati — seedhe track (LSP) par chalti hai.',
    },
  ],
  flash: [
    {
      prompt: 'iBGP par next hop kaun badalta hai default mein?',
      options: ['Har router', 'Koi nahi — eBGP border par "next-hop-self" lagana padta hai', 'Sirf RR', 'IGP'],
      correctIndex: 1,
      explanation: 'Warna andar ke routers eBGP peer ka link IP next hop dekhte hain jo unke paas reachable nahi.',
    },
    {
      prompt: '150 routers full mesh mein kitne iBGP sessions?',
      options: ['150', '300', '11 175', '22 350'],
      correctIndex: 2,
      explanation: '150 × 149 / 2 = 11 175.',
    },
    {
      prompt: 'Route reflector kya NAHI karta?',
      options: [
        'Client ke routes doosre clients ko bhejna',
        'ORIGINATOR_ID jodna',
        'Next hop ko apne IP par badalna (VPNv4 reflect karte waqt)',
        'CLUSTER_LIST jodna',
      ],
      correctIndex: 2,
      explanation: 'Next hop wahi PE loopback rehta hai — traffic seedha PE se PE.',
    },
    {
      prompt: 'VPNv4 route mein RD ka kaam?',
      options: ['Kaunsa VRF import kare', 'Overlapping prefixes ko unique banana', 'Label dena', 'Encryption'],
      correctIndex: 1,
      explanation: 'Import RT decide karta hai; RD sirf prefix ko unique banata hai.',
    },
    {
      prompt: 'Do paths: LOCAL_PREF 200 (AS_PATH 3 AS) aur LOCAL_PREF 100 (AS_PATH 1 AS). Best?',
      options: ['LOCAL_PREF 200 wala', 'Chhota AS_PATH wala', 'Dono', 'Router-ID se'],
      correctIndex: 0,
      explanation: 'LOCAL_PREF AS_PATH se pehle aata hai.',
    },
  ],
  glossary: [
    { term: 'eBGP', en: 'BGP between different autonomous systems.', hi: 'Do alag AS ke beech BGP.' },
    { term: 'iBGP', en: 'BGP inside one AS; routes learned via iBGP are not re-advertised to iBGP peers.', hi: 'Ek hi AS ke andar BGP.' },
    {
      term: 'Route reflector',
      en: 'iBGP speaker that re-advertises client routes, removing the full-mesh need (RFC 4456).',
      hi: 'Routes relay karne wala iBGP router.',
    },
    { term: 'next-hop-self', en: 'Router sets itself as BGP next hop when advertising to iBGP peers.', hi: 'Next hop apna loopback.' },
    { term: 'MP-BGP', en: 'Multiprotocol BGP: carries several address families (e.g. VPNv4).', hi: 'Ek session par kai route types.' },
    { term: 'VPNv4', en: 'RD + IPv4 prefix, with route-targets and a VPN label.', hi: 'VPN route ka format.' },
  ],
  practice: { labId: 'LB5.1', note: 'Lab LB5.1: JU ko RR banao, MTD/DNA/FL clients, aur FL par Jaipur division se eBGP.' },
};
