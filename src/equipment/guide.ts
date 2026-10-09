import { longIfName } from '../engine/cli/ios';
import { roleOf } from '../engine/config/netConfig';
import type { Device } from '../model/types';
import { FAMILY_DOCS } from './families';
import { kindDoc } from './kinds';
import type { Capability, Family, GuideStep } from './types';

/**
 * Config / verify guides generated for a concrete device, so interface names
 * match its real ports. Every `cli` line is executed by tests against the
 * simulator's CLI — the guide never shows a command the simulator rejects.
 */

const s = (en: string, hi: string, where: GuideStep['where'], cli?: string[]): GuideStep => ({ say: { en, hi }, where, cli });

export function familyOf(device: Pick<Device, 'kind'>): Family {
  return kindDoc(device.kind)?.family ?? 'cloud';
}

function dataPorts(device: Device): string[] {
  return device.ports.filter((p) => p.kind === 'rj45' || p.kind === 'sfp' || p.kind === 'combo').map((p) => longIfName(p.name));
}

export function configGuide(device: Device): GuideStep[] {
  const fam = familyOf(device);
  const ports = dataPorts(device);
  const [p1, p2] = [ports[0], ports[ports.length - 1]];
  const start = s('Enter privileged mode, then global configuration.', 'Privileged mode, phir global configuration mein jao.', 'ios', [
    'enable',
    'configure terminal',
  ]);
  const host = s('Give the device a meaningful hostname (station code + role).', 'Device ko samajhdaar hostname do (station code + role).', 'ios', [
    `hostname MTD-${device.kind.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
  ]);
  switch (fam) {
    case 'endpoint':
      return [
        s('Select the device and open its IP settings in the right-hand panel.', 'Device select karke right panel mein IP settings kholo.', 'ui'),
        s(
          'Choose DHCP, or Static and type IP address, subnet mask and default gateway (e.g. 10.20.10.11 / 255.255.255.0 / 10.20.10.1).',
          'DHCP chuno, ya Static mein IP, mask aur default gateway likho (jaise 10.20.10.11 / 255.255.255.0 / 10.20.10.1).',
          'ui',
        ),
        s('Open the console and confirm the settings.', 'Console kholkar settings confirm karo.', 'host', ['ipconfig /all']),
      ];
    case 'hub':
      return [s('A hub has no configuration — just connect cables.', 'Hub ka koi configuration nahi — bas cable jodo.', 'ui')];
    case 'cloud':
      return [s('Placeholder device: nothing to configure in P1.', 'Placeholder device: P1 mein configure karne ko kuch nahi.', 'ui')];
    case 'l2switch':
      return [
        start,
        host,
        s('Create the application VLANs.', 'Application VLANs banao.', 'ios', ['vlan 10', 'name UTS', 'exit', 'vlan 40', 'name CCTV', 'exit']),
        s('Make a user port an access port in VLAN 10.', 'User port ko VLAN 10 ka access port banao.', 'ios', [
          `interface ${p1}`,
          'description UTS counter 1',
          'switchport mode access',
          'switchport access vlan 10',
          'no shutdown',
          'exit',
        ]),
        s('Make the uplink a trunk carrying only the needed VLANs.', 'Uplink ko trunk banao, sirf zaroori VLANs ke saath.', 'ios', [
          `interface ${p2}`,
          'description Uplink to router',
          'switchport mode trunk',
          'switchport trunk allowed vlan 10,40',
          'no shutdown',
          'end',
        ]),
      ];
    case 'l3switch':
      return [
        start,
        host,
        s('Turn on routing and create the VLAN.', 'Routing on karo aur VLAN banao.', 'ios', ['ip routing', 'vlan 10', 'name UTS', 'exit']),
        s('Put a user port in VLAN 10.', 'User port ko VLAN 10 mein daalo.', 'ios', [
          `interface ${p1}`,
          'switchport mode access',
          'switchport access vlan 10',
          'no shutdown',
          'exit',
        ]),
        s('Create the SVI — the gateway for VLAN 10.', 'SVI banao — VLAN 10 ka gateway.', 'ios', [
          'interface vlan 10',
          'ip address 10.20.10.1 255.255.255.0',
          'no shutdown',
          'exit',
        ]),
        s('Advertise it with OSPF (single area 0).', 'OSPF se advertise karo (single area 0).', 'ios', [
          'router ospf 1',
          'network 10.20.10.0 0.0.0.255 area 0',
          'end',
        ]),
      ];
    case 'router':
    case 'firewall':
    case 'mpls':
      return [
        start,
        host,
        s('Address the LAN-facing interface and bring it up.', 'LAN wale interface ko IP do aur up karo.', 'ios', [
          `interface ${p1}`,
          'description Station LAN',
          'ip address 10.20.10.1 255.255.255.0',
          'no shutdown',
          'exit',
        ]),
        s('Address the uplink (point-to-point /30).', 'Uplink ko IP do (point-to-point /30).', 'ios', [
          `interface ${p2}`,
          'description Uplink to JU',
          'ip address 10.255.0.2 255.255.255.252',
          'no shutdown',
          'exit',
        ]),
        s('Run OSPF on both networks.', 'Dono networks par OSPF chalao.', 'ios', [
          'router ospf 1',
          'network 10.20.10.0 0.0.0.255 area 0',
          'network 10.255.0.0 0.0.0.3 area 0',
          'end',
        ]),
      ];
  }
}

export function verifyGuide(device: Device): GuideStep[] {
  const fam = familyOf(device);
  switch (fam) {
    case 'endpoint':
      return [
        s('Check address, mask, gateway and MAC.', 'Address, mask, gateway aur MAC check karo.', 'host', ['ipconfig /all']),
        s('Test the gateway, then a remote host; trace the path.', 'Pehle gateway, phir remote host ping karo; path trace karo.', 'host', [
          'ping 10.20.10.1',
          'tracert 10.20.10.1',
        ]),
        s('See which MACs were learned by ARP.', 'ARP se seekhe MAC dekho.', 'host', ['arp -a']),
      ];
    case 'l2switch':
      return [
        s('Port status and VLAN membership.', 'Port status aur VLAN membership.', 'ios', ['show vlan brief', 'show interfaces trunk']),
        s('MAC learning and loop prevention.', 'MAC learning aur loop prevention.', 'ios', ['show mac address-table', 'show spanning-tree']),
        s('Port security.', 'Port security.', 'ios', ['show port-security']),
      ];
    case 'l3switch':
    case 'router':
    case 'firewall':
    case 'mpls':
      return [
        s('Interfaces: both "Status" and "Protocol" should be up.', 'Interfaces: "Status" aur "Protocol" dono up hone chahiye.', 'ios', [
          'show ip interface brief',
        ]),
        s('Routes and OSPF neighbours.', 'Routes aur OSPF neighbours.', 'ios', ['show ip route', 'show ip ospf neighbor']),
        s('Next-hop MAC resolution and filters.', 'Next-hop MAC aur filters.', 'ios', ['show arp', 'show access-lists']),
        s('Reachability test.', 'Reachability test.', 'ios', ['ping 10.20.10.1']),
      ];
    default:
      return [s('Nothing to verify on this device in P1.', 'P1 mein is device par verify karne ko kuch nahi.', 'ui')];
  }
}

/** What the simulator really does for this device kind (honest, phase-tagged). */
export function capabilities(device: Pick<Device, 'kind'>): Capability[] {
  const role = roleOf(device.kind);
  const fam = familyOf(device);
  const c: Capability[] = [];
  const add = (what: string, status: Capability['status'], note?: string) => c.push({ what, status, note });
  if (role === 'opaque') {
    add('Packet forwarding', 'not-modelled', 'Placeholder device in P1');
    return c;
  }
  add('Link state, cabling rules, optical budget on fibre ports', 'simulated');
  if (role === 'hub') {
    add('Repeats frames out of all ports (no MAC learning)', 'simulated');
    return c;
  }
  if (role === 'host') {
    add('Static IP or DHCP client (DORA), APIPA fallback', 'simulated');
    add('ARP, ping, tracert', 'simulated');
    add('Application traffic (web, video, ticketing)', 'not-modelled', 'QoS analysis uses traffic profiles instead');
    if (device.kind === 'wifi-ap') add('Radio / SSIDs / roaming', 'not-modelled');
    return c;
  }
  if (role === 'switch' || role === 'l3switch') {
    add('MAC learning, VLANs, 802.1Q trunks, native VLAN', 'simulated');
    add('Rapid STP (simplified)', 'simulated');
    add('Port security', 'simulated');
    add('EtherChannel / LACP', 'planned', 'later phase');
  }
  if (role === 'l3switch' || role === 'router') {
    add('IPv4 routing: connected, static, OSPF (single/multi-area)', 'simulated');
    add('ACLs, NAT/PAT, DHCP server/relay, HSRP/VRRP, QoS (fluid analysis)', 'simulated');
  }
  if (fam === 'firewall') add('Stateful inspection, zones', 'not-modelled', 'Use ACLs (stateless)');
  if (fam === 'mpls') {
    add('IS-IS', 'planned', 'P4');
    add('MPLS labels, LDP', 'planned', 'P4');
    add('MP-BGP, L3VPN', 'planned', 'P5');
    add('L2VPN (VPWS/VPLS), TDM pseudowire', 'planned', 'P6');
    add('MPLS QoS, TE, FRR', 'planned', 'P7');
    add('Vendor-exact CLI', 'not-modelled', 'Generic SP CLI only');
  }
  add('CPU, memory, temperature, power draw', 'not-modelled');
  return c;
}

export { FAMILY_DOCS };
