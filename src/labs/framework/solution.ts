
import { execIos, newSession } from '../../engine/cli/ios';
import { parseIpv4 } from '../../engine/ip/ipv4';
import type { Sim } from '../../engine/sim';
import { configure, setIf } from '../../engine/testing/fixtures';
import { addLink } from '../../model/topologyOps';
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
  sim.setTopology(t);
  for (const [name, lines] of Object.entries(sol.cli ?? {})) {
    let session = newSession(byName(name).id);
    for (const line of lines) {
      const r = execIos(line, session, { topology: t, sim, simulationMode: false });
      if (/^% |\n% /.test(r.output) && !r.output.startsWith('% Access VLAN does not exist')) errors.push(`${name}: ${line} → ${r.output}`);
      session = r.session;
      if (r.topology) t = r.topology;
    }
  }
  sim.setTopology(t);
  sim.runUntilIdle();
  for (const [src, dst] of sol.pings ?? []) {
    const ip = parseIpv4(dst);
    if (ip === null) throw new Error(`Bad ping target ${dst}`);
    sim.ping(byName(src).id, ip);
    sim.runUntilIdle();
  }
  return { topology: t, errors };
}

/** Readable text of a solution for the "show solution" panel. */
export function solutionText(sol: LabSolution): string {
  const L: string[] = [];
  for (const [a, pa, b, pb] of sol.links ?? []) L.push(`Cable: ${a} ${pa} ↔ ${b} ${pb} (Cat6)`);
  for (const [n, h] of Object.entries(sol.hosts ?? {})) L.push(`${n}: IP ${h.ip} mask ${h.mask}${h.gateway ? ` gateway ${h.gateway}` : ''}`);
  for (const [n, lines] of Object.entries(sol.cli ?? {})) L.push('', `! ${n}`, ...lines);
  for (const [s, d] of sol.pings ?? []) L.push(`${s}> ping ${d}`);
  return L.join('\n').trim();
}


