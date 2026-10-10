import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B6',
  part: 'B',
  title: 'L3VPN for Railways',
  summary:
    'Har application ka apna VRF (UTS, PRS, FOIS, SCADA, CCTV, RAILNET, VOIP, NMS-MGMT), RD/RT plan, PE-CE routing, isolation test, shared-services leaking aur JU firewall se Railnet internet.',
  estMinutes: 60,
  blocks: [
    {
      kind: 'text',
      heading: 'VRF = router ke andar alag routing table',
      body: 'VRF (Virtual Routing and Forwarding) ek PE router ko kai "virtual routers" mein baant deta hai. UTS ka interface VRF UTS mein, Railnet ka VRF RAILNET mein — dono ke routes alag table mein. Isliye UTS counter PC Railnet se kabhi seedha nahi pahunch sakta, chahe dono ek hi PE par hon. IP addresses bhi overlap kar sakte hain.',
    },
    {
      kind: 'table',
      caption: 'Division plan (simulator teaching plan, asli RailTel plan nahi)',
      headers: ['VRF', 'RT', 'RD', 'Kya chalta hai'],
      rows: [
        ['UTS', '65000:100', '<PE loopback>:100', 'Unreserved ticketing counters'],
        ['PRS', '65000:101', '<PE loopback>:101', 'Passenger reservation'],
        ['FOIS', '65000:102', '<PE loopback>:102', 'Freight operations'],
        ['SCADA', '65000:103', '<PE loopback>:103', 'Traction substations / RTU'],
        ['CCTV', '65000:104', '<PE loopback>:104', 'Station cameras'],
        ['RAILNET', '65000:105', '<PE loopback>:105', 'Office LAN + internet via JU firewall'],
        ['VOIP', '65000:106', '<PE loopback>:106', 'Control phones'],
        ['NMS-MGMT', '65000:107', '<PE loopback>:107', 'Network management (shared service)'],
      ],
    },
    {
      kind: 'text',
      heading: 'Packet ka safar (do labels)',
      body: 'MTD ka UTS counter → MTD PE (VRF UTS lookup: route BGP se, next hop JU loopback, VPN label 1001) → do labels push: neeche VPN label, upar LDP transport label (JU loopback ka). P routers sirf upar wala label swap karte hain; penultimate hop use pop karta hai (PHP). JU PE VPN label dekhkar seedha VRF UTS mein bhejta hai. traceroute mein beech ke hop "[MPLS: Labels 18/1001]" jaisa dikhate hain (numbers sirf misaal hain — asli numbers "show bgp vpnv4 unicast all labels" se padho).',
    },
    { kind: 'widget', widget: 'rt-matcher', caption: 'RT matcher: export ∩ import = kaun kya dekhega' },
    {
      kind: 'table',
      caption: 'PE-CE routing options',
      headers: ['Option', 'Kab', 'PE config'],
      rows: [
        ['Static', 'Chhota site, ek LAN', 'ip route vrf UTS <LAN> <mask> <CE IP> + redistribute static'],
        ['eBGP', 'CE apne routes khud de (SCADA CE, AS 65201)', 'address-family ipv4 vrf SCADA → neighbor <CE> remote-as 65201'],
        ['OSPF', 'Purane station routers jo sirf OSPF jaante', 'router ospf <id> vrf X (simulator mein abhi nahi)'],
      ],
    },
    {
      kind: 'text',
      heading: 'Shared services aur Railnet internet',
      body: 'NMS ko har VRF dekhna hai, par VRFs aapas mein nahi. Tareeka: NMS-MGMT VRF SCADA ka RT import kare, aur remote SCADA VRF NMS ka RT import kare (jawab wapas aane ke liye). Ek-tarfa RT = ek-tarfa raasta. Railnet internet: JU par RAILNET VRF mein default route firewall ki taraf, "redistribute static" se sab Railnet PEs ko B* 0.0.0.0/0 milta hai. Firewall NAT karke ISP tak.',
    },
    {
      kind: 'table',
      caption: 'Troubleshooting',
      headers: ['Symptom', 'Check', 'Aksar wajah'],
      rows: [
        ['VRF table mein remote route nahi', 'show bgp vpnv4 unicast all', 'Import RT galat, ya vpnv4 neighbor activate nahi'],
        [
          'Route hai, ping fail',
          'show bgp vpnv4 unicast all labels, traceroute vrf',
          'Remote side ne humara route import nahi kiya (wapas ka raasta)',
        ],
        ['PE-CE session Idle/Active', 'show bgp vpnv4 unicast all summary (RailMPLS note)', 'remote-as galat, interface VRF mein nahi'],
        ['Do VRFs ek-doosre ko dekh rahe', 'show ip route vrf X', 'Galti se RT import (leak)'],
      ],
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator: ek hi PE par do VRFs ke beech leaking (local import) model nahi hai; VPN labels 1000 se per-prefix; firewall stateless. Yeh sab Model Limitations mein likha hai.',
    },
    {
      kind: 'analogy',
      body: 'VRF = ek hi platform par alag-alag colour ki lines (ticket counter, parcel, staff) — rasta saath, par barrier alag. RT = "yeh parcel kis godown mein utarna hai" ka tag.',
    },
  ],
  flash: [
    {
      prompt: 'Kaunsa attribute decide karta hai ki route kis VRF mein import ho?',
      options: ['RD', 'Route-target', 'VPN label', 'Next hop'],
      correctIndex: 1,
      explanation: 'Export RT importer ke import list mein ho to import.',
    },
    {
      prompt: 'P router (core) par VRF ya BGP chahiye?',
      options: ['Haan, dono', 'Nahi — sirf IGP + LDP', 'Sirf VRF', 'Sirf BGP'],
      correctIndex: 1,
      explanation: 'BGP-free core: P sirf transport label swap karta hai.',
    },
    {
      prompt: 'MTD UTS route JU ko dikh raha hai par ping fail. Pehla shak?',
      options: ['DNS', 'MTD ne JU ka UTS route import nahi kiya (return path)', 'STP', 'Cable'],
      correctIndex: 1,
      explanation: 'VPN do-tarfa RT par chalta hai.',
    },
    {
      prompt: 'Railnet PCs ko default route kaise milta hai?',
      options: ['Har PE par static', 'JU RAILNET VRF ka static default BGP se distribute', 'DHCP', 'OSPF'],
      correctIndex: 1,
      explanation: 'redistribute static → VPNv4 → sab Railnet PEs par B*.',
    },
    {
      prompt: '"vrf forwarding UTS" lagate hi interface ka IP kya hota hai (IOS)?',
      options: ['Wahi rehta hai', 'Hat jaata hai — dobara dena padta hai', 'VRF ka default IP', 'DHCP'],
      correctIndex: 1,
      explanation: 'IOS IP hata deta hai; isliye pehle vrf forwarding, phir ip address.',
    },
  ],
  glossary: [
    { term: 'VRF', en: 'Separate routing/forwarding table on a PE for one VPN.', hi: 'Router ke andar alag routing table.' },
    { term: 'RD', en: 'Route distinguisher: makes a VPN prefix unique in BGP.', hi: 'Prefix ko unique banane wala tag.' },
    { term: 'Route-target', en: 'Extended community deciding VRF import/export.', hi: 'Kaun VRF route le, yeh batane wala tag.' },
    {
      term: 'PE / CE / P',
      en: 'Provider edge (VRFs), customer edge (site router), provider core (labels only).',
      hi: 'Edge, site aur core routers.',
    },
    { term: 'VPN label', en: 'Inner MPLS label telling the egress PE which VRF/prefix.', hi: 'Andar wala label: kaunsa VRF.' },
    { term: 'Shared service', en: 'A VRF (e.g. NMS) reachable from many VRFs through RT import.', hi: 'Sab VRFs ko dikhne wali service.' },
  ],
  practice: {
    labId: 'LB6.1',
    note: 'Lab LB6.1: UTS aur RAILNET VPNs, isolation aur JU firewall se internet. Lab LB6.2: SCADA PE-CE eBGP aur NMS shared service.',
  },
};
