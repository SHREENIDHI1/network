/**
 * Deterministic, locally-administered MAC addresses derived from the device
 * id, so a saved topology always gets the same MACs (stable labs and tests).
 */

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const hex2 = (n: number) => (n & 0xff).toString(16).padStart(2, '0');

/** MAC for port number `index` (0-based); index 255 is the device base MAC (bridge ID, SVIs). */
export function macFor(deviceId: string, index: number): string {
  const h = fnv1a(deviceId);
  return ['02', hex2(h >>> 24), hex2(h >>> 16), hex2(h >>> 8), hex2(h), hex2(index)].join(':');
}

export function baseMac(deviceId: string): string {
  return macFor(deviceId, 255);
}

/** Cisco dotted format: 0200.1122.3344 */
export function ciscoMac(mac: string): string {
  const h = mac.replace(/:/g, '');
  return `${h.slice(0, 4)}.${h.slice(4, 8)}.${h.slice(8, 12)}`;
}

/** Windows format: 02-00-11-22-33-44 */
export function windowsMac(mac: string): string {
  return mac.replace(/:/g, '-');
}
