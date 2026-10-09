import type { Topology } from '../model/types';
import { buildTopology } from './builder';

/**
 * Phase 1 demo: two adjacent stations on an STM-1 OFC link, each with a
 * PD-Mux carrying Section Control and Block circuits, plus a small LAN at
 * Station A. Used to explore the editor; full preloaded topologies arrive
 * in Phase 7.
 */
export function demoTwoStation(): Topology {
  return buildTopology(
    'Demo: two-station SDH + LAN',
    'Station A and Station B joined by STM-1 over 2-core OFC. PD-Mux at each station carries Section Control (FXS) and Block (2W) circuits over E1. Station A has a small LAN on the ADM Ethernet port.',
    [
      { key: 'admA', kind: 'adm-stm1', name: 'A-ADM', station: 'A', x: 100, y: 200 },
      { key: 'muxA', kind: 'pdmux', name: 'A-PDMUX', station: 'A', x: 100, y: 380 },
      { key: 'phA', kind: 'control-phone', name: 'A-CTRL-PH', station: 'A', x: -60, y: 540 },
      { key: 'blkA', kind: 'block-instrument', name: 'A-BLOCK', station: 'A', x: 120, y: 560 },
      { key: 'swA', kind: 'l2-switch', name: 'A-SW', station: 'A', x: -180, y: 200 },
      { key: 'pcA', kind: 'pc', name: 'A-SM-PC', station: 'A', x: -360, y: 120 },
      { key: 'utsA', kind: 'uts-prs', name: 'A-UTS', station: 'A', x: -360, y: 290 },
      { key: 'admB', kind: 'adm-stm1', name: 'B-ADM', station: 'B', x: 560, y: 200 },
      { key: 'muxB', kind: 'pdmux', name: 'B-PDMUX', station: 'B', x: 560, y: 380 },
      { key: 'phB', kind: 'control-phone', name: 'B-CTRL-PH', station: 'B', x: 440, y: 560 },
      { key: 'blkB', kind: 'block-instrument', name: 'B-BLOCK', station: 'B', x: 640, y: 560 },
    ],
    [
      { kind: 'ofc', a: ['admA', 'STM1-E'], b: ['admB', 'STM1-W'], lengthKm: 18, label: 'A–B 2-core OFC' },
      { kind: 'e1-copper', a: ['muxA', 'E1-1'], b: ['admA', 'E1-1'] },
      { kind: 'e1-copper', a: ['muxB', 'E1-1'], b: ['admB', 'E1-1'] },
      { kind: 'quad', a: ['muxA', 'FXS-1'], b: ['phA', 'LINE'], label: 'Section Control' },
      { kind: 'quad', a: ['muxB', 'FXS-1'], b: ['phB', 'LINE'], label: 'Section Control' },
      { kind: 'quad', a: ['muxA', '2W-1'], b: ['blkA', 'LINE'], label: 'Block A–B' },
      { kind: 'quad', a: ['muxB', '2W-1'], b: ['blkB', 'LINE'], label: 'Block A–B' },
      { kind: 'cat6', a: ['admA', 'FE-1'], b: ['swA', 'Gi0/24'] },
      { kind: 'cat6', a: ['swA', 'Gi0/1'], b: ['pcA', 'eth0'] },
      { kind: 'cat6', a: ['swA', 'Gi0/2'], b: ['utsA', 'eth0'] },
    ],
  );
}
