import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A3',
  part: 'A',
  title: 'Number systems: binary, decimal, hex',
  summary: 'Binary, decimal aur hexadecimal — IP address, subnet mask aur MAC address padhne ke liye zaroori ganit.',
  estMinutes: 35,
  blocks: [
    {
      kind: 'text',
      heading: 'Router binary mein kyon sochta hai?',
      body: 'Digital circuit ke paas sirf do states hoti hain: 0 (off/low) aur 1 (on/high). Isliye har cheez — IP address, mask, MAC, label — andar bits mein store hoti hai. Router routing table mein "longest prefix match" bit-by-bit compare karke karta hai. Subnetting (A6) samajhne ke liye binary aana zaroori hai.',
    },
    {
      kind: 'analogy',
      body: 'Signal ka hara/laal socho: sirf do haalat. 8 signals ek line mein = 8 bits = 1 byte = 0 se 255 tak ke 256 combinations.',
    },
    {
      kind: 'table',
      caption: 'Ek octet (8 bits) ki place values',
      headers: ['Bit', '7', '6', '5', '4', '3', '2', '1', '0'],
      rows: [['Value', '128', '64', '32', '16', '8', '4', '2', '1']],
    },
    {
      kind: 'text',
      heading: 'Binary → decimal',
      body: 'Jahan 1 hai uski place value jodo. 11000000 = 128 + 64 = 192. 10101000 = 128 + 32 + 8 = 168. Isliye 192.168.x.x jaise IP mein har number ek octet hai (0–255).',
    },
    {
      kind: 'text',
      heading: 'Decimal → binary (subtract method)',
      body: 'Sabse badi place value se shuru karo: agar number us se bada/barabar hai to 1 likho aur ghata do, warna 0. Example 200: 128 ✓ (72 bacha) → 64 ✓ (8) → 32 ✗ → 16 ✗ → 8 ✓ (0) → 4 ✗ → 2 ✗ → 1 ✗ = 11001000.',
    },
    {
      kind: 'widget',
      widget: 'binary-converter',
      caption: 'Decimal, binary ya hex daalo — baaki do apne aap dikhenge. Bits par click karke toggle bhi kar sakte ho.',
    },
    {
      kind: 'text',
      heading: 'Hexadecimal — 4 bits ka shortcut',
      body: 'Hex mein 16 digits hain: 0–9 aur A=10, B=11, C=12, D=13, E=14, F=15. Ek hex digit = exactly 4 bits, isliye 1 byte = 2 hex digits. MAC address (00:1A:2B:3C:4D:5E) aur IPv6 hex mein likhe jaate hain. Example: 0xC0 = 1100 0000 = 192.',
    },
    {
      kind: 'table',
      caption: 'Yaad karne layak',
      headers: ['Decimal', 'Binary', 'Hex', 'Kahan dikhega'],
      rows: [
        ['255', '11111111', 'FF', 'Mask octet, broadcast'],
        ['254', '11111110', 'FE', 'Mask /31 last octet'],
        ['252', '11111100', 'FC', 'Mask /30 last octet'],
        ['248', '11111000', 'F8', 'Mask /29'],
        ['240', '11110000', 'F0', 'Mask /28'],
        ['224', '11100000', 'E0', 'Mask /27'],
        ['192', '11000000', 'C0', 'Mask /26, 192.168.x.x'],
        ['128', '10000000', '80', 'Mask /25'],
      ],
    },
    {
      kind: 'keyterms',
      terms: [
        { term: 'Bit', meaning: 'Ek binary digit: 0 ya 1.' },
        {
          term: 'Byte / octet',
          meaning: '8 bits. IPv4 address = 4 octets = 32 bits.',
        },
        { term: 'Nibble', meaning: '4 bits = ek hex digit.' },
        {
          term: 'Prefix length (/24)',
          meaning: 'Mask mein shuru ke kitne bits 1 hain. /24 = 255.255.255.0.',
        },
      ],
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Bandwidth mein bit (b) aur storage mein byte (B) — 1 Gbps link ≈ 125 MB/s (overhead se pehle). Isko A0 ke bandwidth widget mein try karo.',
    },
  ],
  flash: [
    {
      prompt: '11000000 ka decimal kya hai?',
      options: ['128', '192', '224', '160'],
      correctIndex: 1,
      explanation: '128 + 64 = 192.',
    },
    {
      prompt: '255 ka binary kya hai?',
      options: ['11111110', '10000000', '11111111', '01111111'],
      correctIndex: 2,
      explanation: '8 bits sab 1 = 128+64+32+16+8+4+2+1 = 255.',
    },
    {
      prompt: 'Hex "A" ka decimal value kya hai?',
      options: ['1', '10', '11', '16'],
      correctIndex: 1,
      explanation: 'A=10, B=11, … F=15.',
    },
    {
      prompt: 'IPv4 address mein kitne bits hote hain?',
      options: ['8', '16', '32', '128'],
      correctIndex: 2,
      explanation: '4 octets × 8 bits = 32 bits. (IPv6 = 128 bits.)',
    },
    {
      prompt: 'Subnet mask 255.255.255.0 ka prefix length kya hai?',
      options: ['/8', '/16', '/24', '/32'],
      correctIndex: 2,
      explanation: '255 = 8 ones, teen baar = 24 ones → /24.',
    },
  ],
  glossary: [
    {
      term: 'Binary',
      en: 'Base-2 number system (0, 1).',
      hi: 'Sirf 0 aur 1 wala number system.',
    },
    {
      term: 'Hexadecimal',
      en: 'Base-16 number system (0–9, A–F).',
      hi: '16 digits wala system; ek digit = 4 bits.',
    },
    { term: 'Octet', en: 'Group of 8 bits.', hi: '8 bits ka group.' },
    {
      term: 'Subnet mask',
      en: 'Bits marking the network part of an IP address.',
      hi: 'IP ka network wala hissa batane wale bits.',
    },
    {
      term: 'Prefix length',
      en: 'Number of leading 1 bits in a mask, e.g. /24.',
      hi: 'Mask mein shuru ke 1 bits ki ginti.',
    },
  ],
  practice: {
    note: 'Converter widget mein 10 random numbers convert karo. A5/A6 (Phase 2) mein subnetting labs isi par based honge.',
  },
};
