/**
 * "Ask why" for show outputs: what each column / field means and what to look
 * for. Matched against what the learner typed, abbreviations included
 * ("sh vl br" = "show vlan brief").
 */

export interface FieldExplain {
  field: string;
  en: string;
  hi: string;
}

export interface ShowExplain {
  title: string;
  fields: FieldExplain[];
  lookFor: { en: string; hi: string };
}

const f = (field: string, en: string, hi: string): FieldExplain => ({ field, en, hi });

/** Pattern words; "<if>" / "<ip>" match any word. */
const ENTRIES: Array<{ pattern: string[]; host?: boolean; ex: ShowExplain }> = [
  {
    pattern: ['show', 'vlan', 'brief'],
    ex: {
      title: 'show vlan brief',
      fields: [
        f('VLAN', 'VLAN ID (1–4094).', 'VLAN ka number.'),
        f('Name', 'Name given with "name" in VLAN config.', 'VLAN ka naam.'),
        f('Status', 'active = VLAN exists in the database.', 'active = VLAN bana hua hai.'),
        f('Ports', 'Access ports in this VLAN. Trunk ports are NOT listed here.', 'Is VLAN ke access ports. Trunk ports yahan nahi dikhte.'),
      ],
      lookFor: {
        en: 'Is every host port in the planned VLAN? Is the VLAN present on every switch that needs it?',
        hi: 'Har port sahi VLAN mein hai? VLAN har zaroori switch par bana hai?',
      },
    },
  },
  {
    pattern: ['show', 'interfaces', 'trunk'],
    ex: {
      title: 'show interfaces trunk',
      fields: [
        f('Port', 'Trunk port (or Port-channel).', 'Trunk port.'),
        f('Mode / Status', 'on + trunking = static trunk working.', 'on + trunking = trunk chal raha hai.'),
        f('Encapsulation', '802.1q tagging.', '802.1Q tag.'),
        f('Native vlan', 'VLAN sent untagged. Must match on both ends.', 'Bina tag wala VLAN — dono ends par same.'),
        f('Vlans allowed on trunk', 'The allowed list you configured.', 'Allowed list jo aapne set ki.'),
        f('Allowed and active', 'Allowed VLANs that also exist on this switch.', 'Allowed + is switch par bane hue.'),
        f('Forwarding state', 'VLANs STP lets through on this trunk ("none" = blocked port).', 'STP ne kaunse VLANs chalne diye ("none" = blocked).'),
      ],
      lookFor: {
        en: 'A VLAN missing from "allowed" on one end breaks only that VLAN between the switches.',
        hi: 'Ek end par VLAN allowed nahi = sirf wahi VLAN beech mein tootega.',
      },
    },
  },
  {
    pattern: ['show', 'mac', 'address-table'],
    ex: {
      title: 'show mac address-table',
      fields: [
        f('Vlan', 'VLAN the MAC was learned in.', 'Kis VLAN mein seekha.'),
        f('Mac Address', 'Source MAC seen on a frame.', 'Frame ka source MAC.'),
        f(
          'Type',
          'DYNAMIC = learned (ages out after 300 s); SECURE = port security.',
          'DYNAMIC = seekha hua (300 s baad hatega); SECURE = port security.',
        ),
        f('Ports', 'Where frames to this MAC will be sent (Po1 = an EtherChannel).', 'Is MAC ke frames kis port par jaayenge.'),
      ],
      lookFor: {
        en: 'Empty table = nothing sent yet (ping first). Same MAC jumping between ports = loop or moved device.',
        hi: 'Khaali = abhi traffic nahi (ping karo). MAC baar-baar port badle = loop.',
      },
    },
  },
  {
    pattern: ['show', 'spanning-tree'],
    ex: {
      title: 'show spanning-tree',
      fields: [
        f('Root ID', 'Priority + MAC of the root bridge for the whole tree.', 'Poore tree ka root bridge.'),
        f('This bridge is the root', 'Shown only on the root switch.', 'Sirf root switch par dikhta hai.'),
        f('Cost', 'Total path cost from this switch to the root.', 'Root tak ka kul cost.'),
        f('Port (root)', 'Root port: best way to the root.', 'Root port: root tak sabse accha rasta.'),
        f('Bridge ID', 'This switch’s own priority + MAC.', 'Is switch ki apni ID.'),
        f('Role', 'Root / Desg (designated) / Altn (alternate = backup, blocked).', 'Root / Desg / Altn (backup, block).'),
        f('Sts', 'FWD = forwarding, BLK = blocking/discarding.', 'FWD = chal raha, BLK = band.'),
        f('Cost (port)', '20000 for 1G, 2000 for 10G (802.1D-2004 long costs).', '1G = 20000, 10G = 2000.'),
        f('Type', 'P2p = point-to-point; Edge = faces a host (no loop possible).', 'P2p link; Edge = host ki taraf.'),
      ],
      lookFor: {
        en: 'Is the root the switch you planned (lowered priority), not just the lowest MAC?',
        hi: 'Root wahi hai jo aapne plan kiya tha, ya sirf lowest MAC se bana?',
      },
    },
  },
  {
    pattern: ['show', 'etherchannel', 'summary'],
    ex: {
      title: 'show etherchannel summary',
      fields: [
        f('Group', 'channel-group number.', 'Channel-group number.'),
        f('Port-channel (SU)', 'S = Layer 2, U = in use (up); SD = down.', 'SU = chal raha, SD = band.'),
        f('Protocol', 'LACP, or "-" for mode on.', 'LACP ya "-" (mode on).'),
        f('Ports (P)', 'Bundled — carrying traffic.', 'Bundle mein — chal raha.'),
        f('Ports (I)', 'Stand-alone: no LACP partner.', 'Stand-alone: LACP partner nahi.'),
        f('Ports (s)', 'Suspended: mode, config or speed mismatch.', 'Suspended: mismatch.'),
        f('Ports (D)', 'Down.', 'Down.'),
      ],
      lookFor: {
        en: 'All members should be (P). Read the RailMPLS Lab note for why a member is not bundled.',
        hi: 'Sab members (P) hone chahiye. Neeche note padho kyon nahi bane.',
      },
    },
  },
  {
    pattern: ['show', 'ip', 'interface', 'brief'],
    ex: {
      title: 'show ip interface brief',
      fields: [
        f('Interface', 'Physical port, subinterface, SVI (Vlan10) or Port-channel.', 'Port, subinterface, SVI ya Port-channel.'),
        f('IP-Address', 'Configured IPv4 address, or unassigned.', 'Configured IP.'),
        f('Status', 'Layer 1: up / down / administratively down (shutdown).', 'Layer 1: up/down/admin down.'),
        f('Protocol', 'Layer 2 line protocol: up only if the link works.', 'Layer 2: link chal raha to up.'),
      ],
      lookFor: {
        en: '"administratively down" = you need "no shutdown". "up / down" = cable/far-end problem.',
        hi: '"administratively down" = no shutdown chahiye. "up/down" = cable ya far end.',
      },
    },
  },
  {
    pattern: ['show', 'interfaces', 'status'],
    ex: {
      title: 'show interfaces status',
      fields: [
        f('Status', 'connected / notconnect / disabled / err-disabled.', 'connected / notconnect / disabled / err-disabled.'),
        f('Vlan', 'Access VLAN, "trunk", or "routed".', 'Access VLAN, trunk ya routed.'),
        f('Duplex', 'a-full = auto-negotiated full; full/half = forced.', 'a-full = auto; full/half = forced.'),
        f('Speed', 'a-1G = auto-negotiated 1 Gb/s.', 'a-1G = auto 1 Gb/s.'),
      ],
      lookFor: { en: 'A forced "full" facing an auto end causes a duplex mismatch.', hi: 'Ek taraf forced full, doosri auto = duplex mismatch.' },
    },
  },
  {
    pattern: ['show', 'interfaces', '<if>'],
    ex: {
      title: 'show interfaces <port>',
      fields: [
        f('is up, line protocol is up', 'Layer 1 and Layer 2 both working.', 'Layer 1 aur 2 dono chal rahe.'),
        f('Full-duplex / Half-duplex', 'Result of negotiation or forced setting.', 'Negotiation ka result.'),
        f('packets input / output', 'Frames received / sent on this port.', 'Aaye / gaye frames.'),
        f('CRC', 'Damaged frames received — cabling, or the full-duplex end of a duplex mismatch.', 'Kharab frames — cable ya duplex mismatch.'),
        f(
          'late collision',
          'Collisions after 64 bytes — the half-duplex end of a duplex mismatch.',
          'Late collisions — duplex mismatch ka half side.',
        ),
      ],
      lookFor: {
        en: 'Rising CRC on one end + late collisions on the other = duplex mismatch.',
        hi: 'Ek taraf CRC, doosri taraf late collision = duplex mismatch.',
      },
    },
  },
  {
    pattern: ['show', 'port-security'],
    ex: {
      title: 'show port-security',
      fields: [
        f('MaxSecureAddr', 'Maximum MACs allowed.', 'Kitne MAC allowed.'),
        f('CurrentAddr', 'Secure MACs learned so far.', 'Abhi tak seekhe secure MAC.'),
        f('SecurityViolation', 'How many violations happened.', 'Kitni baar violation.'),
        f('Security Action', 'Shutdown / Restrict / Protect.', 'Violation par kya hoga.'),
      ],
      lookFor: {
        en: 'Violations > 0 with Shutdown → port is err-disabled: shutdown, then no shutdown.',
        hi: 'Violation > 0 aur Shutdown → err-disabled: shutdown phir no shutdown.',
      },
    },
  },
  {
    pattern: ['show', 'arp'],
    ex: {
      title: 'show arp',
      fields: [
        f('Address', 'IPv4 address.', 'IP address.'),
        f('Age (min)', 'Minutes since learned; "-" = own interface.', 'Kitne minute pehle seekha; "-" = apna.'),
        f('Hardware Addr', 'MAC address for that IP.', 'Us IP ka MAC.'),
        f('Interface', 'Where the neighbour is.', 'Neighbour kis interface par.'),
      ],
      lookFor: {
        en: 'No entry for the next hop = ARP not resolving (wrong subnet, VLAN or cable).',
        hi: 'Next hop ka entry nahi = ARP nahi ho raha (subnet/VLAN/cable).',
      },
    },
  },
  {
    pattern: ['show', 'ip', 'route'],
    ex: {
      title: 'show ip route',
      fields: [
        f('C / L', 'Connected network / local address of an interface.', 'Connected network / interface ka apna address.'),
        f('S / S*', 'Static route / static default route.', 'Static / default route.'),
        f('O', 'Learned by OSPF.', 'OSPF se seekha.'),
        f('[110/2]', '[administrative distance / metric].', '[AD / metric].'),
        f('via', 'Next-hop router.', 'Agla router.'),
      ],
      lookFor: {
        en: 'Is there a route (or default) covering the destination? Longest prefix wins.',
        hi: 'Destination ke liye route hai? Sabse lamba prefix jeetta hai.',
      },
    },
  },
  {
    pattern: ['show', 'running-config'],
    ex: {
      title: 'show running-config',
      fields: [
        f('hostname', 'Device name.', 'Device ka naam.'),
        f('vlan / name', 'VLAN database.', 'VLANs.'),
        f('interface …', 'Settings per interface; defaults are not printed.', 'Har interface ki settings; default nahi dikhte.'),
        f('shutdown', 'Interface is administratively down.', 'Interface band hai.'),
        f('channel-group', 'Member of an EtherChannel.', 'EtherChannel ka member.'),
      ],
      lookFor: {
        en: 'Compare with the plan line by line. Unsaved until "write memory".',
        hi: 'Plan se line-by-line milao. "write memory" tak save nahi.',
      },
    },
  },
  {
    pattern: ['show', 'ip', 'ospf', 'neighbor'],
    ex: {
      title: 'show ip ospf neighbor',
      fields: [
        f('Neighbor ID', 'Router ID of the neighbour (highest loopback, or set with router-id).', 'Neighbour ka router ID.'),
        f('Pri', 'OSPF priority used in the DR election (0 = never DR).', 'DR chunav ki priority.'),
        f(
          'State',
          'FULL = databases synchronised; /DR, /BDR, /DROTHER = its role on that segment. 2WAY between two DROTHERs is normal.',
          'FULL = database sync; DR/BDR/DROTHER = role.',
        ),
        f('Address', 'Neighbour’s interface address on the shared link.', 'Neighbour ka link address.'),
        f('Interface', 'Your interface towards that neighbour.', 'Aapka interface.'),
      ],
      lookFor: {
        en: 'A neighbour missing from the list means a mismatch (area, subnet, hello/dead, MTU) or OSPF not enabled on that interface — compare with "show ip ospf interface".',
        hi: 'Neighbour gayab = area/subnet/timer/MTU mismatch ya interface par OSPF nahi. "show ip ospf interface" se compare karo.',
      },
    },
  },
  {
    pattern: ['show', 'ip', 'ospf', 'interface', '<if>'],
    ex: {
      title: 'show ip ospf interface <if>',
      fields: [
        f('Internet Address / Area', 'Address and OSPF area of this interface.', 'Interface ka address aur area.'),
        f('Cost', 'OSPF cost of this link (lower = preferred).', 'Link ki cost (kam = pasand).'),
        f('State / Priority', 'DR, BDR or DROTHER on this segment, and the election priority.', 'Segment par role aur priority.'),
        f('Hello, Dead', 'Timers that must match the neighbour exactly.', 'Timers — neighbour se bilkul match.'),
        f('Neighbor Count / Adjacent', 'Neighbours seen, and how many reached FULL.', 'Kitne neighbours, kitne FULL.'),
      ],
      lookFor: {
        en: 'Compare Hello/Dead and Area with the neighbour’s interface; "Adjacent neighbor count is 0" on a link with a router behind it is your fault.',
        hi: 'Hello/Dead aur area dono taraf compare karo; adjacent count 0 = yahi gadbad hai.',
      },
    },
  },
  {
    pattern: ['show', 'isis', 'neighbors'],
    ex: {
      title: 'show isis neighbors',
      fields: [
        f('System Id', 'Neighbour router (hostname shown for the system ID).', 'Neighbour router.'),
        f('Type', 'L1 = inside the area, L2 = backbone between areas. One line per level.', 'L1 = area ke andar, L2 = areas ke beech.'),
        f('Interface / IP Address', 'Your interface and the neighbour’s address on it.', 'Interface aur neighbour ka IP.'),
        f('State', 'UP = adjacency formed.', 'UP = adjacency bani.'),
      ],
      lookFor: {
        en: 'Different areas give only L2. A neighbour that is missing: check "ip router isis" on both interfaces, the NET (duplicate system ID?) and is-type.',
        hi: 'Alag area = sirf L2. Neighbour gayab: dono taraf "ip router isis", NET (duplicate system ID?) aur is-type check karo.',
      },
    },
  },
  {
    pattern: ['show', 'standby', 'brief'],
    ex: {
      title: 'show standby brief',
      fields: [
        f('Grp', 'HSRP group number — must be the same on both routers.', 'Group number — dono par same.'),
        f('Pri', 'Current priority (after tracking decrements).', 'Abhi ki priority (tracking ke baad).'),
        f('P', 'P = preempt configured.', 'P = preempt on.'),
        f('State', 'Active forwards for the virtual IP; Standby waits.', 'Active virtual IP ka kaam karta hai.'),
        f('Active / Standby', 'Address of the other role ("local" = this router).', 'Doosre role ka address.'),
        f('Virtual IP', 'The gateway address hosts use.', 'Hosts ka gateway.'),
      ],
      lookFor: {
        en: 'Both routers Active = they are not in the same group (number, subnet) and do not see each other.',
        hi: 'Dono Active = ek group mein nahi hain (number/subnet).',
      },
    },
  },
  {
    pattern: ['show', 'ip', 'nat', 'translations'],
    ex: {
      title: 'show ip nat translations',
      fields: [
        f('Pro', 'Protocol of the session (this simulator translates ICMP).', 'Protocol (yahan ICMP).'),
        f('Inside global', 'Public address:port the outside world sees.', 'Bahar dikhne wala address:port.'),
        f('Inside local', 'Real private address of the inside host.', 'Andar ka asli address.'),
        f('Outside local / global', 'The outside host.', 'Bahar wala host.'),
      ],
      lookFor: {
        en: 'Empty after a ping = no translation: check ip nat inside/outside, the ACL and the "ip nat inside source" line.',
        hi: 'Ping ke baad khaali = NAT nahi hua: inside/outside, ACL aur "ip nat inside source" check karo.',
      },
    },
  },
  {
    pattern: ['show', 'access-lists'],
    ex: {
      title: 'show access-lists',
      fields: [
        f(
          'Standard / Extended',
          'Standard matches source only; extended matches protocol, source, destination, ports.',
          'Standard = sirf source; extended = sab.',
        ),
        f('Sequence (10, 20…)', 'Lines are checked top to bottom; first match wins.', 'Upar se neeche, pehli match.'),
        f('(N matches)', 'Simulated packets that hit this line.', 'Is line se match hue packets.'),
      ],
      lookFor: {
        en: 'A permit above a deny makes the deny useless. No final permit = everything else is dropped (implicit deny).',
        hi: 'Deny se upar permit = deny bekaar. Aakhri permit nahi = baaki sab drop.',
      },
    },
  },
  {
    pattern: ['show', 'ntp', 'status'],
    ex: {
      title: 'show ntp status',
      fields: [
        f('synchronized / unsynchronized', 'Whether the clock follows an NTP server.', 'Clock sync hai ya nahi.'),
        f('stratum', 'Distance from the reference clock: server stratum + 1. 16 = not synchronised.', 'Reference se doori; 16 = sync nahi.'),
        f('reference', 'The server this clock follows.', 'Kis server se time liya.'),
      ],
      lookFor: {
        en: 'Unsynchronised: can the router reach the server (ping, routing, ACL on UDP 123)?',
        hi: 'Sync nahi: server tak pahunch hai? (ping, route, UDP 123 ACL)',
      },
    },
  },
  {
    pattern: ['show', 'policy-map', 'interface', '<if>'],
    ex: {
      title: 'show policy-map interface <if>',
      fields: [
        f('Service-policy output', 'Policy attached to traffic leaving this interface.', 'Bahar jaate traffic ki policy.'),
        f('Interface capacity / offered', 'Link speed vs traffic offered; CONGESTED when offered is larger.', 'Link speed vs traffic.'),
        f('Class-map … (priority / bandwidth)', 'LLQ or CBWFQ class and its offered, sent and dropped rate.', 'Har class ka offered/sent/dropped.'),
      ],
      lookFor: {
        en: 'Drops should land in the lowest-priority class, never in the priority (voice) class.',
        hi: 'Drop sabse kam priority wali class mein ho, voice mein kabhi nahi.',
      },
    },
  },
  {
    pattern: ['nslookup', '<if>'],
    host: true,
    ex: {
      title: 'nslookup <name>',
      fields: [
        f('Server', 'DNS server the PC asked (from DHCP or the DNS field).', 'Kis DNS server se poochha.'),
        f('Name / Address', 'The answer: the name’s IP address.', 'Jawab: naam ka IP.'),
      ],
      lookFor: {
        en: 'Timed out = DNS server unreachable or not set; "Non-existent domain" = the record is missing on the server.',
        hi: 'Timeout = DNS server tak nahi pahunche; Non-existent = record nahi hai.',
      },
    },
  },
  {
    pattern: ['ipconfig'],
    host: true,
    ex: {
      title: 'ipconfig',
      fields: [
        f('IPv4 Address', 'This PC’s address.', 'PC ka IP.'),
        f('Subnet Mask', 'Which addresses are "local".', 'Kaunse address local hain.'),
        f('Default Gateway', 'Router for everything outside the subnet.', 'Bahar jaane ka router.'),
        f('Autoconfiguration (169.254.x.x)', 'DHCP failed (APIPA).', 'DHCP fail hua (APIPA).'),
      ],
      lookFor: {
        en: 'Wrong mask or missing gateway explains "local works, remote fails".',
        hi: 'Galat mask ya gateway nahi = local chale, bahar nahi.',
      },
    },
  },
  {
    pattern: ['arp', '-a'],
    host: true,
    ex: {
      title: 'arp -a',
      fields: [
        f('Internet Address', 'IP the PC talked to recently.', 'Jis IP se baat hui.'),
        f('Physical Address', 'Its MAC address.', 'Uska MAC.'),
        f('Type', 'dynamic = learned by ARP.', 'dynamic = ARP se seekha.'),
      ],
      lookFor: {
        en: 'The gateway’s MAC should appear after pinging anything off-subnet.',
        hi: 'Bahar ping karne ke baad gateway ka MAC dikhna chahiye.',
      },
    },
  },
];

function matches(pattern: string[], words: string[]): boolean {
  if (pattern.length !== words.length) return false;
  return pattern.every((p, i) => (p.startsWith('<') ? true : p.startsWith(words[i].toLowerCase()) && words[i].length >= Math.min(2, p.length)));
}

/** Explanation for a command line, or undefined. `do` prefixes are ignored. */
export function explainShow(line: string, host = false): ShowExplain | undefined {
  let words = line.trim().split(/\s+/).filter(Boolean);
  if (words[0]?.toLowerCase() === 'do') words = words.slice(1);
  if (!words.length) return undefined;
  // Specific patterns before the "<if>" catch-all.
  const ordered = [...ENTRIES].sort((a, b) => Number(a.pattern.some((p) => p.startsWith('<'))) - Number(b.pattern.some((p) => p.startsWith('<'))));
  return ordered.find((e) => !!e.host === host && matches(e.pattern, words))?.ex;
}

export const EXPLAINED_COMMANDS = ENTRIES.map((e) => e.ex.title);
