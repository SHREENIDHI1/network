import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A0',
  part: 'A',
  title: 'What is a network?',
  summary: 'Network kya hota hai, bandwidth vs latency, circuit vs packet switching, aur Railways SDH se IP-MPLS kyon ja rahi hai.',
  estMinutes: 30,
  blocks: [
    {
      kind: 'text',
      heading: 'Network = devices + links + rules',
      body: 'Network ka matlab hai do ya zyada devices (PC, phone, camera, router) jo kisi link (copper cable, fibre, radio) se jude hain aur kuch rules (protocols) follow karke data bhejte hain. Station par UTS counter ka PC, CCTV camera, control phone — sab ko data chahiye, aur network yeh data ek jagah se doosri jagah le jaata hai.',
    },
    {
      kind: 'analogy',
      body: 'Railway jaisa hi socho: stations = devices, track = links, aur timetable + signalling rules = protocols. Bina rules ke do trains ek hi block section mein aa jaayengi; bina protocol ke do devices ka data takra jaayega ya kho jaayega.',
    },
    {
      kind: 'keyterms',
      terms: [
        {
          term: 'Node / device',
          meaning: 'Network par koi bhi cheez jo data bhejti ya receive karti hai (PC, switch, router).',
        },
        {
          term: 'Link',
          meaning: 'Do devices ke beech ka physical rasta — copper, fibre ya wireless.',
        },
        {
          term: 'Protocol',
          meaning: 'Data bhejne-lene ke agreed rules (jaise Ethernet, IP, OSPF).',
        },
        {
          term: 'Bandwidth',
          meaning: 'Ek second mein link kitne bits le ja sakta hai (bit/s). Track ki "kitni chaudi" wali capacity.',
        },
        {
          term: 'Latency',
          meaning: 'Ek bit ko A se B tak pahunchne mein kitna time lagta hai (ms).',
        },
      ],
    },
    {
      kind: 'text',
      heading: 'Bandwidth vs latency — do alag cheezein',
      body: 'Bandwidth batata hai ki ek second mein kitna data jaa sakta hai; latency batata hai ki pehla bit kitni der mein pahunchta hai. 1 Gbps link par bhi agar 300 km fibre hai to signal ko time lagega (light fibre mein lagbhag 200,000 km/s chalti hai, yaani ~5 µs per km). File download ke liye bandwidth important hai; voice call aur control/SCADA ke liye latency aur jitter zyada important hain.',
    },
    {
      kind: 'analogy',
      body: 'Bandwidth = ek goods train mein kitne wagon (ek baar mein kitna maal). Latency = train ko JU se MTD pahunchne mein kitna time. Zyada wagon lagane se train tez nahi chalti — dono alag baatein hain.',
    },
    {
      kind: 'widget',
      widget: 'bandwidth-calc',
      caption: 'Try karo: file size aur link speed daalo, transfer time dekho. Distance daalo to propagation delay bhi dikhega.',
    },
    {
      kind: 'text',
      heading: 'Circuit switching vs packet switching',
      body: 'Circuit switching (purana telephone exchange, SDH/PDH E1) mein call shuru hote hi ek fixed rasta aur fixed bandwidth reserve ho jaati hai — chahe aap bol rahe ho ya chup ho. Packet switching (Ethernet/IP/MPLS) mein data chhote packets mein toot jaata hai; har packet link share karta hai, aur jab koi bol nahi raha to bandwidth doosron ke kaam aati hai.',
    },
    {
      kind: 'diagram',
      diagram: 'circuit-vs-packet',
      caption: 'Upar: circuit — ek reserved path, khaali time bhi blocked. Neeche: packet — sab users ek hi link share karte hain.',
    },
    {
      kind: 'analogy',
      body: 'Circuit = ek dedicated block section jo ek train ke liye poori journey tak lock hai, chahe train station par khadi ho. Packet = shared track jahan har chhoti train (packet) apni baari par nikalti hai, aur khaali gap mein doosri trains chal sakti hain.',
    },
    {
      kind: 'table',
      caption: 'Circuit vs packet — summary',
      headers: ['Point', 'Circuit (SDH/E1)', 'Packet (IP/MPLS)'],
      rows: [
        ['Bandwidth', 'Fixed, reserved per circuit', 'Shared, on demand'],
        ['Idle time', 'Wasted', 'Used by other traffic'],
        ['Delay', 'Very stable', 'Varies (needs QoS for voice)'],
        ['Scaling to Gbps video/CCTV', 'Costly, rigid', 'Natural fit'],
        ['New services (CCTV, Wi-Fi, IP phones)', 'Need conversion', 'Native IP'],
      ],
    },
    {
      kind: 'text',
      heading: 'Railways SDH se IP-MPLS kyon ja rahi hai?',
      body: 'Pehle station ke zyada tar circuits voice aur low-speed data the (control phone, block, E1). Ab CCTV, Wi-Fi, UTS/PRS, FOIS, video surveillance, SCADA — sab IP par hain aur bahut zyada bandwidth chahiye. SDH fixed-size containers (E1 = 2.048 Mbit/s, STM-1 = 155.52 Mbit/s) mein sochta hai; IP-MPLS ek hi network par sab services ko alag-alag VPN mein, QoS ke saath, Gbps speed par le ja sakta hai. Purane E1 circuits bhi MPLS par pseudowire se chal sakte hain (yeh B8 mein seekhenge).',
    },
    {
      kind: 'table',
      caption: 'Station bandwidth planning (as quoted from CAMTECH handbook)',
      headers: ['Station type', 'Approx. bandwidth'],
      rows: [
        ['Major station', '~2 Gbps'],
        ['Junction station', '~1 Gbps'],
        ['Wayside station', '~512 Mbps'],
      ],
    },
    {
      kind: 'note',
      tone: 'source',
      body: 'Source note: yeh figures CAMTECH handbook se user ne quote kiye hain; PDF is app ke paas verify karne ke liye available nahi tha. Apne division ki actual planning document se confirm karein.',
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Yaad rakho: RailMPLS Lab ek educational simulator hai. Jodhpur division ka map TRACK map hai; simulated network real RailTel/NWR network nahi hai.',
    },
  ],
  flash: [
    {
      prompt: 'Bandwidth kya measure karta hai?',
      options: [
        'Ek bit ko pahunchne mein lagne wala time',
        'Ek second mein link kitne bits le ja sakta hai',
        'Cable ki lambai',
        'Router ki CPU speed',
      ],
      correctIndex: 1,
      explanation: 'Bandwidth = capacity (bit/s). Pahunchne ka time latency hai.',
    },
    {
      prompt: 'JU se MTD fibre ~104 km hai. Link 1 Gbps se 10 Gbps kar diya. Propagation delay par kya asar hoga?',
      options: ['10 guna kam ho jaayega', 'Lagbhag same rahega', '10 guna badh jaayega', 'Zero ho jaayega'],
      correctIndex: 1,
      explanation:
        'Propagation delay distance aur fibre mein light ki speed par depend karta hai, link speed par nahi. ~104 km × ~5 µs/km ≈ 0.5 ms dono case mein.',
    },
    {
      prompt: 'Circuit switching ki sabse badi kami kya hai jab user chup hai?',
      options: [
        'Data corrupt ho jaata hai',
        'Reserved bandwidth khaali padi rehti hai, doosre use nahi kar sakte',
        'Call apne aap cut ho jaati hai',
        'Delay badh jaata hai',
      ],
      correctIndex: 1,
      explanation:
        'Circuit mein bandwidth call ke poore time ke liye reserved hai; idle time waste hota hai. Packet switching mein woh capacity doosron ko milti hai.',
    },
    {
      prompt: 'Voice call ke liye kaunsi cheez sabse zyada important hai?',
      options: ['Sirf bahut zyada bandwidth', 'Kam latency aur stable delay (kam jitter)', 'Lamba cable', 'Bada hard disk'],
      correctIndex: 1,
      explanation: 'Voice ko thodi bandwidth chahiye, lekin delay aur jitter kam hone chahiye. Isliye IP network par voice ke liye QoS lagate hain.',
    },
    {
      prompt: 'Railways IP-MPLS kyon apna rahi hai?',
      options: [
        'Kyunki SDH mein fibre use nahi hota',
        'Kyunki CCTV, Wi-Fi, UTS/PRS jaisi IP services ko Gbps shared bandwidth, VPN separation aur QoS chahiye',
        'Kyunki MPLS ko electricity nahi chahiye',
        'Kyunki IP par E1 circuits bilkul nahi chal sakte',
      ],
      correctIndex: 1,
      explanation: 'IP-MPLS ek hi network par kai services ko alag VPN mein, QoS ke saath le jaata hai. Purane E1 bhi pseudowire se chal sakte hain.',
    },
  ],
  glossary: [
    {
      term: 'Bandwidth',
      en: 'Maximum data rate of a link, in bits per second.',
      hi: 'Link ek second mein kitne bits le ja sakta hai.',
    },
    {
      term: 'Latency',
      en: 'Time for data to travel from source to destination.',
      hi: 'Data ko A se B pahunchne mein lagne wala time.',
    },
    {
      term: 'Jitter',
      en: 'Variation in latency between packets.',
      hi: 'Packets ke delay mein upar-neeche hona.',
    },
    {
      term: 'Circuit switching',
      en: 'A fixed path and bandwidth are reserved for the whole call.',
      hi: 'Poori call ke liye fixed rasta aur bandwidth reserve.',
    },
    {
      term: 'Packet switching',
      en: 'Data is split into packets that share links on demand.',
      hi: 'Data chhote packets mein, link sab share karte hain.',
    },
    {
      term: 'SDH',
      en: 'Synchronous Digital Hierarchy: TDM transmission (STM-1/4/16).',
      hi: 'Purana TDM transmission system (STM-1/4/16).',
    },
    {
      term: 'IP-MPLS',
      en: 'IP network that forwards using labels, supporting VPNs, QoS and TE.',
      hi: 'Label se forward karne wala IP network; VPN, QoS, TE support.',
    },
  ],
  practice: {
    note: 'Abhi koi lab nahi. Canvas par Sandbox mode mein do PC aur ek switch jodkar dekho; Phase 2 mein A0 ke liye guided lab aayega.',
  },
};
