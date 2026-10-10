import { execHost } from '../../engine/cli/host';
import { execIos, newSession } from '../../engine/cli/ios';
import { parseIpv4 } from '../../engine/ip/ipv4';
import type { Sim } from '../../engine/sim';
import { configure, setIf } from '../../engine/testing/fixtures';
import { addLink, updateDevice } from '../../model/topologyOps';
import type { Topology } from '../../model/types';
import type { LabSolution } from './types';

/**
 * Applies a reference solution the way a learner would: cables, host IP
 * settings, CLI lines, then pings (run to completion on `sim`). Returns the
 * resulting topology and every CLI error line, so tests can show what broke.
 */
export function applySolution(topology: Topology, sim: Sim, sol: LabSolution): { topology: Topology; errors: string[] } {
  let t = topology;
  const errors: string[] = [];
  const byName = (n: string) => {
    const d = t.devices.find((x) => x.name === n);
    if (!d) throw new Error(`Solution names unknown device ${n}`);
    return d;
  };
  for (const n of sol.repair ?? []) t = updateDevice(t, byName(n).id, { fault: undefined });
  for (const [a, pa, b, pb] of sol.links ?? []) {
    const res = addLink(t, { kind: 'cat6', a: { deviceId: byName(a).id, portId: pa }, b: { deviceId: byName(b).id, portId: pb } });
    if (!res.ok) errors.push(`link ${a} ${pa} – ${b} ${pb}: ${res.reason}`);
    else t = res.topology;
  }
  for (const [name, h] of Object.entries(sol.hosts ?? {})) {
    t = configure(t, name, (c) => {
      setIf(c, byName(name).ports[0].id, { ip: { address: h.ip, mask: h.mask }, dhcpClient: false });
      if (h.gateway) c.defaultGateway = h.gateway;
      else delete c.defaultGateway;
    });
  }
  for (const [name, pools] of Object.entries(sol.pools ?? {})) {
    t = configure(t, name, (c) => {
      for (const p of pools) c.dhcp.pools[p.name] = { network: p.network, mask: p.mask, defaultRouter: p.gateway, dnsServer: p.dns, leaseDays: 1 };
    });
  }
  sim.setTopology(t);
  for (const [name, lines] of Object.entries(sol.cli ?? {})) {
    let session = newSession(byName(name).id);
    for (const line of lines) {
      const r = execIos(line, session, { topology: t, sim, simulationMode: false });
      if (isCliError(r.output)) errors.push(`${name}: ${line} → ${r.output}`);
      session = r.session;
      if (r.topology) {
        // Like the live UI: every committed command reaches the running simulation.
        t = r.topology;
        sim.setTopology(t);
      }
    }
  }
  sim.setTopology(t);
  sim.runUntilIdle();
  for (const [name, iface] of sol.flaps ?? []) {
    for (const cmd of ['shutdown', 'no shutdown']) {
      let session = newSession(byName(name).id);
      for (const line of ['enable', 'configure terminal', `interface ${iface}`, cmd, 'end']) {
        const r = execIos(line, session, { topology: t, sim, simulationMode: false });
        if (isCliError(r.output)) errors.push(`${name}: ${line} → ${r.output}`);
        session = r.session;
        if (r.topology) t = r.topology;
      }
      sim.setTopology(t);
      sim.runUntilIdle();
    }
  }
  for (const h of sol.renew ?? []) {
    sim.dhcpRenew(byName(h).id);
    sim.runUntilIdle();
  }
  for (const [a, b] of sol.cuts ?? []) {
    const ia = byName(a).id;
    const ib = byName(b).id;
    const l = t.links.find((x) => (x.a.deviceId === ia && x.b.deviceId === ib) || (x.a.deviceId === ib && x.b.deviceId === ia));
    if (!l) throw new Error(`Solution cuts unknown link ${a}–${b}`);
    sim.cutLink(l.id);
    sim.runUntilIdle();
  }
  for (const [src, dst] of sol.pings ?? []) {
    const ip = parseIpv4(dst);
    if (ip === null) throw new Error(`Bad ping target ${dst}`);
    sim.ping(byName(src).id, ip);
    sim.runUntilIdle();
  }
  for (const [kind, list] of [
    ['ping', sol.lsp ?? []],
    ['trace', sol.lspTrace ?? []],
  ] as const) {
    for (const [src, fec] of list) {
      const [net, len] = fec.split('/');
      const n = parseIpv4(net);
      if (n === null) throw new Error(`Bad FEC ${fec}`);
      if (kind === 'ping') sim.lspPing(byName(src).id, n, Number(len));
      else sim.lspTrace(byName(src).id, n, Number(len));
      sim.runUntilIdle();
    }
  }
  for (const [name, lines] of Object.entries(sol.hostCli ?? {})) {
    for (const line of lines) {
      execHost(line, byName(name), { sim, simulationMode: false });
      sim.runUntilIdle();
    }
  }
  return { topology: t, errors };
}

/** Informational "%" lines IOS prints on success. */
const INFO = /^% (Access VLAN does not exist|The key modulus|Generating \d+ bit RSA|OSPF: Reference bandwidth)/;

function isCliError(output: string): boolean {
  return output.split('\n').some((l) => l.startsWith('% ') && !INFO.test(l));
}

/** Readable text of a solution for the "show solution" panel. */
export function solutionText(sol: LabSolution): string {
  const L: string[] = [];
  for (const n of sol.repair ?? []) L.push(`${n}: repair the hardware fault (device properties → Fault injection)`);
  for (const [a, pa, b, pb] of sol.links ?? []) L.push(`Cable: ${a} ${pa} ↔ ${b} ${pb} (Cat6)`);
  for (const [n, h] of Object.entries(sol.hosts ?? {})) L.push(`${n}: IP ${h.ip} mask ${h.mask}${h.gateway ? ` gateway ${h.gateway}` : ''}`);
  for (const [n, lines] of Object.entries(sol.cli ?? {})) L.push('', `! ${n}`, ...lines);
  for (const [n, ps] of Object.entries(sol.pools ?? {}))
    for (const p of ps)
      L.push(`${n}: DHCP pool ${p.name} ${p.network} ${p.mask}${p.gateway ? ` gw ${p.gateway}` : ''}${p.dns ? ` dns ${p.dns}` : ''}`);
  for (const [n, i] of sol.flaps ?? []) L.push(`${n}: interface ${i} → shutdown, then no shutdown`);
  for (const [a, b] of sol.cuts ?? []) L.push(`Cut the fibre ${a} – ${b}`);
  for (const h of sol.renew ?? []) L.push(`${h}> ipconfig /renew`);
  for (const [a, b] of sol.cuts ?? []) L.push(`Cut link ${a} – ${b} (select the link → Cut)`);
  for (const [s, d] of sol.pings ?? []) L.push(`${s}> ping ${d}`);
  for (const [n, f] of sol.lsp ?? []) L.push(`${n}# ping mpls ipv4 ${f}`);
  for (const [n, f] of sol.lspTrace ?? []) L.push(`${n}# traceroute mpls ipv4 ${f}`);
  for (const [n, lines] of Object.entries(sol.hostCli ?? {})) for (const l of lines) L.push(`${n}> ${l}`);
  return L.join('\n').trim();
}
