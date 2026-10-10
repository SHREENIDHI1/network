import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B0',
  part: 'B',
  title: 'Why MPLS for Railways',
  summary:
    'Plain IP routing ki seemayein, SDH se IP-MPLS kyon, ek hi backbone par alag-alag railway services ko alag rakhna, aur graceful migration ka idea.',
  estMinutes: 35,
  blocks: [
    {
      kind: 'text',
      heading: 'Aaj ka haal: SDH + alag-alag networks',
      body: 'Railway telecom ka backbone kai saalon se SDH (STM-1/4/16) par chalta aaya hai: har circuit (control phone, block, E1 data) ke liye fixed timeslot, chahe traffic ho ya na ho. Naye applications — UTS/PRS, FOIS, CCTV/VSS, SCADA, Railnet, Wi-Fi, VoIP — sab IP/Ethernet par hain aur bandwidth bahut maangte hain. Fixed SDH pipes mein yeh na fit hota hai, na sasta padta hai.',
    },
    {
      kind: 'table',
      caption: 'Bandwidth ki zaroorat (CAMTECH handbook ka andaza, jaisa user ne diya)',
      headers: ['Station type', 'Approx. bandwidth'],
      rows: [
        ['Major station', '~2 Gbps'],
        ['Junction', '~1 Gbps'],
        ['Wayside station', '~512 Mbps'],
      ],
    },
    {
      kind: 'text',
      heading: 'Sirf IP routing kyon kaafi nahi?',
      body: '1) Separation: UTS ka traffic Railnet/Internet se kabhi milna nahi chahiye. Plain IP mein har router par ACLs ki lambi list — galti ka khatra.\n2) Any-to-any: 150+ POPs, har station dusre se baat kar sake — par har service apni "private" duniya mein.\n3) Legacy: control/block E1 circuits ko bhi ek hi backbone par le jaana hai.\n4) Traffic engineering aur fast reroute: fibre cut par 50 ms jaisi recovery chahiye.\nMPLS label ke zariye yeh sab ek hi core par: L3VPN (VRF per application), L2VPN/pseudowire (E1, Ethernet), TE/FRR.',
    },
    {
      kind: 'analogy',
      body: 'IP routing = har junction par parcel kholkar address padhna. MPLS = booking ke waqt hi route card (label) lag gaya — beech ke junction sirf card dekhkar aage bhejte hain, parcel kholte hi nahi. Aur alag-alag "rake" (VPN) — UTS ka rake, CCTV ka rake — same track par chalte hain par ek-doosre mein mix nahi hote.',
    },
    {
      kind: 'table',
      caption: 'SDH vs IP-MPLS (seedha farak)',
      headers: ['', 'SDH', 'IP-MPLS'],
      rows: [
        ['Bandwidth', 'Fixed timeslots (VC-12 = 2 Mbps)', 'Statistical sharing, QoS se priority'],
        ['Services', 'TDM circuits', 'IP VPN, Ethernet, TDM pseudowire — sab ek core par'],
        ['Protection', 'MSP / SNCP ring (~50 ms)', 'FRR, IGP reroute, BFD'],
        ['Scaling', 'Naya circuit = naya cross-connect', 'Naya service = config (VRF/PW)'],
      ],
    },
    {
      kind: 'text',
      heading: 'Graceful migration',
      body: 'Handbook ka "Option 1" idea (user ke diye summary ke anusaar): purana SDH ek din mein band nahi hota. IP-MPLS core parallel mein lagta hai; nayi IP services seedhe MPLS par; purane E1 circuits (control, block) pseudowire (B8) se MPLS par le jaaye jaate hain; jab sab shift ho jaaye tab SDH retire. Station par LER, junction par LSR (B1).',
    },
    {
      kind: 'note',
      tone: 'source',
      body: 'Context: CAMTECH "An Introductory Handbook on IP-MPLS Technology" (CAMTECH/S/PROJ/2021-22/SP37A) — PDF build ko available nahi tha; numbers user ke diye summary se. Simulator ka Jodhpur network track map par teaching design hai, asli RailTel/NWR network nahi.',
    },
  ],
  flash: [
    {
      prompt: 'MPLS core mein beech ke routers (LSR) packet ko kis basis par forward karte hain?',
      options: ['Destination IP', 'Label', 'Source MAC', 'VLAN'],
      correctIndex: 1,
      explanation: 'Label switching — IP header nahi dekhte.',
    },
    {
      prompt: 'UTS aur Railnet ko ek hi core par alag rakhne ka MPLS tareeka?',
      options: ['Alag fibre', 'L3VPN (VRF per application)', 'Static routes', 'NAT'],
      correctIndex: 1,
      explanation: 'Har application ka apna VRF — routing tables alag.',
    },
    {
      prompt: 'Purane control/block E1 circuits MPLS par kaise jaayenge?',
      options: ['Nahi ja sakte', 'TDM pseudowire (CESoPSN/SAToP)', 'VLAN', 'OSPF'],
      correctIndex: 1,
      explanation: 'E1 ko packets mein emulate karke pseudowire se le jaate hain (B8).',
    },
    {
      prompt: 'Wayside station ke liye andazan bandwidth (handbook)?',
      options: ['~2 Mbps', '~512 Mbps', '~10 Gbps', '~64 kbps'],
      correctIndex: 1,
      explanation: 'Major ~2 Gbps, junction ~1 Gbps, wayside ~512 Mbps.',
    },
    {
      prompt: 'Graceful migration ka matlab?',
      options: ['SDH ek raat mein band', 'SDH aur IP-MPLS saath, services dheere-dheere shift', 'Sirf naye stations par MPLS', 'Radio par shift'],
      correctIndex: 1,
      explanation: 'Parallel running, phir step-by-step migration.',
    },
  ],
  glossary: [
    { term: 'MPLS', en: 'Multiprotocol Label Switching: forwarding on short labels instead of IP lookups.', hi: 'Label ke basis par forwarding.' },
    { term: 'LER', en: 'Label Edge Router: pushes/pops labels at the edge (station).', hi: 'Edge router — label lagata/hatata hai.' },
    { term: 'LSR', en: 'Label Switching Router: swaps labels in the core (junction).', hi: 'Core router — label badalta hai.' },
    { term: 'VPN', en: 'Virtual private network over a shared core (L3VPN, L2VPN).', hi: 'Shared core par alag private network.' },
    { term: 'Pseudowire', en: 'Emulated point-to-point circuit (Ethernet or E1) over MPLS.', hi: 'MPLS par nakli (emulated) circuit.' },
  ],
  practice: { note: 'B0 conceptual hai. Load menu → J1/J2/J4 kholkar Jodhpur design dekho; Learn → Jodhpur page par IP plan.' },
};
