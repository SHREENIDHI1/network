import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B11',
  part: 'B',
  title: 'Operations & NMS',
  summary:
    'NOC ka kaam: SNMP polling aur traps, syslog, NTP, alarm severity, root cause vs impact, railway services ka status, link utilisation, aur fault drill (fibre cut, card, power).',
  estMinutes: 45,
  blocks: [
    {
      kind: 'text',
      heading: 'NMS kya dekhta hai',
      body: 'NMS (Network Management System) har router se SNMP se state poochta hai (polling: interfaces, CPU, counters) aur router khud events bhejta hai (SNMP traps, syslog). Iske liye router par: "snmp-server community <NMS ki community> ro", "snmp-server host <NMS> version 2c <community>", "snmp-server enable traps", "logging host <NMS>". Aur NMS se router tak raasta chahiye. Na community, na raasta = NMS andha.',
    },
    {
      kind: 'table',
      caption: 'Device states on the NMS',
      headers: ['State', 'Matlab', 'Kya karein'],
      rows: [
        ['Managed', 'Community sahi, NMS se reachable', '—'],
        ['Not managed', 'Router par NMS ki polling community nahi', 'snmp-server community … ro'],
        ['Unreachable', 'Community hai par NMS tak raasta nahi (link/power/routing)', 'Root cause dhoondho'],
      ],
    },
    {
      kind: 'text',
      heading: 'Root cause vs impact',
      body: 'Ek line card girne se: links down, LDP down, pseudowire down, BGP down, service down — sab ek saath. Operator ko pehle sabse neeche wali layer ka alarm dekhna chahiye (power → card → link → OSPF → LDP) — woh root cause hai. Upar ke alarms (PW, BGP, TE, service) impact hain; root cause theek hote hi apne aap clear hote hain. RailMPLS Lab ka NMS tab alarms ko isi tarah do hisson mein dikhata hai.',
    },
    { kind: 'widget', widget: 'alarm-layers', caption: 'Ek fault, kai alarms: root cause pehle' },
    {
      kind: 'table',
      caption: 'Severity (teaching plan)',
      headers: ['Severity', 'Misaal', 'Response'],
      rows: [
        ['Critical', 'Safety service down, node unreachable, power failure', 'Turant — control ko inform, field team'],
        ['Major', 'Link / card / LDP / PW / BGP down, congestion with loss', 'Same shift mein'],
        ['Minor', 'FRR active, utilisation > 90%', 'Plan karke'],
        ['Warning', 'Device not managed', 'Config theek karo'],
      ],
    },
    {
      kind: 'text',
      heading: 'Fault drill',
      body: 'Railway NOC regularly drills karta hai: fibre cut (link par Cut), card failure aur power failure (device properties → Fault injection). Har drill mein dekho: kaunse services gaye, protection (FRR / alternate path) ne bachaya ya nahi, aur NMS ne root cause sahi dikhaya ya nahi. Safety circuits (block, BPAC, data logger) ke liye drill sirf approved procedure ke saath.',
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator: NMS view engine state se calculate hota hai (SNMP poll cycle, MIB walk, trap storms nahi); correlation layer-rule based hai, timing/topology inference nahi. Services "path check" hain — ACL/firewall packets ko rokte hon to bhi path check UP dikha sakta hai; asli ping se confirm karo.',
    },
    {
      kind: 'analogy',
      body: 'NMS = section control board. Station se phone (SNMP) nahi juda to control ko us station ka haal nahi dikhta. Ek point failure (root) se kai trains late (impact) — control pehle point failure theek karwata hai.',
    },
  ],
  flash: [
    {
      prompt: 'Router NMS par "not managed" dikh raha hai. Pehla check?',
      options: ['Fibre', 'SNMP community router par hai ya nahi', 'BGP', 'NTP'],
      correctIndex: 1,
      explanation: 'Community na ho to NMS poll hi nahi kar sakta.',
    },
    {
      prompt: 'SNMP trap kaun bhejta hai?',
      options: ['NMS', 'Router (event hone par)', 'Switch ka STP', 'DNS server'],
      correctIndex: 1,
      explanation: 'Polling NMS karta hai; trap router bhejta hai.',
    },
    {
      prompt: 'Card failure se PW-DOWN, BGP-DOWN, SERVICE-DOWN. Root cause?',
      options: ['PW-DOWN', 'BGP-DOWN', 'CARD-FAIL', 'SERVICE-DOWN'],
      correctIndex: 2,
      explanation: 'Sabse neeche wali layer.',
    },
    {
      prompt: 'Saare devices par same time kyon zaroori?',
      options: ['Fashion', 'Alarms aur logs ka order milane ke liye (NTP)', 'BGP ke liye', 'MPLS ke liye'],
      correctIndex: 1,
      explanation: 'Bina NTP ke logs ka time compare nahi hota.',
    },
    {
      prompt: '"Unreachable" aur "not managed" mein farq?',
      options: [
        'Koi nahi',
        'Unreachable: config hai par raasta nahi; not managed: config hi nahi',
        'Unreachable = power off hamesha',
        'Not managed = fibre cut',
      ],
      correctIndex: 1,
      explanation: 'Unreachable ka matlab network problem ho sakta hai.',
    },
  ],
  glossary: [
    {
      term: 'NMS',
      en: 'Network management system: polls devices, receives traps/syslog, shows alarms and services.',
      hi: 'Network ki nigrani ka system.',
    },
    { term: 'SNMP trap', en: 'Unsolicited event message from a device to the NMS.', hi: 'Router ka khud bheja event.' },
    { term: 'Polling', en: 'The NMS periodically reads values from the device (SNMP get).', hi: 'NMS ka poochna.' },
    { term: 'Root cause', en: 'The lowest-layer fault that explains the other alarms.', hi: 'Asli wajah.' },
    { term: 'Service impact', en: 'Effect of a fault on an end-to-end railway service.', hi: 'Service par asar.' },
  ],
  practice: { labId: 'LB11.1', note: 'Lab LB11.1: PPR aur DNA ko NMS ke under laao aur Data Logger outage ka root cause theek karo.' },
};
