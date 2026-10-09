import type { LinkKind } from '../model/types';

export interface LinkStyle {
  stroke: string;
  width: number;
  dash?: string;
}

/** Canvas colours per medium: fibre = amber, CWDM = violet, E1 = green, VF = brown, copper Ethernet = blue. */
export const LINK_STYLES: Record<LinkKind, LinkStyle> = {
  ofc: { stroke: '#f59e0b', width: 3 },
  'cwdm-lambda': { stroke: '#a78bfa', width: 2 },
  'e1-copper': { stroke: '#22c55e', width: 2, dash: '6 3' },
  quad: { stroke: '#b45309', width: 2, dash: '2 3' },
  cat6: { stroke: '#38bdf8', width: 2 },
  'sfp-1g': { stroke: '#2dd4bf', width: 2 },
  'sfp-10g': { stroke: '#2dd4bf', width: 3 },
  'sfp-25g': { stroke: '#14b8a6', width: 3.5 },
  'sfp-100g': { stroke: '#0d9488', width: 4.5 },
};
