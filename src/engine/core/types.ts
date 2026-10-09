/**
 * Frame and packet types used inside the simulation engine.
 * Addresses are kept as plain values: MAC as "aa:bb:cc:dd:ee:ff" strings,
 * IPv4 as unsigned 32-bit numbers.
 */

export const BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff';

export interface ArpPacket {
  kind: 'arp';
  op: 'request' | 'reply';
  senderMac: string;
  senderIp: number;
  targetMac: string;
  targetIp: number;
}

export type IcmpType = 'echo-request' | 'echo-reply' | 'time-exceeded' | 'dest-unreachable';

export interface IcmpMessage {
  type: IcmpType;
  /** Identifies the ping/traceroute session and probe. */
  id: number;
  seq: number;
  /** For errors: the code (e.g. 'net-unreachable', 'host-unreachable', 'ttl-exceeded'). */
  code?: string;
}

export type DhcpOp = 'discover' | 'offer' | 'request' | 'ack' | 'nak' | 'release';

export interface DhcpMessage {
  op: DhcpOp;
  xid: number;
  /** Client hardware address. */
  chaddr: string;
  ciaddr?: number;
  yiaddr?: number;
  /** Server identifier (option 54). */
  serverId?: number;
  /** Relay agent address. */
  giaddr?: number;
  requestedIp?: number;
  mask?: number;
  router?: number;
  dns?: number;
  leaseSec?: number;
}

export interface UdpDatagram {
  srcPort: number;
  dstPort: number;
  dhcp?: DhcpMessage;
}

export interface Ipv4Packet {
  kind: 'ipv4';
  src: number;
  dst: number;
  ttl: number;
  /** Differentiated Services Code Point (0–63). */
  dscp: number;
  protocol: 'icmp' | 'udp';
  icmp?: IcmpMessage;
  udp?: UdpDatagram;
  sizeBytes: number;
}

export interface Frame {
  srcMac: string;
  dstMac: string;
  /** 802.1Q VLAN tag when the frame is tagged on the wire. */
  vlanTag?: number;
  payload: ArpPacket | Ipv4Packet;
  /** Packet-inspector flow this frame belongs to. */
  flowId: number;
}

export type EtherType = 'ARP (0x0806)' | 'IPv4 (0x0800)';

export function etherTypeOf(f: Frame): EtherType {
  return f.payload.kind === 'arp' ? 'ARP (0x0806)' : 'IPv4 (0x0800)';
}
