import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'A15',
  part: 'A',
  title: 'Foundations capstone: MTD station + JU HQ',
  summary:
    'Part A ka sab kuch ek saath: MTD station LAN aur JU divisional HQ — VLANs, inter-VLAN, OSPF, DHCP, NAT, ACL, HSRP, QoS, NMS — aur 5 fault tickets.',
  estMinutes: 40,
  blocks: [
    {
      kind: 'text',
      heading: 'Capstone ka design',
      body: 'MTD (Merta Road Jn) station: access switch par UTS, PRS, CCTV VLANs; L3 switch gateway; OSPF se JU tak. JU (divisional HQ): core router, DHCP/DNS server, NMS, aur Railnet internet ke liye NAT/PAT. Teaching IP plan 10.52.x.x (MTD) aur 10.1.x.x (JU). Yeh asli NWR/RailTel network nahi hai — track map par aadharit practice design hai.',
    },
    {
      kind: 'table',
      caption: 'Checklist (har layer)',
      headers: ['Layer', 'Kya check karna', 'Command'],
      rows: [
        ['Physical', 'Links up, duplex theek', 'show interfaces status'],
        ['Layer 2', 'VLAN, trunk, STP', 'show vlan brief / show interfaces trunk / show spanning-tree'],
        ['Layer 3', 'IP, gateway, routes, OSPF', 'show ip interface brief / show ip route / show ip ospf neighbor'],
        ['Services', 'DHCP lease, DNS, NAT', 'ipconfig /all / nslookup / show ip nat translations'],
        ['Security', 'ACL, vty', 'show access-lists / show line vty 0'],
        ['Mgmt', 'NTP, logs, traps', 'show ntp status / show logging / NMS inbox'],
      ],
    },
    {
      kind: 'text',
      heading: 'Troubleshooting ka tareeka',
      body: 'Complaint padho (kaun, kya, kab se, sab ya ek?). Neeche se upar jao: link → VLAN → IP/gateway → route → service → security. Har step par ek command, ek nateeja. Ek baar mein ek cheez badlo aur turant test karo (ping, nslookup, ssh). Fix ke baad complaint wala test dobara chalao — "service restored" tabhi.',
    },
    {
      kind: 'analogy',
      body: 'Jaise signal failure mein pehle power aur cable (physical), phir relay (L2), phir route setting (L3), phir panel/interlocking logic (services) — neeche se upar, ek-ek karke.',
    },
    {
      kind: 'text',
      heading: '5 fault tickets',
      body: 'Lab L15.1 mein design poora hone ke baad 5 tickets ek-ek karke aate hain (Hinglish complaint ke saath): jaise "PRS counter ka address 169.254 aa raha", "Railnet se internet band", "UTS VLAN JU tak nahi pahunch raha". Har ticket ka root cause chhupa hai; auto-check service wapas aane par hi pass hota hai.',
    },
  ],
  flash: [
    {
      prompt: 'Ek user ka "internet band" — sabse pehle kya?',
      options: ['Router reboot', 'Scope samjho: sirf woh user ya sab? Phir neeche se upar check', 'NAT config delete', 'OSPF restart'],
      correctIndex: 1,
      explanation: 'Scope se pata chalta hai problem host/VLAN/core/edge mein se kahan hai.',
    },
    {
      prompt: 'PRS counter par 169.254.x.x — kahan dekhoge?',
      options: ['QoS', 'DHCP: VLAN, relay (ip helper-address), pool', 'OSPF cost', 'NTP'],
      correctIndex: 1,
      explanation: 'APIPA = DHCP fail.',
    },
    {
      prompt: 'Sab VLANs JU tak pahunchte hain, sirf UTS nahi. Pehle check?',
      options: ['Fibre', 'Trunk allowed list / VLAN existence / UTS subnet route', 'DNS', 'Power'],
      correctIndex: 1,
      explanation: 'Ek hi VLAN ka tootna L2/L3 config ka sign hai, physical ka nahi.',
    },
    {
      prompt: 'Railnet ka internet band, baaki sab theek. Kahan dekhoge?',
      options: ['STP', 'JU par NAT (inside/outside, ACL, overload) aur default route', 'Port security', 'HSRP'],
      correctIndex: 1,
      explanation: 'Internet ka rasta NAT/PAT aur default route par nirbhar.',
    },
    {
      prompt: 'Fix ke baad ticket kab band karein?',
      options: ['Config badalte hi', 'Jab complaint wala test (ping/nslookup/ssh) wapas pass ho', 'Agle din', 'Router reboot ke baad'],
      correctIndex: 1,
      explanation: 'Service restored = user ki taraf se test pass.',
    },
  ],
  glossary: [
    { term: 'Root cause', en: 'The underlying fault, not the symptom.', hi: 'Asli kaaran, lakshan nahi.' },
    { term: 'Bottom-up troubleshooting', en: 'Check layer 1 first, then upwards.', hi: 'Neeche (physical) se upar check.' },
    { term: 'MTTR', en: 'Mean time to repair.', hi: 'Theek karne ka ausat samay.' },
  ],
  practice: { labId: 'L15.1', note: 'Lab L15.1: MTD + JU capstone aur 5 fault tickets.' },
};
