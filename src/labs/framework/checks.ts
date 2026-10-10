import { getTemplate } from '../../model/catalog';
import type { Device, DeviceKind, Link, LinkKind } from '../../model/types';
import { getNetConfig } from '../../engine/config/netConfig';
import { cidrsOverlap, parseCidr } from '../../engine/ip/ipv4';
import { MODULES, type EngineModule } from './modules';
import type { AlarmType, Check, CheckResult, PseudowireState, RouteProtocol, SimSnapshot } from './types';

/**
 * Reusable checker helpers. Each helper returns a Check: a pure function of
 * the snapshot. Detail messages say WHAT is missing, never the answer itself
 * (hints do the teaching).
 *
 * Checks that read a section produced by an unbuilt module fail with a
 * "needs module" message. Labs using them are locked in the registry, so a
 * learner never sees these failures in normal use.
 */

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

export const pass = (detail = 'Done.'): CheckResult => ({ pass: true, detail });
export const fail = (detail: string): CheckResult => ({ pass: false, detail });

/** Device selector: a device name, or a kind and/or station code. */
export type DevSel = string | { kind?: DeviceKind; station?: string };

export function describeSel(sel: DevSel): string {
  if (typeof sel === 'string') return sel;
  const kind = sel.kind ? getTemplate(sel.kind).label : 'device';
  return sel.station ? `${kind} at ${sel.station}` : kind;
}

export function resolveDevices(snap: SimSnapshot, sel: DevSel): Device[] {
  if (typeof sel === 'string') return snap.topology.devices.filter((d) => d.name === sel);
  return snap.topology.devices.filter(
    (d) => (!sel.kind || d.kind === sel.kind) && (!sel.station || (d.station ?? '').toUpperCase() === sel.station.toUpperCase()),
  );
}

function needs(module: EngineModule): CheckResult {
  const m = MODULES[module];
  return fail(`This check needs the ${m.label} engine module (Phase ${m.phase}), which is not built yet.`);
}

/** Returns the section or a "needs module" failure. */
function section<K extends keyof SimSnapshot>(snap: SimSnapshot, key: K, module: EngineModule): NonNullable<SimSnapshot[K]> | CheckResult {
  const v = snap[key];
  if (!snap.modules.has(module)) return needs(module);
  if (v === undefined) return fail(`No ${MODULES[module].label} data in this snapshot — run the simulation first.`);
  return v as NonNullable<SimSnapshot[K]>;
}

function isResult(x: unknown): x is CheckResult {
  return typeof x === 'object' && x !== null && 'pass' in x && 'detail' in x && typeof (x as CheckResult).pass === 'boolean';
}

// ---------------------------------------------------------------------------
// Combinators
// ---------------------------------------------------------------------------

/** Passes when every check passes; reports the first failure. */
export function all(...checks: Check[]): Check {
  return (snap) => {
    for (const c of checks) {
      const r = c(snap);
      if (!r.pass) return r;
    }
    return pass();
  };
}

/** Passes when at least one check passes. */
export function any(detail: string, ...checks: Check[]): Check {
  return (snap) => (checks.some((c) => c(snap).pass) ? pass() : fail(detail));
}

/** Inverts a check, with a detail used when the inner check unexpectedly passes. */
export function not(check: Check, detail: string): Check {
  return (snap) => (check(snap).pass ? fail(detail) : pass());
}

// ---------------------------------------------------------------------------
// Topology / physical (built: Phase 1)
// ---------------------------------------------------------------------------

export function hasDevice(kind: DeviceKind, station?: string, min = 1): Check {
  return (snap) => {
    const n = resolveDevices(snap, { kind, station }).length;
    const what = describeSel({ kind, station });
    if (n >= min) return pass();
    return fail(min === 1 ? `No ${what} found.` : `Found ${n} ${what}(s); this task needs more.`);
  };
}

function linksBetween(snap: SimSnapshot, a: DevSel, b: DevSel, kind?: LinkKind): Link[] {
  const as = new Set(resolveDevices(snap, a).map((d) => d.id));
  const bs = new Set(resolveDevices(snap, b).map((d) => d.id));
  return snap.topology.links.filter(
    (l) => (!kind || l.kind === kind) && ((as.has(l.a.deviceId) && bs.has(l.b.deviceId)) || (bs.has(l.a.deviceId) && as.has(l.b.deviceId))),
  );
}

export function linkExists(a: DevSel, b: DevSel, kind?: LinkKind): Check {
  return (snap) => {
    if (!resolveDevices(snap, a).length) return fail(`${describeSel(a)} does not exist.`);
    if (!resolveDevices(snap, b).length) return fail(`${describeSel(b)} does not exist.`);
    return linksBetween(snap, a, b, kind).length
      ? pass()
      : fail(`${describeSel(a)} and ${describeSel(b)} are not connected${kind ? ' with the right link type' : ''}.`);
  };
}

/** Every OFC link between a and b has a healthy optical budget (no LOS/overload; marginal allowed if allowMarginal). */
export function opticalOk(a: DevSel, b: DevSel, allowMarginal = false): Check {
  return (snap) => {
    const optical = section(snap, 'optical', 'physical');
    if (isResult(optical)) return optical;
    const links = linksBetween(snap, a, b, 'ofc');
    if (!links.length) return fail(`No OFC between ${describeSel(a)} and ${describeSel(b)}.`);
    for (const l of links) {
      const st = optical.find((o) => o.linkId === l.id)?.status;
      if (st === 'ok' || (allowMarginal && st === 'marginal')) continue;
      return fail(`OFC ${describeSel(a)}–${describeSel(b)} optical budget is not healthy.`);
    }
    return pass();
  };
}

/** No OFC link anywhere is in LOS or overload. */
export function noOpticalFailures(): Check {
  return (snap) => {
    const optical = section(snap, 'optical', 'physical');
    if (isResult(optical)) return optical;
    const bad = optical.filter((o) => o.status === 'los' || o.status === 'overload').length;
    return bad ? fail(`${bad} optical link(s) fail the power budget.`) : pass();
  };
}

/** Exactly/at most `max` links of a kind (e.g. "no extra fibre added"). */
export function linkCountAtMost(kind: LinkKind, max: number): Check {
  return (snap) => {
    const n = snap.topology.links.filter((l) => l.kind === kind).length;
    return n <= max ? pass() : fail(`There are more ${kind} links than the design allows.`);
  };
}

// ---------------------------------------------------------------------------
// Ethernet (Phase 2)
// ---------------------------------------------------------------------------

function switchport(snap: SimSnapshot, dev: string, port: string) {
  const sp = section(snap, 'switchports', 'ethernet');
  if (isResult(sp)) return sp;
  const p = sp[dev]?.[port];
  return p ?? fail(`${dev} ${port} has no switchport configuration.`);
}

export function vlanOnPort(dev: string, port: string, vlan: number): Check {
  return (snap) => {
    const p = switchport(snap, dev, port);
    if (isResult(p)) return p;
    if (p.mode !== 'access') return fail(`${dev} ${port} is not an access port.`);
    return p.accessVlan === vlan ? pass() : fail(`${dev} ${port} is in the wrong access VLAN.`);
  };
}

export function trunkAllows(dev: string, port: string, vlans: number[]): Check {
  return (snap) => {
    const p = switchport(snap, dev, port);
    if (isResult(p)) return p;
    if (p.mode !== 'trunk') return fail(`${dev} ${port} is not a trunk.`);
    const missing = vlans.filter((v) => !(p.allowedVlans ?? []).includes(v)).length;
    return missing ? fail(`${dev} ${port} trunk is missing ${missing} required VLAN(s).`) : pass();
  };
}

export function nativeVlanIs(dev: string, port: string, vlan: number): Check {
  return (snap) => {
    const p = switchport(snap, dev, port);
    if (isResult(p)) return p;
    return p.mode === 'trunk' && (p.nativeVlan ?? 1) === vlan ? pass() : fail(`${dev} ${port} native VLAN is not as planned.`);
  };
}

export function portSecurityOn(dev: string, port: string, maxMac?: number): Check {
  return (snap) => {
    const p = switchport(snap, dev, port);
    if (isResult(p)) return p;
    if (!p.portSecurity?.enabled) return fail(`Port security is not enabled on ${dev} ${port}.`);
    if (maxMac !== undefined && p.portSecurity.maxMac !== maxMac) return fail(`${dev} ${port} port-security MAC limit is not as required.`);
    if (p.portSecurity.errDisabled) return fail(`${dev} ${port} is err-disabled.`);
    return pass();
  };
}

export function vlanDefined(dev: string, vlan: number): Check {
  return (snap) => {
    const v = section(snap, 'vlans', 'ethernet');
    if (isResult(v)) return v;
    return (v[dev] ?? []).some((x) => x.id === vlan) ? pass() : fail(`${dev} is missing a VLAN from the plan.`);
  };
}

export function stpRootIs(dev: string): Check {
  return (snap) => {
    const s = section(snap, 'stp', 'ethernet');
    if (isResult(s)) return s;
    const b = s[dev];
    if (!b) return fail(`${dev} is not running spanning tree.`);
    if (!b.isRoot) return fail(`${dev} is not the root bridge yet.`);
    return b.priority < 32768 ? pass() : fail(`${dev} is root only by luck (lowest MAC). Make it root on purpose with a lower priority.`);
  };
}

/** Port-channel `po` on `dev` is up with at least `min` bundled (P) members. */
export function etherChannelBundled(dev: string, po: string, min = 2): Check {
  return (snap) => {
    const e = section(snap, 'etherChannels', 'ethernet');
    if (isResult(e)) return e;
    const b = (e[dev] ?? []).find((x) => x.name === po);
    if (!b) return fail(`${dev} has no ${po}.`);
    const bundled = b.members.filter((m) => m.flag === 'P').length;
    if (bundled >= min) return pass();
    const odd = b.members.find((m) => m.flag !== 'P');
    const why = odd ? { I: 'stand-alone (no LACP partner)', s: 'suspended (mismatch)', D: 'down', P: '' }[odd.flag] : 'missing';
    return fail(`${dev} ${po} has ${bundled} bundled member(s); ${odd ? `${odd.port} is ${why}` : 'add more members'}.`);
  };
}

export function noDuplexMismatch(): Check {
  return (snap) => {
    const d = section(snap, 'duplexMismatches', 'ethernet');
    if (isResult(d)) return d;
    return d.length ? fail(`Duplex mismatch still present (${d.length} port end(s)).`) : pass();
  };
}

/** The switch has learned at least `min` MAC addresses. */
export function macLearned(dev: string, min: number): Check {
  return (snap) => {
    const t = section(snap, 'macTables', 'ethernet');
    if (isResult(t)) return t;
    const n = (t[dev] ?? []).length;
    return n >= min ? pass() : fail(`${dev} has learned ${n} MAC address(es) so far.`);
  };
}

// ---------------------------------------------------------------------------
// IP (Phase 2)
// ---------------------------------------------------------------------------

export function ipInSubnet(dev: string, iface: string, subnet: string): Check {
  return (snap) => {
    const ips = section(snap, 'interfaceIps', 'ip');
    if (isResult(ips)) return ips;
    const want = parseCidr(subnet);
    const have = ips.find((i) => i.device === dev && i.iface === iface);
    if (!have) return fail(`${dev} ${iface} has no IP address.`);
    const got = parseCidr(have.address);
    if (!want || !got) return fail(`${dev} ${iface} address is not valid.`);
    return got.network === want.network && got.prefixLen === want.prefixLen ? pass() : fail(`${dev} ${iface} is not in the planned subnet.`);
  };
}

/** No two interfaces (in the same VRF) sit in overlapping subnets on different links — duplicate/overlapping plan check. */
export function noDuplicateIps(): Check {
  return (snap) => {
    const ips = section(snap, 'interfaceIps', 'ip');
    if (isResult(ips)) return ips;
    const seen = new Map<string, string>();
    for (const i of ips) {
      const key = `${i.vrf ?? ''}|${i.address.split('/')[0]}`;
      const prev = seen.get(key);
      if (prev) return fail(`Duplicate IP address found (${prev} and ${i.device} ${i.iface}).`);
      seen.set(key, `${i.device} ${i.iface}`);
    }
    return pass();
  };
}

export function routeExists(dev: string, prefix: string, protocol?: RouteProtocol): Check {
  return (snap) => {
    const rt = section(snap, 'routingTables', 'ip');
    if (isResult(rt)) return rt;
    const want = parseCidr(prefix);
    const hit = (rt[dev] ?? []).find((r) => {
      const c = parseCidr(r.prefix);
      return c && want && c.network === want.network && c.prefixLen === want.prefixLen && (!protocol || r.protocol === protocol);
    });
    return hit ? pass() : fail(`${dev} has no ${protocol ? `${protocol} ` : ''}route to the required network.`);
  };
}

/** The best route on `dev` to `prefix` uses `nextHop` (e.g. after a cost change or a link cut). */
export function routeVia(dev: string, prefix: string, nextHop: string): Check {
  return (snap) => {
    const rt = section(snap, 'routingTables', 'ip');
    if (isResult(rt)) return rt;
    const want = parseCidr(prefix);
    const hits = (rt[dev] ?? []).filter((r) => {
      const c = parseCidr(r.prefix);
      return c && want && c.network === want.network && c.prefixLen === want.prefixLen;
    });
    if (!hits.length) return fail(`${dev} has no route to the required network.`);
    if (hits.some((r) => r.nextHop === nextHop) && hits.length === 1) return pass();
    return fail(
      `${dev} reaches that network via ${hits.map((r) => r.nextHop ?? r.outInterface ?? 'connected').join(' and ')}, not the planned path.`,
    );
  };
}

/** OSPF cost configured on `dev` `iface` ("ip ospf cost N"). */
export function ospfCostIs(dev: string, iface: string, cost: number): Check {
  return (snap) => {
    const d = snap.topology.devices.find((x) => x.name === dev);
    if (!d) return fail(`No device named ${dev}.`);
    const c = getNetConfig(d).interfaces[iface]?.ospfCost;
    return c === cost ? pass() : fail(`OSPF cost on ${dev} ${iface} is ${c ?? 'the default'}, not as planned.`);
  };
}

/** A QoS policy-map is attached to `dev` `iface` in direction `dir` (and the policy exists). */
export function servicePolicyApplied(dev: string, iface: string, dir: 'input' | 'output'): Check {
  return (snap) => {
    const d = snap.topology.devices.find((x) => x.name === dev);
    if (!d) return fail(`No device named ${dev}.`);
    const cfg = getNetConfig(d);
    const name = dir === 'input' ? cfg.interfaces[iface]?.servicePolicyIn : cfg.interfaces[iface]?.servicePolicyOut;
    if (!name) return fail(`No QoS policy is attached ${dir} on ${dev} ${iface}.`);
    return cfg.qos.policyMaps[name] ? pass() : fail(`${dev} ${iface} points to policy-map ${name}, which does not exist.`);
  };
}

/** JSON with sorted keys, so key order does not matter when comparing configs. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

/** Running config of `dev` has been saved ("write memory" / "copy running-config startup-config") and is unchanged since. */
export function configSaved(dev: string): Check {
  return (snap) => {
    const d = snap.topology.devices.find((x) => x.name === dev);
    if (!d) return fail(`No device named ${dev}.`);
    const { startup, ...running } = getNetConfig(d);
    if (!startup) return fail(`${dev} has no startup-config yet — the running config would be lost on reload.`);
    return stable(startup) === stable(running) ? pass() : fail(`${dev} running-config has changes that are not saved to startup-config.`);
  };
}

/** The link between devices a and b has been cut (fibre-cut simulation). */
export function linkCut(a: string, b: string): Check {
  return (snap) => {
    const cuts = snap.cutLinks ?? [];
    return cuts.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
      ? pass()
      : fail(`The ${a}–${b} link has not been cut yet (select the link → Cut).`);
  };
}

export function pingSucceeds(src: string, dst: string, vrf?: string): Check {
  return (snap) => {
    const pings = section(snap, 'pings', 'ip');
    if (isResult(pings)) return pings;
    const r = [...pings].reverse().find((p) => p.src === src && p.dst === dst && (p.vrf ?? undefined) === vrf);
    if (!r) return fail(`No ping from ${src} to the target has been run yet.`);
    return r.success ? pass() : fail(`The last ping from ${src} failed.`);
  };
}

export function gatewayIs(host: string, gateway: string): Check {
  return (snap) => {
    const g = section(snap, 'hostGateways', 'ip');
    if (isResult(g)) return g;
    if (!g[host]) return fail(`${host} has no default gateway.`);
    return g[host] === gateway ? pass() : fail(`${host} default gateway is not the router's address.`);
  };
}

/** Default gateway of `host` is an address of device `router`. */
export function gatewayOnDevice(host: string, router: string): Check {
  return (snap) => {
    const g = section(snap, 'hostGateways', 'ip');
    const ips = section(snap, 'interfaceIps', 'ip');
    if (isResult(g)) return g;
    if (isResult(ips)) return ips;
    if (!g[host]) return fail(`${host} has no default gateway.`);
    return ips.some((i) => i.device === router && i.address.split('/')[0] === g[host])
      ? pass()
      : fail(`${host} default gateway is not an address of ${router}.`);
  };
}

/** The last ping from `src` to any address of device `dst` succeeded. */
export function pingReachesDevice(src: string, dst: string): Check {
  return (snap) => {
    const pings = section(snap, 'pings', 'ip');
    const ips = section(snap, 'interfaceIps', 'ip');
    if (isResult(pings)) return pings;
    if (isResult(ips)) return ips;
    const targets = new Set(ips.filter((i) => i.device === dst).map((i) => i.address.split('/')[0]));
    const r = [...pings].reverse().find((p) => p.src === src && targets.has(p.dst));
    if (!r) return fail(`No ping from ${src} to ${dst} has been run yet.`);
    return r.success ? pass() : fail(`The last ping from ${src} to ${dst} failed.`);
  };
}

/** Smallest prefix that holds `hosts` usable addresses (network + broadcast reserved). */
export function prefixForHosts(hosts: number): number {
  for (let len = 30; len >= 1; len--) if (2 ** (32 - len) - 2 >= hosts) return len;
  return 0;
}

/** Interface address sits inside `block` with the smallest prefix that fits `hosts` (VLSM). */
export function subnetSizedFor(dev: string, iface: string, hosts: number, block: string): Check {
  return (snap) => {
    const ips = section(snap, 'interfaceIps', 'ip');
    if (isResult(ips)) return ips;
    const have = ips.find((i) => i.device === dev && i.iface === iface);
    if (!have) return fail(`${dev} ${iface} has no IP address.`);
    const got = parseCidr(have.address);
    const b = parseCidr(block);
    if (!got || !b) return fail(`${dev} ${iface} address is not valid.`);
    const inside = got.prefixLen >= b.prefixLen && cidrsOverlap(got, b);
    if (!inside) return fail(`${dev} ${iface} is outside the station block.`);
    const want = prefixForHosts(hosts);
    if (got.prefixLen > want) return fail(`${dev} ${iface} subnet is too small for ${hosts} hosts.`);
    if (got.prefixLen < want) return fail(`${dev} ${iface} subnet wastes addresses — a smaller subnet still fits ${hosts} hosts.`);
    return pass();
  };
}

/** No two of the listed interfaces have overlapping subnets. */
export function noOverlap(ifaces: Array<[string, string]>): Check {
  return (snap) => {
    const ips = section(snap, 'interfaceIps', 'ip');
    if (isResult(ips)) return ips;
    const cidrs = ifaces
      .map(([d, i]) => ips.find((x) => x.device === d && x.iface === i))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .map((x) => ({ at: `${x.device} ${x.iface}`, c: parseCidr(x.address)! }));
    for (let i = 0; i < cidrs.length; i++)
      for (let j = i + 1; j < cidrs.length; j++) if (cidrsOverlap(cidrs[i].c, cidrs[j].c)) return fail(`${cidrs[i].at} and ${cidrs[j].at} overlap.`);
    return cidrs.length === ifaces.length ? pass() : fail('Some planned interfaces have no address yet.');
  };
}

// ---------------------------------------------------------------------------
// OSPF / QoS (Phase 3)
// ---------------------------------------------------------------------------

export function ospfNeighborFull(a: string, b: string): Check {
  return (snap) => {
    const nb = section(snap, 'ospfNeighbors', 'ospf');
    if (isResult(nb)) return nb;
    const ab = nb.find((n) => n.device === a && n.neighbor === b);
    const ba = nb.find((n) => n.device === b && n.neighbor === a);
    if (!ab || !ba) return fail(`${a} and ${b} are not OSPF neighbours.`);
    return ab.state === 'FULL' && ba.state === 'FULL' ? pass() : fail(`OSPF adjacency ${a}–${b} is not FULL.`);
  };
}

export function qosClassMapped(dev: string, dscp: number, exp: number): Check {
  return (snap) => {
    const q = section(snap, 'qosMaps', 'qos');
    if (isResult(q)) return q;
    const m = q.find((x) => x.device === dev && x.dscp === dscp);
    if (!m) return fail(`${dev} has no mapping for this DSCP class.`);
    return m.exp === exp ? pass() : fail(`${dev} maps this DSCP class to the wrong EXP/TC value.`);
  };
}

// ---------------------------------------------------------------------------
// PDH / SDH (Phase 4)
// ---------------------------------------------------------------------------

export function timeslotMapped(dev: string, e1: string, timeslot: number, channel: string): Check {
  return (snap) => {
    const ts = section(snap, 'timeslots', 'pdh');
    if (isResult(ts)) return ts;
    if (timeslot === 0 || timeslot === 16) return fail('TS0 and TS16 are reserved.');
    const m = ts.find((t) => t.device === dev && t.e1 === e1 && t.channel === channel);
    if (!m) return fail(`${channel} is not mapped on ${dev} ${e1}.`);
    return m.timeslot === timeslot ? pass() : fail(`${channel} on ${dev} is in a different timeslot than planned.`);
  };
}

/** No channel is mapped into reserved TS0/TS16 anywhere. */
export function noReservedTimeslots(): Check {
  return (snap) => {
    const ts = section(snap, 'timeslots', 'pdh');
    if (isResult(ts)) return ts;
    const bad = ts.filter((t) => t.timeslot === 0 || t.timeslot === 16).length;
    return bad ? fail(`${bad} channel(s) use a reserved timeslot.`) : pass();
  };
}

export function sdhXconnect(dev: string, vc12: string, from: string, to: string): Check {
  return (snap) => {
    const xc = section(snap, 'sdhXconnects', 'sdh');
    if (isResult(xc)) return xc;
    const ok = xc.some((x) => x.device === dev && x.vc12 === vc12 && ((x.from === from && x.to === to) || (x.from === to && x.to === from)));
    return ok ? pass() : fail(`${dev} is missing a required VC-12 cross-connect.`);
  };
}

export function alarmActive(dev: string, type: AlarmType): Check {
  return (snap) => {
    const al = section(snap, 'alarms', 'sdh');
    if (isResult(al)) return al;
    return al.some((a) => a.device === dev && a.type === type) ? pass() : fail(`Expected alarm is not active on ${dev}.`);
  };
}

export function noCriticalAlarms(): Check {
  return (snap) => {
    const al = section(snap, 'alarms', 'sdh');
    if (isResult(al)) return al;
    const n = al.filter((a) => a.severity === 'critical').length;
    return n ? fail(`${n} critical alarm(s) still active.`) : pass();
  };
}

// ---------------------------------------------------------------------------
// MPLS / BGP / L2VPN (Phase 5)
// ---------------------------------------------------------------------------

export function ldpSessionUp(a: string, b: string): Check {
  return (snap) => {
    const nb = section(snap, 'ldpNeighbors', 'mpls');
    if (isResult(nb)) return nb;
    const ok = nb.some((n) => ((n.device === a && n.neighbor === b) || (n.device === b && n.neighbor === a)) && n.state === 'OPERATIONAL');
    return ok ? pass() : fail(`LDP session ${a}–${b} is not operational.`);
  };
}

export function lfibHasLabelFor(dev: string, fec: string): Check {
  return (snap) => {
    const lf = section(snap, 'lfib', 'mpls');
    if (isResult(lf)) return lf;
    return lf.some((e) => e.device === dev && e.fec === fec) ? pass() : fail(`${dev} has no LFIB entry for the required FEC.`);
  };
}

/** The last LSP ping (or trace) from `src` to `fec` reached the egress. */
export function lspPingSucceeds(src: string, fec: string, kind: 'ping' | 'trace' = 'ping'): Check {
  return (snap) => {
    const r = section(snap, 'lspResults', 'mpls');
    if (isResult(r)) return r;
    const last = [...r].reverse().find((x) => x.src === src && x.fec === fec && x.kind === kind);
    if (!last) return fail(`No LSP ${kind === 'ping' ? 'ping' : 'traceroute'} from ${src} to ${fec} has been run yet.`);
    return last.success
      ? pass()
      : fail(`The last LSP ${kind === 'ping' ? 'ping' : 'traceroute'} from ${src} to ${fec} failed (codes ${last.codes}).`);
  };
}

/** The last "ping mpls pseudowire PEER VCID" from `src` succeeded. */
export function pwPingSucceeds(src: string, peer: string, vcId: number): Check {
  return (snap) => {
    const r = section(snap, 'lspResults', 'l2vpn');
    if (isResult(r)) return r;
    const fec = `pseudowire ${peer} ${vcId}`;
    const last = [...r].reverse().find((x) => x.src === src && x.fec === fec);
    if (!last) return fail(`Run "ping mpls pseudowire ${peer} ${vcId}" on ${src} to prove the circuit.`);
    return last.success ? pass() : fail(`The last pseudowire ping from ${src} failed (codes ${last.codes}).`);
  };
}

/** `dev` pushes / swaps a real label (not "No Label", not pop) for `fec`. */
export function labelledPath(dev: string, fec: string): Check {
  return (snap) => {
    const lf = section(snap, 'lfib', 'mpls');
    if (isResult(lf)) return lf;
    return lf.some((e) => e.device === dev && e.fec === fec && (e.action === 'push' || e.action === 'pop'))
      ? pass()
      : fail(`${dev} has no outgoing label for ${fec} (LDP binding from the next hop missing).`);
  };
}

/**
 * PHP: on an LSP path [ingress, ..., penultimate, egress], the penultimate
 * hop must pop the label for the egress FEC (implicit-null advertised).
 */
export function phpOnPenultimate(path: string[], fec: string): Check {
  return (snap) => {
    const lf = section(snap, 'lfib', 'mpls');
    if (isResult(lf)) return lf;
    if (path.length < 3) return fail('PHP needs a path of at least three routers.');
    const pen = path[path.length - 2];
    const e = lf.find((x) => x.device === pen && x.fec === fec);
    if (!e) return fail(`${pen} has no LFIB entry for the FEC.`);
    return e.action === 'pop' ? pass() : fail(`${pen} does not perform penultimate-hop popping.`);
  };
}

/** BGP session from `dev` to `peer` is Established (optionally for an address family, or inside a VRF). */
export function bgpSessionUp(dev: string, peer: string, opts: { af?: 'ipv4' | 'vpnv4'; vrf?: string } = {}): Check {
  return (snap) => {
    const s = section(snap, 'bgpSessions', 'bgp');
    if (isResult(s)) return s;
    const mine = s.filter((x) => x.device === dev && x.peer === peer && (opts.vrf === undefined || x.vrf === opts.vrf));
    if (!mine.length) return fail(`${dev} has no BGP neighbor statement that points at ${peer}${opts.vrf ? ` in VRF ${opts.vrf}` : ''}.`);
    const up = mine.find((x) => x.state === 'Established');
    if (!up) return fail(`BGP session ${dev} → ${peer} is ${mine[0].state}.`);
    if (opts.af && !up.afs.includes(opts.af))
      return fail(`BGP session ${dev} → ${peer} is up, but address family ${opts.af} is not active on both sides.`);
    return pass();
  };
}

/** `dev` has a VRF `vrf` with an RD and at least one import and export RT. */
export function vrfDefined(dev: string, vrf: string): Check {
  return (snap) => {
    const v = section(snap, 'vrfs', 'bgp');
    if (isResult(v)) return v;
    const x = v.find((r) => r.device === dev && r.vrf === vrf);
    if (!x) return fail(`VRF ${vrf} is not defined on ${dev}.`);
    if (!x.rd) return fail(`VRF ${vrf} on ${dev} has no route distinguisher.`);
    return x.importRts.length && x.exportRts.length ? pass() : fail(`VRF ${vrf} on ${dev} is missing import or export route-targets.`);
  };
}

export function vrfHasRoute(dev: string, vrf: string, prefix: string): Check {
  return (snap) => {
    const vr = section(snap, 'vrfRoutes', 'bgp');
    if (isResult(vr)) return vr;
    const want = parseCidr(prefix);
    const ok = vr.some((r) => {
      const c = parseCidr(r.prefix);
      return r.device === dev && r.vrf === vrf && c && want && c.network === want.network && c.prefixLen === want.prefixLen;
    });
    return ok ? pass() : fail(`VRF ${vrf} on ${dev} is missing a required route.`);
  };
}

/** No route of vrfB's connected networks leaks into vrfA on dev (and vice versa). Default routes are ignored. */
export function vrfIsolated(dev: string, vrfA: string, vrfB: string): Check {
  return (snap) => {
    const vr = section(snap, 'vrfRoutes', 'bgp');
    if (isResult(vr)) return vr;
    const connected = (vrf: string) =>
      vr
        .filter((r) => r.vrf === vrf && r.protocol === 'connected')
        .map((r) => parseCidr(r.prefix))
        .filter((c) => c !== null);
    const routesIn = (vrf: string) =>
      vr
        .filter((r) => r.device === dev && r.vrf === vrf)
        .map((r) => parseCidr(r.prefix))
        .filter((c): c is NonNullable<typeof c> => c !== null && c.prefixLen > 0); // a default route (e.g. to a shared firewall) is not a leak
    const leaks = (into: string, from: string) => routesIn(into).some((r) => connected(from).some((c) => cidrsOverlap(r, c)));
    return leaks(vrfA, vrfB) || leaks(vrfB, vrfA) ? fail(`VRFs ${vrfA} and ${vrfB} on ${dev} are not isolated.`) : pass();
  };
}

/** Pseudowire a↔b with this VC ID is UP (optionally of a given type: vpws-eth, vpls, satop, cesopsn). */
export function pwUp(a: string, b: string, vcId: number, type?: PseudowireState['type']): Check {
  return (snap) => {
    const pw = section(snap, 'pseudowires', 'l2vpn');
    if (isResult(pw)) return pw;
    const ps = pw.filter((x) => x.vcId === vcId && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
    if (!ps.length) return fail(`No pseudowire with the required VC ID between ${a} and ${b}.`);
    if (type && !ps.some((p) => p.type === type)) return fail(`Pseudowire ${a}–${b} exists but is not of the required type (${type}).`);
    const down = ps.find((p) => p.status !== 'UP');
    return down ? fail(`Pseudowire ${a}–${b} is down — check "show mpls l2transport vc" on ${a}.`) : pass();
  };
}

// ---------------------------------------------------------------------------
// NMS / services (Phase 6)
// ---------------------------------------------------------------------------

export function serviceUp(name: string): Check {
  return (snap) => {
    const sv = section(snap, 'services', 'nms');
    if (isResult(sv)) return sv;
    const s = sv.find((x) => x.name === name);
    if (!s) return fail(`Service "${name}" is not defined.`);
    return s.status === 'UP' ? pass() : fail(`Service "${name}" is ${s.status}.`);
  };
}

export function allServicesUp(): Check {
  return (snap) => {
    const sv = section(snap, 'services', 'nms');
    if (isResult(sv)) return sv;
    const down = sv.filter((s) => s.status !== 'UP').length;
    return down ? fail(`${down} railway service(s) are not UP.`) : pass();
  };
}

// ---------------------------------------------------------------------------
// Routing protocols / services / security / QoS (Phase 3)
// ---------------------------------------------------------------------------

export function isisAdjacent(a: string, b: string, level?: 1 | 2): Check {
  return (snap) => {
    const adj = section(snap, 'isisAdjacencies', 'ospf');
    if (isResult(adj)) return adj;
    const hit = adj.some((x) => x.device === a && x.neighbor === b && (!level || x.level === level));
    return hit ? pass() : fail(`${a} has no IS-IS${level ? ` level-${level}` : ''} adjacency with ${b}.`);
  };
}

/** The last ping from src to dst FAILED (e.g. an ACL is supposed to block it). */
export function pingFails(src: string, dst: string): Check {
  return (snap) => {
    const pings = section(snap, 'pings', 'ip');
    if (isResult(pings)) return pings;
    const r = [...pings].reverse().find((p) => p.src === src && p.dst === dst);
    if (!r) return fail(`No ping from ${src} to the target has been run yet.`);
    return r.success ? fail(`The last ping from ${src} still succeeds — it should be blocked.`) : pass();
  };
}

export function fhrpActiveIs(protocol: 'hsrp' | 'vrrp', group: number, active: string, vip?: string): Check {
  return (snap) => {
    const g = section(snap, 'fhrpGroups', 'resilience');
    if (isResult(g)) return g;
    const grp = g.find((x) => x.protocol === protocol && x.group === group);
    if (!grp) return fail(`No ${protocol.toUpperCase()} group ${group} is configured.`);
    if (vip && grp.vip !== vip) return fail(`${protocol.toUpperCase()} group ${group} virtual IP is not as planned.`);
    if (grp.members.length < 2) return fail(`${protocol.toUpperCase()} group ${group} has only ${grp.members.length} router — redundancy needs two.`);
    return grp.active === active ? pass() : fail(`${grp.active ?? 'Nobody'} is ${protocol === 'hsrp' ? 'Active' : 'Master'}, not ${active}.`);
  };
}

export function natTranslationFor(dev: string, insideLocal: string): Check {
  return (snap) => {
    const n = section(snap, 'natTranslations', 'services');
    if (isResult(n)) return n;
    return (n[dev] ?? []).some((t) => t.insideLocal === insideLocal)
      ? pass()
      : fail(`${dev} has no NAT translation for that inside host yet (send traffic first).`);
  };
}

export function dhcpBound(host: string): Check {
  return (snap) => {
    const d = section(snap, 'dhcpStates', 'services');
    if (isResult(d)) return d;
    const st = d[host];
    if (!st) return fail(`${host} is not a DHCP client.`);
    return st === 'bound' ? pass() : fail(`${host} DHCP state is "${st}"${st === 'apipa' ? ' (no server answered)' : ''}.`);
  };
}

export function aclApplied(dev: string, iface: string, dir: 'in' | 'out'): Check {
  return (snap) => {
    const b = section(snap, 'aclBindings', 'services');
    if (isResult(b)) return b;
    return b.some((x) => x.device === dev && x.iface === iface && x.dir === dir) ? pass() : fail(`No ACL is applied ${dir} on ${dev} ${iface}.`);
  };
}

export function ntpSynced(dev: string, maxStratum = 15): Check {
  return (snap) => {
    const n = section(snap, 'ntp', 'services');
    if (isResult(n)) return n;
    const s = n[dev];
    if (!s) return fail(`${dev} has no NTP server configured.`);
    if (!s.synced) return fail(`${dev} clock is not synchronised (check reachability of its NTP server, then "show ntp status").`);
    return (s.stratum ?? 16) <= maxStratum ? pass() : fail(`${dev} is synchronised at stratum ${s.stratum}, higher than allowed.`);
  };
}

export function nmsReceived(nms: string, kind: 'syslog' | 'traps', min = 1): Check {
  return (snap) => {
    const i = section(snap, 'nmsInbox', 'services');
    if (isResult(i)) return i;
    const n = i[nms]?.[kind] ?? 0;
    return n >= min ? pass() : fail(`${nms} has received ${n} ${kind === 'syslog' ? 'syslog message(s)' : 'trap(s)'} so far.`);
  };
}

/** vty accepts SSH only, with local usernames, and SSH is enabled. */
export function sshOnly(dev: string): Check {
  return (snap) => {
    const v = section(snap, 'vty', 'services');
    if (isResult(v)) return v;
    const x = v[dev];
    if (!x) return fail(`${dev} has no vty lines.`);
    if (!x.sshEnabled) return fail(`SSH is not enabled on ${dev} (domain name + RSA keys).`);
    if (x.transport !== 'ssh') return fail(`${dev} vty lines still accept other protocols than SSH.`);
    return x.login === 'local' ? pass() : fail(`${dev} vty lines do not use local usernames.`);
  };
}

export function vtyAccessClass(dev: string): Check {
  return (snap) => {
    const v = section(snap, 'vty', 'services');
    if (isResult(v)) return v;
    return v[dev]?.accessClass ? pass() : fail(`${dev} vty lines accept connections from any address.`);
  };
}

/** The last app attempt of `kind` from src to target succeeded (target = device name, or DNS name). */
export function appSucceeds(src: string, kind: 'dns' | 'ntp' | 'ssh' | 'telnet', target: string, resultIncludes?: string): Check {
  return (snap) => {
    const r = section(snap, 'appResults', 'services');
    if (isResult(r)) return r;
    const last = [...r].reverse().find((a) => a.src === src && a.kind === kind && a.target === target);
    if (!last) return fail(`No ${kind.toUpperCase()} attempt from ${src} to ${target} yet.`);
    if (last.status !== 'ok') return fail(`The last ${kind.toUpperCase()} attempt from ${src} failed: ${last.result}`);
    return !resultIncludes || last.result.includes(resultIncludes)
      ? pass()
      : fail(`${kind.toUpperCase()} from ${src} connected, but: ${last.result}`);
  };
}

export function appFails(src: string, kind: 'ssh' | 'telnet', target: string): Check {
  return (snap) => {
    const r = section(snap, 'appResults', 'services');
    if (isResult(r)) return r;
    const last = [...r].reverse().find((a) => a.src === src && a.kind === kind && a.target === target);
    if (!last) return fail(`No ${kind.toUpperCase()} attempt from ${src} to ${target} yet.`);
    return last.status === 'fail' ? pass() : fail(`${kind.toUpperCase()} from ${src} to ${target} still connects — it should be refused.`);
  };
}

/** On `atDevice`'s egress, the flow of `app` from `src` leaves labelled with EXP `exp`. */
export function qosFlowExp(src: string, app: string, atDevice: string, exp: number): Check {
  return (snap) => {
    const q = section(snap, 'qosFlows', 'qos');
    if (isResult(q)) return q;
    const f = q.find((x) => x.src === src && x.app === app);
    if (!f) return fail(`No ${app} traffic flow from ${src} is defined.`);
    const h = (f.hops ?? []).find((x) => x.device === atDevice && x.exp !== undefined);
    if (!h) return fail(`${app} from ${src} does not leave ${atDevice} labelled.`);
    return h.exp === exp ? pass() : fail(`${app} from ${src} leaves ${atDevice} with EXP ${h.exp} (needs ${exp}).`);
  };
}

/** Flow of `app` from `src` passes through (or avoids) `device`. */
export function qosFlowVia(src: string, app: string, device: string, avoid = false): Check {
  return (snap) => {
    const q = section(snap, 'qosFlows', 'qos');
    if (isResult(q)) return q;
    const f = q.find((x) => x.src === src && x.app === app);
    if (!f) return fail(`No ${app} traffic flow from ${src} is defined.`);
    const on = (f.hops ?? []).some((h) => h.device === device);
    return on !== avoid ? pass() : fail(`${app} from ${src} ${avoid ? 'still goes through' : 'does not go through'} ${device}.`);
  };
}

/** TE tunnel `tunnel` headed on `head` is up (optionally through `via`, with ≥ minKbps, FRR state in `frr`). */
export function teTunnelUp(
  head: string,
  tunnel: string,
  o: { via?: string; avoid?: string; minKbps?: number; frr?: Array<'none' | 'ready' | 'active'> } = {},
): Check {
  return (snap) => {
    const te = section(snap, 'teTunnels', 'te');
    if (isResult(te)) return te;
    const t = te.find((x) => x.head === head && x.tunnel === tunnel);
    if (!t) return fail(`${head} has no ${tunnel}.`);
    if (t.state !== 'up') return fail(`${head} ${tunnel} is down — "show mpls traffic-eng tunnels brief" shows why.`);
    if (o.via && !t.path.includes(o.via)) return fail(`${head} ${tunnel} is up but does not go through ${o.via}.`);
    if (o.avoid && t.path.includes(o.avoid)) return fail(`${head} ${tunnel} still goes through ${o.avoid}.`);
    if (o.minKbps !== undefined && t.bandwidthKbps < o.minKbps)
      return fail(`${head} ${tunnel} reserves ${t.bandwidthKbps} kbit/s (needs at least ${o.minKbps}).`);
    if (o.frr && !o.frr.includes(t.frr)) return fail(`${head} ${tunnel}: fast-reroute protection is "${t.frr}" (needs ${o.frr.join(' or ')}).`);
    return pass();
  };
}

/** Flow of app `app` from `src` loses at most `maxLossPct` percent. */
export function qosFlowOk(src: string, app: string, maxLossPct: number): Check {
  return (snap) => {
    const q = section(snap, 'qosFlows', 'qos');
    if (isResult(q)) return q;
    const f = q.find((x) => x.src === src && x.app === app);
    if (!f) return fail(`No ${app} traffic flow from ${src} is defined.`);
    return f.lossPct <= maxLossPct ? pass() : fail(`${app} from ${src} loses ${f.lossPct.toFixed(1)}% (allowed ${maxLossPct}%).`);
  };
}
