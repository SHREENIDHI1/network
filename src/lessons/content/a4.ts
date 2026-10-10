import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A4',
  part: 'A',
  title: 'Ethernet & MAC addresses',
  summary: 'Ethernet frame, MAC address, hub vs switch, collision aur broadcast domain, MAC learning aur flooding.',
  estMinutes: 45,
  blocks: [
    {
      kind: 'text',
      heading: 'Ethernet = LAN ki bhasha',
      body: 'Station ke andar ka network (LAN) lagbhag hamesha Ethernet hota hai: Cat6 cable ya fibre par chalne wala Layer 2 protocol. Ethernet data ko "frame" mein bhejta hai. Har frame par bhejne wale aur paane wale ka hardware address (MAC address) likha hota hai.',
    },
    { kind: 'diagram', diagram: 'ethernet-frame', caption: 'Ethernet II frame: preamble, destination MAC, source MAC, type, payload, FCS.' },
    {
      kind: 'table',
      caption: 'Frame ke hisse',
      headers: ['Field', 'Size', 'Kaam'],
      rows: [
        ['Preamble + SFD', '8 bytes', 'Receiver ko sync karna ("frame shuru ho raha hai")'],
        ['Destination MAC', '6 bytes', 'Kisko jaana hai'],
        ['Source MAC', '6 bytes', 'Kisne bheja — switch isi se seekhta hai'],
        ['Type / EtherType', '2 bytes', 'Andar kya hai: 0x0800 = IPv4, 0x0806 = ARP, 0x8100 = VLAN tag'],
        ['Payload', '46–1500 bytes', 'Asli data (jaise IP packet). 1500 = standard MTU'],
        ['FCS', '4 bytes', 'CRC error check — kharab frame drop'],
      ],
    },
    {
      kind: 'text',
      heading: 'MAC address',
      body: 'MAC address 48 bits (6 bytes) ka hota hai, hex mein likhte hain: 00:1A:2B:3C:4D:5E (Cisco style: 001a.2b3c.4d5e). Pehle 3 bytes OUI = manufacturer ka code, baaki 3 bytes us company ka serial. Har NIC (network card) par factory se ek MAC hota hai. MAC sirf apne LAN (Layer 2) mein kaam aata hai; router ke paar IP address kaam karta hai.',
    },
    {
      kind: 'keyterms',
      terms: [
        { term: 'Unicast', meaning: 'Ek device ko frame (destination = uska MAC).' },
        { term: 'Broadcast', meaning: 'Sabko: FF:FF:FF:FF:FF:FF. Jaise ARP request.' },
        { term: 'Multicast', meaning: 'Ek group ko (pehle byte ka last bit = 1), jaise kuch routing protocols.' },
        { term: 'Collision domain', meaning: 'Jahan do devices ek saath bhejein to signal takra sakte hain (hub ka poora segment).' },
        { term: 'Broadcast domain', meaning: 'Jahan tak broadcast frame pahunchta hai (ek VLAN / ek LAN). Router isko rokta hai.' },
      ],
    },
    {
      kind: 'text',
      heading: 'Hub vs switch',
      body: 'Hub (Layer 1) dimaag nahi lagata: jo bits ek port par aaye, sab doosre ports par repeat. Sab ek collision domain mein, half duplex, bandwidth share. Switch (Layer 2) har frame ka source MAC padh kar MAC table banata hai. Destination MAC table mein ho to frame sirf us port par; na ho ya broadcast ho to flood (VLAN ke sab ports par, aane wale port ko chhod kar). Har switch port apna collision domain hai, aur full duplex mein collision hota hi nahi.',
    },
    {
      kind: 'analogy',
      body: 'Hub = station ka loudspeaker announcement: sabko sunai deta hai, chahe kisi ke kaam ka ho ya nahi. Switch = parcel office ka clerk jo register (MAC table) rakhta hai: "UTS counter 2 ka maal hamesha khidki 2 par" — dusri khidki par koi pareshan nahi hota.',
    },
    {
      kind: 'widget',
      widget: 'mac-learning',
      caption: 'Hub aur switch chuno, frames bhejo aur dekho kisko milta hai aur MAC table kaise bharti hai.',
    },
    {
      kind: 'text',
      heading: 'MAC aging aur duplex',
      body: 'Switch MAC entry ko hamesha nahi rakhta: Cisco default aging 300 second hai (simulator bhi 300 s). Device hata do to entry purani hokar mit jaati hai. Duplex: full duplex = dono taraf ek saath bhej sakte hain; half = ek time par ek. Dono ends auto-negotiation karte hain. Agar ek taraf "duplex full" force kiya aur doosri taraf auto hai, to auto wala half duplex par chala jaata hai → duplex mismatch: link up dikhta hai lekin packets girte hain, CRC aur late collision counters badhte hain.',
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator mein hub frames repeat karta hai lekin collision timing simulate nahi karta; duplex mismatch ko simplified loss (har 4th frame) se dikhaya hai. Details: Model Limitations.',
    },
  ],
  flash: [
    {
      prompt: 'Switch apni MAC table kis field se bharta hai?',
      options: ['Destination MAC', 'Source MAC', 'Destination IP', 'FCS'],
      correctIndex: 1,
      explanation: 'Switch seekhta hai "yeh source MAC is port par hai". Destination MAC se forwarding decision hota hai.',
    },
    {
      prompt: 'Broadcast MAC address kya hai?',
      options: ['00:00:00:00:00:00', 'FF:FF:FF:FF:FF:FF', '01:00:5E:00:00:01', '127.0.0.1'],
      correctIndex: 1,
      explanation: 'Sab 48 bits 1 = broadcast; LAN ke sab devices use lete hain.',
    },
    {
      prompt: 'Destination MAC switch ki table mein nahi hai. Switch kya karega?',
      options: ['Frame drop', 'Same VLAN ke sab doosre ports par flood', 'Router ko bhejega', 'Sender ko error'],
      correctIndex: 1,
      explanation: 'Unknown unicast flooding. Jab reply aayega to switch us MAC ko bhi seekh lega.',
    },
    {
      prompt: '8-port hub par 8 PC: kitne collision domains?',
      options: ['8', '1', '0', '2'],
      correctIndex: 1,
      explanation: 'Hub ka poora segment ek collision domain hai. Switch par har port alag collision domain hota hai.',
    },
    {
      prompt: 'Switch port "duplex full" forced, PC auto par. Kya hoga?',
      options: ['Sab theek', 'Duplex mismatch: PC half duplex par, packet loss aur CRC/late collisions', 'Link down', 'Speed 10 Gbps'],
      correctIndex: 1,
      explanation: 'Forced side negotiate nahi karta; auto side half duplex maan leta hai. Dono ends same rakho (dono auto ya dono forced same).',
    },
  ],
  glossary: [
    { term: 'Frame', en: 'Layer 2 unit of data with MAC header and FCS.', hi: 'Layer 2 ka data packet, MAC header ke saath.' },
    { term: 'MAC address', en: '48-bit hardware address of a network interface.', hi: 'NIC ka 48-bit hardware address.' },
    { term: 'OUI', en: 'First 24 bits of a MAC: identifies the manufacturer.', hi: 'MAC ke pehle 24 bits: company ka code.' },
    { term: 'MAC table', en: 'Switch table mapping MAC addresses to ports (per VLAN).', hi: 'Switch ka register: kaunsa MAC kis port par.' },
    {
      term: 'Flooding',
      en: 'Sending a frame out of all ports in the VLAN except the incoming one.',
      hi: 'VLAN ke sab ports par bhejna (aane wale port ko chhod kar).',
    },
    { term: 'Duplex', en: 'Full = send and receive at the same time; half = one at a time.', hi: 'Full = ek saath bhejna-lena; half = baari-baari.' },
  ],
  practice: { labId: 'L4.1', note: 'Lab L4.1: hub aur switch side-by-side chalao, ping karo aur MAC table dekho.' },
};
