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
  /** RFC 4950 extension: label stack of the packet whose TTL expired in an LSP. */
  mplsLabels?: Array<{ label: number; exp: number }>;
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

/** Application payloads carried over UDP (P3 management services). */
export type AppMessage =
  | { kind: 'dns-query'; id: number; name: string }
  | { kind: 'dns-reply'; id: number; name: string; address?: number }
  | { kind: 'ntp-request'; id: number }
  | { kind: 'ntp-reply'; id: number; stratum: number }
  | { kind: 'syslog'; text: string }
  | { kind: 'snmp-trap'; community: string; text: string }
  /** RFC 8029 LSP ping / trace (UDP 3503). fec = "A.B.C.D/len". */
  | { kind: 'mpls-echo-request'; id: number; seq: number; fec: string }
  /** code: '!' egress, 'L' label-switched transit, 'B' unlabelled output, 'N' no label entry, 'f' FEC mismatch. */
  | { kind: 'mpls-echo-reply'; id: number; seq: number; code: string; info: string };

export interface UdpDatagram {
  srcPort: number;
  dstPort: number;
  dhcp?: DhcpMessage;
  app?: AppMessage;
}

/**
 * TCP, reduced to connection set-up for SSH/Telnet management access:
 * SYN, then SYN-ACK (accepted, with the login outcome) or RST (refused).
 */
export interface TcpSegment {
  srcPort: number;
  dstPort: number;
  flags: 'SYN' | 'SYN-ACK' | 'RST';
  id: number;
  /** Login outcome / refusal reason carried back to the client. */
  note?: string;
  /** What an eavesdropper sees: Telnet = cleartext, SSH = encrypted. */
  payload?: string;
}

export interface Ipv4Packet {
  kind: 'ipv4';
  src: number;
  dst: number;
  ttl: number;
  /** Differentiated Services Code Point (0–63). */
  dscp: number;
  protocol: 'icmp' | 'udp' | 'tcp';
  icmp?: IcmpMessage;
  udp?: UdpDatagram;
  tcp?: TcpSegment;
  sizeBytes: number;
}

/** One MPLS label stack entry (RFC 3032): 20-bit label, 3-bit TC (EXP), 8-bit TTL; S bit = last entry. */
export interface MplsLabel {
  label: number;
  tc: number;
  ttl: number;
}

export interface Frame {
  srcMac: string;
  dstMac: string;
  /** 802.1Q VLAN tag when the frame is tagged on the wire. */
  vlanTag?: number;
  /** MPLS label stack (top first) between the Ethernet header and the IP packet. */
  mpls?: MplsLabel[];
  payload: ArpPacket | Ipv4Packet;
  /** Pseudowire: the whole customer Ethernet frame carried under the MPLS labels (payload mirrors its payload). */
  l2?: Frame;
  /** Packet-inspector flow this frame belongs to. */
  flowId: number;
}

export type EtherType = 'ARP (0x0806)' | 'IPv4 (0x0800)' | 'MPLS unicast (0x8847)';

export function etherTypeOf(f: Frame): EtherType {
  if (f.mpls?.length) return 'MPLS unicast (0x8847)';
  return f.payload.kind === 'arp' ? 'ARP (0x0806)' : 'IPv4 (0x0800)';
}
