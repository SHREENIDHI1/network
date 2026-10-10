import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A7',
  part: 'A',
  title: 'Switching basics & VLANs',
  summary: 'Switch CLI, VLAN per railway application, access aur trunk ports, 802.1Q tag, native VLAN.',
  estMinutes: 55,
  blocks: [
    {
      kind: 'text',
      heading: 'Switch CLI — pehli mulaqat',
      body: 'Managed switch ko console (ya SSH) se configure karte hain. Modes: user (">") → enable → privileged ("#") → configure terminal → global config ("(config)#") → interface gi0/1 → interface config ("(config-if)#"). "?" se help, Tab se completion, "end" se wapas privileged. "show running-config" se current config, "write memory" se save.',
    },
    {
      kind: 'table',
      caption: 'Pehle commands',
      headers: ['Command', 'Kya karta hai'],
      rows: [
        ['enable', 'Privileged mode'],
        ['configure terminal', 'Config mode'],
        ['hostname MTD-SW1', 'Switch ka naam'],
        ['vlan 10 / name UTS', 'VLAN banana aur naam dena'],
        ['interface gi0/1', 'Port chunna'],
        ['interface range gi0/1 - 4', 'Kai ports ek saath'],
        ['show vlan brief', 'VLANs aur unke access ports'],
        ['show interfaces trunk', 'Trunk ports, allowed aur native VLAN'],
        ['show mac address-table', 'Seekhe hue MACs'],
      ],
    },
    {
      kind: 'text',
      heading: 'VLAN — ek switch, kai alag LAN',
      body: 'VLAN (Virtual LAN) switch ko logically alag broadcast domains mein baant deta hai. UTS terminal ka broadcast CCTV camera tak nahi jaata. Fayde: security (UTS ko Railnet se alag), kam broadcast, saaf IP plan (har VLAN = ek subnet). Do VLANs ke beech baat ke liye router ya L3 switch chahiye (A9).',
    },
    {
      kind: 'table',
      caption: 'Is course ka teaching VLAN plan (har station par same)',
      headers: ['VLAN', 'Application'],
      rows: [
        ['10', 'UTS (unreserved ticketing)'],
        ['20', 'PRS (reservation)'],
        ['30', 'FOIS (freight)'],
        ['40', 'CCTV / VSS'],
        ['50', 'Railnet (office data)'],
        ['60', 'VoIP'],
        ['70', 'SCADA'],
        ['99', 'Management (switch/router access)'],
      ],
    },
    {
      kind: 'text',
      heading: 'Access port vs trunk port',
      body: 'Access port: ek hi VLAN, end device (PC, UTS terminal, camera) ke liye; frame par koi tag nahi. Trunk port: switch-to-switch (ya switch-to-router) link jo kai VLANs le jaata hai. Trunk par har frame mein 4-byte 802.1Q tag lagta hai jismein 12-bit VLAN ID hota hai. Native VLAN ke frames bina tag ke jaate hain — trunk ke dono ends par native VLAN same hona chahiye, warna traffic galat VLAN mein gir jaata hai.',
    },
    { kind: 'diagram', diagram: 'vlan-trunk', caption: 'Access ports (ek VLAN, bina tag) aur trunk (kai VLAN, tagged).' },
    { kind: 'widget', widget: 'vlan-tag', caption: 'VLAN ID aur priority chuno — frame ke andar 802.1Q tag ke bytes dekho.' },
    {
      kind: 'analogy',
      body: 'Trunk = ek hi main line par alag-alag rakes; har wagon par rake ka label (VLAN tag). Next station par label padh kar sahi siding (VLAN) par bheja jaata hai. Native VLAN = bina label wale wagon — dono stations ko pehle se pata hona chahiye ki unlabelled wagon kis siding ke hain.',
    },
    {
      kind: 'text',
      heading: 'Common galtiyan',
      body: '1) VLAN ek switch par bana, doosre par nahi → traffic us switch par gir jaata hai. 2) Trunk ke allowed list mein VLAN nahi → wahi VLAN beech mein tootta hai, baaki chalte hain. 3) Native VLAN mismatch → ajeeb leakage. 4) Access port galat VLAN mein → device "network nahi mil raha". Troubleshoot: show vlan brief, show interfaces trunk.',
    },
  ],
  flash: [
    {
      prompt: 'UTS terminal kis tarah ke port par lagta hai?',
      options: ['Trunk port', 'Access port (VLAN 10 jaise ek VLAN mein)', 'Console port', 'Routed port'],
      correctIndex: 1,
      explanation: 'End devices access ports par, ek VLAN mein, bina tag.',
    },
    {
      prompt: '802.1Q tag mein VLAN ID kitne bits ka hota hai?',
      options: ['8', '12', '16', '32'],
      correctIndex: 1,
      explanation: '12 bits → VLAN 1–4094.',
    },
    {
      prompt: 'Trunk ke dono ends par native VLAN alag hai. Asar?',
      options: ['Kuch nahi', 'Untagged traffic galat VLAN mein pahunch sakta hai (native VLAN mismatch)', 'Link down', 'Speed half'],
      correctIndex: 1,
      explanation: 'Untagged frames ko har end apne native VLAN ka maanta hai — mismatch se VLANs mix ho jaate hain.',
    },
    {
      prompt: 'Sirf UTS (VLAN 10) do switches ke beech nahi chal raha; PRS chal raha hai. Pehle kya dekhoge?',
      options: ['Power supply', 'show interfaces trunk — VLAN 10 allowed hai ya nahi', 'OSPF', 'DNS'],
      correctIndex: 1,
      explanation: 'Ek VLAN tootna aur baaki chalna = trunk allowed list ya VLAN missing ka classic sign.',
    },
    {
      prompt: 'Alag VLANs ke do PCs ek hi switch par hain. Bina router ping hoga?',
      options: ['Haan', 'Nahi — inter-VLAN routing chahiye', 'Sirf broadcast se', 'Sirf trunk se'],
      correctIndex: 1,
      explanation: 'VLAN = alag broadcast domain = alag subnet; beech mein router/L3 switch chahiye (A9).',
    },
  ],
  glossary: [
    { term: 'VLAN', en: 'Logical Layer 2 broadcast domain on a switch.', hi: 'Switch ke andar alag logical LAN.' },
    { term: 'Access port', en: 'Switch port carrying one untagged VLAN.', hi: 'Ek VLAN wala port, bina tag.' },
    { term: 'Trunk', en: 'Link carrying many VLANs with 802.1Q tags.', hi: 'Kai VLANs wala link, tag ke saath.' },
    { term: '802.1Q', en: 'IEEE standard for VLAN tagging (4-byte tag).', hi: 'VLAN tag ka standard (4 byte).' },
    { term: 'Native VLAN', en: 'VLAN sent untagged on a trunk.', hi: 'Trunk par bina tag wala VLAN.' },
  ],
  practice: { labId: 'L7.1', note: 'Lab L7.1: MTD ke do switches par VLAN 10/20/40/99, access ports aur trunk banao.' },
};
