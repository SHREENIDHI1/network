import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A5',
  part: 'A',
  title: 'IPv4 addressing',
  summary: 'IPv4 address, mask, CIDR, network/broadcast/host range, private vs public, default gateway aur ARP.',
  estMinutes: 50,
  blocks: [
    {
      kind: 'text',
      heading: 'IP address = logical address',
      body: 'MAC address sirf ek LAN ke andar kaam aata hai. Poore railway network mein — station se division se zone tak — pahunchne ke liye Layer 3 address chahiye: IPv4 address. Yeh 32 bits ka hota hai, 4 octets mein decimal mein likhte hain: 10.52.1.11. Har octet 0–255.',
    },
    {
      kind: 'analogy',
      body: 'MAC = wagon ka number (wagon jahan bhi jaaye, wahi rehta hai). IP = booking ka destination station code + line number. Router destination station code dekh kar rasta chunta hai; har yard (LAN) mein wagon ko line tak pahunchane ke liye MAC kaam aata hai.',
    },
    {
      kind: 'text',
      heading: 'Network part aur host part — subnet mask',
      body: 'Mask batata hai ki address ke kitne bits "network" ke hain. 255.255.255.0 = 24 ones = /24 (CIDR notation): pehle 3 octets network (10.52.1), last octet host. Same network part = same subnet = seedhe baat (ARP). Alag network = router (default gateway) ke through.',
    },
    { kind: 'widget', widget: 'subnet-calc', caption: 'Koi bhi IP/prefix daalo: network, broadcast, first/last host, usable hosts dekho.' },
    {
      kind: 'table',
      caption: 'Ek /24 subnet (10.52.1.0/24) ka anatomy',
      headers: ['Address', 'Kya hai', 'Device ko de sakte?'],
      rows: [
        ['10.52.1.0', 'Network address (subnet ka naam)', 'Nahi'],
        ['10.52.1.1 – 10.52.1.254', 'Usable host range (254 hosts)', 'Haan'],
        ['10.52.1.255', 'Broadcast address (subnet ke sab hosts)', 'Nahi'],
      ],
    },
    {
      kind: 'text',
      heading: 'Classes (sirf itihaas) aur CIDR',
      body: 'Pehle addresses classes mein bante the: Class A (1–126, /8), B (128–191, /16), C (192–223, /24), D multicast, E reserved. Aaj CIDR (classless) use hota hai — mask kuch bhi ho sakta hai (/27, /30…). Classes sirf purani books aur interview mein milti hain.',
    },
    {
      kind: 'table',
      caption: 'Private address ranges (RFC 1918) — Internet par route nahi hote',
      headers: ['Range', 'CIDR'],
      rows: [
        ['10.0.0.0 – 10.255.255.255', '10.0.0.0/8'],
        ['172.16.0.0 – 172.31.255.255', '172.16.0.0/12'],
        ['192.168.0.0 – 192.168.255.255', '192.168.0.0/16'],
      ],
    },
    {
      kind: 'text',
      heading: 'Default gateway aur ARP',
      body: 'Host ko packet bhejna hai. Pehle check: destination mere subnet mein hai? Haan → ARP request (broadcast: "10.52.1.12 kiska hai?") → reply mein MAC → frame bhejo. Nahi → default gateway (router) ka MAC ARP se lo aur frame router ko do; router aage le jaayega. ARP ka jawab cache mein rehta hai (Windows "arp -a", IOS "show arp").',
    },
    {
      kind: 'keyterms',
      terms: [
        { term: 'Default gateway', meaning: 'Apne subnet ke bahar ke packets ka pehla router.' },
        { term: 'ARP', meaning: 'IP se MAC dhoondhne ka protocol (RFC 826), sirf ek LAN ke andar.' },
        { term: 'CIDR', meaning: '/24 jaisa prefix length; classless addressing.' },
        { term: 'Private IP', meaning: 'Andar ke networks ke liye ranges; Internet par jaane ke liye NAT chahiye (A11).' },
      ],
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Is course ke addresses (10.52.x.x for MTD) ek teaching plan hain — asli NWR/RailTel addressing nahi. Asli Jodhpur division IP plan generator P4 mein aayega.',
    },
  ],
  flash: [
    {
      prompt: '10.52.1.0/24 mein kitne usable host addresses?',
      options: ['256', '254', '255', '252'],
      correctIndex: 1,
      explanation: '256 addresses − network − broadcast = 254.',
    },
    {
      prompt: '192.168.10.77/26 ka network address kya hai?',
      options: ['192.168.10.0', '192.168.10.64', '192.168.10.77', '192.168.10.128'],
      correctIndex: 1,
      explanation: '/26 blocks 64 ke hain: 0, 64, 128, 192. 77 → 64 wale block mein.',
    },
    {
      prompt: 'Host 10.52.1.11/24 ko 10.52.9.5 par packet bhejna hai. Woh ARP kiske liye karega?',
      options: ['10.52.9.5', 'Default gateway', 'Broadcast 10.52.1.255', 'Kisi ke liye nahi'],
      correctIndex: 1,
      explanation: '10.52.9.5 alag subnet mein hai, isliye frame gateway ko jaata hai — ARP gateway ke MAC ke liye.',
    },
    {
      prompt: 'Inme se private address kaunsa hai?',
      options: ['172.32.1.1', '172.20.5.5', '11.0.0.1', '192.169.1.1'],
      correctIndex: 1,
      explanation: '172.16.0.0/12 = 172.16–172.31. 172.20.5.5 private hai; 172.32 nahi.',
    },
    {
      prompt: '255.255.255.192 ka prefix length?',
      options: ['/24', '/25', '/26', '/27'],
      correctIndex: 2,
      explanation: '192 = 11000000 → 24 + 2 = 26 ones.',
    },
  ],
  glossary: [
    { term: 'IPv4 address', en: '32-bit logical address of an interface.', hi: 'Interface ka 32-bit logical address.' },
    { term: 'Subnet mask', en: 'Marks the network bits of an address.', hi: 'Address ke network wale bits batata hai.' },
    { term: 'Network address', en: 'First address of a subnet; names the subnet.', hi: 'Subnet ka pehla address, subnet ka naam.' },
    { term: 'Broadcast address', en: 'Last address of a subnet; reaches all hosts in it.', hi: 'Subnet ka aakhri address; sab hosts ko.' },
    { term: 'Default gateway', en: 'Router used for destinations outside the local subnet.', hi: 'Bahar ke networks ke liye router.' },
    { term: 'ARP', en: 'Resolves an IPv4 address to a MAC address on the local link.', hi: 'IP se MAC nikalta hai (LAN ke andar).' },
  ],
  practice: { labId: 'L5.1', note: 'Lab L5.1: MTD station LAN ko address karo aur gateway tak ping karo.' },
};
