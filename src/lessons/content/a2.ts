import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A2',
  part: 'A',
  title: 'Physical layer: copper, fibre, SFPs, optical budget',
  summary: 'Cat6 vs OFC, single-mode vs multi-mode, connectors, SFP types, console cable, LEDs, aur Jodhpur spans par optical power budget.',
  estMinutes: 50,
  blocks: [
    {
      kind: 'text',
      heading: 'Layer 1 = bits ko signal banana',
      body: 'Physical layer ka kaam hai 0/1 ko bijli (copper), light (fibre) ya radio signal mein badalna. Bahut saare field faults yahin hote hain: cable cut, loose connector, gandi fibre end-face, galat SFP, power fail. Isliye troubleshooting hamesha Layer 1 se shuru karo: "LED jal rahi hai? link up hai?"',
    },
    {
      kind: 'diagram',
      diagram: 'fibre-vs-copper',
      caption: 'Copper electrical signal le jaata hai (~100 m tak Ethernet); fibre light le jaata hai (km tak).',
    },
    {
      kind: 'table',
      caption: 'Copper vs fibre',
      headers: ['Point', 'Copper (Cat6 UTP)', 'Optical fibre (OFC)'],
      rows: [
        ['Signal', 'Electrical', 'Light (laser/LED)'],
        ['Ethernet reach', '100 m per segment', 'Hundreds of m (MMF) se 80+ km (SMF, optic par depend)'],
        ['EMI (25 kV OHE ke paas)', 'Interference ka risk', 'Immune — electrical noise ka asar nahi'],
        ['Use in station', 'PC, phone, camera tak patch', 'Station-to-station, building-to-building'],
        ['Lightning / earth potential', 'Surge aa sakta hai', 'Non-conductive (metal-free cable ho to)'],
      ],
    },
    {
      kind: 'analogy',
      body: 'Copper = station yard ki chhoti shunting line: paas ke kaam ke liye theek. Fibre = main line: lambi doori, tez, aur OHE ki bijli se pareshaan nahi.',
    },
    {
      kind: 'text',
      heading: 'Single-mode vs multi-mode fibre',
      body: 'Single-mode fibre (SMF, core ~9 µm, ITU-T G.652) mein light ek hi raste chalti hai — lambi doori ke liye; railway OFC backbone SMF hota hai. Multi-mode fibre (MMF, core 50 ya 62.5 µm) mein light kai raston se chalti hai, isliye doori kam (building ke andar). SMF optic ko MMF fibre par (ya ulta) lagana galat hai.',
    },
    {
      kind: 'keyterms',
      terms: [
        {
          term: 'LC connector',
          meaning: 'Chhota push-pull connector; SFP par sabse common.',
        },
        {
          term: 'SC connector',
          meaning: 'Bada square push-pull connector; ODF/patch panel par common.',
        },
        {
          term: 'FC connector',
          meaning: 'Screw-type round connector; purane SDH equipment par milta hai.',
        },
        {
          term: 'UPC / APC',
          meaning: 'Connector end-face polish. APC (green, angled) ko UPC (blue) se mat jodo — loss/damage.',
        },
        {
          term: 'Pigtail / patch cord',
          meaning: 'Ek taraf connector wala chhota fibre (splice ke liye) / dono taraf connector.',
        },
        {
          term: 'ODF',
          meaning: 'Optical Distribution Frame — station par OFC ke cores yahan terminate hote hain.',
        },
      ],
    },
    {
      kind: 'table',
      caption: 'Pluggable optic types',
      headers: ['Type', 'Speed', 'Note'],
      rows: [
        ['SFP', '1 Gbps', '1000BASE-SX (MMF), -LX (SMF ~10 km), -ZX (vendor, ~80 km)'],
        ['SFP+', '10 Gbps', '10GBASE-SR/LR (10 km)/ER (40 km)'],
        ['SFP28', '25 Gbps', 'SFP+ jaisa size'],
        ['QSFP28', '100 Gbps', '4 lanes × 25G'],
        ['BiDi SFP', '1/10 Gbps', 'Ek hi fibre core par Tx/Rx alag wavelength — pair mein (A/B) lagte hain'],
        ['CWDM / DWDM SFP', 'varies', 'Fixed wavelength; mux se kai channels ek fibre pair par'],
      ],
    },
    {
      kind: 'text',
      heading: 'Straight, crossover, Auto-MDIX aur console',
      body: 'Purane Ethernet mein PC→switch ke liye straight cable aur switch→switch ya PC→PC ke liye crossover cable lagti thi. Aaj zyada tar ports Auto-MDIX support karte hain, to straight cable har jagah chal jaati hai (1000BASE-T mein sab 4 pairs use hote hain). Console cable (RJ45-to-DB9 serial ya USB) se router/switch ko pehli baar configure karte hain — yeh data port nahi, management port hai; Cisco jaise devices par aam setting 9600 baud, 8 data bits, no parity, 1 stop bit hoti hai (apne device ka manual dekho).',
    },
    {
      kind: 'table',
      caption: 'Port LEDs — general meaning (vendor ke hisaab se badalta hai)',
      headers: ['LED', 'Aam matlab'],
      rows: [
        ['Off', 'Link down: cable/SFP nahi, far end band, ya port shutdown'],
        ['Steady green', 'Link up'],
        ['Blinking green', 'Traffic (activity)'],
        ['Amber', 'Fault, err-disabled, ya STP blocking (device par depend)'],
      ],
    },
    {
      kind: 'text',
      heading: 'Optical power budget — link chalega ya nahi?',
      body: 'Transmitter kuch power (dBm) bhejta hai; raste mein fibre, connectors aur splices loss karte hain (dB); receiver ko kam se kam "sensitivity" jitni power chahiye. Formula: Rx = Tx − (L × α + connectors × loss + splices × loss + extra). Margin = Rx − sensitivity. Hum 3 dB margin ageing aur repair splices ke liye bacha kar rakhte hain. Zyada power bhi problem hai: chhoti doori par ZX optic receiver ko overload kar sakta hai — attenuator lagao.',
    },
    {
      kind: 'analogy',
      body: 'Budget = train ke paas kitna diesel hai. Har km, har connector, har splice thoda diesel khaata hai. Destination par pahunch kar bhi reserve (margin) bacha hona chahiye — warna raste mein ruk jaayegi (LOS).',
    },
    {
      kind: 'widget',
      widget: 'optical-budget',
      caption: 'Jodhpur division ka span chuno (map chainage se km), optic chuno, aur dekho link OK/marginal/LOS hai.',
    },
    {
      kind: 'text',
      heading: 'Jodhpur example: JU–MTD 104.11 km',
      body: 'Track chainage se JU (624.96) se MTD (520.85) = 104.11 km. Ek seedha 104 km 1550 nm span par fibre loss hi ~26 dB (0.25 dB/km) ho jaata hai, upar se splices (~2 km drum par ek) aur connectors. Simulator ke 10GBASE-ER ya generic 1000BASE-ZX profiles itna budget nahi dete — widget mein khud check karo. Isliye practical design mein beech ke stations (RKB, BNO, JWL, … ~8–12 km doori par) par equipment hota hai aur link station-to-station chhote spans mein jaata hai. Assumption: OFC track ke saath-saath chalta hai; yeh asli RailTel/NWR route nahi hai.',
    },
    {
      kind: 'text',
      heading: 'Test instruments: power meter aur OTDR',
      body: 'Optical power meter + light source se end-to-end loss (dB) seedha naapte hain. OTDR ek taraf se pulse bhej kar reflection dekhta hai aur graph par har splice, connector, bend aur break ki doori batata hai — fibre cut dhoondhne mein kaam aata hai ("break 37.2 km par"). Kabhi bhi active fibre ya laser mein aankh se mat dekho.',
    },
    {
      kind: 'note',
      tone: 'safety',
      body: 'Laser safety: SFP ya patch cord ke end mein kabhi mat jhaanko — infrared light dikhti nahi lekin aankh ko nuksan kar sakti hai. Unused ports par dust cap lagao; connect karne se pehle end-face clean aur inspect karo.',
    },
    {
      kind: 'note',
      tone: 'source',
      body: 'Optic Tx/Rx values simulator ke OPTIC_PROFILES se hain (ITU-T G.957 / IEEE 802.3 approx. / vendor-typical, har profile par source likha hai). Asli design ke liye apne SFP ka datasheet use karo.',
    },
  ],
  flash: [
    {
      prompt: 'OHE (25 kV) ke paas station-to-station link ke liye fibre kyon behtar hai?',
      options: [
        'Fibre sasta hai',
        'Fibre electromagnetic interference se immune hai aur lambi doori tak jaata hai',
        'Fibre ko power nahi chahiye',
        'Fibre par IP nahi chalta',
      ],
      correctIndex: 1,
      explanation: 'Light ko bijli ka interference nahi lagta, aur SMF km tak chalta hai; Cat6 Ethernet sirf 100 m.',
    },
    {
      prompt: 'Railway OFC backbone kis type ka fibre hota hai?',
      options: ['Multi-mode 62.5 µm', 'Single-mode (~9 µm core)', 'Plastic fibre', 'Coaxial'],
      correctIndex: 1,
      explanation: 'Lambi doori ke liye single-mode fibre (G.652) use hota hai.',
    },
    {
      prompt: 'Tx = −5 dBm, total loss = 20 dB, sensitivity = −28 dBm. Margin kitna hai?',
      options: ['3 dB', '−3 dB', '8 dB', '23 dB'],
      correctIndex: 0,
      explanation: 'Rx = −5 − 20 = −25 dBm. Margin = −25 − (−28) = 3 dB — bilkul edge par (marginal/OK limit).',
    },
    {
      prompt: 'Fibre cut ki doori dhoondhne ke liye kaunsa instrument?',
      options: ['Multimeter', 'OTDR', 'Console cable', 'LAN tester'],
      correctIndex: 1,
      explanation: 'OTDR reflection se event ki doori batata hai.',
    },
    {
      prompt: 'Naye switch par port LED bilkul off hai. Sabse pehle kya check karoge?',
      options: ['OSPF config', 'Layer 1: cable/SFP laga hai, far end on hai, port shutdown to nahi', 'DNS server', 'Routing table'],
      correctIndex: 1,
      explanation: 'LED off = link down. Troubleshooting Layer 1 se shuru karo.',
    },
  ],
  glossary: [
    {
      term: 'OFC',
      en: 'Optical Fibre Cable.',
      hi: 'Light le jaane wali fibre cable.',
    },
    {
      term: 'SMF / MMF',
      en: 'Single-mode / multi-mode fibre.',
      hi: 'Ek raste wali (lambi doori) / kai raste wali (chhoti doori) fibre.',
    },
    {
      term: 'SFP',
      en: 'Small Form-factor Pluggable transceiver.',
      hi: 'Port mein lagne wala chhota optic/copper module.',
    },
    {
      term: 'dBm',
      en: 'Power level relative to 1 mW.',
      hi: '1 mW ke comparison mein power (0 dBm = 1 mW).',
    },
    {
      term: 'Rx sensitivity',
      en: 'Minimum received power for error-free operation.',
      hi: 'Receiver ko kam se kam itni power chahiye.',
    },
    {
      term: 'OTDR',
      en: 'Optical Time-Domain Reflectometer.',
      hi: 'Fibre mein splice/break ki doori batane wala instrument.',
    },
    {
      term: 'Auto-MDIX',
      en: 'Port automatically adapts to straight or crossover cable.',
      hi: 'Port khud straight/crossover samajh leta hai.',
    },
  ],
  practice: {
    note: 'Sandbox: do routers ko OFC link se jodo, link par click karke length aur optic badlo — optical budget aur link state live dikhega. Guided lab Phase 2 mein.',
  },
};
