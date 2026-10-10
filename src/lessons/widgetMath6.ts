/** Maths behind the P6 (L2VPN / TDM pseudowire) lesson widgets. */

// ------------------------------------------------- B7: core MTU for a PW

/** Bytes a customer frame needs on a core link: inner Ethernet (+tag) + labels + optional control word (outer L2 header excluded, as MTU is). */
export function pwCoreMtu(o: {
  ipMtu: number;
  vlanTagged: boolean;
  labels: number;
  controlWord: boolean;
}): { inner: number; mpls: number; total: number } | string {
  if (!Number.isInteger(o.ipMtu) || o.ipMtu < 68 || o.ipMtu > 9000) return 'Customer IP MTU must be 68 – 9000 bytes.';
  if (!Number.isInteger(o.labels) || o.labels < 1 || o.labels > 4) return 'Label stack depth must be 1 – 4.';
  const inner = o.ipMtu + 14 + (o.vlanTagged ? 4 : 0);
  const mpls = 4 * o.labels + (o.controlWord ? 4 : 0);
  return { inner, mpls, total: inner + mpls };
}

// ------------------------------------------- B8: TDM pseudowire sizing

/** Outer Ethernet header + FCS (18) + transport and VC labels (8) + control word (4). Preamble/IFG not counted. */
export const TDM_PW_OVERHEAD_BYTES = 30;

/**
 * SAToP (unframed E1: 32 bytes per 125 µs frame) or CESoPSN (N timeslots: N bytes per frame).
 * framesPerPacket E1 frames are packed into each packet.
 */
export function tdmPw(o: {
  timeslots: number | 'unframed';
  framesPerPacket: number;
}): { payloadBytes: number; packetsPerSecond: number; packetizationMs: number; payloadKbps: number; wireKbps: number } | string {
  const perFrame = o.timeslots === 'unframed' ? 32 : o.timeslots;
  if (o.timeslots !== 'unframed' && (!Number.isInteger(o.timeslots) || o.timeslots < 1 || o.timeslots > 31))
    return 'CESoPSN carries 1 – 31 timeslots (TS0 is framing).';
  if (!Number.isInteger(o.framesPerPacket) || o.framesPerPacket < 1 || o.framesPerPacket > 64) return 'Frames per packet must be 1 – 64.';
  const payloadBytes = perFrame * o.framesPerPacket;
  const packetsPerSecond = 8000 / o.framesPerPacket;
  return {
    payloadBytes,
    packetsPerSecond,
    packetizationMs: o.framesPerPacket * 0.125,
    payloadKbps: perFrame * 64,
    wireKbps: ((payloadBytes + TDM_PW_OVERHEAD_BYTES) * 8 * packetsPerSecond) / 1000,
  };
}
