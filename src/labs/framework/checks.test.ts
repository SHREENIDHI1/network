import { describe, expect, it } from 'vitest';
import { updateLink } from '../../model/topologyOps';
import { demoTwoStation } from '../../topologies/demoTwoStation';
import * as C from './checks';
import type { EngineModule } from './modules';
import { buildSnapshot } from './snapshot';

const ALL: ReadonlySet<EngineModule> = new Set<EngineModule>([
  'topology',
  'physical',
  'ethernet',
  'ip',
  'ospf',
  'qos',
  'pdh',
  'sdh',
  'mpls',
  'bgp',
  'l2vpn',
  'nms',
]);

describe('topology / physical checks (real engine state)', () => {
  const topo = demoTwoStation();
  const snap = buildSnapshot(topo);

  it('hasDevice by kind and station', () => {
    expect(C.hasDevice('pdmux', 'A')(snap).pass).toBe(true);
    expect(C.hasDevice('pdmux', undefined, 2)(snap).pass).toBe(true);
    const r = C.hasDevice('ler', 'A')(snap);
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/No LER/);
  });

  it('linkExists by name and kind', () => {
    expect(C.linkExists('A-ADM', 'B-ADM', 'ofc')(snap).pass).toBe(true);
    expect(C.linkExists('A-ADM', 'B-ADM', 'cat6')(snap).pass).toBe(false);
    expect(C.linkExists('A-PDMUX', { kind: 'adm-stm1', station: 'A' }, 'e1-copper')(snap).pass).toBe(true);
    expect(C.linkExists('NOPE', 'B-ADM')(snap).detail).toMatch(/does not exist/);
  });

  it('opticalOk reflects the power budget', () => {
    expect(C.opticalOk('A-ADM', 'B-ADM')(snap).pass).toBe(true);
    const ofc = topo.links.find((l) => l.kind === 'ofc')!;
    const longTopo = updateLink(topo, ofc.id, { lengthKm: 120 }).topology;
    const s2 = buildSnapshot(longTopo);
    expect(C.opticalOk('A-ADM', 'B-ADM')(s2).pass).toBe(false);
    expect(C.noOpticalFailures()(s2).pass).toBe(false);
  });

  it('linkCountAtMost', () => {
    expect(C.linkCountAtMost('ofc', 1)(snap).pass).toBe(true);
    expect(C.linkCountAtMost('ofc', 0)(snap).pass).toBe(false);
  });

  it('combinators', () => {
    const yes = C.hasDevice('pdmux');
    const no = C.hasDevice('ler');
    expect(C.all(yes, yes)(snap).pass).toBe(true);
    expect(C.all(yes, no)(snap).pass).toBe(false);
    expect(C.any('none', no, yes)(snap).pass).toBe(true);
    expect(C.not(no, 'should not exist')(snap).pass).toBe(true);
  });
});

describe('module-dependent checks', () => {
  const topo = demoTwoStation();

  it('fail with a "needs module" message when the module is not built', () => {
    const snap = buildSnapshot(topo, {}, new Set<EngineModule>(['topology', 'physical']));
    for (const check of [
      C.vlanOnPort('A-SW', 'Gi0/1', 10),
      C.routeExists('R1', '10.0.0.0/24'),
      C.ospfNeighborFull('R1', 'R2'),
      C.ldpSessionUp('LSR-1', 'LSR-2'),
      C.sdhXconnect('A-ADM', '1-1-1', 'E1-1', 'STM1-E'),
      C.serviceUp('Block A–B'),
    ]) {
      const r = check(snap);
      expect(r.pass).toBe(false);
      expect(r.detail).toMatch(/needs the .* engine module \(Phase \d\), which is not built yet/);
    }
  });

  // Hand-built sections exercise the checker logic against the snapshot contract.
  const snap = buildSnapshot(
    topo,
    {
      switchports: {
        'A-SW': {
          'Gi0/1': { mode: 'access', accessVlan: 10 },
          'Gi0/24': { mode: 'trunk', allowedVlans: [10, 20, 99], nativeVlan: 99 },
          'Gi0/2': { mode: 'access', accessVlan: 10, portSecurity: { enabled: true, maxMac: 1, violation: 'shutdown', errDisabled: false } },
        },
      },
      interfaceIps: [
        { device: 'R1', iface: 'Gi0/0', address: '10.20.1.1/24' },
        { device: 'R2', iface: 'Gi0/0', address: '10.20.1.2/24' },
      ],
      routingTables: { R1: [{ prefix: '10.30.0.0/24', protocol: 'ospf', nextHop: '10.20.1.2' }] },
      pings: [
        { src: 'PC-1', dst: '10.30.0.1', success: false },
        { src: 'PC-1', dst: '10.30.0.1', success: true },
      ],
      ospfNeighbors: [
        { device: 'R1', neighbor: 'R2', state: 'FULL', area: '0' },
        { device: 'R2', neighbor: 'R1', state: 'FULL', area: '0' },
        { device: 'R2', neighbor: 'R3', state: 'EXSTART', area: '0' },
        { device: 'R3', neighbor: 'R2', state: 'EXSTART', area: '0' },
      ],
      qosMaps: [{ device: 'LER-1', dscp: 46, exp: 5 }],
      timeslots: [{ device: 'A-PDMUX', e1: 'E1-1', timeslot: 1, channel: 'Control' }],
      sdhXconnects: [{ device: 'A-ADM', vc12: '1-1-1', from: 'E1-1', to: 'STM1-E' }],
      alarms: [{ device: 'B-ADM', type: 'LOS', severity: 'critical' }],
      ldpNeighbors: [{ device: 'LSR-1', neighbor: 'LSR-2', state: 'OPERATIONAL' }],
      lfib: [
        { device: 'LSR-2', inLabel: 20, fec: '10.255.0.3/32', action: 'pop', nextHop: 'LER-3' },
        { device: 'LSR-1', inLabel: 30, fec: '10.255.0.3/32', action: 'swap', outLabel: 20 },
      ],
      vrfRoutes: [
        { device: 'LER-1', vrf: 'UTS', prefix: '10.1.1.0/24', protocol: 'connected' },
        { device: 'LER-1', vrf: 'FOIS', prefix: '10.2.1.0/24', protocol: 'connected' },
        { device: 'LER-2', vrf: 'UTS', prefix: '10.1.1.0/24', protocol: 'bgp' },
        { device: 'LER-2', vrf: 'FOIS', prefix: '10.1.1.0/24', protocol: 'bgp' }, // leak
      ],
      pseudowires: [{ a: 'LER-1', b: 'LER-2', vcId: 101, type: 'vpws-eth', status: 'UP' }],
      services: [
        { name: 'Block A–B', status: 'UP', carriedBy: 'sdh' },
        { name: 'UTS A', status: 'DOWN', carriedBy: 'ip' },
      ],
    },
    ALL,
  );

  it('ethernet', () => {
    expect(C.vlanOnPort('A-SW', 'Gi0/1', 10)(snap).pass).toBe(true);
    expect(C.vlanOnPort('A-SW', 'Gi0/1', 20)(snap).pass).toBe(false);
    expect(C.trunkAllows('A-SW', 'Gi0/24', [10, 20])(snap).pass).toBe(true);
    const r = C.trunkAllows('A-SW', 'Gi0/24', [10, 30, 40])(snap);
    expect(r.pass).toBe(false);
    expect(r.detail).toMatch(/missing 2/);
    expect(r.detail).not.toMatch(/30|40/); // never reveal the answer
    expect(C.nativeVlanIs('A-SW', 'Gi0/24', 99)(snap).pass).toBe(true);
    expect(C.portSecurityOn('A-SW', 'Gi0/2', 1)(snap).pass).toBe(true);
    expect(C.portSecurityOn('A-SW', 'Gi0/1')(snap).pass).toBe(false);
  });

  it('ip', () => {
    expect(C.ipInSubnet('R1', 'Gi0/0', '10.20.1.0/24')(snap).pass).toBe(true);
    expect(C.ipInSubnet('R1', 'Gi0/0', '10.20.2.0/24')(snap).pass).toBe(false);
    expect(C.noDuplicateIps()(snap).pass).toBe(true);
    expect(C.routeExists('R1', '10.30.0.0/24', 'ospf')(snap).pass).toBe(true);
    expect(C.routeExists('R1', '10.30.0.0/24', 'static')(snap).pass).toBe(false);
    expect(C.pingSucceeds('PC-1', '10.30.0.1')(snap).pass).toBe(true); // latest result wins
  });

  it('ospf / qos', () => {
    expect(C.ospfNeighborFull('R1', 'R2')(snap).pass).toBe(true);
    expect(C.ospfNeighborFull('R2', 'R3')(snap).detail).toMatch(/not FULL/);
    expect(C.qosClassMapped('LER-1', 46, 5)(snap).pass).toBe(true);
    expect(C.qosClassMapped('LER-1', 46, 3)(snap).pass).toBe(false);
  });

  it('pdh / sdh', () => {
    expect(C.timeslotMapped('A-PDMUX', 'E1-1', 1, 'Control')(snap).pass).toBe(true);
    expect(C.timeslotMapped('A-PDMUX', 'E1-1', 16, 'Control')(snap).pass).toBe(false);
    expect(C.noReservedTimeslots()(snap).pass).toBe(true);
    expect(C.sdhXconnect('A-ADM', '1-1-1', 'STM1-E', 'E1-1')(snap).pass).toBe(true);
    expect(C.alarmActive('B-ADM', 'LOS')(snap).pass).toBe(true);
    expect(C.noCriticalAlarms()(snap).pass).toBe(false);
  });

  it('mpls / bgp / l2vpn', () => {
    expect(C.ldpSessionUp('LSR-2', 'LSR-1')(snap).pass).toBe(true);
    expect(C.lfibHasLabelFor('LSR-1', '10.255.0.3/32')(snap).pass).toBe(true);
    expect(C.phpOnPenultimate(['LSR-1', 'LSR-2', 'LER-3'], '10.255.0.3/32')(snap).pass).toBe(true);
    expect(C.phpOnPenultimate(['LER-0', 'LSR-1', 'LSR-2'], '10.255.0.3/32')(snap).pass).toBe(false);
    expect(C.vrfHasRoute('LER-2', 'UTS', '10.1.1.0/24')(snap).pass).toBe(true);
    expect(C.vrfIsolated('LER-1', 'UTS', 'FOIS')(snap).pass).toBe(true);
    expect(C.vrfIsolated('LER-2', 'UTS', 'FOIS')(snap).pass).toBe(false);
    expect(C.pwUp('LER-2', 'LER-1', 101)(snap).pass).toBe(true);
    expect(C.pwUp('LER-1', 'LER-2', 102)(snap).pass).toBe(false);
  });

  it('services', () => {
    expect(C.serviceUp('Block A–B')(snap).pass).toBe(true);
    expect(C.serviceUp('UTS A')(snap).pass).toBe(false);
    expect(C.allServicesUp()(snap).detail).toMatch(/1 railway service/);
  });
});
