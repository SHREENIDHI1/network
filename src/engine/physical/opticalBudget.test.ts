import { describe, expect, it } from 'vitest';
import { computeBudget, SYSTEM_MARGIN_DB } from './opticalBudget';
import type { OpticalParams } from '../../model/types';

const L11: OpticalParams = {
  profile: 'L-1.1',
  wavelengthNm: 1310,
  lossDbPerKm: 0.35,
  connectors: 2,
  connectorLossDb: 0.5,
  splices: 9,
  spliceLossDb: 0.1,
  extraLossDb: 0,
  txPowerDbm: -5,
  rxSensitivityDbm: -34,
  rxOverloadDbm: -10,
};

describe('optical budget', () => {
  it('computes Rx power and loss breakdown for a 20 km STM-1 span', () => {
    const r = computeBudget(20, L11);
    // 20*0.35=7, 2*0.5=1, 9*0.1=0.9 -> 8.9 dB
    expect(r.breakdown.totalLossDb).toBeCloseTo(8.9, 5);
    expect(r.rxPowerDbm).toBeCloseTo(-13.9, 5);
    expect(r.powerBudgetDb).toBe(29);
    expect(r.marginDb).toBeCloseTo(20.1, 5);
    expect(r.status).toBe('ok');
  });

  it('declares LOS when Rx falls below sensitivity', () => {
    const r = computeBudget(90, L11); // 31.5 + 1 + 0.9 = 33.4 dB -> Rx -38.4
    expect(r.rxPowerDbm).toBeCloseTo(-38.4, 5);
    expect(r.status).toBe('los');
    expect(r.marginDb).toBeLessThan(0);
  });

  it('flags marginal links inside the system margin', () => {
    // Power budget is 29 dB; 'marginal' means total loss between 26 and 29 dB.
    const r = computeBudget(78, L11); // 27.3 + 1 + 0.9 = 29.2 dB > 29 dB budget
    const r2 = computeBudget(78, { ...L11, splices: 0 }); // 27.3 + 1 = 28.3 dB -> margin 0.7 dB
    expect(r.status).toBe('los');
    expect(r2.status).toBe('marginal');
    expect(r2.marginDb).toBeLessThan(SYSTEM_MARGIN_DB);
  });

  it('flags receiver overload on a very short span with a hot laser', () => {
    const r = computeBudget(0.5, { ...L11, txPowerDbm: 0, splices: 0 });
    expect(r.status).toBe('overload');
  });

  it('max reach keeps the system margin spare', () => {
    const r = computeBudget(10, { ...L11, splices: 0 });
    // (29 - 3 - 1) / 0.35 = 71.43 km
    expect(r.maxReachKm).toBeCloseTo(71.43, 2);
  });
});
