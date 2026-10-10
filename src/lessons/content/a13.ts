import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A13',
  part: 'A',
  title: 'Redundancy: HSRP/VRRP',
  summary:
    'Gateway ek hi router par ho to woh single point of failure hai. HSRP/VRRP do routers ko ek virtual gateway banate hain; priority, preempt aur tracking.',
  estMinutes: 50,
  blocks: [
    {
      kind: 'text',
      heading: 'Problem: ek gateway, ek failure',
      body: 'Junction par UTS/PRS terminals ka default gateway ek router hai. Woh router reboot ho ya uska uplink kate, to poora station ka ticketing ruk jaata hai — chahe doosra router wahin khada ho. Terminals par do gateway nahi likh sakte.',
    },
    {
      kind: 'text',
      heading: 'Solution: virtual gateway (FHRP)',
      body: 'First Hop Redundancy Protocol: do (ya zyada) routers ek group banate hain jiska ek virtual IP aur virtual MAC hota hai. Hosts ka gateway = virtual IP. Ek router Active (HSRP) / Master (VRRP) us IP ka jawab deta hai; doosra Standby/Backup. Active gira to Standby virtual IP le leta hai — hosts ko kuch badalna nahi padta.',
    },
    {
      kind: 'table',
      caption: 'HSRP vs VRRP',
      headers: ['', 'HSRP', 'VRRP'],
      rows: [
        ['Standard', 'Cisco proprietary', 'Open standard (RFC 5798)'],
        ['Roles', 'Active / Standby', 'Master / Backup'],
        ['Virtual MAC', '0000.0c07.acXX (XX = group)', '0000.5e00.01XX'],
        ['Default priority', '100', '100'],
        ['Preempt default', 'Off', 'On'],
        ['Command', 'standby 10 ip 10.52.10.1', 'vrrp 10 ip 10.52.10.1'],
      ],
    },
    {
      kind: 'text',
      heading: 'Priority, preempt, tracking',
      body: 'Sabse zyada priority Active banta hai (barabar ho to bada interface IP). Preempt on ho to behtar router wapas aate hi role le leta hai; off ho to jo Active hai wahi rehta hai. Tracking: "standby 10 track Gi0/1 decrement 20" — uplink gira to priority 20 kam, taaki doosra router (jiska uplink theek hai) Active bane. Tracking ke saath preempt zaroori hai.',
    },
    { kind: 'widget', widget: 'hsrp', caption: 'Priority, preempt, uplink down aur router down badal kar dekho kaun Active banta hai.' },
    {
      kind: 'analogy',
      body: 'Station Master aur Deputy SM: ek hi "SM office" ka phone number (virtual IP). Jo duty par (Active) hai woh uthata hai. SM chhutti par gaye to Deputy wahi number uthata hai — callers ko naya number nahi chahiye.',
    },
    {
      kind: 'text',
      heading: 'Dual uplinks aur convergence',
      body: 'Redundancy poori tab hai jab router, uplink, aur switch sab ke do raste hon (A8 EtherChannel/STP + yahan FHRP + A10 dynamic routing). Convergence = failure ke baad kitni der mein traffic wapas: HSRP default hello 3 s / hold 10 s; tuning se kam. Simulator mein failover turant hota hai (timers simulate nahi) — pehla ping ARP ki wajah se gir sakta hai.',
    },
  ],
  flash: [
    {
      prompt: 'Hosts ka default gateway HSRP mein kya hota hai?',
      options: ['Active router ka real IP', 'Virtual IP', 'Standby ka IP', 'Switch ka IP'],
      correctIndex: 1,
      explanation: 'Virtual IP kabhi nahi badalta; jo Active hai woh jawab deta hai.',
    },
    {
      prompt: 'R1 priority 110, R2 100, preempt off. R1 reboot hua, R2 Active bana. R1 wapas aaya. Ab Active?',
      options: ['R1', 'R2 — preempt off hai', 'Dono', 'Koi nahi'],
      correctIndex: 1,
      explanation: 'Bina preempt ke current Active role nahi chhodta.',
    },
    {
      prompt: 'HSRP group 10 ka virtual MAC?',
      options: ['0000.5e00.010a', '0000.0c07.ac0a', 'ffff.ffff.ffff', '0100.5e00.000a'],
      correctIndex: 1,
      explanation: 'HSRPv1: 0000.0c07.acXX, XX = group hex (10 = 0a).',
    },
    {
      prompt: 'Active router ka WAN uplink kat gaya par LAN interface up hai. Kya chahiye taaki Standby le le?',
      options: ['Kuch nahi', 'Interface tracking + preempt', 'Bada subnet', 'NAT'],
      correctIndex: 1,
      explanation: 'Tracking priority ghatata hai, preempt doosre ko role lene deta hai.',
    },
    {
      prompt: 'VRRP aur HSRP mein standard kaun?',
      options: ['HSRP', 'VRRP (RFC 5798)', 'Dono Cisco', 'Dono IEEE'],
      correctIndex: 1,
      explanation: 'VRRP open standard hai, multi-vendor network (NEON + others) mein useful.',
    },
  ],
  glossary: [
    { term: 'FHRP', en: 'First Hop Redundancy Protocol (HSRP, VRRP, GLBP).', hi: 'Gateway redundancy protocols.' },
    { term: 'Virtual IP', en: 'Shared gateway address owned by the active router.', hi: 'Shared gateway address.' },
    { term: 'Preempt', en: 'Higher-priority router takes over when it returns.', hi: 'Behtar router wapas aakar role le.' },
    { term: 'Tracking', en: 'Lowers priority when a watched interface fails.', hi: 'Uplink gire to priority kam.' },
    { term: 'Convergence', en: 'Time until traffic flows again after a failure.', hi: 'Failure ke baad traffic wapas aane ka time.' },
  ],
  practice: { labId: 'L13.1', note: 'Lab L13.1: MTD junction par do routers, HSRP group, tracking aur failover test.' },
};
