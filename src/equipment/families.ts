import type { Bi, Family, FamilyDoc } from './types';

const b = (en: string, hi: string): Bi => ({ en, hi });

const LASER = b(
  'Laser safety: never look into an SFP, patch cord or fibre end. Fit dust caps on unused optical ports; clean and inspect connectors before mating.',
  'Laser safety: SFP, patch cord ya fibre end mein kabhi mat jhaanko. Khaali optical ports par dust cap; jodne se pehle connector clean aur inspect karo.',
);
const ESD = b(
  'Use an ESD wrist strap when handling modules or cards; hold them by the edges.',
  'Module/card chhoote waqt ESD wrist strap pehno; kinaron se pakdo.',
);
const POWER48 = b(
  'Telecom routers commonly run on −48 V DC with dual feeds. Isolate the correct feed before work; never short battery terminals.',
  'Telecom routers aam taur par −48 V DC dual feed par chalte hain. Kaam se pehle sahi feed isolate karo; battery terminals short mat karo.',
);
const CHANGE = b(
  'Change control: save a backup of the running configuration and take the required permission/block before changing live equipment.',
  'Change control: live equipment badalne se pehle running config ka backup lo aur zaroori permission/block lo.',
);

const L1_CHECK = {
  symptom: b('Port LED off / link down', 'Port LED band / link down'),
  check: b(
    'Check cable or SFP seated, far end powered, correct fibre pair (Tx→Rx), interface not shut down, optical Rx level within range.',
    'Cable/SFP theek laga hai, far end on hai, fibre pair sahi (Tx→Rx), interface shutdown nahi, optical Rx level range mein — yeh check karo.',
  ),
};

export const FAMILY_DOCS: Record<Family, FamilyDoc> = {
  endpoint: {
    family: 'endpoint',
    forwarding: [
      b(
        'Application creates data; the host builds an IP packet with its own IP as source.',
        'Application data banati hai; host apne IP ko source rakh kar IP packet banata hai.',
      ),
      b(
        'If the destination is in the same subnet (compare with the mask), it ARPs for the destination MAC.',
        'Destination same subnet mein hai (mask se compare) to destination ka MAC ARP se poochta hai.',
      ),
      b(
        'Otherwise it ARPs for the default gateway MAC and sends the frame to the gateway.',
        'Warna default gateway ka MAC ARP se leke frame gateway ko bhejta hai.',
      ),
      b(
        'Packets queue while ARP is pending (simulator behaviour for hosts).',
        'ARP pending ho tab tak packets queue mein (hosts ka simulator behaviour).',
      ),
    ],
    troubleshoot: [
      L1_CHECK,
      {
        symptom: b('Address 169.254.x.x', 'Address 169.254.x.x'),
        check: b(
          'DHCP failed (APIPA). Check the VLAN, DHCP pool and relay (ip helper-address).',
          'DHCP fail (APIPA). VLAN, DHCP pool aur relay (ip helper-address) check karo.',
        ),
      },
      {
        symptom: b('Ping to own subnet works, other subnets fail', 'Apne subnet mein ping chalta hai, doosre mein nahi'),
        check: b('Default gateway missing or wrong; gateway interface down.', 'Default gateway nahi/galat; gateway interface down.'),
      },
    ],
    maintenance: [
      b(
        'Keep OS/antivirus patched as per IT policy; label the patch cord with switch port.',
        'IT policy ke hisaab se OS/antivirus update; patch cord par switch port ka label.',
      ),
    ],
    safety: [b('Use only approved power points; do not open power supplies.', 'Sirf approved power point; power supply mat kholo.')],
  },
  hub: {
    family: 'hub',
    forwarding: [
      b('A signal arrives on one port.', 'Ek port par signal aata hai.'),
      b(
        'The hub repeats it out of every other port — no MAC learning, no filtering.',
        'Hub use baaki sab ports par repeat karta hai — na MAC learning, na filtering.',
      ),
      b(
        'Every device sees every frame; all share the bandwidth (one collision domain).',
        'Har device har frame dekhta hai; sab bandwidth share karte hain (ek collision domain).',
      ),
    ],
    troubleshoot: [
      L1_CHECK,
      {
        symptom: b('Network slow with many devices', 'Zyada devices par network slow'),
        check: b('Expected with a hub: replace with a switch.', 'Hub mein yahi hota hai: switch lagao.'),
      },
    ],
    maintenance: [b('Replace hubs with switches.', 'Hub hata kar switch lagao.')],
    safety: [],
  },
  l2switch: {
    family: 'l2switch',
    forwarding: [
      b(
        'Frame arrives; the port decides its VLAN (access VLAN, or the 802.1Q tag / native VLAN on a trunk).',
        'Frame aata hai; port uska VLAN tay karta hai (access VLAN, ya trunk par 802.1Q tag / native VLAN).',
      ),
      b('Source MAC is learned against the incoming port and VLAN.', 'Source MAC incoming port aur VLAN ke saath seekha jaata hai.'),
      b(
        'Destination MAC known → forward out that one port; unknown or broadcast → flood within the VLAN.',
        'Destination MAC pata hai → sirf us port par; unknown/broadcast → VLAN ke andar flood.',
      ),
      b('Only STP-forwarding ports send/receive; blocked ports stop loops.', 'Sirf STP forwarding ports chalte hain; blocked ports loop rokte hain.'),
    ],
    troubleshoot: [
      L1_CHECK,
      {
        symptom: b('Hosts in the same VLAN cannot ping across switches', 'Same VLAN ke hosts do switches ke paar ping nahi'),
        check: b(
          'show interfaces trunk: is the VLAN allowed on the trunk? Native VLAN same on both ends? VLAN created on both switches?',
          'show interfaces trunk: trunk par VLAN allowed? Dono taraf native VLAN same? Dono switch par VLAN bana hai?',
        ),
      },
      {
        symptom: b('Port went err-disabled', 'Port err-disabled ho gaya'),
        check: b(
          'Port-security violation: show port-security; fix the cause, then shutdown / no shutdown.',
          'Port-security violation: show port-security; kaaran theek karo, phir shutdown / no shutdown.',
        ),
      },
    ],
    maintenance: [
      b(
        'Back up configuration after changes; keep port labels and a VLAN register up to date.',
        'Badlav ke baad config backup; port labels aur VLAN register update rakho.',
      ),
    ],
    safety: [ESD, LASER, CHANGE],
  },
  l3switch: {
    family: 'l3switch',
    forwarding: [
      b('Inside a VLAN it switches exactly like an L2 switch.', 'VLAN ke andar L2 switch jaisa hi switch karta hai.'),
      b(
        'A frame addressed to the SVI MAC (the gateway) is routed: look up the destination IP, choose the egress SVI/port.',
        'SVI MAC (gateway) ko aaya frame route hota hai: destination IP dekh kar egress SVI/port chunta hai.',
      ),
      b(
        'ARP for the next hop, rewrite MACs, decrement TTL, switch out in the new VLAN.',
        'Next hop ka ARP, MAC badalna, TTL ek kam, naye VLAN mein bhejna.',
      ),
      b(
        'SVIs are up only when the VLAN has at least one up, forwarding port (autostate).',
        'SVI tabhi up jab VLAN ka kam se kam ek port up/forwarding ho (autostate).',
      ),
    ],
    troubleshoot: [
      L1_CHECK,
      {
        symptom: b('Inter-VLAN ping fails', 'Inter-VLAN ping fail'),
        check: b(
          'show ip interface brief: SVI up/up? Hosts use the SVI IP as gateway?',
          'show ip interface brief: SVI up/up? Hosts ka gateway SVI IP hai?',
        ),
      },
    ],
    maintenance: [b('Back up configuration; monitor SFP optical levels on uplinks.', 'Config backup; uplink SFP optical levels monitor karo.')],
    safety: [ESD, LASER, CHANGE],
  },
  router: {
    family: 'router',
    forwarding: [
      b(
        'Frame arrives; the router accepts it only if it is addressed to its MAC (or broadcast).',
        'Frame aata hai; router sirf apne MAC (ya broadcast) wala leta hai.',
      ),
      b(
        'Inbound ACL (if any) is checked; NAT inside→outside translation follows IOS order.',
        'Inbound ACL (agar ho) check; NAT IOS order ke hisaab se.',
      ),
      b(
        'Longest-prefix match in the routing table chooses the next hop and exit interface.',
        'Routing table mein longest-prefix match se next hop aur exit interface.',
      ),
      b(
        'TTL is decremented (0 → ICMP time exceeded), ARP for next hop, new L2 header, send.',
        'TTL ek kam (0 hua to ICMP time exceeded), next hop ka ARP, naya L2 header, bhejo.',
      ),
      b(
        'If ARP is not resolved yet, the router drops that first packet (why the first ping often shows ".").',
        'ARP abhi resolve nahi to router pehla packet drop karta hai (isliye pehla ping aksar "." dikhata hai).',
      ),
    ],
    troubleshoot: [
      L1_CHECK,
      {
        symptom: b('No route to a remote subnet', 'Remote subnet ka route nahi'),
        check: b(
          'show ip route; show ip ospf neighbor — check area, hello/dead timers, subnet mask, passive interfaces.',
          'show ip route; show ip ospf neighbor — area, hello/dead timers, mask, passive interface check karo.',
        ),
      },
      {
        symptom: b('Traffic blocked unexpectedly', 'Traffic achanak block'),
        check: b('show access-lists — implicit deny at the end of every ACL.', 'show access-lists — har ACL ke end mein implicit deny hota hai.'),
      },
    ],
    maintenance: [
      b(
        'Back up configuration; review logs; keep a record of IP plan and interface descriptions.',
        'Config backup; logs dekho; IP plan aur interface description ka record.',
      ),
    ],
    safety: [ESD, LASER, CHANGE],
  },
  firewall: {
    family: 'firewall',
    forwarding: [
      b(
        'In this simulator: forwards like a router; every filter is an ACL you configure (stateless).',
        'Is simulator mein: router jaisa forward; har filter aapka banaya ACL (stateless).',
      ),
      b(
        'Real firewalls track sessions (stateful) and use zones/policies — not modelled yet.',
        'Asli firewall session track karte hain (stateful) aur zones/policies — abhi modelled nahi.',
      ),
    ],
    troubleshoot: [
      L1_CHECK,
      {
        symptom: b('Return traffic dropped', 'Return traffic drop'),
        check: b('Stateless ACLs need a rule for the return direction too.', 'Stateless ACL mein return direction ka rule bhi chahiye.'),
      },
    ],
    maintenance: [
      b('Review rules periodically; remove unused rules; back up configuration.', 'Rules samay-samay par review; unused rules hatao; config backup.'),
    ],
    safety: [ESD, CHANGE],
  },
  mpls: {
    family: 'mpls',
    forwarding: [
      b(
        'Today (P1–P3) the simulator forwards on these routers as plain IP routers (static/OSPF).',
        'Abhi (P1–P3) simulator inhe plain IP router ki tarah forward karta hai (static/OSPF).',
      ),
      b(
        'From P4: LER pushes a label on ingress, LSRs swap labels, the penultimate hop pops (PHP), egress LER delivers by IP/VRF.',
        'P4 se: LER ingress par label push, LSR swap, penultimate hop pop (PHP), egress LER IP/VRF se deliver.',
      ),
    ],
    troubleshoot: [
      L1_CHECK,
      {
        symptom: b('Core link up but no reachability', 'Core link up par reachability nahi'),
        check: b(
          'show ip ospf neighbor; show ip route — the IGP must carry loopbacks before LDP/BGP can work.',
          'show ip ospf neighbor; show ip route — LDP/BGP se pehle IGP ko loopbacks le jaane chahiye.',
        ),
      },
    ],
    maintenance: [
      b(
        'Monitor optical Rx levels on long OFC spans; keep spare SFPs of each type.',
        'Lambe OFC spans par optical Rx monitor; har type ke spare SFP rakho.',
      ),
      b('Check both power feeds and fan alarms during inspections.', 'Inspection mein dono power feed aur fan alarm check.'),
    ],
    safety: [POWER48, ESD, LASER, CHANGE],
  },
  cloud: {
    family: 'cloud',
    forwarding: [b('Placeholder: does not forward traffic in P1.', 'Placeholder: P1 mein traffic forward nahi karta.')],
    troubleshoot: [],
    maintenance: [],
    safety: [],
  },
};
