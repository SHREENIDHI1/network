import { roleOf, type IsisConfig, type RipConfig } from '../config/netConfig';
import { parseNet } from '../igp/isis';
import * as F from './format';
import * as G from './formatIgp';
import { CONF, EXEC, IFM, ifCfg, iface, ip, kw, num, word, type Cmd, type CliMode, type Exec } from './ios';

/**
 * IS-IS and RIP commands (P3). Returned by a function so ios.ts can append
 * them after its grammar helpers are initialised (circular-import ordering).
 */

const NO = () => kw('no', 'Negate a command or set its defaults');
const ISIS: CliMode[] = ['config-router-isis'];
const RIP: CliMode[] = ['config-router-rip'];
const routerRole = (x: Exec) => ['router', 'l3switch'].includes(roleOf(x.device.kind));
const LEVELS = { 'level-1': 'Act as a station router only', 'level-1-2': 'Act as both a station router and an area router', 'level-2-only': 'Act as an area router only' } as const;

function isis(x: Exec): IsisConfig {
  return x.cfg.isis!;
}
function rip(x: Exec): RipConfig {
  return x.cfg.rip!;
}

function enterIsis(x: Exec, tag?: string): string | void {
  if (!routerRole(x)) return x.invalid();
  if (!x.cfg.isis) {
    x.cfg.isis = { tag, isType: 'level-1-2', passive: [] };
    x.dirty();
  } else if ((x.cfg.isis.tag ?? '') !== (tag ?? '')) return `% RailMPLS Lab supports one IS-IS process per device (tag ${x.cfg.isis.tag ?? 'null'} exists).`;
  x.setMode('config-router-isis');
  if (roleOf(x.device.kind) === 'l3switch' && !x.cfg.ipRouting) return '% IP routing not enabled ("ip routing") — IS-IS will not run until it is.';
}

export function igpCmds(): Cmd[] {
  const showKw = kw('show', 'Show running system information');
  return [
    // ------------------------------------------------------------- IS-IS
    { modes: CONF, toks: [kw('router', 'Enable a routing process'), kw('isis', 'ISO IS-IS')], run: (x) => enterIsis(x) },
    { modes: CONF, toks: [kw('router', 'Enable a routing process'), kw('isis', 'ISO IS-IS'), word('tag', 'ISO routing area tag')], run: (x) => enterIsis(x, String(x.args.tag)) },
    {
      modes: CONF,
      toks: [NO(), kw('router', 'Enable a routing process'), kw('isis', 'ISO IS-IS')],
      run: (x) => {
        delete x.cfg.isis;
        for (const ic of Object.values(x.cfg.interfaces)) delete ic.isisEnabled;
        x.dirty();
      },
    },
    {
      modes: ISIS,
      toks: [kw('net', 'A Network Entity Title for this process (OSI only)'), word('net', 'XX.XXXX. ... .XXX.XX  Network entity title (NET)')],
      run: (x) => {
        const n = String(x.args.net);
        if (!parseNet(n)) return '% Invalid NET. Format: 49.0001.0000.0000.0001.00 (area . 12-hex-digit system ID . 00)';
        isis(x).net = n.toLowerCase();
        x.dirty();
      },
    },
    { modes: ISIS, toks: [NO(), kw('net', 'A Network Entity Title for this process (OSI only)'), word('net', 'Network entity title (NET)')], run: (x) => {
      delete isis(x).net;
      x.dirty();
    } },
    ...(Object.keys(LEVELS) as Array<keyof typeof LEVELS>).map(
      (l): Cmd => ({ modes: ISIS, toks: [kw('is-type', 'IS Level for this routing process (OSI only)'), kw(l, LEVELS[l])], run: (x) => {
        isis(x).isType = l;
        x.dirty();
      } }),
    ),
    { modes: ISIS, toks: [kw('passive-interface', 'Suppress routing updates on an interface'), iface()], run: (x) => {
      const p = isis(x).passive;
      if (!p.includes(String(x.args.if))) p.push(String(x.args.if));
      x.dirty();
    } },
    { modes: ISIS, toks: [NO(), kw('passive-interface', 'Suppress routing updates on an interface'), iface()], run: (x) => {
      isis(x).passive = isis(x).passive.filter((p) => p !== String(x.args.if));
      x.dirty();
    } },
    // interface
    ...[[], [word('tag', 'Routing process tag')]].map(
      (extra): Cmd => ({ modes: IFM, toks: [kw('ip', 'Interface Internet Protocol config commands'), kw('router', 'IP router interface commands'), kw('isis', 'IS-IS Routing for IP'), ...extra], run: (x) => {
        if (!routerRole(x)) return x.invalid();
        ifCfg(x).isisEnabled = true;
        x.dirty();
        if (!x.cfg.isis) return '% IS-IS process is not configured yet ("router isis"); the interface will join when it is.';
      } }),
    ),
    { modes: IFM, toks: [NO(), kw('ip', 'Interface Internet Protocol config commands'), kw('router', 'IP router interface commands'), kw('isis', 'IS-IS Routing for IP')], run: (x) => {
      delete ifCfg(x).isisEnabled;
      x.dirty();
    } },
    { modes: IFM, toks: [kw('isis', 'IS-IS commands'), kw('metric', 'Configure the metric for interface'), num('m', 1, 63, '<1-63> Default metric')], run: (x) => {
      ifCfg(x).isisMetric = Number(x.args.m);
      x.dirty();
    } },
    { modes: IFM, toks: [NO(), kw('isis', 'IS-IS commands'), kw('metric', 'Configure the metric for interface')], run: (x) => {
      delete ifCfg(x).isisMetric;
      x.dirty();
    } },
    ...(Object.keys(LEVELS) as Array<keyof typeof LEVELS>).map(
      (l): Cmd => ({ modes: IFM, toks: [kw('isis', 'IS-IS commands'), kw('circuit-type', 'Configure circuit type for interface'), kw(l, LEVELS[l])], run: (x) => {
        ifCfg(x).isisCircuitType = l;
        x.dirty();
      } }),
    ),
    { modes: EXEC, toks: [showKw, kw('isis', 'IS-IS routing information'), kw('neighbors', 'IS-IS neighbors')], run: (x) => G.showIsisNeighbors(x.ctx.sim, x.device, x.cfg) },
    { modes: EXEC, toks: [showKw, kw('isis', 'IS-IS routing information'), kw('database', 'IS-IS link state database')], run: (x) => G.showIsisDatabase(x.ctx.sim, x.device, x.cfg) },
    { modes: EXEC, toks: [showKw, kw('clns', 'CLNS network information'), kw('neighbors', 'CLNS neighbor adjacencies')], run: (x) => G.showIsisNeighbors(x.ctx.sim, x.device, x.cfg) },

    // --------------------------------------------------------------- RIP
    {
      modes: CONF,
      toks: [kw('router', 'Enable a routing process'), kw('rip', 'Routing Information Protocol (RIP)')],
      run: (x) => {
        if (!routerRole(x)) return x.invalid();
        if (!x.cfg.rip) {
          x.cfg.rip = { version: 1, networks: [], passive: [], autoSummary: false, defaultOriginate: false };
          x.dirty();
        }
        x.setMode('config-router-rip');
      },
    },
    { modes: CONF, toks: [NO(), kw('router', 'Enable a routing process'), kw('rip', 'Routing Information Protocol (RIP)')], run: (x) => {
      delete x.cfg.rip;
      x.dirty();
    } },
    { modes: RIP, toks: [kw('version', 'Set routing protocol version'), num('v', 1, 2, '<1-2> version')], run: (x) => {
      rip(x).version = Number(x.args.v) as 1 | 2;
      x.dirty();
      if (Number(x.args.v) === 1) return '% RailMPLS Lab models RIPv2 only: RIP will not run until "version 2".';
    } },
    ...[false, true].map(
      (neg): Cmd => ({ modes: RIP, toks: [...(neg ? [NO()] : []), kw('network', 'Enable routing on an IP network'), ip('net', 'Network number')], run: (x) => {
        const n = String(x.args.net);
        const r = rip(x);
        r.networks = neg ? r.networks.filter((m) => m !== n) : r.networks.includes(n) ? r.networks : [...r.networks, n];
        x.dirty();
      } }),
    ),
    { modes: RIP, toks: [kw('passive-interface', 'Suppress routing updates on an interface'), iface()], run: (x) => {
      const p = rip(x).passive;
      if (!p.includes(String(x.args.if))) p.push(String(x.args.if));
      x.dirty();
    } },
    { modes: RIP, toks: [NO(), kw('passive-interface', 'Suppress routing updates on an interface'), iface()], run: (x) => {
      rip(x).passive = rip(x).passive.filter((p) => p !== String(x.args.if));
      x.dirty();
    } },
    { modes: RIP, toks: [kw('auto-summary', 'Enable automatic network number summarization')], run: (x) => {
      rip(x).autoSummary = true;
      x.dirty();
      return '% RailMPLS Lab does not model RIP auto-summary; routes stay unsummarised.';
    } },
    { modes: RIP, toks: [NO(), kw('auto-summary', 'Enable automatic network number summarization')], run: (x) => {
      rip(x).autoSummary = false;
      x.dirty();
    } },
    { modes: RIP, toks: [kw('default-information', 'Control distribution of default information'), kw('originate', 'Distribute a default route')], run: (x) => {
      rip(x).defaultOriginate = true;
      x.dirty();
    } },
    { modes: RIP, toks: [NO(), kw('default-information', 'Control distribution of default information'), kw('originate', 'Distribute a default route')], run: (x) => {
      rip(x).defaultOriginate = false;
      x.dirty();
    } },

    // ---------------------------------------------------- route filters
    ...(
      [
        ['connected', 'Connected', (p: string) => p === 'C' || p === 'L'],
        ['static', 'Static routes', (p: string) => p === 'S'],
        ['ospf', 'Open Shortest Path First (OSPF)', (p: string) => p.startsWith('O')],
        ['isis', 'ISO IS-IS', (p: string) => p.startsWith('i ')],
        ['rip', 'Routing Information Protocol (RIP)', (p: string) => p === 'R'],
      ] as const
    ).map(
      ([k, help, f]): Cmd => ({
        modes: EXEC,
        toks: [showKw, kw('ip', 'IP information'), kw('route', 'IP routing table'), kw(k, help)],
        run: (x) => F.showIpRoute(x.ctx.sim, x.device, (r) => f(r.protocol)),
      }),
    ),
  ];
}
