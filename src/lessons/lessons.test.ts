import { describe, expect, it } from 'vitest';
import { CURRICULUM, LESSON_LOADERS, isAvailable } from './curriculum';
import { PROGRESS_KEY, exportProgress, importProgress, loadProgress, recordQuiz, saveProgress, type StorageLike } from './progress';
import { encapStages, parseOctet, propagationMs, subtractSteps, toBin8, toHex2, transferSeconds } from './widgetMath';

describe('curriculum', () => {
  it('lists A0–A15 and B0–B15 with unique ids', () => {
    expect(CURRICULUM.filter((c) => c.part === 'A')).toHaveLength(16);
    expect(CURRICULUM.filter((c) => c.part === 'B')).toHaveLength(16);
    expect(new Set(CURRICULUM.map((c) => c.id)).size).toBe(CURRICULUM.length);
  });

  it('every loader belongs to the curriculum', () => {
    for (const id of Object.keys(LESSON_LOADERS)) expect(CURRICULUM.some((c) => c.id === id)).toBe(true);
    expect(isAvailable('A0')).toBe(true);
    expect(['A4', 'A5', 'A6', 'A7', 'A8'].every(isAvailable)).toBe(true);
    expect(['B0', 'B1', 'B2', 'B3', 'B4'].every(isAvailable)).toBe(true);
    expect(['B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14', 'B15'].every(isAvailable)).toBe(true);
    expect(isAvailable('B16')).toBe(false);
  });

  for (const id of Object.keys(LESSON_LOADERS)) {
    it(`${id} loads and is well-formed`, async () => {
      const l = await LESSON_LOADERS[id]();
      expect(l.id).toBe(id);
      expect(l.title).toBe(CURRICULUM.find((c) => c.id === id)!.title);
      expect(l.blocks.length).toBeGreaterThan(3);
      expect(l.flash).toHaveLength(5);
      for (const q of l.flash) {
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThan(q.options.length);
        expect(new Set(q.options).size).toBe(q.options.length);
        expect(q.explanation.length).toBeGreaterThan(5);
      }
      expect(l.glossary.length).toBeGreaterThan(0);
      expect(l.practice.note.length).toBeGreaterThan(0);
      if (l.practice.labId) {
        const { getLab } = await import('../labs/registry');
        expect(getLab(l.practice.labId)?.lessonId, `${id} practice lab`).toBe(id);
      }
      for (const b of l.blocks) if (b.kind === 'table') for (const r of b.rows) expect(r).toHaveLength(b.headers.length);
    });
  }
});

describe('progress', () => {
  const mem = (): StorageLike & { data: Record<string, string> } => {
    const data: Record<string, string> = {};
    return {
      data,
      getItem: (k) => data[k] ?? null,
      setItem: (k, v) => void (data[k] = v),
    };
  };
  const throwing: StorageLike = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };

  it('records attempts, best score and completion at 4/5', () => {
    let p = loadProgress(mem());
    p = recordQuiz(p, 'A0', 3);
    expect(p.lessons.A0).toMatchObject({
      completed: false,
      bestScore: 3,
      attempts: 1,
    });
    p = recordQuiz(p, 'A0', 4);
    p = recordQuiz(p, 'A0', 2);
    expect(p.lessons.A0).toMatchObject({
      completed: true,
      bestScore: 4,
      attempts: 3,
    });
  });

  it('round-trips through storage', () => {
    const s = mem();
    expect(saveProgress(recordQuiz(loadProgress(s), 'A1', 5), s)).toBe(true);
    expect(s.data[PROGRESS_KEY]).toBeDefined();
    expect(loadProgress(s).lessons.A1.completed).toBe(true);
  });

  it('keeps working when storage throws or is corrupt', () => {
    expect(loadProgress(throwing).lessons).toEqual({});
    expect(saveProgress(recordQuiz(loadProgress(throwing), 'A0', 5), throwing)).toBe(false);
    const s = mem();
    s.data[PROGRESS_KEY] = '{not json';
    expect(loadProgress(s).lessons).toEqual({});
  });

  it('exports and imports, rejecting foreign files', () => {
    const p = recordQuiz(loadProgress(mem()), 'A2', 5);
    expect(importProgress(exportProgress(p))?.lessons.A2.completed).toBe(true);
    expect(importProgress('{"format":"other","version":1,"lessons":{}}')).toBeNull();
    expect(importProgress('garbage')).toBeNull();
  });
});

describe('widget maths', () => {
  it('transfer and propagation', () => {
    expect(transferSeconds(125, 'MB', 1, 'Gbps')).toBeCloseTo(1);
    expect(transferSeconds(1, 'MB', 0, 'Mbps')).toBe(Infinity);
    expect(propagationMs(104.11)).toBeCloseTo(0.51, 2);
  });

  it('number conversions', () => {
    expect(parseOctet('11000000', 2)).toBe(192);
    expect(parseOctet('0xFF', 16)).toBe(255);
    expect(parseOctet('256', 10)).toBeNull();
    expect(parseOctet('102', 2)).toBeNull();
    expect(toBin8(5)).toBe('00000101');
    expect(toHex2(10)).toBe('0A');
    expect(
      subtractSteps(200)
        .map((s) => s.bit)
        .join(''),
    ).toBe('11001000');
  });

  it('encapsulation adds an MPLS label only when enabled', () => {
    expect(encapStages(false).some((s) => s.layer.includes('MPLS'))).toBe(false);
    const m = encapStages(true);
    const i = m.findIndex((s) => s.layer.includes('MPLS'));
    expect(m[i - 1].layer).toContain('L3');
    expect(m[i + 1].layer).toContain('L2');
  });
});

describe('P2 widget maths', () => {
  it('hub repeats, switch learns, floods unknown and forwards known', async () => {
    const { forwardFrame } = await import('./widgetMath');
    expect(forwardFrame('hub', 4, {}, 1, 'A', 'C').outPorts).toEqual([2, 3, 4]);
    const s1 = forwardFrame('switch', 4, {}, 1, 'A', 'C');
    expect(s1).toMatchObject({ outPorts: [2, 3, 4], action: 'learn+flood', table: { A: 1 } });
    const s2 = forwardFrame('switch', 4, s1.table, 3, 'C', 'A');
    expect(s2).toMatchObject({ outPorts: [1], action: 'learn+forward' });
    expect(forwardFrame('switch', 4, s2.table, 1, 'A', 'A').action).toBe('filter');
  });

  it('subnet calculator', async () => {
    const { subnetInfo, parsePrefix } = await import('./widgetMath');
    expect(subnetInfo('10.52.20.70', 27)).toMatchObject({
      network: '10.52.20.64',
      broadcast: '10.52.20.95',
      firstHost: '10.52.20.65',
      lastHost: '10.52.20.94',
      usableHosts: 30,
      mask: '255.255.255.224',
      wildcard: '0.0.0.31',
      klass: 'A',
      isPrivate: true,
    });
    expect(subnetInfo('10.0.0.0', 31)?.usableHosts).toBe(2);
    expect(subnetInfo('172.32.0.1', 16)?.isPrivate).toBe(false);
    expect(subnetInfo('300.1.1.1', 24)).toBeNull();
    expect(parsePrefix('10.52.20.0 255.255.255.192')).toEqual({ ip: '10.52.20.0', len: 26 });
    expect(parsePrefix('10.0.0.0 255.0.255.0')).toBeNull();
  });

  it('VLSM planner allocates largest first, aligned, and matches lab L6.1', async () => {
    const { vlsmPlan } = await import('./widgetMath');
    const p = vlsmPlan('10.52.20.0/24', [
      { name: 'UTS', hosts: 20 },
      { name: 'CCTV', hosts: 50 },
      { name: 'MGMT', hosts: 5 },
    ])!;
    expect(p.map((r) => `${r.name} ${r.network}/${r.prefixLen}`)).toEqual(['CCTV 10.52.20.0/26', 'UTS 10.52.20.64/27', 'MGMT 10.52.20.96/29']);
    expect(vlsmPlan('10.0.0.0/28', [{ name: 'big', hosts: 100 }])).toBeNull();
  });

  it('802.1Q tag and root election', async () => {
    const { dot1qTag, electRoot } = await import('./widgetMath');
    expect(dot1qTag(10)?.hex).toBe('81 00 00 0A');
    expect(dot1qTag(40, 5)?.hex).toBe('81 00 A0 28');
    expect(dot1qTag(4095)).toBeNull();
    expect(
      electRoot([
        { name: 'A', priority: 32768, mac: '00aa.0000.0001' },
        { name: 'B', priority: 32768, mac: '0000.0000.0009' },
      ]),
    ).toBe('B');
    expect(
      electRoot([
        { name: 'A', priority: 4096, mac: 'ffff.ffff.ffff' },
        { name: 'B', priority: 32768, mac: '0000.0000.0001' },
      ]),
    ).toBe('A');
    expect(electRoot([{ name: 'A', priority: 100, mac: '0000.0000.0001' }])).toBeNull();
  });
});

describe('P3 widget maths', () => {
  it('longest prefix match, then AD, then metric', async () => {
    const { lpmPick } = await import('./widgetMath3');
    const routes = [
      { prefix: '0.0.0.0/0', via: 'ISP', ad: 1, metric: 0 },
      { prefix: '10.52.0.0/16', via: 'MTD', ad: 110, metric: 20 },
      { prefix: '10.52.10.0/24', via: 'GOTN', ad: 110, metric: 30 },
      { prefix: '10.52.10.0/24', via: 'static', ad: 1, metric: 0 },
    ];
    expect(lpmPick(routes, '10.52.10.5')).toMatchObject({ index: 3 });
    expect(lpmPick(routes, '10.52.99.1')!.index).toBe(1);
    expect(lpmPick(routes, '8.8.8.8')!.index).toBe(0);
    expect(lpmPick(routes.slice(1), '8.8.8.8')).toBeNull();
  });

  it('SPF on the JU–BNO–JWL–AAS ring', async () => {
    const { spf, pathTo } = await import('./widgetMath3');
    const nodes = ['JU', 'BNO', 'JWL', 'AAS'];
    const edges = [
      { a: 'JU', b: 'BNO', cost: 10 },
      { a: 'BNO', b: 'JWL', cost: 10 },
      { a: 'JWL', b: 'AAS', cost: 10 },
      { a: 'AAS', b: 'JU', cost: 40 },
    ];
    const r = spf(nodes, edges, 'JU');
    expect(r.dist.AAS).toBe(30);
    expect(pathTo(r.prev, 'JU', 'AAS')).toEqual(['JU', 'BNO', 'JWL', 'AAS']);
    const cut = spf(
      nodes,
      edges.filter((e) => !(e.a === 'BNO' && e.b === 'JWL')),
      'JU',
    );
    expect(pathTo(cut.prev, 'JU', 'JWL')).toEqual(['JU', 'AAS', 'JWL']);
  });

  it('HSRP election with priority, preempt and tracking', async () => {
    const { hsrpElect } = await import('./widgetMath3');
    const r = [
      { name: 'MTD-R1', priority: 110, up: true, ip: '10.52.10.2' },
      { name: 'MTD-R2', priority: 100, up: true, ip: '10.52.10.3' },
    ];
    expect(hsrpElect(r, true).active).toBe('MTD-R1');
    expect(hsrpElect([{ ...r[0], trackDown: true, decrement: 20 }, r[1]], true).active).toBe('MTD-R2');
    expect(hsrpElect(r, false, 'MTD-R2').active).toBe('MTD-R2'); // no preempt: R2 keeps the role
    expect(hsrpElect([{ ...r[0], up: false }, r[1]], false, 'MTD-R1').active).toBe('MTD-R2');
  });

  it('ACL evaluator uses the engine: first match, implicit deny', async () => {
    const { aclEvaluate } = await import('./widgetMath3');
    const lines = ['deny ip 10.52.10.0 0.0.0.255 10.52.50.0 0.0.0.255', 'permit tcp any host 10.1.1.1 eq 22', 'permit ip any any'];
    expect(aclEvaluate('extended', lines, { protocol: 'icmp', src: '10.52.10.11', dst: '10.52.50.5' })).toMatchObject({ verdict: 'deny', line: 1 });
    expect(aclEvaluate('extended', lines, { protocol: 'tcp', src: '10.52.50.5', dst: '10.1.1.1', dstPort: 22 })).toMatchObject({
      verdict: 'permit',
      line: 2,
    });
    expect(aclEvaluate('extended', lines.slice(0, 2), { protocol: 'udp', src: '1.1.1.1', dst: '2.2.2.2', dstPort: 53 })).toMatchObject({
      verdict: 'deny',
      implicit: true,
    });
    expect(aclEvaluate('standard', ['permit 10.52.0.0 0.0.255.255'], { protocol: 'icmp', src: '10.52.3.3', dst: '1.1.1.1' }).verdict).toBe('permit');
    expect(aclEvaluate('extended', ['allow everything'], { protocol: 'icmp', src: '1.1.1.1', dst: '2.2.2.2' }).error).toBeDefined();
  });

  it('queue simulator: FIFO loses evenly, LLQ protects voice', async () => {
    const { queueSim } = await import('./widgetMath3');
    const flows = [
      { name: 'Voice', rateMbps: 2, dscp: 46 },
      { name: 'CCTV', rateMbps: 18, dscp: 34 },
    ];
    const fifo = queueSim(10, flows, null);
    expect(fifo[0].lossPct).toBeCloseTo(50, 0);
    const llq = queueSim(10, flows, [{ name: 'VOICE', dscp: [46], priorityPercent: 30 }]);
    expect(llq[0].lossPct).toBeCloseTo(0, 5);
    expect(llq[1].deliveredMbps).toBeCloseTo(8, 5);
  });
});

describe('P4 widget maths', () => {
  it('encodes and decodes an MPLS label stack entry', async () => {
    const { encodeLabel, decodeLabel, reservedLabel } = await import('./widgetMath4');
    const r = encodeLabel({ label: 18, tc: 5, s: 1, ttl: 63 });
    if (typeof r === 'string') throw new Error(r);
    expect(r.hex).toBe('0x00012b3f');
    expect(decodeLabel(r.value)).toEqual({ label: 18, tc: 5, s: 1, ttl: 63 });
    expect(encodeLabel({ label: 1 << 20, tc: 0, s: 1, ttl: 1 })).toMatch(/20 bits/);
    expect(reservedLabel(3)).toMatch(/implicit-null/);
    expect(reservedLabel(16)).toBeNull();
  });

  it('LSP walk: PHP pops at the penultimate hop; explicit-null pops at the egress', async () => {
    const { lspWalk } = await import('./widgetMath4');
    const path = ['A', 'B', 'C', 'D'];
    const php = lspWalk(path, { explicitNull: false, propagateTtl: true });
    expect(php[0].action).toMatch(/PUSH/);
    expect(php[1].action).toMatch(/SWAP/);
    expect(php[2].action).toMatch(/POP .*penultimate/);
    expect(php[3].action).toMatch(/plain IP/);
    expect(php[3].ipTtl).toBe(61); // 64 − 3 hops before the egress
    const exp = lspWalk(path, { explicitNull: true, propagateTtl: true });
    expect(exp[2].action).toMatch(/SWAP .* → 0/);
    expect(exp[3].action).toMatch(/POP explicit-null/);
    const pipe = lspWalk(path, { explicitNull: false, propagateTtl: false });
    expect(pipe[0].labelTtl).toBe('255');
    expect(pipe[3].ipTtl).toBe(63); // core hops hidden: only the ingress decremented
  });
});

describe('P5 widget maths', () => {
  it('iBGP sessions: full mesh vs route reflectors', async () => {
    const { ibgpSessions } = await import('./widgetMath5');
    expect(ibgpSessions(150, 2)).toEqual({ fullMesh: 11175, withRr: 297, perClient: 2 });
    expect(ibgpSessions(4, 1)).toEqual({ fullMesh: 6, withRr: 3, perClient: 1 });
    expect(ibgpSessions(1, 1)).toMatch(/at least 2/);
    expect(ibgpSessions(5, 5)).toMatch(/Route reflectors/);
  });

  it('RT matcher: export ∩ import decides who sees what', async () => {
    const { rtImports } = await import('./widgetMath5');
    const r = rtImports([
      { pe: 'JU', vrf: 'NMS-MGMT', exports: ['65000:107'], imports: ['65000:107', '65000:103'] },
      { pe: 'MTD', vrf: 'SCADA', exports: ['65000:103'], imports: ['65000:103', '65000:107'] },
      { pe: 'DNA', vrf: 'UTS', exports: ['65000:100'], imports: ['65000:100'] },
    ]);
    if (typeof r === 'string') throw new Error(r);
    expect(r.map((x) => `${x.from}>${x.into}`).sort()).toEqual(['JU:NMS-MGMT>MTD:SCADA', 'MTD:SCADA>JU:NMS-MGMT']);
    expect(rtImports([{ pe: 'A', vrf: 'X', exports: ['bad'], imports: [] }])).toMatch(/not an RT/);
  });
});

describe('P6 widget maths', () => {
  it('core MTU needed by an Ethernet pseudowire', async () => {
    const { pwCoreMtu } = await import('./widgetMath6');
    expect(pwCoreMtu({ ipMtu: 1500, vlanTagged: false, labels: 2, controlWord: false })).toEqual({ inner: 1514, mpls: 8, total: 1522 });
    expect(pwCoreMtu({ ipMtu: 1500, vlanTagged: true, labels: 2, controlWord: true })).toEqual({ inner: 1518, mpls: 12, total: 1530 });
    expect(pwCoreMtu({ ipMtu: 20, vlanTagged: false, labels: 2, controlWord: false })).toMatch(/68/);
  });

  it('TDM pseudowire packetisation and bandwidth', async () => {
    const { tdmPw } = await import('./widgetMath6');
    expect(tdmPw({ timeslots: 4, framesPerPacket: 8 })).toEqual({
      payloadBytes: 32,
      packetsPerSecond: 1000,
      packetizationMs: 1,
      payloadKbps: 256,
      wireKbps: 496,
    });
    const satop = tdmPw({ timeslots: 'unframed', framesPerPacket: 8 });
    if (typeof satop === 'string') throw new Error(satop);
    expect(satop.payloadKbps).toBe(2048);
    expect(satop.wireKbps).toBeCloseTo(2288);
    expect(tdmPw({ timeslots: 32, framesPerPacket: 8 })).toMatch(/TS0/);
  });
});

describe('P7 widget maths', () => {
  it('DSCP → EXP is IP precedence', async () => {
    const { dscpToExp, expBits } = await import('./widgetMath7');
    expect(dscpToExp(46)).toBe(5);
    expect(dscpToExp(40)).toBe(5);
    expect(dscpToExp(34)).toBe(4);
    expect(expBits(46)).toEqual({ dscp: '101110', exp: '101' });
    expect(dscpToExp(64)).toMatch(/0 – 63/);
  });

  it('CSPF prunes links without enough bandwidth', async () => {
    const { cspf } = await import('./widgetMath7');
    const ring = [
      { a: 'MTD', b: 'PPR', cost: 10, freeMbps: 10000 },
      { a: 'PPR', b: 'JU', cost: 10, freeMbps: 400 },
      { a: 'MTD', b: 'DNA', cost: 10, freeMbps: 10000 },
      { a: 'DNA', b: 'JU', cost: 50, freeMbps: 7500 },
    ];
    expect(cspf(ring, 'MTD', 'JU', 100)?.path).toEqual(['MTD', 'PPR', 'JU']);
    expect(cspf(ring, 'MTD', 'JU', 1000)).toEqual({ path: ['MTD', 'DNA', 'JU'], cost: 60, pruned: ['PPR–JU'] });
    expect(cspf(ring, 'MTD', 'JU', 20000)).toBeNull();
  });
});

describe('P8 widget maths', () => {
  it('alarm layers put the lowest failed layer first', async () => {
    const { alarmLayers } = await import('./widgetMath8');
    expect(alarmLayers('none')).toEqual([]);
    for (const f of ['fibre-cut', 'card', 'power', 'ldp'] as const) {
      const a = alarmLayers(f);
      expect(a[0].layer).toBe('root');
      expect(a[a.length - 1].text).toMatch(/SERVICE-DOWN/);
    }
  });

  it('templates render per device', async () => {
    const { renderForSamples } = await import('./widgetMath8');
    const r = renderForSamples('hostname {{hostname}}\nntp source {{ loopback }}\n{{oops}}');
    expect(r[1]).toEqual({ hostname: 'MTD-LSR', lines: ['hostname MTD-LSR', 'ntp source 10.0.1.13'], errors: ['unknown variable {{oops}}'] });
  });
});

describe('P9 widget maths', () => {
  it('SID index → label inside the SRGB', async () => {
    const { srLabel } = await import('./widgetMath9');
    expect(srLabel(16000, 23999, 4)).toEqual({ label: 16004 });
    expect(srLabel(16000, 23999, 8000)).toHaveProperty('error');
    expect(srLabel(16000, 15000, 1)).toHaveProperty('error');
  });

  it('TI-LFA on the ring matches the engine (lease cost 50 → node-SID DNA + adj-SID)', async () => {
    const { tiLfa, ringEdges, RING_SID } = await import('./widgetMath9');
    const v = tiLfa(ringEdges(50), 'MTD', 'JU', (n) => RING_SID[n])!;
    expect(v.primary).toEqual(['MTD', 'PPR', 'JU']);
    expect(v.post).toEqual(['MTD', 'DNA', 'JU']);
    expect(v.segments).toEqual(['node-SID DNA (16004)', 'adj-SID DNA → JU']);
    expect(tiLfa(ringEdges(20), 'MTD', 'JU', (n) => RING_SID[n])!.segments).toEqual(['node-SID DNA (16004)']);
  });

  it('ticket titles follow the LB15.1 catalog and draws are repeatable', async () => {
    const { GRAND_TICKET_TITLES, drawTickets } = await import('./widgetMath9');
    const { GRAND_TICKETS } = await import('../labs/content/grand');
    expect(GRAND_TICKET_TITLES).toHaveLength(GRAND_TICKETS.length);
    expect(GRAND_TICKETS.length).toBeGreaterThanOrEqual(20);
    expect(drawTickets(42)).toEqual(drawTickets(42));
    expect(new Set(drawTickets(42).map((x) => x.n)).size).toBe(10);
  });
});
