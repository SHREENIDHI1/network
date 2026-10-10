import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A6',
  part: 'A',
  title: 'Subnetting & VLSM (Jodhpur IP plan)',
  summary: 'Bade block ko chhote subnets mein kaatna, VLSM, aur division → control board → section → station → application IP plan ka idea.',
  estMinutes: 60,
  blocks: [
    {
      kind: 'text',
      heading: 'Subnetting kyon?',
      body: 'Ek bada /16 ek station ko de diya to hazaron address barbaad, aur broadcast poore network mein. Isliye bade block ko chhote subnets mein kaatte hain — har LAN/VLAN ka apna subnet. Prefix 1 badhao to subnet aadha ho jaata hai: /24 = 256 addresses, /25 = 128, /26 = 64, /27 = 32, /28 = 16, /29 = 8, /30 = 4.',
    },
    {
      kind: 'table',
      caption: 'Yaad karne wali table',
      headers: ['Prefix', 'Mask (last octet)', 'Block size', 'Usable hosts'],
      rows: [
        ['/24', '0', '256', '254'],
        ['/25', '128', '128', '126'],
        ['/26', '192', '64', '62'],
        ['/27', '224', '32', '30'],
        ['/28', '240', '16', '14'],
        ['/29', '248', '8', '6'],
        ['/30', '252', '4', '2'],
        ['/31', '254', '2', '2 (point-to-point, RFC 3021)'],
        ['/32', '255', '1', '1 (loopback)'],
      ],
    },
    {
      kind: 'text',
      heading: 'Magic number trick',
      body: 'Block size = 256 − mask ka last non-255 octet. /27 → 256 − 224 = 32. To subnets 0, 32, 64, 96, 128… par shuru honge. 10.52.20.70/27 kis subnet mein? 70 ke neeche sabse bada multiple of 32 = 64 → network 10.52.20.64, broadcast 64 + 32 − 1 = 95.',
    },
    {
      kind: 'widget',
      widget: 'subnet-calc',
      caption: 'Drill: 5 random addresses lo, pehle kaagaz par network/broadcast nikaalo, phir calculator se check karo.',
    },
    {
      kind: 'text',
      heading: 'VLSM — har LAN ko sahi size',
      body: 'VLSM (Variable Length Subnet Mask): sab subnets ek size ke nahi; jitne hosts chahiye utna. Tareeka: (1) LANs ko hosts ke hisaab se bade se chhote sort karo. (2) Har ek ke liye smallest prefix jo fit ho (usable ≥ hosts). (3) Block ke shuru se allot karo, har subnet apni boundary par shuru ho. (4) Overlap check.',
    },
    {
      kind: 'analogy',
      body: 'Goods yard ki lines baantna: pehle 58-wagon rake ko lambi line, phir chhote rake, phir engine shunting ke liye chhoti siding. Agar chhoti siding pehle beech mein bana di, to lambi line ke liye jagah toot jaayegi.',
    },
    {
      kind: 'widget',
      widget: 'vlsm-planner',
      caption: 'MTD block 10.52.20.0/24: CCTV 50, UTS/PRS 20, MGMT 5 — planner largest-first allocation dikhata hai. Apne LAN jodo.',
    },
    {
      kind: 'text',
      heading: 'Jodhpur division IP plan — hierarchy ka idea',
      body: 'Bade network mein addresses hierarchy se dete hain taaki routes summarize ho sakein: Division (ek bada block) → Control board (North/Central/West/East) → Section (S1…S11) → Station → Application (UTS, PRS, FOIS, CCTV…). Har POP (router) ko ek /32 loopback, aur do routers ke beech har span ko /31. Iska poora generator (overlap check ke saath) P4 mein Jodhpur topologies ke saath aayega; abhi aap idea samjho aur MTD block par practice karo.',
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Yahan ke blocks (10.52.x.x) teaching plan hain. Asli division/zone ka IP plan RailTel/zonal IT ke document se hi lena.',
    },
  ],
  flash: [
    {
      prompt: '30 hosts ke liye sabse chhota subnet?',
      options: ['/26', '/27', '/28', '/29'],
      correctIndex: 1,
      explanation: '/27 = 30 usable. /28 sirf 14.',
    },
    {
      prompt: '10.52.20.70/27 ka broadcast address?',
      options: ['10.52.20.95', '10.52.20.127', '10.52.20.71', '10.52.20.255'],
      correctIndex: 0,
      explanation: 'Block 32: network .64, broadcast .64 + 31 = .95.',
    },
    {
      prompt: 'VLSM mein allocation kis order mein karte hain?',
      options: ['Alphabetical', 'Sabse bada LAN pehle', 'Sabse chhota pehle', 'Random'],
      correctIndex: 1,
      explanation: 'Bade subnets ko boundary par shuru hona padta hai; pehle allot karne se gaps/overlap nahi bante.',
    },
    {
      prompt: 'Do routers ke beech point-to-point link ke liye modern choice?',
      options: ['/24', '/29', '/31', '/16'],
      correctIndex: 2,
      explanation: '/31 (RFC 3021) do addresses deta hai, koi waste nahi. /30 bhi chalta hai.',
    },
    {
      prompt: 'Router loopback ke liye kaunsa prefix?',
      options: ['/24', '/30', '/32', '/8'],
      correctIndex: 2,
      explanation: 'Loopback ek hi address hai, isliye /32 — router ID aur management ke liye.',
    },
  ],
  glossary: [
    { term: 'Subnetting', en: 'Dividing an address block into smaller subnets.', hi: 'Bade block ko chhote subnets mein kaatna.' },
    { term: 'VLSM', en: 'Using different prefix lengths for different subnets.', hi: 'Har subnet ka alag size (prefix).' },
    { term: 'Block size', en: 'Number of addresses in a subnet (2^(32−prefix)).', hi: 'Subnet mein kitne address.' },
    { term: 'Summarization', en: 'Advertising many subnets as one larger prefix.', hi: 'Kai subnets ko ek bade prefix se batana.' },
    { term: 'Loopback', en: 'Virtual always-up router interface, usually /32.', hi: 'Router ka virtual interface, hamesha up, /32.' },
  ],
  practice: { labId: 'L6.1', note: 'Lab L6.1: MTD block ko VLSM se teen LANs mein kaato aur router par configure karo.' },
};
