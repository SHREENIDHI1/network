/**
 * Command Reference: every entry is a real command accepted by the
 * simulator's CLI (a test runs each example in its mode). `en` / `hi` are
 * one-line explanations. Syntax is the simulator's IOS-like CLI, not an
 * official vendor manual.
 */

export type RefMode = 'user' | 'priv' | 'config' | 'config-if' | 'config-vlan' | 'config-router' | 'host';
export type RefDevice = 'l2-switch' | 'l3-switch' | 'router' | 'pc';

export interface CommandRef {
  topic: string;
  example: string;
  mode: RefMode;
  device: RefDevice;
  en: string;
  hi: string;
  lesson?: string;
}

const sw = 'l2-switch' as const;
const l3 = 'l3-switch' as const;
const r = 'router' as const;
const pc = 'pc' as const;

export const COMMANDS: CommandRef[] = [
  // Basics
  {
    topic: 'Basics',
    example: 'enable',
    mode: 'user',
    device: sw,
    en: 'Enter privileged EXEC mode (#).',
    hi: 'Privileged mode mein jao.',
    lesson: 'A7',
  },
  {
    topic: 'Basics',
    example: 'configure terminal',
    mode: 'priv',
    device: sw,
    en: 'Enter global configuration mode.',
    hi: 'Config mode mein jao.',
    lesson: 'A7',
  },
  { topic: 'Basics', example: 'hostname MTD-SW1', mode: 'config', device: sw, en: 'Set the device name.', hi: 'Device ka naam rakho.', lesson: 'A7' },
  {
    topic: 'Basics',
    example: 'end',
    mode: 'config-if',
    device: sw,
    en: 'Return to privileged EXEC from any config mode.',
    hi: 'Seedha # par wapas.',
    lesson: 'A7',
  },
  {
    topic: 'Basics',
    example: 'show running-config',
    mode: 'priv',
    device: sw,
    en: 'Show the active configuration.',
    hi: 'Abhi ka config dikhao.',
    lesson: 'A7',
  },
  {
    topic: 'Basics',
    example: 'write memory',
    mode: 'priv',
    device: sw,
    en: 'Save running-config to startup-config.',
    hi: 'Config save karo.',
    lesson: 'A7',
  },
  {
    topic: 'Basics',
    example: 'copy running-config startup-config',
    mode: 'priv',
    device: sw,
    en: 'Same as write memory.',
    hi: 'Config save (doosra tareeka).',
    lesson: 'A7',
  },
  {
    topic: 'Basics',
    example: 'do show vlan brief',
    mode: 'config',
    device: sw,
    en: 'Run an EXEC command from config mode.',
    hi: 'Config mode se show chalao.',
    lesson: 'A7',
  },
  // Interfaces
  {
    topic: 'Interfaces',
    example: 'interface gi0/1',
    mode: 'config',
    device: sw,
    en: 'Select one interface to configure.',
    hi: 'Ek port chuno.',
    lesson: 'A7',
  },
  {
    topic: 'Interfaces',
    example: 'interface range gi0/1 - 4',
    mode: 'config',
    device: sw,
    en: 'Configure several ports at once.',
    hi: 'Kai ports ek saath.',
    lesson: 'A7',
  },
  {
    topic: 'Interfaces',
    example: 'description UTS counter 1',
    mode: 'config-if',
    device: sw,
    en: 'Label the interface.',
    hi: 'Port par label likho.',
    lesson: 'A7',
  },
  {
    topic: 'Interfaces',
    example: 'shutdown',
    mode: 'config-if',
    device: sw,
    en: 'Administratively disable the port.',
    hi: 'Port band karo.',
    lesson: 'A7',
  },
  {
    topic: 'Interfaces',
    example: 'no shutdown',
    mode: 'config-if',
    device: r,
    en: 'Enable the port (router ports start shut down).',
    hi: 'Port chalu karo (router ports default band).',
    lesson: 'A5',
  },
  {
    topic: 'Interfaces',
    example: 'duplex full',
    mode: 'config-if',
    device: sw,
    en: 'Force full duplex (both ends must match).',
    hi: 'Full duplex force (dono taraf same).',
    lesson: 'A4',
  },
  { topic: 'Interfaces', example: 'duplex auto', mode: 'config-if', device: sw, en: 'Back to auto-negotiation.', hi: 'Wapas auto.', lesson: 'A4' },
  {
    topic: 'Interfaces',
    example: 'show interfaces status',
    mode: 'priv',
    device: sw,
    en: 'One line per port: status, VLAN, duplex, speed.',
    hi: 'Har port ki ek line.',
    lesson: 'A4',
  },
  {
    topic: 'Interfaces',
    example: 'show interfaces gi0/1',
    mode: 'priv',
    device: sw,
    en: 'Detail of one port incl. errors.',
    hi: 'Ek port ki detail, errors ke saath.',
    lesson: 'A4',
  },
  // VLANs
  {
    topic: 'VLAN & trunk',
    example: 'vlan 10',
    mode: 'config',
    device: sw,
    en: 'Create VLAN 10 and enter VLAN config.',
    hi: 'VLAN 10 banao.',
    lesson: 'A7',
  },
  { topic: 'VLAN & trunk', example: 'name UTS', mode: 'config-vlan', device: sw, en: 'Name the VLAN.', hi: 'VLAN ka naam.', lesson: 'A7' },
  {
    topic: 'VLAN & trunk',
    example: 'switchport mode access',
    mode: 'config-if',
    device: sw,
    en: 'Make the port an access port.',
    hi: 'Port ko access banao.',
    lesson: 'A7',
  },
  {
    topic: 'VLAN & trunk',
    example: 'switchport access vlan 10',
    mode: 'config-if',
    device: sw,
    en: 'Put the access port in VLAN 10.',
    hi: 'Access port ko VLAN 10 mein daalo.',
    lesson: 'A7',
  },
  {
    topic: 'VLAN & trunk',
    example: 'switchport mode trunk',
    mode: 'config-if',
    device: sw,
    en: 'Make the port an 802.1Q trunk.',
    hi: 'Port ko trunk banao.',
    lesson: 'A7',
  },
  {
    topic: 'VLAN & trunk',
    example: 'switchport trunk allowed vlan 10,20,40',
    mode: 'config-if',
    device: sw,
    en: 'Limit the VLANs on a trunk.',
    hi: 'Trunk par sirf yeh VLANs.',
    lesson: 'A7',
  },
  {
    topic: 'VLAN & trunk',
    example: 'switchport trunk allowed vlan add 60',
    mode: 'config-if',
    device: sw,
    en: 'Add a VLAN to the allowed list.',
    hi: 'Allowed list mein VLAN jodo.',
    lesson: 'A7',
  },
  {
    topic: 'VLAN & trunk',
    example: 'switchport trunk native vlan 99',
    mode: 'config-if',
    device: sw,
    en: 'Set the untagged (native) VLAN.',
    hi: 'Native VLAN set karo.',
    lesson: 'A7',
  },
  {
    topic: 'VLAN & trunk',
    example: 'show vlan brief',
    mode: 'priv',
    device: sw,
    en: 'VLANs and their access ports.',
    hi: 'VLANs aur unke ports.',
    lesson: 'A7',
  },
  {
    topic: 'VLAN & trunk',
    example: 'show interfaces trunk',
    mode: 'priv',
    device: sw,
    en: 'Trunk ports, native and allowed VLANs.',
    hi: 'Trunks ki detail.',
    lesson: 'A7',
  },
  {
    topic: 'VLAN & trunk',
    example: 'show mac address-table',
    mode: 'priv',
    device: sw,
    en: 'Learned MAC addresses per VLAN and port.',
    hi: 'Seekhe hue MACs.',
    lesson: 'A4',
  },
  {
    topic: 'VLAN & trunk',
    example: 'clear mac address-table dynamic',
    mode: 'priv',
    device: sw,
    en: 'Flush dynamically learned MACs.',
    hi: 'Seekhe hue MACs saaf karo.',
    lesson: 'A4',
  },
  // STP
  {
    topic: 'Spanning tree',
    example: 'spanning-tree vlan 1 priority 4096',
    mode: 'config',
    device: sw,
    en: 'Lower the bridge priority (make this the root).',
    hi: 'Priority kam karo — root banao.',
    lesson: 'A8',
  },
  {
    topic: 'Spanning tree',
    example: 'show spanning-tree',
    mode: 'priv',
    device: sw,
    en: 'Root, costs, port roles and states.',
    hi: 'Root aur port roles dikhao.',
    lesson: 'A8',
  },
  // EtherChannel
  {
    topic: 'EtherChannel',
    example: 'channel-group 1 mode active',
    mode: 'config-if',
    device: sw,
    en: 'Bundle the port into Port-channel 1 with LACP (active).',
    hi: 'Port ko LACP bundle mein daalo.',
    lesson: 'A8',
  },
  {
    topic: 'EtherChannel',
    example: 'channel-group 1 mode passive',
    mode: 'config-if',
    device: sw,
    en: 'LACP passive: answer only.',
    hi: 'LACP passive: sirf jawab.',
    lesson: 'A8',
  },
  {
    topic: 'EtherChannel',
    example: 'interface port-channel 1',
    mode: 'config',
    device: sw,
    en: 'Configure the bundle; L2 settings copy to members.',
    hi: 'Bundle ka config — members par copy.',
    lesson: 'A8',
  },
  {
    topic: 'EtherChannel',
    example: 'show etherchannel summary',
    mode: 'priv',
    device: sw,
    en: 'Bundles and member flags (P/I/s/D).',
    hi: 'Bundles aur member flags.',
    lesson: 'A8',
  },
  // Port security
  {
    topic: 'Port security',
    example: 'switchport port-security',
    mode: 'config-if',
    device: sw,
    en: 'Enable port security (default max 1, shutdown).',
    hi: 'Port security chalu.',
    lesson: 'A8',
  },
  {
    topic: 'Port security',
    example: 'switchport port-security maximum 2',
    mode: 'config-if',
    device: sw,
    en: 'Allow up to 2 MACs.',
    hi: '2 MAC tak allowed.',
    lesson: 'A8',
  },
  {
    topic: 'Port security',
    example: 'switchport port-security violation restrict',
    mode: 'config-if',
    device: sw,
    en: 'Drop + count instead of shutting the port.',
    hi: 'Port band nahi, sirf drop.',
    lesson: 'A8',
  },
  {
    topic: 'Port security',
    example: 'show port-security',
    mode: 'priv',
    device: sw,
    en: 'Secure ports and violation counts.',
    hi: 'Secure ports aur violations.',
    lesson: 'A8',
  },
  // IP
  {
    topic: 'IP',
    example: 'ip address 10.52.1.1 255.255.255.0',
    mode: 'config-if',
    device: r,
    en: 'Set the interface IPv4 address.',
    hi: 'Interface ko IP do.',
    lesson: 'A5',
  },
  {
    topic: 'IP',
    example: 'show ip interface brief',
    mode: 'priv',
    device: r,
    en: 'Interfaces with IP, status and protocol.',
    hi: 'Interfaces aur unke IP.',
    lesson: 'A5',
  },
  { topic: 'IP', example: 'show arp', mode: 'priv', device: r, en: 'IP → MAC mappings learned by ARP.', hi: 'ARP table.', lesson: 'A5' },
  { topic: 'IP', example: 'show ip route', mode: 'priv', device: r, en: 'Routing table.', hi: 'Routing table.', lesson: 'A9' },
  { topic: 'IP', example: 'ping 10.52.1.11', mode: 'priv', device: r, en: 'Send ICMP echo requests.', hi: 'Ping bhejo.', lesson: 'A5' },
  {
    topic: 'IP',
    example: 'traceroute 10.52.1.11',
    mode: 'priv',
    device: r,
    en: 'Show the hops to a destination.',
    hi: 'Raste ke hops dikhao.',
    lesson: 'A9',
  },
  {
    topic: 'IP',
    example: 'ip routing',
    mode: 'config',
    device: l3,
    en: 'Turn on routing on an L3 switch.',
    hi: 'L3 switch par routing on.',
    lesson: 'A9',
  },
  // Host
  {
    topic: 'Host (PC)',
    example: 'ipconfig /all',
    mode: 'host',
    device: pc,
    en: 'IP, mask, gateway, MAC and DHCP info.',
    hi: 'PC ki IP settings.',
    lesson: 'A5',
  },
  { topic: 'Host (PC)', example: 'ping 10.52.1.1', mode: 'host', device: pc, en: 'Ping from the PC.', hi: 'PC se ping.', lesson: 'A5' },
  {
    topic: 'Host (PC)',
    example: 'tracert 10.52.1.1',
    mode: 'host',
    device: pc,
    en: 'Trace the route from the PC.',
    hi: 'PC se route trace.',
    lesson: 'A9',
  },
  { topic: 'Host (PC)', example: 'arp -a', mode: 'host', device: pc, en: 'Show the PC’s ARP cache.', hi: 'PC ki ARP cache.', lesson: 'A5' },
];

/** CLI lines that bring a fresh device into `mode` (used by the reference test and the "try it" hint). */
export function preLines(mode: RefMode, device: RefDevice): string[] {
  const port = device === 'router' ? 'gi0/0' : device === 'l3-switch' ? 'gi1/0/1' : 'gi0/1';
  switch (mode) {
    case 'user':
    case 'host':
      return [];
    case 'priv':
      return ['enable'];
    case 'config':
      return ['enable', 'configure terminal'];
    case 'config-if':
      return ['enable', 'configure terminal', `interface ${port}`];
    case 'config-vlan':
      return ['enable', 'configure terminal', 'vlan 10'];
    case 'config-router':
      return ['enable', 'configure terminal', 'router ospf 1'];
  }
}
