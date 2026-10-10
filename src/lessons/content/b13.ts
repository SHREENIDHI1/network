import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B13',
  part: 'B',
  title: 'Inter-division hand-off',
  summary:
    'Do divisions (do AS) ke MPLS VPNs ko jodna: Inter-AS Option A (back-to-back VRFs), Option B (ASBRs ke beech VPNv4), Option C (RR ke beech multihop) — trade-offs, Phulera boundary par Option A.',
  estMinutes: 40,
  blocks: [
    {
      kind: 'text',
      heading: 'Boundary par kya hota hai',
      body: 'Har division apna MPLS core aur VPN plan chalata hai (Jodhpur AS 65000, Jaipur AS 65002 — teaching numbers). UTS, FOIS jaise zonal/national applications ko division ke paar jaana hai, par har VRF alag rehna chahiye. Boundary station (jaise Phulera) par dono taraf ke border routers (ASBR) milte hain. Kaise jodein — teen standard tareeke (RFC 4364 section 10).',
    },
    {
      kind: 'table',
      caption: 'Inter-AS options',
      headers: ['Option', 'ASBRs ke beech', 'Plus', 'Minus'],
      rows: [
        [
          'A — back-to-back VRF',
          'Har VRF ka sub-interface + eBGP (IP, no labels)',
          'Simple, secure, har VRF alag; QoS/ACL per VRF',
          'VRF badhe to config badhe; ASBR par saare VRFs',
        ],
        ['B — VPNv4 eBGP', 'Ek eBGP VPNv4 session, labelled packets', 'ASBR par VRF nahi, scale achha', 'Labels aur VPN routes doosre AS ko dikhte'],
        ['C — multihop VPNv4', 'RRs ke beech VPNv4; ASBR sirf PE loopbacks + labels', 'Sabse scalable', 'Dono AS ko ek-doosre par zyada bharosa'],
      ],
    },
    {
      kind: 'text',
      heading: 'Option A at Phulera',
      body: 'FL-LER par Jaipur ASBR ki taraf ek port, us par har VRF ka sub-interface: Gi0/1/0.101 (dot1Q 101, vrf UTS), Gi0/1/0.102 (dot1Q 102, vrf FOIS). Har VRF ke address-family mein Jaipur ASBR ke saath eBGP. FL Jaipur ke routes eBGP se seekh kar VPNv4 mein JU tak bhejta hai; ulta bhi. Dono taraf VLAN aur IP plan match hona chahiye — VLAN galat = us VRF ka session down.',
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator: sirf Option A chalta hai (VRF sub-interfaces + PE–CE eBGP, jo engine mein hai). Option B/C ke liye ASes ke beech labelled VPNv4 chahiye — lesson mein theory. JP-ASBR Jaipur division ka teaching stand-in hai.',
    },
    {
      kind: 'analogy',
      body: 'Option A = boundary station par har train ka crew change — har line (VRF) ka apna handover. Option B = ek common goods yard jahan sab wagons ek saath hand over. Option C = dono divisions ke control offices seedha baat karte, boundary sirf track deta hai.',
    },
  ],
  flash: [
    {
      prompt: 'Option A mein ASBRs ek-doosre ko kya maante hain?',
      options: ['P router', 'CE router (per VRF)', 'RR', 'Kuch nahi'],
      correctIndex: 1,
      explanation: 'Back-to-back VRFs.',
    },
    {
      prompt: 'Option B mein ASBR par VRFs?',
      options: ['Zaroori', 'Nahi chahiye — VPNv4 routes seedhe', 'Sirf ek', 'Sirf FOIS'],
      correctIndex: 1,
      explanation: 'ASBR labelled VPNv4 exchange karta hai.',
    },
    {
      prompt: 'Sabse scalable option?',
      options: ['A', 'B', 'C', 'Sab barabar'],
      correctIndex: 2,
      explanation: 'Par sabse zyada mutual trust chahiye.',
    },
    {
      prompt: 'Option A hand-off par UTS session down, FOIS up. Pehla shak?',
      options: ['MPLS', 'UTS sub-interface ka VLAN/IP mismatch', 'NTP', 'OSPF area'],
      correctIndex: 1,
      explanation: 'Har VRF ka apna sub-interface.',
    },
    {
      prompt: 'Option A mein UTS aur FOIS alag kaise rehte hain?',
      options: ['ACL se', 'Alag sub-interfaces aur alag VRFs dono taraf', 'NAT se', 'Nahi rehte'],
      correctIndex: 1,
      explanation: 'Har VRF ka apna path.',
    },
  ],
  glossary: [
    { term: 'ASBR', en: 'Autonomous system border router: connects to another AS.', hi: 'Do AS ke beech ka router.' },
    { term: 'Inter-AS Option A/B/C', en: 'Ways to interconnect MPLS VPNs of two ASes (RFC 4364 §10).', hi: 'Do providers ke VPN jodne ke tareeke.' },
    { term: 'Back-to-back VRF', en: 'Option A: one sub-interface and eBGP session per VRF between ASBRs.', hi: 'Har VRF ka alag handover.' },
    { term: 'Hand-off', en: 'The demarcation where one network passes traffic to another.', hi: 'Seema par saunpna.' },
  ],
  practice: { labId: 'LB13.1', note: 'Lab LB13.1: Phulera par Jaipur division se UTS aur FOIS ka Option A hand-off.' },
};
