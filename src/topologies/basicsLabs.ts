import type { Topology } from '../model/types';
import { host } from '../engine/testing/fixtures';
import { buildTopology } from './builder';

/**
 * Starting topologies for the foundation labs (A4–A8). Station names follow
 * the Jodhpur division (MTD = Merta Road Jn). Addresses are a teaching plan,
 * not the real NWR/RailTel addressing.
 */

/** L4.1 — three PCs on a hub (PC3 not cabled yet), three PCs on a switch. */
export function hubVsSwitch(): Topology {
  let t = buildTopology(
    'Lab A4: hub vs switch',
    'Left: an old hub with PC1–PC3 (PC3 still needs a cable). Right: a switch with PC4–PC6. Same subnet 10.1.1.0/24, but the two islands are not connected to each other.',
    [
      { key: 'hub', kind: 'hub', name: 'HUB1', x: 120, y: 60 },
      { key: 'p1', kind: 'pc', name: 'PC1', x: 0, y: 260 },
      { key: 'p2', kind: 'pc', name: 'PC2', x: 120, y: 260 },
      { key: 'p3', kind: 'pc', name: 'PC3', x: 240, y: 260 },
      { key: 'sw', kind: 'l2-switch', name: 'SW1', x: 560, y: 60 },
      { key: 'p4', kind: 'pc', name: 'PC4', x: 440, y: 260 },
      { key: 'p5', kind: 'pc', name: 'PC5', x: 560, y: 260 },
      { key: 'p6', kind: 'pc', name: 'PC6', x: 680, y: 260 },
    ],
    [
      { kind: 'cat6', a: ['hub', 'Port1'], b: ['p1', 'eth0'] },
      { kind: 'cat6', a: ['hub', 'Port2'], b: ['p2', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['p4', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['p5', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/3'], b: ['p6', 'eth0'] },
    ],
  );
  for (const [n, i] of [
    ['PC1', 1],
    ['PC2', 2],
    ['PC3', 3],
    ['PC4', 4],
    ['PC5', 5],
    ['PC6', 6],
  ] as const)
    t = host(t, n, `10.1.1.${i}`);
  return t;
}

/** L5.1 — MTD station LAN, no addresses yet. */
export function mtdStationLan(): Topology {
  return buildTopology(
    'Lab A5: MTD station LAN',
    'Merta Road Jn station LAN: one switch, the station router as gateway, two UTS counters, a FOIS terminal and the SM office PC. Nothing is addressed yet.',
    [
      { key: 'r', kind: 'router', name: 'MTD-R1', station: 'MTD', x: 300, y: 0 },
      { key: 'sw', kind: 'l2-switch', name: 'MTD-SW1', station: 'MTD', x: 300, y: 160 },
      { key: 'u1', kind: 'uts-prs', name: 'MTD-UTS1', station: 'MTD', x: 0, y: 340 },
      { key: 'u2', kind: 'uts-prs', name: 'MTD-UTS2', station: 'MTD', x: 200, y: 340 },
      { key: 'f', kind: 'fois', name: 'MTD-FOIS1', station: 'MTD', x: 400, y: 340 },
      { key: 'sm', kind: 'pc', name: 'MTD-SM-PC', station: 'MTD', x: 600, y: 340 },
    ],
    [
      { kind: 'cat6', a: ['r', 'Gi0/0'], b: ['sw', 'Gi0/24'] },
      { kind: 'cat6', a: ['sw', 'Gi0/1'], b: ['u1', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/2'], b: ['u2', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/3'], b: ['f', 'eth0'] },
      { kind: 'cat6', a: ['sw', 'Gi0/4'], b: ['sm', 'eth0'] },
    ],
  );
}

/** L6.1 — one router, three LANs of different sizes (VLSM). */
export function mtdVlsm(): Topology {
  return buildTopology(
    'Lab A6: MTD VLSM plan',
    'MTD station router with three LANs of different sizes: UTS/PRS (20 hosts), CCTV (50 cameras) and management (5 devices). Carve them from the station block 10.52.20.0/24.',
    [
      { key: 'r', kind: 'router', name: 'MTD-R1', station: 'MTD', x: 300, y: 0 },
      { key: 's1', kind: 'l2-switch', name: 'MTD-SW-UTS', station: 'MTD', x: 0, y: 180 },
      { key: 's2', kind: 'l2-switch', name: 'MTD-SW-CCTV', station: 'MTD', x: 300, y: 180 },
      { key: 's3', kind: 'l2-switch', name: 'MTD-SW-MGMT', station: 'MTD', x: 600, y: 180 },
      { key: 'u', kind: 'uts-prs', name: 'MTD-UTS1', station: 'MTD', x: 0, y: 360 },
      { key: 'c', kind: 'cctv', name: 'MTD-CAM1', station: 'MTD', x: 300, y: 360 },
      { key: 'm', kind: 'laptop', name: 'MTD-MGMT-LT', station: 'MTD', x: 600, y: 360 },
    ],
    [
      { kind: 'cat6', a: ['r', 'Gi0/0'], b: ['s1', 'Gi0/24'] },
      { kind: 'cat6', a: ['r', 'Gi0/1'], b: ['s2', 'Gi0/24'] },
      { kind: 'cat6', a: ['r', 'Gi0/2'], b: ['s3', 'Gi0/24'] },
      { kind: 'cat6', a: ['s1', 'Gi0/1'], b: ['u', 'eth0'] },
      { kind: 'cat6', a: ['s2', 'Gi0/1'], b: ['c', 'eth0'] },
      { kind: 'cat6', a: ['s3', 'Gi0/1'], b: ['m', 'eth0'] },
    ],
  );
}

/** L7.1 — two MTD switches joined by one cable; hosts pre-addressed per application. */
export function mtdVlans(): Topology {
  let t = buildTopology(
    'Lab A7: VLANs per application at MTD',
    'Booking-office switch MTD-SW1 and equipment-room switch MTD-SW2 joined by one Cat6 cable (Gi0/24). UTS, PRS and CCTV hosts are already addressed per the VLAN plan; the switches are still factory default (everything in VLAN 1).',
    [
      { key: 's1', kind: 'l2-switch', name: 'MTD-SW1', station: 'MTD', x: 120, y: 0 },
      { key: 's2', kind: 'l2-switch', name: 'MTD-SW2', station: 'MTD', x: 560, y: 0 },
      { key: 'u1', kind: 'uts-prs', name: 'MTD-UTS1', station: 'MTD', x: 0, y: 200 },
      { key: 'p1', kind: 'uts-prs', name: 'MTD-PRS1', station: 'MTD', x: 200, y: 200 },
      { key: 'u2', kind: 'uts-prs', name: 'MTD-UTS2', station: 'MTD', x: 440, y: 200 },
      { key: 'p2', kind: 'uts-prs', name: 'MTD-PRS2', station: 'MTD', x: 600, y: 200 },
      { key: 'c', kind: 'cctv', name: 'MTD-CAM1', station: 'MTD', x: 760, y: 200 },
    ],
    [
      { kind: 'cat6', a: ['s1', 'Gi0/24'], b: ['s2', 'Gi0/24'], label: 'Booking office ↔ equipment room' },
      { kind: 'cat6', a: ['s1', 'Gi0/1'], b: ['u1', 'eth0'] },
      { kind: 'cat6', a: ['s1', 'Gi0/2'], b: ['p1', 'eth0'] },
      { kind: 'cat6', a: ['s2', 'Gi0/1'], b: ['u2', 'eth0'] },
      { kind: 'cat6', a: ['s2', 'Gi0/2'], b: ['p2', 'eth0'] },
      { kind: 'cat6', a: ['s2', 'Gi0/3'], b: ['c', 'eth0'] },
    ],
  );
  t = host(t, 'MTD-UTS1', '10.52.10.11');
  t = host(t, 'MTD-UTS2', '10.52.10.12');
  t = host(t, 'MTD-PRS1', '10.52.20.11');
  t = host(t, 'MTD-PRS2', '10.52.20.12');
  t = host(t, 'MTD-CAM1', '10.52.40.11');
  return t;
}

/** L8.1 — three MTD switches in a triangle, double cable core↔counter. */
export function mtdResilience(): Topology {
  let t = buildTopology(
    'Lab A8: MTD switching resilience',
    'Three switches in a triangle (core, booking counter, platform) for redundancy. Core and counter are joined by two cables (Gi0/23, Gi0/24). Hosts are in VLAN 1, subnet 10.52.10.0/24.',
    [
      { key: 'core', kind: 'l2-switch', name: 'MTD-SW-CORE', station: 'MTD', x: 300, y: 0 },
      { key: 'cnt', kind: 'l2-switch', name: 'MTD-SW-COUNTER', station: 'MTD', x: 0, y: 220 },
      { key: 'plat', kind: 'l2-switch', name: 'MTD-SW-PLAT', station: 'MTD', x: 600, y: 220 },
      { key: 'srv', kind: 'server', name: 'MTD-SRV', station: 'MTD', x: 300, y: -180 },
      { key: 'uts', kind: 'uts-prs', name: 'MTD-UTS1', station: 'MTD', x: 0, y: 420 },
      { key: 'cam', kind: 'cctv', name: 'MTD-CAM1', station: 'MTD', x: 600, y: 420 },
    ],
    [
      { kind: 'cat6', a: ['core', 'Gi0/23'], b: ['cnt', 'Gi0/23'] },
      { kind: 'cat6', a: ['core', 'Gi0/24'], b: ['cnt', 'Gi0/24'] },
      { kind: 'cat6', a: ['core', 'Gi0/22'], b: ['plat', 'Gi0/24'] },
      { kind: 'cat6', a: ['cnt', 'Gi0/22'], b: ['plat', 'Gi0/23'] },
      { kind: 'cat6', a: ['core', 'Gi0/1'], b: ['srv', 'eth0'] },
      { kind: 'cat6', a: ['cnt', 'Gi0/1'], b: ['uts', 'eth0'] },
      { kind: 'cat6', a: ['plat', 'Gi0/1'], b: ['cam', 'eth0'] },
    ],
  );
  t = host(t, 'MTD-SRV', '10.52.10.100');
  t = host(t, 'MTD-UTS1', '10.52.10.11');
  t = host(t, 'MTD-CAM1', '10.52.10.41');
  return t;
}
