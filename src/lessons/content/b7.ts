import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B7',
  part: 'B',
  title: 'L2VPN: VPWS and VPLS',
  summary:
    'Pseudowire = MPLS par virtual cable. VPWS (point-to-point, jaise Data Logger ka Ethernet) aur VPLS (multipoint "virtual switch", jaise CCTV LAN), VC label, MTU, split horizon aur troubleshooting.',
  estMinutes: 50,
  blocks: [
    {
      kind: 'text',
      heading: 'L3VPN kaafi nahi?',
      body: 'L3VPN (B6) mein PE customer ke IP routes jaanta hai. Kuch railway systems ko routing nahi, ek hi LAN chahiye: Data Logger ka vendor software broadcast se logger dhoondhta hai; purane SCADA/CCTV discovery tools layer-2 maangte hain; purane leased Ethernet circuits ko "jaisa tha waisa" chalana hai. Iske liye L2VPN: PE frame ko route nahi karta, bas MPLS par as-is le jaata hai.',
    },
    {
      kind: 'table',
      caption: 'VPWS vs VPLS',
      headers: ['', 'VPWS', 'VPLS'],
      rows: [
        ['Shape', 'Point-to-point (do ports)', 'Multipoint (kai sites, ek LAN)'],
        ['PE ka kaam', 'Port A ka har frame → port B', 'Virtual switch: MAC learning, flooding'],
        [
          'Config (IOS)',
          'interface → xconnect <peer> <vc-id> encapsulation mpls',
          'l2 vfi NAME manual → vpn id → neighbor …; port par xconnect vfi NAME',
        ],
        ['Railway misaal', 'MTD Data Logger ↔ JU server', 'JU NVR + teen stations ke cameras'],
        ['Loop se bachav', 'Do hi ends', 'Split horizon + full mesh'],
      ],
    },
    {
      kind: 'text',
      heading: 'Pseudowire ke do labels',
      body: 'Ingress PE frame ke aage do labels lagata hai: upar transport label (LDP, remote PE ke loopback ka — wahi LSP jo B4 mein bana) aur neeche VC label. VC label remote PE ne targeted LDP se diya hota hai — "yeh label dekho to frame mere is port par nikaalo". P routers sirf upar wala label swap karte hain; penultimate hop use pop karta hai; egress PE VC label se port chunta hai. Peer address hamesha remote PE ka LDP router-ID (loopback) — targeted LDP session usi par banta hai.',
    },
    { kind: 'widget', widget: 'pw-mtu', caption: 'Core MTU: customer frame + labels + control word' },
    {
      kind: 'text',
      heading: 'VPLS: split horizon aur full mesh',
      body: 'VFI ek switch ki tarah MAC seekhta hai: "yeh MAC mere local port par" ya "yeh MAC PE-DNA wale pseudowire ke peeche". Unknown/broadcast sab ports aur sab pseudowires par flood. Par jo frame pseudowire se aaya, woh kabhi doosre pseudowire par nahi jaata (split horizon) — isse core mein loop nahi banta aur STP ki zaroorat nahi. Natija: har PE ka har PE se seedha pseudowire chahiye. 4 PE = 6 PWs; 20 PE = 190 — bade networks H-VPLS ya EVPN use karte hain.',
    },
    {
      kind: 'table',
      caption: 'VC DOWN — kya check karein',
      headers: ['Symptom (show mpls l2transport vc)', 'Wajah', 'Fix'],
      rows: [
        ['Remote has no VC ID …', 'Dono taraf VC ID / vpn id alag', 'Same VC ID'],
        ['MTU mismatch', 'AC par "mtu" alag', 'Dono taraf same MTU'],
        ['Targeted LDP cannot form', 'Peer loopback IGP mein nahi', 'Loopback advertise karo'],
        ['No LSP to peer', 'LDP label nahi ("mpls ip" missing)', 'Core par mpls ip'],
        ['Attachment circuit down', 'Port shutdown / cable', 'no shutdown'],
      ],
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator: pseudowire state computed hai (targeted LDP messages, PW status TLV, control word negotiation nahi). Frames asli mein do labels ke saath core se guzarte hain — Packet Inspector mein "Pseudowire payload" dikhta hai. VPLS VFI seedha port par lagta hai (IOS mein SVI/bridge-domain); MAC aging aur MAC limit nahi.',
    },
    {
      kind: 'analogy',
      body: 'VPWS = do stations ke beech private parcel van: jo dabba diya, bina khole doosre station par utaar diya. VPLS = kai stations ka common godown: har dabbe par naam padh kar sahi station bhejte hain, naam na pata ho to sab stations ko copy.',
    },
  ],
  flash: [
    {
      prompt: 'VPWS mein PE customer frame ke saath kya karta hai?',
      options: ['IP route karta hai', 'As-is MPLS labels ke neeche le jaata hai', 'NAT karta hai', 'VLAN hata deta hai hamesha'],
      correctIndex: 1,
      explanation: 'Layer-2 service: frame wahi rehta hai.',
    },
    {
      prompt: 'VC label kaun allocate karta hai?',
      options: ['Ingress PE', 'Remote (egress) PE, targeted LDP se', 'P router', 'BGP RR'],
      correctIndex: 1,
      explanation: 'Egress PE batata hai kis label par kaunsa AC.',
    },
    {
      prompt: 'VPLS mein split horizon ka matlab?',
      options: ['PW se aaya frame doosre PW par nahi', 'Port se aaya frame drop', 'Broadcast band', 'MAC learning band'],
      correctIndex: 0,
      explanation: 'Loop se bachav — isliye full mesh.',
    },
    {
      prompt: '5 PEs ki VPLS full mesh mein kitne pseudowires?',
      options: ['4', '5', '10', '20'],
      correctIndex: 2,
      explanation: '5×4/2 = 10.',
    },
    {
      prompt: 'Ping chhote packets se chal raha, bada data nahi. Pseudowire par pehla shak?',
      options: ['DNS', 'Core MTU chhota (labels ke bytes)', 'Galat VC ID', 'BGP'],
      correctIndex: 1,
      explanation: 'Customer 1500 + 14 + labels > 1500 core MTU.',
    },
  ],
  glossary: [
    { term: 'Pseudowire (PW)', en: 'Emulated point-to-point circuit over MPLS (RFC 3985).', hi: 'MPLS par virtual cable.' },
    { term: 'Attachment circuit (AC)', en: 'The customer-facing port or VLAN tied to a pseudowire.', hi: 'Customer ka port jo PW se juda.' },
    { term: 'VC ID', en: 'Identifier that both PEs use for the same pseudowire.', hi: 'Dono PE par same PW number.' },
    { term: 'VPWS', en: 'Virtual Private Wire Service: point-to-point L2VPN.', hi: 'Do points ke beech L2VPN.' },
    { term: 'VPLS / VFI', en: 'Virtual Private LAN Service; the per-PE virtual switch is the VFI.', hi: 'MPLS par virtual switch.' },
    { term: 'Split horizon (VPLS)', en: 'Frames from one pseudowire are never sent to another pseudowire.', hi: 'PW se PW forward nahi.' },
  ],
  practice: { labId: 'LB7.1', note: 'Lab LB7.1: MTD Data Logger ka VPWS. Lab LB7.2: CCTV ka VPLS, full mesh aur split horizon.' },
};
