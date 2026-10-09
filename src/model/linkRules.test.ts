import { describe, expect, it } from 'vitest';
import { getTemplate } from './catalog';
import { checkPortPair, compatibleOptions, defaultOptical } from './linkRules';
import { addDevice, emptyTopology } from './topologyOps';
import type { Port } from './types';

const portOf = (kind: Parameters<typeof getTemplate>[0], name: string): Port => {
  const p = getTemplate(kind).buildPorts().find((x) => x.name === name);
  if (!p) throw new Error(`no port ${name}`);
  return p;
};

describe('physical link rules', () => {
  it('allows STM-1 to STM-1 over OFC but rejects STM-1 to STM-4', () => {
    expect(checkPortPair('ofc', portOf('adm-stm1', 'STM1-E'), portOf('adm-stm1', 'STM1-W')).ok).toBe(true);
    const r = checkPortPair('ofc', portOf('adm-stm1', 'STM1-E'), portOf('adm-stm4', 'STM4-W'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/rate mismatch/);
  });

  it('allows STM-1 tributary of an STM-4 ADM to face an STM-1 aggregate', () => {
    expect(checkPortPair('ofc', portOf('adm-stm4', 'STM1-T1'), portOf('adm-stm1', 'STM1-W')).ok).toBe(true);
  });

  it('E1 copper only joins E1 ports', () => {
    expect(checkPortPair('e1-copper', portOf('pdmux', 'E1-1'), portOf('adm-stm1', 'E1-5')).ok).toBe(true);
    expect(checkPortPair('e1-copper', portOf('pdmux', 'E1-1'), portOf('pc', 'eth0')).ok).toBe(false);
  });

  it('enforces VF role pairing', () => {
    expect(checkPortPair('quad', portOf('pdmux', 'FXS-1'), portOf('control-phone', 'LINE')).ok).toBe(true);
    expect(checkPortPair('quad', portOf('pdmux', 'FXO-1'), portOf('exchange', 'SUB-1')).ok).toBe(true);
    expect(checkPortPair('quad', portOf('pdmux', 'FXS-1'), portOf('exchange', 'SUB-1')).ok).toBe(false); // FXS-FXS
    expect(checkPortPair('quad', portOf('pdmux', 'FXO-1'), portOf('control-phone', 'LINE')).ok).toBe(false);
    expect(checkPortPair('quad', portOf('pdmux', '4W-1'), portOf('bpac', 'MODEM-1')).ok).toBe(true);
    expect(checkPortPair('quad', portOf('pdmux', '2W-1'), portOf('bpac', 'MODEM-1')).ok).toBe(false); // 2W vs 4W
  });

  it('SFP patch requires a common speed', () => {
    expect(checkPortPair('sfp-10g', portOf('ler', 'Te0/1/0'), portOf('lsr', 'Te0/0/0')).ok).toBe(true);
    expect(checkPortPair('sfp-10g', portOf('l2-switch', 'Gi0/25'), portOf('lsr', 'Te0/0/0')).ok).toBe(false);
    expect(checkPortPair('sfp-100g', portOf('lsr', 'Hu0/1/0'), portOf('lsr', 'Hu0/1/1')).ok).toBe(true);
  });

  it('CWDM lambda joins a channel port to a coloured optic', () => {
    expect(checkPortPair('cwdm-lambda', portOf('cwdm-mux', 'CH1551'), portOf('adm-stm1', 'STM1-E')).ok).toBe(true);
    expect(checkPortPair('cwdm-lambda', portOf('ler', 'Te0/1/0'), portOf('cwdm-mux', 'CH1571')).ok).toBe(true);
    expect(checkPortPair('cwdm-lambda', portOf('cwdm-mux', 'CH1551'), portOf('cwdm-mux', 'CH1571')).ok).toBe(false);
    expect(checkPortPair('ofc', portOf('cwdm-mux', 'LINE'), portOf('cwdm-mux', 'LINE')).ok).toBe(true);
  });

  it('lists compatible link options between two devices', () => {
    let t = emptyTopology();
    const a = addDevice(t, 'pdmux', { x: 0, y: 0 });
    t = a.topology;
    const b = addDevice(t, 'adm-stm1', { x: 0, y: 0 });
    const opts = compatibleOptions(a.device, b.device, []);
    const kinds = opts.map((o) => o.kind).sort();
    expect(kinds).toEqual(['cat6', 'e1-copper']);
  });

  it('default optics follow the port type', () => {
    expect(defaultOptical(portOf('adm-stm1', 'STM1-E'), 20).profile).toBe('L-1.1');
    expect(defaultOptical(portOf('adm-stm16', 'STM16-E'), 20).profile).toBe('L-16.2');
    expect(defaultOptical(portOf('cwdm-mux', 'LINE'), 20).extraLossDb).toBe(5);
    expect(defaultOptical(portOf('adm-stm1', 'STM1-E'), 20).splices).toBe(9);
  });
});
