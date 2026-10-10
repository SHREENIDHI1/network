import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A11',
  part: 'A',
  title: 'Network services: DHCP, DNS, NAT, NTP, SNMP, Syslog, SSH',
  summary:
    'Network ko chalane wali services: address dena (DHCP), naam se address (DNS), Railnet ka internet (NAT/PAT), sahi time (NTP), monitoring (SNMP, Syslog) aur surakshit login (SSH).',
  estMinutes: 70,
  blocks: [
    {
      kind: 'text',
      heading: 'DHCP — address apne aap',
      body: 'Station par 40 terminals ko haath se IP dena galtiyon ka ghar hai. DHCP server pool se address, mask, gateway aur DNS deta hai. Chaar step: DISCOVER (broadcast), OFFER, REQUEST, ACK. Broadcast router paar nahi karta — isliye doosre subnet ke server ke liye router interface par "ip helper-address <server>" (DHCP relay). Server na mile to Windows 169.254.x.x (APIPA) le leta hai.',
    },
    { kind: 'diagram', diagram: 'dhcp-dora', caption: 'DORA: Discover, Offer, Request, Ack.' },
    {
      kind: 'text',
      heading: 'DNS — naam se address',
      body: 'Log "uts-server" yaad rakhte hain, 10.52.200.10 nahi. DNS (UDP 53) naam ko IP mein badalta hai. Host par DNS server set hota hai (DHCP se ya haath se); "nslookup uts-server" se test karo. Router par "ip name-server" + "ip domain-lookup"; chhote setup mein "ip host NAME IP" static table bhi chalti hai.',
    },
    {
      kind: 'text',
      heading: 'NAT / PAT — Railnet ka internet JU par',
      body: 'Andar ke addresses (10.x private) Internet par route nahi hote. JU firewall/router NAT karta hai: andar ka address bahar ke public address se badalta hai. PAT (overload) mein hazaron andar wale ek hi public IP share karte hain — port number se alag pehchane jaate hain. Interfaces: "ip nat inside" / "ip nat outside"; rule: "ip nat inside source list 1 interface Gi0/1 overload".',
    },
    { kind: 'diagram', diagram: 'nat-pat', caption: 'PAT: kai andar wale hosts, ek bahar ka IP, alag ports.' },
    {
      kind: 'text',
      heading: 'NTP — sab ka time ek',
      body: 'Logs aur alarms ka time galat ho to fault ki kahani samajh nahi aati. NTP (UDP 123) se sab devices ek reference clock se sync hote hain. Stratum = reference se kitni doori: GPS clock 1, usse sync server 2, uske clients 3… Router par "ntp server <ip>"; jis router ke paas apni clock ho use "ntp master". "show ntp status" se check.',
    },
    {
      kind: 'text',
      heading: 'SNMP aur Syslog — monitoring',
      body: 'NMS (Network Management System) ko pata hona chahiye ki kahin link gira. Syslog (UDP 514): device events ka text message bhejta hai ("%LINK-3-UPDOWN … down"). SNMP: NMS devices se counters poochhta hai (UDP 161, community string = password jaisa), aur device khud traps bhejta hai (UDP 162) jaise linkDown. Router: "logging host <nms>", "snmp-server community <c> RO", "snmp-server host <nms> version 2c <c>", "snmp-server enable traps".',
    },
    {
      kind: 'text',
      heading: 'SSH vs Telnet — remote login',
      body: 'Telnet (TCP 23) sab kuch cleartext bhejta hai — password bhi; beech ka koi bhi padh sakta hai. SSH (TCP 22) encrypted hai. Router par SSH ke liye: hostname, "ip domain-name", "crypto key generate rsa modulus 2048", "username admin privilege 15 secret …", aur "line vty 0 4" mein "login local" + "transport input ssh". Packet Inspector mein Telnet "cleartext" aur SSH "encrypted" dikhega.',
    },
    {
      kind: 'table',
      caption: 'Ports yaad rakho',
      headers: ['Service', 'Protocol / port'],
      rows: [
        ['DHCP', 'UDP 67 (server) / 68 (client)'],
        ['DNS', 'UDP 53'],
        ['NTP', 'UDP 123'],
        ['SNMP poll / trap', 'UDP 161 / 162'],
        ['Syslog', 'UDP 514'],
        ['SSH / Telnet', 'TCP 22 / 23'],
      ],
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator mein yeh sab asli packets ki tarah chalte hain (routing, ACL, Packet Inspector). SSH/Telnet mein sirf connection aur login check simulate hota hai — interactive remote shell nahi; device ka console use karo.',
    },
  ],
  flash: [
    {
      prompt: 'UTS terminal ko 169.254.x.x address mila. Iska matlab?',
      options: ['DHCP sahi chal raha', 'DHCP server tak request nahi pahunchi (APIPA)', 'DNS fail', 'NAT fail'],
      correctIndex: 1,
      explanation: 'APIPA tab aata hai jab DHCP server jawab nahi deta — VLAN/relay/pool check karo.',
    },
    {
      prompt: 'DHCP server doosre subnet mein hai. Router par kya chahiye?',
      options: ['ip nat inside', 'ip helper-address <server>', 'ip name-server', 'ntp server'],
      correctIndex: 1,
      explanation: 'DHCP relay broadcast ko unicast banakar server tak le jaata hai.',
    },
    {
      prompt: 'PAT mein kai PCs ek public IP kaise share karte hain?',
      options: ['MAC address se', 'Port numbers se', 'VLAN se', 'TTL se'],
      correctIndex: 1,
      explanation: 'Har session ka alag source port translation table mein.',
    },
    {
      prompt: 'Router ntp server (stratum 2) se sync hua. Router ka stratum?',
      options: ['1', '2', '3', '16'],
      correctIndex: 2,
      explanation: 'Har hop par stratum +1.',
    },
    {
      prompt: 'Management ke liye Telnet kyon nahi?',
      options: ['Slow hai', 'Password aur commands cleartext jaate hain', 'Router support nahi karta', 'Port 23 band hota hai'],
      correctIndex: 1,
      explanation: 'Telnet unencrypted hai; SSH encrypted.',
    },
  ],
  glossary: [
    { term: 'DHCP', en: 'Dynamic Host Configuration Protocol: leases IP settings.', hi: 'Apne aap IP settings dena.' },
    {
      term: 'DHCP relay',
      en: 'Router forwards DHCP broadcasts to a server (ip helper-address).',
      hi: 'Router DHCP broadcast ko server tak pahunchata hai.',
    },
    { term: 'DNS', en: 'Translates names to IP addresses (UDP 53).', hi: 'Naam ko IP mein badalna.' },
    {
      term: 'NAT / PAT',
      en: 'Translating private addresses; PAT shares one address using ports.',
      hi: 'Private address badalna; PAT ports se ek IP share.',
    },
    { term: 'NTP stratum', en: 'Distance from a reference clock (1 = next to GPS).', hi: 'Reference clock se doori.' },
    { term: 'SNMP trap', en: 'Unsolicited alert sent by a device to the NMS (UDP 162).', hi: 'Device ka NMS ko khud bheja alert.' },
    { term: 'Syslog', en: 'Text event messages sent to a log server (UDP 514).', hi: 'Events ke text messages log server ko.' },
    { term: 'SSH', en: 'Encrypted remote login (TCP 22).', hi: 'Encrypted remote login.' },
  ],
  practice: { labId: 'L11.1', note: 'Lab L11.1: JU HQ par DHCP relay, DNS, NAT/PAT, NTP, syslog/SNMP aur SSH.' },
};
