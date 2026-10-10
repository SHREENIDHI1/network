import { updateDevice } from '../../model/topologyOps';
import type { Device, Topology } from '../../model/types';
import {
  effectivePort,
  getNetConfig,
  isBridgeRole,
  isSubinterface,
  longIfName,
  loopbackId,
  parentOf,
  portChannelId,
  resolveIfName,
  roleOf,
  sviVlan,
  withNetConfig,
  type InterfaceConfig,
  type NetConfig,
} from '../config/netConfig';
import { cidrsOverlap, formatIpv4, maskToPrefix, parseIpv4, validateHostAddress } from '../ip/ipv4';
import type { Sim } from '../sim';
import * as F from './format';
import { phase3Cmds } from './ios3';
import { igpCmds } from './iosIgp';
import { mgmtCmds } from './iosMgmt';
import { mplsCmds } from './iosMpls';
import { bgpCmds } from './iosBgp';
import { l2vpnCmds } from './iosL2vpn';
import { teCmds } from './iosTe';
import { l2Cmds, propagatePortChannel } from './iosL2';

/**
 * Cisco IOS-like CLI (subset) for switches and routers.
 *
 * Supports abbreviations ("sh ip int br", "conf t", "int gi0/1"), "?" help,
 * Tab completion, the "^" invalid-input marker, "do" in config modes, and
 * "no" forms. Commands change the device's NetConfig; the caller stores the
 * returned topology.
 */

export type CliMode =
  | 'user'
  | 'priv'
  | 'config'
  | 'config-if'
  | 'config-subif'
  | 'config-vlan'
  | 'config-router'
  | 'config-router-isis'
  | 'config-router-rip'
  | 'config-line'
  | 'config-std-nacl'
  | 'config-ext-nacl'
  | 'dhcp-config'
  | 'config-cmap'
  | 'config-pmap'
  | 'config-pmap-c'
  | 'config-vrf'
  | 'config-vrf-af'
  | 'config-router-bgp'
  | 'config-router-af'
  | 'config-vfi'
  | 'config-controller'
  | 'config-cem-if'
  | 'config-if-cem'
  | 'config-tunnel'
  | 'config-expl-path';

export interface CliSession {
  deviceId: string;
  mode: CliMode;
  iface?: string;
  /** "interface range": every interface the next interface command applies to. */
  range?: string[];
  vlan?: number;
  /** Name of the ACL / DHCP pool / class-map / policy-map being edited. */
  ctxName?: string;
  /** Class being edited inside a policy-map. */
  pmapClass?: string;
  /** BGP address family being edited: 'ipv4', 'vpnv4' or 'vrf:NAME'. */
  bgpAf?: string;
  /** CEM group being edited under "interface CEMx/y/z" → "cem N". */
  cemGroup?: number;
}

export interface CliContext {
  topology: Topology;
  sim: Sim;
  /** In Simulation mode, ping/traceroute are queued for Step/Play instead of run to completion. */
  simulationMode: boolean;
}

export interface CliResult {
  output: string;
  session: CliSession;
  topology?: Topology;
}

// ---------------------------------------------------------------------------
// Grammar
// ---------------------------------------------------------------------------

export type ParamKind = 'ip' | 'mask' | 'num' | 'word' | 'line' | 'if' | 'vlans';
export type Tok = { k: 'kw'; w: string; help: string } | { k: ParamKind; name: string; help: string; min?: number; max?: number };

export const kw = (w: string, help: string): Tok => ({ k: 'kw', w, help });
export const ip = (name: string, help = 'IP address'): Tok => ({ k: 'ip', name, help });
export const mask = (name: string, help = 'IP subnet mask'): Tok => ({ k: 'mask', name, help });
export const num = (name: string, min: number, max: number, help: string): Tok => ({ k: 'num', name, min, max, help });
export const word = (name: string, help: string): Tok => ({ k: 'word', name, help });
export const line = (name: string, help: string): Tok => ({ k: 'line', name, help });
export const iface = (name = 'if', help = 'Interface name, e.g. GigabitEthernet0/1, Vlan10'): Tok => ({ k: 'if', name, help });
export const vlans = (name = 'vlans', help = 'VLAN IDs of the allowed VLANs, e.g. 10,20,30-32'): Tok => ({ k: 'vlans', name, help });

export type Args = Record<string, string | number | number[]>;

export interface Exec {
  args: Args;
  device: Device;
  cfg: NetConfig;
  session: CliSession;
  ctx: CliContext;
  /** Marks the config as changed. */
  dirty(): void;
  rename(name: string): void;
  setMode(mode: CliMode, extra?: Partial<CliSession>): void;
  invalid(): string;
}

export interface Cmd {
  modes: CliMode[];
  toks: Tok[];
  run: (x: Exec) => string | void;
}

export const EXEC: CliMode[] = ['user', 'priv'];
export const PRIV: CliMode[] = ['priv'];
export const CONF: CliMode[] = ['config'];
export const IFM: CliMode[] = ['config-if', 'config-subif'];
export const ANYCONF: CliMode[] = [
  'config',
  'config-if',
  'config-subif',
  'config-vlan',
  'config-router',
  'config-router-isis',
  'config-router-rip',
  'config-line',
  'config-std-nacl',
  'config-ext-nacl',
  'dhcp-config',
  'config-cmap',
  'config-pmap',
  'config-pmap-c',
  'config-vrf',
  'config-vrf-af',
  'config-router-bgp',
  'config-router-af',
  'config-vfi',
  'config-controller',
  'config-cem-if',
  'config-if-cem',
  'config-tunnel',
  'config-expl-path',
];

const INVALID = "% Invalid input detected at '^' marker.";

export function ifCfg(x: Exec): InterfaceConfig {
  const n = x.session.iface!;
  x.cfg.interfaces[n] ??= {};
  return x.cfg.interfaces[n];
}

const isSwitchport = (x: Exec) => {
  const role = roleOf(x.device.kind);
  const n = x.session.iface!;
  if (isBridgeRole(role) && portChannelId(n) !== null) return true; // only Layer 2 port-channels are simulated
  return isBridgeRole(role) && x.device.ports.some((p) => p.id === n) && effectivePort(role, x.cfg.interfaces[n]).switchport === true;
};

export function needSwitchport(x: Exec): string | undefined {
  if (!isBridgeRole(roleOf(x.device.kind)) || isSubinterface(x.session.iface!) || sviVlan(x.session.iface!) !== null) return x.invalid();
  if (!isSwitchport(x)) return '% Command rejected: interface is a routed port. Use "switchport" first.';
  return undefined;
}

export function pingCmd(x: Exec, kind: 'ping' | 'traceroute', vrf?: string): string {
  const dst = parseIpv4(String(x.args.dst));
  if (dst === null) return '% Unrecognized host or address, or protocol not running.';
  const sim = x.ctx.sim;
  const repeat = typeof x.args.repeat === 'number' ? x.args.repeat : undefined;
  const sid = kind === 'ping' ? sim.ping(x.device.id, dst, { count: repeat, vrf }) : sim.traceroute(x.device.id, dst, { vrf });
  if (x.ctx.simulationMode)
    return `${kind === 'ping' ? 'Ping' : 'Traceroute'} queued (Simulation mode): press Step or Play, then read the Packet Inspector.`;
  sim.runUntilIdle();
  const s = sim.session(sid)!;
  return kind === 'ping' ? F.iosPingOutput(s) : F.iosTraceOutput(s);
}

function setIpAddress(x: Exec): string | void {
  const role = roleOf(x.device.kind);
  const name = x.session.iface!;
  if (isSwitchport(x)) return '% IP addresses may not be configured on L2 links.';
  if (role === 'switch' && sviVlan(name) === null) return x.invalid();
  const address = String(x.args.addr);
  const m = String(x.args.mask);
  const err = validateHostAddress(address, m, loopbackId(name) !== null);
  if (err) return err;
  const len = maskToPrefix(m)!;
  const mine = { network: (parseIpv4(address)! & (len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0)) >>> 0, prefixLen: len };
  for (const [other, oc] of Object.entries(x.cfg.interfaces)) {
    if (other === name || !oc.ip) continue;
    const olen = maskToPrefix(oc.ip.mask);
    const oip = parseIpv4(oc.ip.address);
    if (olen === null || oip === null) continue;
    const theirs = { network: (oip & (olen === 0 ? 0 : (0xffffffff << (32 - olen)) >>> 0)) >>> 0, prefixLen: olen };
    if (cidrsOverlap(mine, theirs)) return `% ${formatIpv4(mine.network)} overlaps with ${longIfName(other)}`;
  }
  ifCfg(x).ip = { address, mask: m };
  x.dirty();
}

function staticRoute(x: Exec, remove: boolean): string | void {
  const prefix = String(x.args.prefix);
  const m = String(x.args.mask);
  const len = maskToPrefix(m);
  const net = parseIpv4(prefix);
  if (len === null || net === null) return '% Inconsistent address and mask';
  if (len < 32 && (net & ~(len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0)) >>> 0) return '% Inconsistent address and mask';
  const nextHop = x.args.nh !== undefined ? String(x.args.nh) : undefined;
  const exitInterface = x.args.exit !== undefined ? String(x.args.exit) : undefined;
  const same = (r: NetConfig['staticRoutes'][number]) =>
    r.prefix === prefix && r.mask === m && (r.nextHop ?? '') === (nextHop ?? '') && (r.exitInterface ?? '') === (exitInterface ?? '');
  if (remove) {
    const before = x.cfg.staticRoutes.length;
    x.cfg.staticRoutes = x.cfg.staticRoutes.filter((r) => !same(r));
    if (x.cfg.staticRoutes.length === before) return '%No matching route to delete';
  } else if (!x.cfg.staticRoutes.some(same)) {
    x.cfg.staticRoutes.push({ prefix, mask: m, nextHop, exitInterface, distance: typeof x.args.ad === 'number' ? x.args.ad : undefined });
  }
  x.dirty();
}

const CMDS: Cmd[] = [
  // ------------------------------------------------------------ exec ----
  { modes: ['user'], toks: [kw('enable', 'Turn on privileged commands')], run: (x) => x.setMode('priv') },
  { modes: PRIV, toks: [kw('disable', 'Turn off privileged commands')], run: (x) => x.setMode('user') },
  { modes: EXEC, toks: [kw('exit', 'Exit from the EXEC')], run: (x) => x.setMode('user') },
  { modes: EXEC, toks: [kw('logout', 'Exit from the EXEC')], run: (x) => x.setMode('user') },
  {
    modes: PRIV,
    toks: [kw('configure', 'Enter configuration mode'), kw('terminal', 'Configure from the terminal')],
    run: (x) => {
      x.setMode('config');
      return 'Enter configuration commands, one per line.  End with CNTL/Z.';
    },
  },
  { modes: EXEC, toks: [kw('ping', 'Send echo messages'), ip('dst', 'Ping destination address')], run: (x) => pingCmd(x, 'ping') },
  {
    modes: EXEC,
    toks: [
      kw('ping', 'Send echo messages'),
      ip('dst', 'Ping destination address'),
      kw('repeat', 'specify repeat count'),
      num('repeat', 1, 100, '<1-100> Repeat count'),
    ],
    run: (x) => pingCmd(x, 'ping'),
  },
  {
    modes: EXEC,
    toks: [kw('traceroute', 'Trace route to destination'), ip('dst', 'Trace route to destination address')],
    run: (x) => pingCmd(x, 'traceroute'),
  },
  { modes: PRIV, toks: [kw('write', 'Write running configuration to memory'), kw('memory', 'Write to NV memory')], run: (x) => saveStartup(x) },
  {
    modes: PRIV,
    toks: [
      kw('copy', 'Copy from one file to another'),
      kw('running-config', 'Copy from current system configuration'),
      kw('startup-config', 'Copy to startup configuration'),
    ],
    run: (x) => saveStartup(x),
  },
  {
    modes: PRIV,
    toks: [
      kw('clear', 'Reset functions'),
      kw('mac', 'MAC forwarding table'),
      kw('address-table', 'MAC forwarding table'),
      kw('dynamic', 'dynamic entry type'),
    ],
    run: (x) => {
      x.ctx.sim.clearMacTable(x.device.id);
    },
  },
  {
    modes: PRIV,
    toks: [kw('clear', 'Reset functions'), kw('arp-cache', 'Clear the entire ARP cache')],
    run: (x) => {
      x.ctx.sim.clearArp(x.device.id);
    },
  },

  // show
  {
    modes: PRIV,
    toks: [kw('show', 'Show running system information'), kw('running-config', 'Current operating configuration')],
    run: (x) => F.runningConfig(x.device, x.cfg),
  },
  {
    modes: PRIV,
    toks: [kw('show', 'Show running system information'), kw('startup-config', 'Contents of startup configuration')],
    run: (x) => (x.cfg.startup ? F.runningConfig(x.device, { ...x.cfg.startup }, 'Using startup configuration') : 'startup-config is not present'),
  },
  {
    modes: EXEC,
    toks: [
      kw('show', 'Show running system information'),
      kw('ip', 'IP information'),
      kw('interface', 'IP interface status and configuration'),
      kw('brief', 'Brief summary of IP status and configuration'),
    ],
    run: (x) => F.showIpIntBrief(x.ctx.sim, x.device),
  },
  {
    modes: EXEC,
    toks: [kw('show', 'Show running system information'), kw('ip', 'IP information'), kw('route', 'IP routing table')],
    run: (x) => F.showIpRoute(x.ctx.sim, x.device),
  },
  {
    modes: EXEC,
    toks: [kw('show', 'Show running system information'), kw('ip', 'IP information'), kw('arp', 'IP ARP table')],
    run: (x) => F.showArp(x.ctx.sim, x.device),
  },
  { modes: EXEC, toks: [kw('show', 'Show running system information'), kw('arp', 'ARP table')], run: (x) => F.showArp(x.ctx.sim, x.device) },
  {
    modes: EXEC,
    toks: [kw('show', 'Show running system information'), kw('interfaces', 'Interface status and configuration'), iface()],
    run: (x) => F.showInterface(x.ctx.sim, x.device, String(x.args.if)),
  },
  {
    modes: EXEC,
    toks: [
      kw('show', 'Show running system information'),
      kw('interfaces', 'Interface status and configuration'),
      kw('trunk', 'Show interface trunk information'),
    ],
    run: (x) => (isBridgeRole(roleOf(x.device.kind)) ? F.showTrunks(x.ctx.sim, x.device) : x.invalid()),
  },
  {
    modes: EXEC,
    toks: [
      kw('show', 'Show running system information'),
      kw('interfaces', 'Interface status and configuration'),
      kw('status', 'Show interface line status'),
    ],
    run: (x) => (isBridgeRole(roleOf(x.device.kind)) ? F.showInterfacesStatus(x.ctx.sim, x.device) : x.invalid()),
  },
  {
    modes: EXEC,
    toks: [kw('show', 'Show running system information'), kw('vlan', 'VTP VLAN status'), kw('brief', 'VTP all VLAN status in brief')],
    run: (x) => (isBridgeRole(roleOf(x.device.kind)) ? F.showVlanBrief(x.ctx.sim, x.device) : x.invalid()),
  },
  {
    modes: EXEC,
    toks: [kw('show', 'Show running system information'), kw('vlan', 'VTP VLAN status')],
    run: (x) => (isBridgeRole(roleOf(x.device.kind)) ? F.showVlanBrief(x.ctx.sim, x.device) : x.invalid()),
  },
  {
    modes: EXEC,
    toks: [kw('show', 'Show running system information'), kw('mac', 'MAC configuration'), kw('address-table', 'MAC forwarding table')],
    run: (x) => (isBridgeRole(roleOf(x.device.kind)) ? F.showMacTable(x.ctx.sim, x.device) : x.invalid()),
  },
  {
    modes: EXEC,
    toks: [kw('show', 'Show running system information'), kw('spanning-tree', 'Spanning tree topology')],
    run: (x) => F.showSpanningTree(x.ctx.sim, x.device),
  },
  {
    modes: EXEC,
    toks: [kw('show', 'Show running system information'), kw('port-security', 'Show secure port information')],
    run: (x) => (isBridgeRole(roleOf(x.device.kind)) ? F.showPortSecurity(x.ctx.sim, x.device) : x.invalid()),
  },
  {
    modes: EXEC,
    toks: [
      kw('show', 'Show running system information'),
      kw('port-security', 'Show secure port information'),
      kw('interface', 'Show secure interface'),
      iface(),
    ],
    run: (x) => (isBridgeRole(roleOf(x.device.kind)) ? F.showPortSecurity(x.ctx.sim, x.device, String(x.args.if)) : x.invalid()),
  },

  // ---------------------------------------------------------- global ----
  { modes: ANYCONF, toks: [kw('end', 'Exit from configure mode')], run: (x) => x.setMode('priv') },
  {
    modes: ANYCONF,
    toks: [kw('exit', 'Exit from current mode')],
    run: (x) =>
      x.session.mode === 'config'
        ? x.setMode('priv')
        : x.session.mode === 'config-pmap-c'
          ? x.setMode('config-pmap', { ctxName: x.session.ctxName })
          : x.session.mode === 'config-vrf-af'
            ? x.setMode('config-vrf', { ctxName: x.session.ctxName })
            : x.session.mode === 'config-router-af'
              ? x.setMode('config-router-bgp')
              : x.session.mode === 'config-if-cem'
                ? x.setMode('config-cem-if', { ctxName: x.session.ctxName })
                : x.setMode('config'),
  },
  {
    modes: CONF,
    toks: [kw('hostname', "Set system's network name"), word('name', "This system's network name")],
    run: (x) => {
      const n = String(x.args.name);
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(n)) return '% Hostname must start with a letter and contain only letters, digits, - or _';
      x.rename(n);
    },
  },
  { modes: ANYCONF, toks: [kw('interface', 'Select an interface to configure'), iface()], run: (x) => enterInterface(x) },
  {
    modes: ANYCONF,
    toks: [
      kw('interface', 'Select an interface to configure'),
      kw('range', 'interface range command'),
      line('spec', 'Interfaces, e.g. gi0/1 - 4 , gi0/23 - 24'),
    ],
    run: (x) => enterRange(x),
  },
  {
    modes: ['config', 'config-vlan'],
    toks: [kw('vlan', 'VLAN commands'), num('id', 1, 4094, '<1-4094> ISL VLAN IDs 1-1005')],
    run: (x) => {
      if (!isBridgeRole(roleOf(x.device.kind))) return x.invalid();
      const id = Number(x.args.id);
      if (!x.cfg.vlans[String(id)]) {
        x.cfg.vlans[String(id)] = { name: `VLAN${String(id).padStart(4, '0')}` };
        x.dirty();
      }
      x.setMode('config-vlan', { vlan: id });
    },
  },
  {
    modes: CONF,
    toks: [kw('no', 'Negate a command or set its defaults'), kw('vlan', 'VLAN commands'), num('id', 1, 4094, '<1-4094> VLAN ID')],
    run: (x) => {
      if (!isBridgeRole(roleOf(x.device.kind))) return x.invalid();
      const id = Number(x.args.id);
      if (id === 1) return '%Default VLAN 1 may not be deleted.';
      delete x.cfg.vlans[String(id)];
      x.dirty();
    },
  },
  {
    modes: ['config-vlan'],
    toks: [kw('name', 'Ascii name of the VLAN'), word('name', 'The ascii name for the VLAN')],
    run: (x) => {
      x.cfg.vlans[String(x.session.vlan)] = { name: String(x.args.name).slice(0, 32) };
      x.dirty();
    },
  },
  {
    modes: CONF,
    toks: [kw('ip', 'Global IP configuration subcommands'), kw('routing', 'Enable IP routing')],
    run: (x) => {
      if (roleOf(x.device.kind) === 'switch') return x.invalid();
      x.cfg.ipRouting = true;
      x.dirty();
    },
  },
  {
    modes: CONF,
    toks: [kw('no', 'Negate a command or set its defaults'), kw('ip', 'Global IP configuration subcommands'), kw('routing', 'Enable IP routing')],
    run: (x) => {
      if (roleOf(x.device.kind) === 'switch') return x.invalid();
      x.cfg.ipRouting = false;
      x.dirty();
    },
  },
  ...(['add', 'remove'] as const).flatMap((op) => {
    const lead = op === 'remove' ? [kw('no', 'Negate a command or set its defaults')] : [];
    const base = [
      ...lead,
      kw('ip', 'Global IP configuration subcommands'),
      kw('route', 'Establish static routes'),
      ip('prefix', 'Destination prefix'),
      mask('mask', 'Destination prefix mask'),
    ];
    return [
      { modes: CONF, toks: [...base, ip('nh', "Forwarding router's address")], run: (x: Exec) => staticRoute(x, op === 'remove') },
      {
        modes: CONF,
        toks: [...base, ip('nh', "Forwarding router's address"), num('ad', 1, 255, '<1-255> Distance metric for this route')],
        run: (x: Exec) => staticRoute(x, op === 'remove'),
      },
      { modes: CONF, toks: [...base, iface('exit', 'Outgoing interface')], run: (x: Exec) => staticRoute(x, op === 'remove') },
      {
        modes: CONF,
        toks: [...base, iface('exit', 'Outgoing interface'), ip('nh', "Forwarding router's address")],
        run: (x: Exec) => staticRoute(x, op === 'remove'),
      },
    ] satisfies Cmd[];
  }),
  {
    modes: CONF,
    toks: [
      kw('ip', 'Global IP configuration subcommands'),
      kw('default-gateway', 'Specify default gateway (if not routing IP)'),
      ip('gw', 'IP address of default gateway'),
    ],
    run: (x) => {
      x.cfg.defaultGateway = String(x.args.gw);
      x.dirty();
    },
  },
  {
    modes: CONF,
    toks: [
      kw('no', 'Negate a command or set its defaults'),
      kw('ip', 'Global IP configuration subcommands'),
      kw('default-gateway', 'Specify default gateway (if not routing IP)'),
    ],
    run: (x) => {
      delete x.cfg.defaultGateway;
      x.dirty();
    },
  },
  {
    modes: CONF,
    toks: [
      kw('spanning-tree', 'Spanning Tree Subsystem'),
      kw('vlan', 'VLAN Switch Spanning Tree'),
      vlans('vl', 'Spanning tree VLAN id(s)'),
      kw('priority', 'Set the bridge priority for the spanning tree'),
      num('prio', 0, 61440, '<0-61440> bridge priority in increments of 4096'),
    ],
    run: (x) => stpPriority(x),
  },
  {
    modes: CONF,
    toks: [
      kw('spanning-tree', 'Spanning Tree Subsystem'),
      kw('mst', 'Multiple spanning tree configuration'),
      num('inst', 0, 0, '<0> MST instance'),
      kw('priority', 'Set the bridge priority'),
      num('prio', 0, 61440, '<0-61440> bridge priority in increments of 4096'),
    ],
    run: (x) => stpPriority(x),
  },
  {
    modes: CONF,
    toks: [
      kw('no', 'Negate a command or set its defaults'),
      kw('spanning-tree', 'Spanning Tree Subsystem'),
      kw('vlan', 'VLAN Switch Spanning Tree'),
      vlans('vl', 'Spanning tree VLAN id(s)'),
      kw('priority', 'Set the bridge priority'),
    ],
    run: (x) => {
      if (!isBridgeRole(roleOf(x.device.kind))) return x.invalid();
      x.cfg.stpPriority = 32768;
      x.dirty();
    },
  },
  {
    modes: ANYCONF,
    toks: [kw('do', 'To run exec commands in config mode'), line('cmd', 'Exec Command')],
    run: (x) => {
      const r = execIos(String(x.args.cmd), { ...x.session, mode: 'priv' }, x.ctx);
      return r.output;
    },
  },

  // ------------------------------------------------------- interface ----
  {
    modes: IFM,
    toks: [kw('description', 'Interface specific description'), line('text', 'Up to 240 characters describing this interface')],
    run: (x) => {
      ifCfg(x).description = String(x.args.text).slice(0, 240);
      x.dirty();
    },
  },
  {
    modes: IFM,
    toks: [kw('no', 'Negate a command or set its defaults'), kw('description', 'Interface specific description')],
    run: (x) => {
      delete ifCfg(x).description;
      x.dirty();
    },
  },
  {
    modes: IFM,
    toks: [kw('shutdown', 'Shutdown the selected interface')],
    run: (x) => {
      ifCfg(x).shutdown = true;
      x.dirty();
    },
  },
  {
    modes: IFM,
    toks: [kw('no', 'Negate a command or set its defaults'), kw('shutdown', 'Shutdown the selected interface')],
    run: (x) => {
      ifCfg(x).shutdown = false;
      x.dirty();
    },
  },
  {
    modes: IFM,
    toks: [
      kw('ip', 'Interface Internet Protocol config commands'),
      kw('address', 'Set the IP address of an interface'),
      ip('addr', 'IP address'),
      mask('mask', 'IP subnet mask'),
    ],
    run: (x) => setIpAddress(x),
  },
  {
    modes: IFM,
    toks: [
      kw('no', 'Negate a command or set its defaults'),
      kw('ip', 'Interface Internet Protocol config commands'),
      kw('address', 'Set the IP address of an interface'),
    ],
    run: (x) => {
      delete ifCfg(x).ip;
      x.dirty();
    },
  },
  {
    modes: ['config-subif'],
    toks: [
      kw('encapsulation', 'Set encapsulation type for an interface'),
      kw('dot1q', 'IEEE 802.1Q Virtual LAN'),
      num('vlan', 1, 4094, '<1-4094> IEEE 802.1Q VLAN ID'),
    ],
    run: (x) => encap(x, false),
  },
  {
    modes: ['config-subif'],
    toks: [
      kw('encapsulation', 'Set encapsulation type for an interface'),
      kw('dot1q', 'IEEE 802.1Q Virtual LAN'),
      num('vlan', 1, 4094, '<1-4094> IEEE 802.1Q VLAN ID'),
      kw('native', 'Make this as native vlan'),
    ],
    run: (x) => encap(x, true),
  },
  {
    modes: ['config-if'],
    toks: [kw('switchport', 'Set switching mode characteristics')],
    run: (x) => {
      if (roleOf(x.device.kind) !== 'l3switch' || !x.device.ports.some((p) => p.id === x.session.iface)) return x.invalid();
      const c = ifCfg(x);
      c.switchport = true;
      delete c.ip;
      x.dirty();
    },
  },
  {
    modes: ['config-if'],
    toks: [kw('no', 'Negate a command or set its defaults'), kw('switchport', 'Set switching mode characteristics')],
    run: (x) => {
      if (roleOf(x.device.kind) !== 'l3switch' || !x.device.ports.some((p) => p.id === x.session.iface)) return x.invalid();
      ifCfg(x).switchport = false;
      x.dirty();
    },
  },
  {
    modes: ['config-if'],
    toks: [
      kw('switchport', 'Set switching mode characteristics'),
      kw('mode', 'Set trunking mode of the interface'),
      kw('access', 'Set trunking mode to ACCESS unconditionally'),
    ],
    run: (x) => {
      const e = needSwitchport(x);
      if (e) return e;
      ifCfg(x).mode = 'access';
      x.dirty();
    },
  },
  {
    modes: ['config-if'],
    toks: [
      kw('switchport', 'Set switching mode characteristics'),
      kw('mode', 'Set trunking mode of the interface'),
      kw('trunk', 'Set trunking mode to TRUNK unconditionally'),
    ],
    run: (x) => {
      const e = needSwitchport(x);
      if (e) return e;
      ifCfg(x).mode = 'trunk';
      x.dirty();
    },
  },
  {
    modes: ['config-if'],
    toks: [
      kw('switchport', 'Set switching mode characteristics'),
      kw('access', 'Set access mode characteristics of the interface'),
      kw('vlan', 'Set VLAN when interface is in access mode'),
      num('vlan', 1, 4094, '<1-4094> VLAN ID of the VLAN when this port is in access mode'),
    ],
    run: (x) => {
      const e = needSwitchport(x);
      if (e) return e;
      const id = Number(x.args.vlan);
      ifCfg(x).accessVlan = id;
      x.dirty();
      // IOS creates the VLAN automatically when assigning an access port to it.
      if (!x.cfg.vlans[String(id)]) {
        x.cfg.vlans[String(id)] = { name: `VLAN${String(id).padStart(4, '0')}` };
        return `% Access VLAN does not exist. Creating vlan ${id}`;
      }
    },
  },
  {
    modes: ['config-if'],
    toks: [
      kw('switchport', 'Set switching mode characteristics'),
      kw('trunk', 'Set trunking characteristics of the interface'),
      kw('native', 'Set trunking native characteristics'),
      kw('vlan', 'Set native VLAN'),
      num('vlan', 1, 4094, '<1-4094> VLAN ID of the native VLAN'),
    ],
    run: (x) => {
      const e = needSwitchport(x);
      if (e) return e;
      ifCfg(x).nativeVlan = Number(x.args.vlan);
      x.dirty();
    },
  },
  {
    modes: ['config-if'],
    toks: [
      kw('no', 'Negate a command or set its defaults'),
      kw('switchport', 'Set switching mode characteristics'),
      kw('trunk', 'Set trunking characteristics of the interface'),
      kw('native', 'Set trunking native characteristics'),
      kw('vlan', 'Set native VLAN'),
    ],
    run: (x) => {
      const e = needSwitchport(x);
      if (e) return e;
      delete ifCfg(x).nativeVlan;
      x.dirty();
    },
  },
  {
    modes: ['config-if'],
    toks: [
      kw('switchport', 'Set switching mode characteristics'),
      kw('trunk', 'Set trunking characteristics of the interface'),
      kw('allowed', 'Set allowed VLAN characteristics when interface is in trunking mode'),
      kw('vlan', 'Set allowed VLANs when interface is in trunking mode'),
      vlans(),
    ],
    run: (x) => trunkAllowed(x, 'set'),
  },
  {
    modes: ['config-if'],
    toks: [
      kw('switchport', 'Set switching mode characteristics'),
      kw('trunk', 'Set trunking characteristics of the interface'),
      kw('allowed', 'Set allowed VLAN characteristics when interface is in trunking mode'),
      kw('vlan', 'Set allowed VLANs when interface is in trunking mode'),
      kw('add', 'add VLANs to the current list'),
      vlans(),
    ],
    run: (x) => trunkAllowed(x, 'add'),
  },
  {
    modes: ['config-if'],
    toks: [
      kw('switchport', 'Set switching mode characteristics'),
      kw('trunk', 'Set trunking characteristics of the interface'),
      kw('allowed', 'Set allowed VLAN characteristics when interface is in trunking mode'),
      kw('vlan', 'Set allowed VLANs when interface is in trunking mode'),
      kw('remove', 'remove VLANs from the current list'),
      vlans(),
    ],
    run: (x) => trunkAllowed(x, 'remove'),
  },
  {
    modes: ['config-if'],
    toks: [
      kw('switchport', 'Set switching mode characteristics'),
      kw('trunk', 'Set trunking characteristics of the interface'),
      kw('allowed', 'Set allowed VLAN characteristics when interface is in trunking mode'),
      kw('vlan', 'Set allowed VLANs when interface is in trunking mode'),
      kw('all', 'all VLANs'),
    ],
    run: (x) => trunkAllowed(x, 'all'),
  },
  {
    modes: ['config-if'],
    toks: [
      kw('switchport', 'Set switching mode characteristics'),
      kw('trunk', 'Set trunking characteristics of the interface'),
      kw('allowed', 'Set allowed VLAN characteristics when interface is in trunking mode'),
      kw('vlan', 'Set allowed VLANs when interface is in trunking mode'),
      kw('none', 'no VLANs'),
    ],
    run: (x) => trunkAllowed(x, 'none'),
  },
  {
    modes: ['config-if'],
    toks: [kw('switchport', 'Set switching mode characteristics'), kw('port-security', 'Security related command')],
    run: (x) => {
      const e = needSwitchport(x);
      if (e) return e;
      const c = ifCfg(x);
      c.portSecurity = { enabled: true, maximum: c.portSecurity?.maximum ?? 1, violation: c.portSecurity?.violation ?? 'shutdown' };
      x.dirty();
    },
  },
  {
    modes: ['config-if'],
    toks: [
      kw('no', 'Negate a command or set its defaults'),
      kw('switchport', 'Set switching mode characteristics'),
      kw('port-security', 'Security related command'),
    ],
    run: (x) => {
      const e = needSwitchport(x);
      if (e) return e;
      const c = ifCfg(x);
      if (c.portSecurity) c.portSecurity = { ...c.portSecurity, enabled: false };
      x.dirty();
    },
  },
  {
    modes: ['config-if'],
    toks: [
      kw('switchport', 'Set switching mode characteristics'),
      kw('port-security', 'Security related command'),
      kw('maximum', 'Max secure addresses'),
      num('max', 1, 8192, '<1-8192> Maximum addresses'),
    ],
    run: (x) => {
      const e = needSwitchport(x);
      if (e) return e;
      const c = ifCfg(x);
      c.portSecurity = { enabled: c.portSecurity?.enabled ?? false, maximum: Number(x.args.max), violation: c.portSecurity?.violation ?? 'shutdown' };
      x.dirty();
    },
  },
  ...(['protect', 'restrict', 'shutdown'] as const).map(
    (v): Cmd => ({
      modes: ['config-if'],
      toks: [
        kw('switchport', 'Set switching mode characteristics'),
        kw('port-security', 'Security related command'),
        kw('violation', 'Security violation mode'),
        kw(v, `Security violation ${v} mode`),
      ],
      run: (x) => {
        const e = needSwitchport(x);
        if (e) return e;
        const c = ifCfg(x);
        c.portSecurity = { enabled: c.portSecurity?.enabled ?? false, maximum: c.portSecurity?.maximum ?? 1, violation: v };
        x.dirty();
      },
    }),
  ),
];

CMDS.push(...phase3Cmds(), ...l2Cmds(), ...igpCmds(), ...mgmtCmds(), ...mplsCmds(), ...bgpCmds(), ...l2vpnCmds(), ...teCmds());

function saveStartup(x: Exec): string {
  const { startup: _ignored, ...running } = x.cfg;
  x.cfg.startup = structuredClone(running);
  x.dirty();
  return 'Building configuration...\n[OK]';
}

function stpPriority(x: Exec): string | void {
  if (!isBridgeRole(roleOf(x.device.kind))) return x.invalid();
  const p = Number(x.args.prio);
  if (p % 4096 !== 0)
    return '% Bridge Priority must be in increments of 4096.\n% Allowed values are:\n  0     4096  8192  12288 16384 20480 24576 28672\n  32768 36864 40960 45056 49152 53248 57344 61440';
  x.cfg.stpPriority = p;
  x.dirty();
  if (Array.isArray(x.args.vl)) return 'Note: RailMPLS Lab runs one spanning-tree instance for all VLANs; the priority applies to that instance.';
}

function encap(x: Exec, native: boolean): void {
  ifCfg(x).encapsulation = { vlan: Number(x.args.vlan), native };
  x.dirty();
}

function trunkAllowed(x: Exec, op: 'set' | 'add' | 'remove' | 'all' | 'none'): string | void {
  const e = needSwitchport(x);
  if (e) return e;
  const c = ifCfg(x);
  const list = (x.args.vlans as number[] | undefined) ?? [];
  const cur = c.trunkAllowed ?? 'all';
  const all = Array.from({ length: 4094 }, (_, i) => i + 1);
  if (op === 'all') delete c.trunkAllowed;
  else if (op === 'none') c.trunkAllowed = [];
  else if (op === 'set') c.trunkAllowed = [...new Set(list)].sort((a, b) => a - b);
  else if (op === 'add') c.trunkAllowed = cur === 'all' ? 'all' : [...new Set([...cur, ...list])].sort((a, b) => a - b);
  else {
    const base = cur === 'all' ? all : cur;
    c.trunkAllowed = base.filter((v) => !list.includes(v));
  }
  x.dirty();
}

/** "interface range gi0/1 - 4 , gi0/10": physical ports only. */
export function parseRange(spec: string, ports: Device['ports']): string[] | null {
  const out: string[] = [];
  for (const part of spec.split(',')) {
    const t = part.replace(/\s+/g, '');
    if (!t) return null;
    const m = /^(.*?)(\d+)(?:-(?:[a-z-]+[\d/]*\/)?(\d+))?$/i.exec(t);
    if (!m) return null;
    const [, prefix, a, b] = m;
    const from = Number(a);
    const to = b !== undefined ? Number(b) : from;
    if (to < from || to - from > 64) return null;
    for (let n = from; n <= to; n++) {
      const r = resolveIfName(`${prefix}${n}`, ports);
      if (!r || !ports.some((p) => p.id === r)) return null;
      if (!out.includes(r)) out.push(r);
    }
  }
  return out.length ? out : null;
}

function enterRange(x: Exec): string | void {
  const list = parseRange(String(x.args.spec), x.device.ports);
  if (!list) return '% Invalid interface range. Example: interface range gi0/1 - 4';
  x.setMode('config-if', { iface: list[0], range: list });
}

function enterInterface(x: Exec): string | void {
  const role = roleOf(x.device.kind);
  const name = String(x.args.if);
  const vlan = sviVlan(name);
  if (vlan !== null) {
    if (!isBridgeRole(role) || vlan < 1 || vlan > 4094) return x.invalid();
    if (!x.cfg.interfaces[name]) {
      x.cfg.interfaces[name] = {};
      x.dirty();
    }
    x.setMode('config-if', { iface: name });
    return;
  }
  if (loopbackId(name) !== null) {
    const r = roleOf(x.device.kind);
    if (r !== 'router' && r !== 'l3switch') return x.invalid();
    if (!x.cfg.interfaces[name]) {
      x.cfg.interfaces[name] = {};
      x.dirty();
    }
    x.setMode('config-if', { iface: name });
    return;
  }
  if (portChannelId(name) !== null) {
    const id = portChannelId(name)!;
    if (!isBridgeRole(role) || id < 1 || id > 64) return x.invalid();
    if (!x.cfg.interfaces[name]) {
      x.cfg.interfaces[name] = {};
      x.dirty();
    }
    x.setMode('config-if', { iface: name });
    return;
  }
  if (isSubinterface(name)) {
    const parent = parentOf(name);
    const sub = Number(name.split('.').pop());
    if (role !== 'router' || !x.device.ports.some((p) => p.id === parent) || sub < 1 || sub > 4294967295) return x.invalid();
    if (!x.cfg.interfaces[name]) {
      x.cfg.interfaces[name] = {};
      x.dirty();
    }
    x.setMode('config-subif', { iface: name });
    return;
  }
  x.setMode('config-if', { iface: name });
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

interface Match {
  cmd: Cmd;
  args: Args;
  complete: boolean;
  /** Index of the first input word that failed to match (for the ^ marker). */
  failAt: number;
  /** Keyword matched at each input word index (for ambiguity checks). */
  kws: Map<number, string>;
  exact: Set<number>;
  /** Index into cmd.toks reached after consuming all input. */
  tokIndex: number;
}

function matchCmd(cmd: Cmd, words: string[], device: Device): Match {
  const args: Args = {};
  const kws = new Map<number, string>();
  const exact = new Set<number>();
  let wi = 0;
  let ti = 0;
  while (wi < words.length) {
    const t = cmd.toks[ti];
    if (!t) return { cmd, args, complete: false, failAt: wi, kws, exact, tokIndex: ti };
    const w = words[wi];
    if (t.k === 'kw') {
      if (!t.w.toLowerCase().startsWith(w.toLowerCase())) return { cmd, args, complete: false, failAt: wi, kws, exact, tokIndex: ti };
      kws.set(wi, t.w);
      if (t.w.toLowerCase() === w.toLowerCase()) exact.add(wi);
      wi++;
      ti++;
      continue;
    }
    let ok = false;
    switch (t.k) {
      case 'ip':
      case 'mask':
        ok = parseIpv4(w) !== null;
        if (ok) args[t.name] = w;
        break;
      case 'num': {
        const n = /^\d+$/.test(w) ? Number(w) : NaN;
        ok = Number.isInteger(n) && n >= (t.min ?? 0) && n <= (t.max ?? Number.MAX_SAFE_INTEGER);
        if (ok) args[t.name] = n;
        break;
      }
      case 'word':
        ok = true;
        args[t.name] = w;
        break;
      case 'line':
        ok = true;
        args[t.name] = words.slice(wi).join(' ');
        wi = words.length;
        ti++;
        continue;
      case 'vlans': {
        const v = F.parseVlanList(w);
        ok = v !== null;
        if (ok) args[t.name] = v!;
        break;
      }
      case 'if': {
        let r = resolveIfName(w, device.ports);
        if (!r && /^[a-z-]+$/i.test(w) && words[wi + 1] !== undefined && /^\d/.test(words[wi + 1])) {
          r = resolveIfName(w + words[wi + 1], device.ports);
          if (r) wi++;
        }
        ok = r !== null;
        if (ok) args[t.name] = r!;
        break;
      }
    }
    if (!ok) return { cmd, args, complete: false, failAt: wi, kws, exact, tokIndex: ti };
    wi++;
    ti++;
  }
  return { cmd, args, complete: ti === cmd.toks.length, failAt: words.length, kws, exact, tokIndex: ti };
}

function tokenize(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

function wordStart(s: string, index: number): number {
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (i === index) return m.index;
    i++;
  }
  return s.length;
}

function candidates(mode: CliMode, words: string[], device: Device): Match[] {
  return CMDS.filter((c) => c.modes.includes(mode)).map((c) => matchCmd(c, words, device));
}

/** Drops matches that lose an ambiguity: at a word where keywords differ, exact keyword matches win. */
function disambiguate(ms: Match[], words: string[]): { ms: Match[]; ambiguousAt?: number } {
  let cur = ms;
  for (let i = 0; i < words.length; i++) {
    const kwsHere = new Set(cur.map((m) => m.kws.get(i)).filter((k): k is string => !!k));
    if (kwsHere.size <= 1) continue;
    const exacts = cur.filter((m) => m.exact.has(i));
    if (exacts.length) cur = exacts.concat(cur.filter((m) => !m.kws.has(i)));
    else return { ms: cur, ambiguousAt: i };
  }
  return { ms: cur };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function prompt(session: CliSession, topology: Topology): string {
  const name = topology.devices.find((d) => d.id === session.deviceId)?.name ?? 'Device';
  switch (session.mode) {
    case 'user':
      return `${name}>`;
    case 'priv':
      return `${name}#`;
    case 'config':
      return `${name}(config)#`;
    case 'config-if':
      return session.range ? `${name}(config-if-range)#` : `${name}(config-if)#`;
    case 'config-subif':
      return `${name}(config-subif)#`;
    case 'config-vlan':
      return `${name}(config-vlan)#`;
    case 'config-router':
    case 'config-router-isis':
    case 'config-router-rip':
      return `${name}(config-router)#`;
    case 'config-line':
      return `${name}(config-line)#`;
    case 'config-std-nacl':
      return `${name}(config-std-nacl)#`;
    case 'config-ext-nacl':
      return `${name}(config-ext-nacl)#`;
    case 'dhcp-config':
      return `${name}(dhcp-config)#`;
    case 'config-cmap':
      return `${name}(config-cmap)#`;
    case 'config-pmap':
      return `${name}(config-pmap)#`;
    case 'config-pmap-c':
      return `${name}(config-pmap-c)#`;
    case 'config-vrf':
      return `${name}(config-vrf)#`;
    case 'config-vrf-af':
      return `${name}(config-vrf-af)#`;
    case 'config-router-bgp':
      return `${name}(config-router)#`;
    case 'config-router-af':
      return `${name}(config-router-af)#`;
    case 'config-vfi':
      return `${name}(config-vfi)#`;
    case 'config-controller':
      return `${name}(config-controller)#`;
    case 'config-cem-if':
      return `${name}(config-if)#`;
    case 'config-if-cem':
      return `${name}(config-if-cem)#`;
    case 'config-tunnel':
      return `${name}(config-if)#`;
    case 'config-expl-path':
      return `${name}(cfg-ip-expl-path)#`;
  }
}

export function newSession(deviceId: string): CliSession {
  return { deviceId, mode: 'user' };
}

export function execIos(input: string, session: CliSession, ctx: CliContext): CliResult {
  const device = ctx.topology.devices.find((d) => d.id === session.deviceId);
  if (!device) return { output: '% Device no longer exists.', session };
  const words = tokenize(input);
  if (!words.length) return { output: '', session };
  const promptLen = prompt(session, ctx.topology).length;
  const caret = (wi: number) => `${' '.repeat(promptLen + wordStart(input, wi))}^\n${INVALID}`;

  const all = candidates(session.mode, words, device);
  const complete = all.filter((m) => m.complete);
  const { ms, ambiguousAt } = disambiguate(complete.length ? complete : all.filter((m) => m.failAt === words.length), words);
  if (ambiguousAt !== undefined) return { output: `% Ambiguous command:  "${input.trim()}"`, session };

  // IOS: a global configuration command typed in a sub-mode (config-if, config-router…)
  // is executed in global configuration mode, and the prompt drops back to (config)#.
  const inSubMode = session.mode !== 'config' && (session.mode.startsWith('config') || session.mode === 'dhcp-config');
  if (inSubMode && !ms.some((m) => m.complete)) {
    const globalComplete = candidates('config', words, device).filter((m) => m.complete);
    if (globalComplete.length) return execIos(input, { deviceId: session.deviceId, mode: 'config' }, ctx);
  }

  const winner = ms.find((m) => m.complete);
  if (!winner) {
    if (ms.length) return { output: '% Incomplete command.', session };
    const failAt = Math.max(0, ...all.map((m) => m.failAt));
    return { output: caret(failAt), session };
  }

  // Execute against a mutable copy of the config.
  const cfg = structuredClone(getNetConfig(device));
  let dirty = false;
  let newName: string | undefined;
  let next: CliSession = { ...session };
  const x: Exec = {
    args: winner.args,
    device,
    cfg,
    session,
    ctx,
    dirty: () => (dirty = true),
    rename: (n) => (newName = n),
    setMode: (mode, extra = {}) => {
      next = { deviceId: session.deviceId, mode, ...extra };
      if (mode === 'config' || mode === 'priv' || mode === 'user') {
        delete next.iface;
        delete next.vlan;
        delete next.ctxName;
        delete next.pmapClass;
      }
    },
    invalid: () => caret(0),
  };
  // In "interface range" mode an interface command runs once per interface.
  const perInterface = !!session.range && session.mode === 'config-if' && !winner.cmd.modes.includes('config');
  let out: string;
  if (perInterface) {
    const outs: string[] = [];
    for (const name of session.range!) {
      x.session = { ...session, iface: name };
      const o = winner.cmd.run(x) ?? '';
      if (o && !outs.includes(o)) outs.push(o);
    }
    x.session = session;
    out = outs.join('\n');
    next = { ...session, ...(next.mode !== session.mode || next.iface !== session.iface ? next : {}) };
  } else out = winner.cmd.run(x) ?? '';
  // IOS copies Layer 2 settings made on interface Port-channelN to all its members.
  if (dirty && session.mode === 'config-if' && session.iface && portChannelId(session.iface) !== null) propagatePortChannel(x, session.iface);
  let topology: Topology | undefined;
  if (dirty || newName) {
    let t = ctx.topology;
    if (dirty) t = { ...t, devices: t.devices.map((d) => (d.id === device.id ? withNetConfig(d, cfg) : d)) };
    if (newName) t = updateDevice(t, device.id, { name: newName });
    topology = t;
    ctx.sim.setTopology(t);
  }
  return { output: out, session: next, topology };
}

/** "?" help for the text before the cursor. */
export function helpIos(input: string, session: CliSession, topology: Topology): string {
  const device = topology.devices.find((d) => d.id === session.deviceId);
  if (!device) return '';
  const trailingSpace = /\s$/.test(input) || input === '';
  const words = tokenize(input);
  const done = trailingSpace ? words : words.slice(0, -1);
  const partial = trailingSpace ? '' : words[words.length - 1].toLowerCase();
  const live = candidates(session.mode, done, device).filter((m) => m.failAt === done.length);
  const rows = new Map<string, string>();
  let cr = false;
  for (const m of live) {
    const t = m.cmd.toks[m.tokIndex];
    if (!t) {
      cr = true;
      continue;
    }
    if (t.k === 'kw') {
      if (t.w.toLowerCase().startsWith(partial)) rows.set(t.w, t.help);
    } else if (!partial) {
      const label =
        t.k === 'ip'
          ? 'A.B.C.D'
          : t.k === 'mask'
            ? 'A.B.C.D'
            : t.k === 'num'
              ? `<${t.min}-${t.max}>`
              : t.k === 'line'
                ? 'LINE'
                : t.k === 'if'
                  ? 'INTERFACE'
                  : t.k === 'vlans'
                    ? 'WORD'
                    : 'WORD';
      rows.set(label, t.help);
    }
  }
  if (!rows.size && !cr) return '% Unrecognized command';
  const width = Math.max(...[...rows.keys()].map((k) => k.length), 4) + 2;
  const lines = [...rows].sort(([a], [b]) => a.localeCompare(b)).map(([k, h]) => `  ${k.padEnd(width)}${h}`);
  if (cr && !partial) lines.push('  <cr>');
  return lines.join('\n');
}

/** Tab completion of the last keyword. Returns the completed input, or null. */
export function completeIos(input: string, session: CliSession, topology: Topology): string | null {
  const device = topology.devices.find((d) => d.id === session.deviceId);
  if (!device || /\s$/.test(input) || !input.trim()) return null;
  const words = tokenize(input);
  const partial = words[words.length - 1].toLowerCase();
  const live = candidates(session.mode, words.slice(0, -1), device).filter((m) => m.failAt === words.length - 1);
  const opts = new Set<string>();
  for (const m of live) {
    const t = m.cmd.toks[m.tokIndex];
    if (t?.k === 'kw' && t.w.toLowerCase().startsWith(partial)) opts.add(t.w);
  }
  if (opts.size !== 1) return null;
  return `${input.slice(0, input.length - words[words.length - 1].length)}${[...opts][0]} `;
}

export { longIfName };
