import type { OpticalParams } from '../../model/types';

/**
 * Point-to-point optical power budget.
 *
 *   Rx(dBm) = Tx(dBm) - [ L·α + Nc·Lc + Ns·Ls + Lextra ]
 *
 * Status rules (simplified, see Model Limitations):
 *  - Rx < sensitivity           -> 'los'      (receiver cannot recover the signal)
 *  - Rx > overload              -> 'overload' (receiver saturated; needs attenuator)
 *  - margin < SYSTEM_MARGIN_DB  -> 'marginal' (works on paper, no ageing/repair margin)
 *  - otherwise                  -> 'ok'
 */

/** Design margin reserved for fibre ageing, repair splices and temperature. */
export const SYSTEM_MARGIN_DB = 3;

export type OpticalStatus = 'ok' | 'marginal' | 'los' | 'overload';

export interface BudgetBreakdown {
  fibreLossDb: number;
  connectorLossDb: number;
  spliceLossDb: number;
  extraLossDb: number;
  totalLossDb: number;
}

export interface BudgetResult {
  rxPowerDbm: number;
  /** Rx minus sensitivity. Negative means below sensitivity. */
  marginDb: number;
  /** Maximum attenuation the optic pair can tolerate (Tx - sensitivity). */
  powerBudgetDb: number;
  breakdown: BudgetBreakdown;
  status: OpticalStatus;
  /** Max route length for this optic/plant with SYSTEM_MARGIN_DB kept spare. */
  maxReachKm: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeBudget(lengthKm: number, p: OpticalParams): BudgetResult {
  const fibreLossDb = lengthKm * p.lossDbPerKm;
  const connectorLossDb = p.connectors * p.connectorLossDb;
  const spliceLossDb = p.splices * p.spliceLossDb;
  const extraLossDb = p.extraLossDb;
  const totalLossDb = fibreLossDb + connectorLossDb + spliceLossDb + extraLossDb;

  const rxPowerDbm = p.txPowerDbm - totalLossDb;
  const marginDb = rxPowerDbm - p.rxSensitivityDbm;
  const powerBudgetDb = p.txPowerDbm - p.rxSensitivityDbm;

  let status: OpticalStatus;
  if (rxPowerDbm < p.rxSensitivityDbm) status = 'los';
  else if (rxPowerDbm > p.rxOverloadDbm) status = 'overload';
  else if (marginDb < SYSTEM_MARGIN_DB) status = 'marginal';
  else status = 'ok';

  const fixedLoss = connectorLossDb + spliceLossDb + extraLossDb;
  const maxReachKm = p.lossDbPerKm > 0 ? Math.max(0, (powerBudgetDb - SYSTEM_MARGIN_DB - fixedLoss) / p.lossDbPerKm) : Infinity;

  return {
    rxPowerDbm: round2(rxPowerDbm),
    marginDb: round2(marginDb),
    powerBudgetDb: round2(powerBudgetDb),
    breakdown: {
      fibreLossDb: round2(fibreLossDb),
      connectorLossDb: round2(connectorLossDb),
      spliceLossDb: round2(spliceLossDb),
      extraLossDb: round2(extraLossDb),
      totalLossDb: round2(totalLossDb),
    },
    status,
    maxReachKm: round2(maxReachKm),
  };
}
