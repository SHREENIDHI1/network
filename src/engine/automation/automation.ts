import type { Device, Topology } from '../../model/types';
import { execIos, newSession } from '../cli/ios';
import { runningConfig } from '../cli/format';
import { formatIpv4 } from '../ip/ipv4';
import type { Sim } from '../sim';

/**
 * RailMPLS Lab automation (P8): an Ansible-like teaching tool, not a real
 * automation product. A template with {{variables}} is rendered per device,
 * pushed through the same CLI a person would type, and compliance rules
 * (regular expressions over the running-config) report drift.
 */

export const TEMPLATE_VARS = ['hostname', 'station', 'loopback', 'router_id'] as const;

export function templateVars(sim: Sim, d: Device): Record<string, string> {
  const ifs = sim.interfaces(d.id);
  const lo = ifs.find((i) => i.name === 'Loopback0' && i.ip !== undefined);
  const rid = sim.ospf.routerIds.get(d.id);
  return {
    hostname: d.name,
    station: d.station ?? '',
    loopback: lo ? formatIpv4(lo.ip!) : '',
    router_id: rid !== undefined ? formatIpv4(rid) : lo ? formatIpv4(lo.ip!) : '',
  };
}

/** Replaces {{ name }} placeholders; returns the lines and any unknown / empty variable. */
export function renderTemplate(template: string, vars: Record<string, string>): { lines: string[]; errors: string[] } {
  const errors: string[] = [];
  const text = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => {
    if (!(k in vars)) {
      errors.push(`unknown variable {{${k}}}`);
      return '';
    }
    if (!vars[k]) errors.push(`variable {{${k}}} is empty on this device`);
    return vars[k];
  });
  return {
    lines: text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('!') && !l.startsWith('#')),
    errors: [...new Set(errors)],
  };
}

export interface PushResult {
  device: string;
  ok: boolean;
  errors: string[];
}

/** Runs the lines in configuration mode on each device (like the learner would), returning the new topology. */
export function pushConfig(topology: Topology, sim: Sim, targets: Array<{ deviceId: string; lines: string[] }>): { topology: Topology; results: PushResult[] } {
  let t = topology;
  const results: PushResult[] = [];
  for (const tg of targets) {
    const d = t.devices.find((x) => x.id === tg.deviceId);
    if (!d) continue;
    let session = newSession(d.id);
    const errors: string[] = [];
    for (const line of ['enable', 'configure terminal', ...tg.lines, 'end']) {
      const r = execIos(line, session, { topology: t, sim, simulationMode: false });
      if (r.output.split('\n').some((l) => l.startsWith('% '))) errors.push(`${line} → ${r.output.trim().split('\n').pop()}`);
      session = r.session;
      if (r.topology) {
        t = r.topology;
        sim.setTopology(t);
      }
    }
    results.push({ device: d.name, ok: errors.length === 0, errors });
  }
  sim.runUntilIdle();
  return { topology: t, results };
}

export interface ComplianceRow {
  device: string;
  results: Array<{ rule: string; pass: boolean }>;
}

/** Each rule is a regular expression that must match a line of the running-config. Lines starting with "!" mean "must NOT match". */
export function compliance(sim: Sim, deviceIds: string[], rules: string[]): { rows: ComplianceRow[]; errors: string[] } {
  const errors: string[] = [];
  const compiled: Array<{ rule: string; re: RegExp; negate: boolean }> = [];
  for (const raw of rules.map((r) => r.trim()).filter(Boolean)) {
    const negate = raw.startsWith('!');
    const body = negate ? raw.slice(1).trim() : raw;
    try {
      compiled.push({ rule: raw, re: new RegExp(body, 'm'), negate });
    } catch {
      errors.push(`invalid rule: ${raw}`);
    }
  }
  const rows: ComplianceRow[] = [];
  for (const id of deviceIds) {
    const d = sim.device(id);
    const cfg = sim.config(id);
    if (!d || !cfg) continue;
    const text = runningConfig(d, cfg);
    rows.push({ device: d.name, results: compiled.map((c) => ({ rule: c.rule, pass: c.re.test(text) !== c.negate })) });
  }
  return { rows, errors };
}
