/**
 * Railway application classes and an illustrative DSCP plan.
 *
 * Priority order (highest first), as used across RailNet Sim labs:
 *   Signalling / safety data > Control voice / VoIP > UTS / PRS / FOIS > CCTV > Railnet / Wi-Fi
 * DSCP values follow common practice (RFC 4594 classes: EF for voice, AF4x
 * for video, AF3x for transactional data, CS5 for critical signalling here).
 * This is a teaching plan, not an official Indian Railways QoS policy.
 */

export const DSCP_NAMES: Record<string, number> = {
  default: 0,
  cs1: 8,
  af11: 10,
  af12: 12,
  af13: 14,
  cs2: 16,
  af21: 18,
  af22: 20,
  af23: 22,
  cs3: 24,
  af31: 26,
  af32: 28,
  af33: 30,
  cs4: 32,
  af41: 34,
  af42: 36,
  af43: 38,
  cs5: 40,
  ef: 46,
  cs6: 48,
  cs7: 56,
};

const BY_VALUE = new Map(Object.entries(DSCP_NAMES).map(([k, v]) => [v, k]));

export function dscpName(v: number): string {
  return BY_VALUE.get(v) ?? String(v);
}

/** Parses "ef", "af31", "46" → number; null if invalid. */
export function parseDscp(s: string): number | null {
  const k = s.toLowerCase();
  if (k in DSCP_NAMES) return DSCP_NAMES[k];
  if (/^\d+$/.test(k) && Number(k) <= 63) return Number(k);
  return null;
}

export type AppId = 'signalling' | 'voip' | 'uts' | 'prs' | 'fois' | 'cctv' | 'railnet' | 'wifi';

export interface AppClass {
  id: AppId;
  label: string;
  dscp: number;
  defaultMbps: number;
  /** 1 = highest priority in the railway plan. */
  rank: number;
}

export const APP_CLASSES: AppClass[] = [
  { id: 'signalling', label: 'Signalling / safety data', dscp: DSCP_NAMES.cs5, defaultMbps: 0.5, rank: 1 },
  { id: 'voip', label: 'Control voice / VoIP', dscp: DSCP_NAMES.ef, defaultMbps: 0.2, rank: 2 },
  { id: 'uts', label: 'UTS ticketing', dscp: DSCP_NAMES.af31, defaultMbps: 1, rank: 3 },
  { id: 'prs', label: 'PRS reservation', dscp: DSCP_NAMES.af31, defaultMbps: 1, rank: 3 },
  { id: 'fois', label: 'FOIS freight', dscp: DSCP_NAMES.af31, defaultMbps: 1, rank: 3 },
  { id: 'cctv', label: 'CCTV video', dscp: DSCP_NAMES.af41, defaultMbps: 4, rank: 4 },
  { id: 'railnet', label: 'Railnet / Internet', dscp: DSCP_NAMES.default, defaultMbps: 10, rank: 5 },
  { id: 'wifi', label: 'Passenger Wi-Fi', dscp: DSCP_NAMES.default, defaultMbps: 20, rank: 5 },
];

export function appClass(id: string): AppClass | undefined {
  return APP_CLASSES.find((a) => a.id === id);
}
