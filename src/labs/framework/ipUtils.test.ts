import { describe, expect, it } from 'vitest';
import { cidrWithin, findOverlaps, formatCidr, parseCidr, parseIpv4, sameSubnet } from './ipUtils';

describe('ipUtils', () => {
  it('parses IPv4 and rejects bad input', () => {
    expect(parseIpv4('10.0.0.1')).toBe(0x0a000001);
    expect(parseIpv4('256.1.1.1')).toBeNull();
    expect(parseIpv4('10.0.0')).toBeNull();
    expect(parseIpv4('10.0.0.x')).toBeNull();
  });

  it('normalises CIDR network address', () => {
    expect(formatCidr(parseCidr('10.20.1.77/24')!)).toBe('10.20.1.0/24');
    expect(formatCidr(parseCidr('0.0.0.0/0')!)).toBe('0.0.0.0/0');
    expect(formatCidr(parseCidr('10.1.1.1/32')!)).toBe('10.1.1.1/32');
    expect(parseCidr('10.1.1.1/33')).toBeNull();
    expect(parseCidr('10.1.1.1')).toBeNull();
  });

  it('detects overlaps and containment', () => {
    expect(findOverlaps(['10.20.0.0/16', '10.20.5.0/24', '10.30.0.0/24'])).toEqual([['10.20.0.0/16', '10.20.5.0/24']]);
    expect(findOverlaps(['10.1.1.0/24', '10.1.2.0/24'])).toEqual([]);
    expect(cidrWithin(parseCidr('10.20.5.0/24')!, parseCidr('10.20.0.0/16')!)).toBe(true);
    expect(cidrWithin(parseCidr('10.21.5.0/24')!, parseCidr('10.20.0.0/16')!)).toBe(false);
  });

  it('same subnet', () => {
    expect(sameSubnet('10.1.1.1/24', '10.1.1.254/24')).toBe(true);
    expect(sameSubnet('10.1.1.1/24', '10.1.2.1/24')).toBe(false);
    expect(sameSubnet('10.1.1.1/24', '10.1.1.2/25')).toBe(false);
  });
});
