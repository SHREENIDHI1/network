import { isBridgeRole, roleOf, type FhrpConfig, type NetConfig } from '../config/netConfig';
import { maskToPrefix, parseIpv4 } from '../ip/ipv4';
import { parseDscp } from '../qos/apps';
import { numberedKind, parseAclLine, type AclKind } from '../security/acl';
import * as F3 from './format3';
import { CONF, EXEC, IFM, PRIV, ifCfg, iface, ip, kw, line, mask, num, word, type Cmd, type CliMode, type Exec } from './ios';

/**
 * Phase 3 IOS commands: OSPF, ACL, NAT, DHCP, HSRP/VRRP, QoS (MQC), speed/MTU.
 * Returned by a function so ios.ts can append them after its own grammar
 * helpers are initialised (avoids a circular-import ordering problem).
 */

const NO = () => kw('no', 'Negate a command or set its defaults');
const routerRole = (x: Exec) => {
  const r = roleOf(x.device.kind);
  return r === 'router' || r === 'l3switch';
};
const ROUTER: CliMode[] = ['config-router'];
const NACL: CliMode[] = ['config-std-nacl', 'config-ext-nacl'];

function ospfCfg(x: Exec) {
  return x.cfg.ospf!;
}

function fhrp(x: Exec, protocol: 'hsrp' | 'vrrp', group: number): FhrpConfig {
  const ic = ifCfg(x);
  ic.fhrp ??= [];
  let g = ic.fhrp.find((f) => f.protocol === protocol && f.group === group);
  if (!g) {
    g = { protocol, group, track: [] };
    ic.fhrp.push(g);
  }
  return g;
}

function needL3If(x: Exec): string | undefined {
  if (!routerRole(x) && !(isBridgeRole(roleOf(x.device.kind)) && /^Vlan\d+$/.test(x.session.iface ?? ''))) return x.invalid();
  return undefined;
}

function aclAdd(x: Exec, name: string, kind: AclKind, tokens: string[]): string | void {
  const existing = x.cfg.acls[name];
  if (existing && existing.kind !== kind) return `% ${name} is a ${existing.kind} access list`;
  const e = parseAclLine(kind, tokens);
  if (typeof e === 'string') return e;
  x.cfg.acls[name] ??= { kind, entries: [] };
  x.cfg.acls[name].entries.push(e);
  x.dirty();
}

export function phase3Cmds(): Cmd[] {
  return [
    // ===================================================================== OSPF
    {
      modes: CONF,
      toks: [kw('router', 'Enable a routing process'), kw('ospf', 'Open Shortest Path First (OSPF)'), num('pid', 1, 65535, '<1-65535> Process ID')],
      run: (x) => {
        if (!routerRole(x)) return x.invalid();
        const pid = Number(x.args.pid);
        if (x.cfg.ospf && x.cfg.ospf.processId !== pid)
          return `% RailMPLS Lab supports one OSPF process per device (process ${x.cfg.ospf.processId} exists).`;
        if (!x.cfg.ospf) {
          x.cfg.ospf = {
            processId: pid,
            networks: [],
            passive: [],
            defaultOriginate: 'off',
            redistributeStatic: false,
            referenceBandwidth: 100,
            ldpSync: false,
            ldpAutoconfig: false,
          };
          x.dirty();
        }
        x.setMode('config-router');
        if (roleOf(x.device.kind) === 'l3switch' && !x.cfg.ipRouting)
          return '% IP routing not enabled ("ip routing") — OSPF will not run until it is.';
      },
    },
    {
      modes: CONF,
      toks: [
        NO(),
        kw('router', 'Enable a routing process'),
        kw('ospf', 'Open Shortest Path First (OSPF)'),
        num('pid', 1, 65535, '<1-65535> Process ID'),
      ],
      run: (x) => {
        delete x.cfg.ospf;
        x.dirty();
      },
    },
    {
      modes: ROUTER,
      toks: [kw('router-id', 'router-id for this OSPF process'), ip('rid', 'OSPF router-id in IP address format')],
      run: (x) => {
        ospfCfg(x).routerId = String(x.args.rid);
        x.dirty();
        return 'Reload or use "clear ip ospf process" command, for this to take effect';
      },
    },
    {
      modes: ROUTER,
      toks: [NO(), kw('router-id', 'router-id for this OSPF process')],
      run: (x) => {
        delete ospfCfg(x).routerId;
        x.dirty();
      },
    },
    ...[false, true].map(
      (neg): Cmd => ({
        modes: ROUTER,
        toks: [
          ...(neg ? [NO()] : []),
          kw('network', 'Enable routing on an IP network'),
          ip('addr', 'Network number'),
          mask('wc', 'OSPF wild card bits'),
          kw('area', 'Set the OSPF area ID'),
          num('area', 0, 4294967295, '<0-4294967295> OSPF area ID as a decimal value'),
        ],
        run: (x) => {
          const o = ospfCfg(x);
          const entry = { address: String(x.args.addr), wildcard: String(x.args.wc), area: Number(x.args.area) };
          if (neg) o.networks = o.networks.filter((n) => !(n.address === entry.address && n.wildcard === entry.wildcard && n.area === entry.area));
          else if (!o.networks.some((n) => n.address === entry.address && n.wildcard === entry.wildcard)) o.networks.push(entry);
          else return `% Network ${entry.address} ${entry.wildcard} is already configured`;
          x.dirty();
        },
      }),
    ),
    {
      modes: ROUTER,
      toks: [kw('passive-interface', 'Suppress routing updates on an interface'), iface()],
      run: (x) => {
        const o = ospfCfg(x);
        if (!o.passive.includes(String(x.args.if))) o.passive.push(String(x.args.if));
        x.dirty();
      },
    },
    {
      modes: ROUTER,
      toks: [NO(), kw('passive-interface', 'Suppress routing updates on an interface'), iface()],
      run: (x) => {
        const o = ospfCfg(x);
        o.passive = o.passive.filter((p) => p !== String(x.args.if));
        x.dirty();
      },
    },
    {
      modes: ROUTER,
      toks: [kw('default-information', 'Control distribution of default information'), kw('originate', 'Distribute a default route')],
      run: (x) => {
        ospfCfg(x).defaultOriginate = 'on';
        x.dirty();
      },
    },
    {
      modes: ROUTER,
      toks: [
        kw('default-information', 'Control distribution of default information'),
        kw('originate', 'Distribute a default route'),
        kw('always', 'Always advertise default route'),
      ],
      run: (x) => {
        ospfCfg(x).defaultOriginate = 'always';
        x.dirty();
      },
    },
    {
      modes: ROUTER,
      toks: [NO(), kw('default-information', 'Control distribution of default information'), kw('originate', 'Distribute a default route')],
      run: (x) => {
        ospfCfg(x).defaultOriginate = 'off';
        x.dirty();
      },
    },
    {
      modes: ROUTER,
      toks: [kw('redistribute', 'Redistribute information from another routing protocol'), kw('static', 'Static routes')],
      run: (x) => {
        ospfCfg(x).redistributeStatic = true;
        x.dirty();
      },
    },
    {
      modes: ROUTER,
      toks: [
        kw('redistribute', 'Redistribute information from another routing protocol'),
        kw('static', 'Static routes'),
        kw('subnets', 'Consider subnets for redistribution into OSPF'),
      ],
      run: (x) => {
        ospfCfg(x).redistributeStatic = true;
        x.dirty();
      },
    },
    {
      modes: ROUTER,
      toks: [NO(), kw('redistribute', 'Redistribute information from another routing protocol'), kw('static', 'Static routes')],
      run: (x) => {
        ospfCfg(x).redistributeStatic = false;
        x.dirty();
      },
    },
    {
      modes: ROUTER,
      toks: [
        kw('auto-cost', 'Calculate OSPF interface cost according to bandwidth'),
        kw('reference-bandwidth', 'Use reference bandwidth method to assign OSPF cost'),
        num('bw', 1, 4294967, '<1-4294967> The reference bandwidth in terms of Mbits per second'),
      ],
      run: (x) => {
        ospfCfg(x).referenceBandwidth = Number(x.args.bw);
        x.dirty();
        return '% OSPF: Reference bandwidth is changed.\n        Please ensure reference bandwidth is consistent across all routers.';
      },
    },
    // interface OSPF / MTU / speed
    ...(
      [
        ['cost', 'Interface cost', 'ospfCost', 1, 65535],
        ['hello-interval', 'Time between HELLO packets', 'ospfHello', 1, 65535],
        ['dead-interval', 'Interval after which a neighbor is declared dead', 'ospfDead', 1, 65535],
        ['priority', 'Router priority', 'ospfPriority', 0, 255],
      ] as const
    ).flatMap(([k, help, field, min, max]): Cmd[] => [
      {
        modes: IFM,
        toks: [
          kw('ip', 'Interface Internet Protocol config commands'),
          kw('ospf', 'OSPF interface commands'),
          kw(k, help),
          num('v', min, max, `<${min}-${max}> ${help}`),
        ],
        run: (x) => {
          (ifCfg(x) as Record<string, unknown>)[field] = Number(x.args.v);
          x.dirty();
        },
      },
      {
        modes: IFM,
        toks: [NO(), kw('ip', 'Interface Internet Protocol config commands'), kw('ospf', 'OSPF interface commands'), kw(k, help)],
        run: (x) => {
          delete (ifCfg(x) as Record<string, unknown>)[field];
          x.dirty();
        },
      },
    ]),
    {
      modes: IFM,
      toks: [
        kw('ip', 'Interface Internet Protocol config commands'),
        kw('mtu', 'Set IP Maximum Transmission Unit'),
        num('mtu', 68, 9216, '<68-9216> MTU (bytes)'),
      ],
      run: (x) => {
        ifCfg(x).mtu = Number(x.args.mtu);
        x.dirty();
      },
    },
    {
      modes: IFM,
      toks: [NO(), kw('ip', 'Interface Internet Protocol config commands'), kw('mtu', 'Set IP Maximum Transmission Unit')],
      run: (x) => {
        delete ifCfg(x).mtu;
        x.dirty();
      },
    },
    ...['10', '100', '1000', '10000'].map(
      (sp): Cmd => ({
        modes: ['config-if'],
        toks: [kw('speed', 'Configure speed operation.'), kw(sp, `Force ${sp} Mbps operation`)],
        run: (x) => {
          if (!x.device.ports.some((p) => p.id === x.session.iface)) return x.invalid();
          ifCfg(x).speedMbps = Number(sp);
          x.dirty();
        },
      }),
    ),
    {
      modes: ['config-if'],
      toks: [kw('speed', 'Configure speed operation.'), kw('auto', 'Enable AUTO speed configuration')],
      run: (x) => {
        delete ifCfg(x).speedMbps;
        x.dirty();
      },
    },

    // ===================================================================== ACL
    {
      modes: CONF,
      toks: [
        kw('access-list', 'Add an access list entry'),
        num('n', 1, 2699, '<1-2699> IP access list number'),
        line('rest', 'permit | deny | remark …'),
      ],
      run: (x) => {
        const name = String(x.args.n);
        const kind = numberedKind(name);
        if (!kind) return x.invalid();
        return aclAdd(x, name, kind, String(x.args.rest).split(/\s+/));
      },
    },
    {
      modes: CONF,
      toks: [NO(), kw('access-list', 'Add an access list entry'), num('n', 1, 2699, '<1-2699> IP access list number')],
      run: (x) => {
        delete x.cfg.acls[String(x.args.n)];
        x.dirty();
      },
    },
    ...(['standard', 'extended'] as const).flatMap((k): Cmd[] => [
      {
        modes: CONF,
        toks: [
          kw('ip', 'Global IP configuration subcommands'),
          kw('access-list', 'Named access list'),
          kw(k, `${k[0].toUpperCase()}${k.slice(1)} Access List`),
          word('name', 'Access-list name'),
        ],
        run: (x) => {
          const name = String(x.args.name);
          const ex = x.cfg.acls[name];
          if (ex && ex.kind !== k) return `% A ${ex.kind} access list named ${name} exists`;
          if (!ex) {
            x.cfg.acls[name] = { kind: k, entries: [] };
            x.dirty();
          }
          x.setMode(k === 'standard' ? 'config-std-nacl' : 'config-ext-nacl', { ctxName: name });
        },
      },
      {
        modes: CONF,
        toks: [
          NO(),
          kw('ip', 'Global IP configuration subcommands'),
          kw('access-list', 'Named access list'),
          kw(k, `${k} Access List`),
          word('name', 'Access-list name'),
        ],
        run: (x) => {
          delete x.cfg.acls[String(x.args.name)];
          x.dirty();
        },
      },
    ]),
    ...(['permit', 'deny', 'remark'] as const).map(
      (a): Cmd => ({
        modes: NACL,
        toks: [
          kw(a, a === 'remark' ? 'Access list entry comment' : `Specify packets to ${a === 'permit' ? 'forward' : 'reject'}`),
          line('rest', 'Source / protocol …'),
        ],
        run: (x) =>
          aclAdd(x, x.session.ctxName!, x.session.mode === 'config-std-nacl' ? 'standard' : 'extended', [a, ...String(x.args.rest).split(/\s+/)]),
      }),
    ),
    ...(['in', 'out'] as const).flatMap((d): Cmd[] => [
      {
        modes: IFM,
        toks: [
          kw('ip', 'Interface Internet Protocol config commands'),
          kw('access-group', 'Specify access control for packets'),
          word('name', 'Access-list name or number'),
          kw(d, `${d === 'in' ? 'inbound' : 'outbound'} packets`),
        ],
        run: (x) => {
          const e = needL3If(x);
          if (e) return e;
          if (d === 'in') ifCfg(x).aclIn = String(x.args.name);
          else ifCfg(x).aclOut = String(x.args.name);
          x.dirty();
        },
      },
      {
        modes: IFM,
        toks: [
          NO(),
          kw('ip', 'Interface Internet Protocol config commands'),
          kw('access-group', 'Specify access control for packets'),
          word('name', 'Access-list name or number'),
          kw(d, `${d} packets`),
        ],
        run: (x) => {
          if (d === 'in') delete ifCfg(x).aclIn;
          else delete ifCfg(x).aclOut;
          x.dirty();
        },
      },
    ]),

    // ===================================================================== NAT
    ...(['inside', 'outside'] as const).flatMap((r): Cmd[] => [
      {
        modes: IFM,
        toks: [
          kw('ip', 'Interface Internet Protocol config commands'),
          kw('nat', 'NAT interface commands'),
          kw(r, `${r === 'inside' ? 'Inside' : 'Outside'} interface for address translation`),
        ],
        run: (x) => {
          if (!routerRole(x)) return x.invalid();
          ifCfg(x).natRole = r;
          x.dirty();
        },
      },
      {
        modes: IFM,
        toks: [NO(), kw('ip', 'Interface Internet Protocol config commands'), kw('nat', 'NAT interface commands'), kw(r, 'interface role')],
        run: (x) => {
          delete ifCfg(x).natRole;
          x.dirty();
        },
      },
    ]),
    ...[false, true].flatMap((neg): Cmd[] => [
      {
        modes: CONF,
        toks: [
          ...(neg ? [NO()] : []),
          kw('ip', 'Global IP configuration subcommands'),
          kw('nat', 'NAT configuration commands'),
          kw('inside', 'Inside address translation'),
          kw('source', 'Source address translation'),
          kw('list', 'Specify access list describing local addresses'),
          word('acl', 'Access list number or name'),
          kw('interface', 'Specify interface for global address'),
          iface('ifc', 'Interface'),
          kw('overload', 'Overload an address translation'),
        ],
        run: (x) => {
          if (!routerRole(x)) return x.invalid();
          const rule = { acl: String(x.args.acl), iface: String(x.args.ifc) };
          x.cfg.nat.overload = x.cfg.nat.overload.filter((o) => !(o.acl === rule.acl && o.iface === rule.iface));
          if (!neg) x.cfg.nat.overload.push(rule);
          x.dirty();
        },
      },
      {
        modes: CONF,
        toks: [
          ...(neg ? [NO()] : []),
          kw('ip', 'Global IP configuration subcommands'),
          kw('nat', 'NAT configuration commands'),
          kw('inside', 'Inside address translation'),
          kw('source', 'Source address translation'),
          kw('static', 'Specify static local->global mapping'),
          ip('local', 'Inside local IP address'),
          ip('global', 'Inside global IP address'),
        ],
        run: (x) => {
          if (!routerRole(x)) return x.invalid();
          const st = { local: String(x.args.local), global: String(x.args.global) };
          x.cfg.nat.statics = x.cfg.nat.statics.filter((o) => o.local !== st.local && o.global !== st.global);
          if (!neg) x.cfg.nat.statics.push(st);
          x.dirty();
        },
      },
    ]),
    {
      modes: PRIV,
      toks: [
        kw('show', 'Show running system information'),
        kw('ip', 'IP information'),
        kw('nat', 'IP NAT information'),
        kw('translations', 'Translation entries'),
      ],
      run: (x) => F3.showNatTranslations(x.ctx.sim, x.device),
    },
    {
      modes: PRIV,
      toks: [
        kw('show', 'Show running system information'),
        kw('ip', 'IP information'),
        kw('nat', 'IP NAT information'),
        kw('statistics', 'Translation statistics'),
      ],
      run: (x) => F3.showNatStatistics(x.ctx.sim, x.device, x.cfg),
    },
    {
      modes: PRIV,
      toks: [
        kw('clear', 'Reset functions'),
        kw('ip', 'IP'),
        kw('nat', 'Clear NAT'),
        kw('translation', 'Clear dynamic translation'),
        word('star', '* Delete all dynamic translations'),
      ],
      run: (x) => {
        if (String(x.args.star) !== '*') return x.invalid();
        x.ctx.sim.clearNat(x.device.id);
      },
    },

    // ===================================================================== DHCP
    {
      modes: CONF,
      toks: [
        kw('ip', 'Global IP configuration subcommands'),
        kw('dhcp', 'Configure DHCP server and relay parameters'),
        kw('pool', 'Configure DHCP address pools'),
        word('name', 'Pool name'),
      ],
      run: (x) => {
        if (!routerRole(x) && roleOf(x.device.kind) !== 'switch') return x.invalid();
        const n = String(x.args.name);
        if (!x.cfg.dhcp.pools[n]) {
          x.cfg.dhcp.pools[n] = { leaseDays: 1 };
          x.dirty();
        }
        x.setMode('dhcp-config', { ctxName: n });
      },
    },
    {
      modes: CONF,
      toks: [
        NO(),
        kw('ip', 'Global IP configuration subcommands'),
        kw('dhcp', 'Configure DHCP server and relay parameters'),
        kw('pool', 'Configure DHCP address pools'),
        word('name', 'Pool name'),
      ],
      run: (x) => {
        delete x.cfg.dhcp.pools[String(x.args.name)];
        x.dirty();
      },
    },
    ...[false, true].flatMap((neg): Cmd[] => [
      {
        modes: CONF,
        toks: [
          ...(neg ? [NO()] : []),
          kw('ip', 'Global IP configuration subcommands'),
          kw('dhcp', 'Configure DHCP server and relay parameters'),
          kw('excluded-address', 'Prevent DHCP from assigning certain addresses'),
          ip('a', 'Low IP address'),
        ],
        run: (x) => excluded(x, neg),
      },
      {
        modes: CONF,
        toks: [
          ...(neg ? [NO()] : []),
          kw('ip', 'Global IP configuration subcommands'),
          kw('dhcp', 'Configure DHCP server and relay parameters'),
          kw('excluded-address', 'Prevent DHCP from assigning certain addresses'),
          ip('a', 'Low IP address'),
          ip('b', 'High IP address'),
        ],
        run: (x) => excluded(x, neg),
      },
    ]),
    {
      modes: ['dhcp-config'],
      toks: [kw('network', 'Network number and mask'), ip('net', 'Network number in dotted-decimal notation'), mask('mask', 'Network mask')],
      run: (x) => {
        if (maskToPrefix(String(x.args.mask)) === null) return '% Invalid mask';
        Object.assign(x.cfg.dhcp.pools[x.session.ctxName!], { network: String(x.args.net), mask: String(x.args.mask) });
        x.dirty();
      },
    },
    {
      modes: ['dhcp-config'],
      toks: [kw('default-router', 'Default routers'), ip('gw', "Router's IP address")],
      run: (x) => {
        x.cfg.dhcp.pools[x.session.ctxName!].defaultRouter = String(x.args.gw);
        x.dirty();
      },
    },
    {
      modes: ['dhcp-config'],
      toks: [kw('dns-server', 'DNS servers'), ip('dns', "Server's IP address")],
      run: (x) => {
        x.cfg.dhcp.pools[x.session.ctxName!].dnsServer = String(x.args.dns);
        x.dirty();
      },
    },
    {
      modes: ['dhcp-config'],
      toks: [kw('lease', 'Address lease time'), num('days', 0, 365, '<0-365> Days')],
      run: (x) => {
        x.cfg.dhcp.pools[x.session.ctxName!].leaseDays = Number(x.args.days);
        x.dirty();
      },
    },
    {
      modes: IFM,
      toks: [
        kw('ip', 'Interface Internet Protocol config commands'),
        kw('helper-address', 'Specify a destination address for UDP broadcasts'),
        ip('h', 'IP destination address'),
      ],
      run: (x) => {
        const e = needL3If(x);
        if (e) return e;
        const c = ifCfg(x);
        c.helpers = [...new Set([...(c.helpers ?? []), String(x.args.h)])];
        x.dirty();
      },
    },
    {
      modes: IFM,
      toks: [
        NO(),
        kw('ip', 'Interface Internet Protocol config commands'),
        kw('helper-address', 'Specify a destination address for UDP broadcasts'),
        ip('h', 'IP destination address'),
      ],
      run: (x) => {
        const c = ifCfg(x);
        c.helpers = (c.helpers ?? []).filter((h) => h !== String(x.args.h));
        x.dirty();
      },
    },
    {
      modes: PRIV,
      toks: [
        kw('show', 'Show running system information'),
        kw('ip', 'IP information'),
        kw('dhcp', 'Show items in the DHCP database'),
        kw('binding', 'DHCP address bindings'),
      ],
      run: (x) => F3.showDhcpBinding(x.ctx.sim, x.device),
    },
    {
      modes: PRIV,
      toks: [
        kw('show', 'Show running system information'),
        kw('ip', 'IP information'),
        kw('dhcp', 'Show items in the DHCP database'),
        kw('pool', 'DHCP pools information'),
      ],
      run: (x) => F3.showDhcpPool(x.ctx.sim, x.device, x.cfg),
    },
    {
      modes: PRIV,
      toks: [
        kw('clear', 'Reset functions'),
        kw('ip', 'IP'),
        kw('dhcp', 'Delete items from the DHCP database'),
        kw('binding', 'DHCP address bindings'),
        word('star', '* Clear all automatic bindings'),
      ],
      run: (x) => {
        if (String(x.args.star) !== '*') return x.invalid();
        x.ctx.sim.clearBindings(x.device.id);
      },
    },

    // ===================================================================== HSRP / VRRP
    ...(['standby', 'vrrp'] as const).flatMap((cmd): Cmd[] => {
      const proto = cmd === 'standby' ? 'hsrp' : 'vrrp';
      const help = cmd === 'standby' ? 'HSRP interface configuration commands' : 'VRRP Interface configuration commands';
      const grp = num('g', 0, 255, '<0-255> group number');
      return [
        {
          modes: IFM,
          toks: [kw(cmd, help), grp, kw('ip', 'Enable group and set virtual IP address'), ip('vip', 'Virtual IP address')],
          run: (x) => {
            const e = needL3If(x);
            if (e) return e;
            fhrp(x, proto, Number(x.args.g)).ip = String(x.args.vip);
            x.dirty();
          },
        },
        {
          modes: IFM,
          toks: [kw(cmd, help), grp, kw('priority', 'Priority level'), num('p', 1, 254, '<1-254> Priority value')],
          run: (x) => {
            fhrp(x, proto, Number(x.args.g)).priority = Number(x.args.p);
            x.dirty();
          },
        },
        {
          modes: IFM,
          toks: [kw(cmd, help), grp, kw('preempt', 'Overthrow lower priority Active routers')],
          run: (x) => {
            fhrp(x, proto, Number(x.args.g)).preempt = true;
            x.dirty();
          },
        },
        {
          modes: IFM,
          toks: [NO(), kw(cmd, help), grp, kw('preempt', 'Overthrow lower priority Active routers')],
          run: (x) => {
            fhrp(x, proto, Number(x.args.g)).preempt = false;
            x.dirty();
          },
        },
        {
          modes: IFM,
          toks: [
            kw(cmd, help),
            grp,
            kw('track', 'Priority tracking'),
            iface('t', 'Tracked interface'),
            kw('decrement', 'Priority decrement'),
            num('d', 1, 255, '<1-255> Decrement value'),
          ],
          run: (x) => {
            const g = fhrp(x, proto, Number(x.args.g));
            g.track = [...g.track.filter((t) => t.iface !== String(x.args.t)), { iface: String(x.args.t), decrement: Number(x.args.d) }];
            x.dirty();
          },
        },
        {
          modes: IFM,
          toks: [NO(), kw(cmd, help), grp],
          run: (x) => {
            const c = ifCfg(x);
            c.fhrp = (c.fhrp ?? []).filter((f) => !(f.protocol === proto && f.group === Number(x.args.g)));
            x.dirty();
          },
        },
      ];
    }),
    {
      modes: EXEC,
      toks: [kw('show', 'Show running system information'), kw('standby', 'HSRP information'), kw('brief', 'Brief output')],
      run: (x) => F3.showFhrpBrief(x.ctx.sim, x.device, 'hsrp'),
    },
    {
      modes: EXEC,
      toks: [kw('show', 'Show running system information'), kw('vrrp', 'VRRP information'), kw('brief', 'Brief output')],
      run: (x) => F3.showFhrpBrief(x.ctx.sim, x.device, 'vrrp'),
    },

    // ===================================================================== QoS (MQC)
    ...(['match-any', 'match-all', ''] as const).map(
      (m): Cmd => ({
        modes: CONF,
        toks: [
          kw('class-map', 'Configure CPL Class Map'),
          ...(m ? [kw(m, m === 'match-any' ? 'Logical-OR all matching statements' : 'Logical-AND all matching statements')] : []),
          word('name', 'class-map name'),
        ],
        run: (x) => {
          const n = String(x.args.name);
          if (n === 'class-default') return '% class-default is predefined';
          x.cfg.qos.classMaps[n] ??= { matchAll: m !== 'match-any', dscp: [] };
          if (m) x.cfg.qos.classMaps[n].matchAll = m === 'match-all';
          x.dirty();
          x.setMode('config-cmap', { ctxName: n });
        },
      }),
    ),
    {
      modes: CONF,
      toks: [NO(), kw('class-map', 'Configure CPL Class Map'), word('name', 'class-map name')],
      run: (x) => {
        delete x.cfg.qos.classMaps[String(x.args.name)];
        x.dirty();
      },
    },
    ...[false, true].map(
      (neg): Cmd => ({
        modes: ['config-cmap'],
        toks: [
          ...(neg ? [NO()] : []),
          kw('match', 'classification criteria'),
          kw('dscp', 'Match DSCP in IPv4 and IPv6 packets'),
          line('vals', 'DSCP values, e.g. ef af31 46'),
        ],
        run: (x) => {
          const vals: number[] = [];
          for (const t of String(x.args.vals).split(/\s+/)) {
            const v = parseDscp(t);
            if (v === null) return `% Invalid DSCP value ${t}`;
            vals.push(v);
          }
          const cm = x.cfg.qos.classMaps[x.session.ctxName!];
          cm.dscp = neg ? cm.dscp.filter((d) => !vals.includes(d)) : [...new Set([...cm.dscp, ...vals])];
          x.dirty();
        },
      }),
    ),
    ...[false, true].map(
      (neg): Cmd => ({
        modes: ['config-cmap'],
        toks: [
          ...(neg ? [NO()] : []),
          kw('match', 'classification criteria'),
          kw('mpls', 'Multi Protocol Label Switching specific values'),
          kw('experimental', 'Match MPLS experimental'),
          kw('topmost', 'Match MPLS experimental value on topmost label'),
          line('vals', 'EXP values 0-7, e.g. 5 6'),
        ],
        run: (x) => {
          const vals: number[] = [];
          for (const t of String(x.args.vals).split(/\s+/)) {
            if (!/^[0-7]$/.test(t)) return `% Invalid MPLS experimental value ${t} (0-7)`;
            vals.push(Number(t));
          }
          const cm = x.cfg.qos.classMaps[x.session.ctxName!];
          const cur = cm.exp ?? [];
          cm.exp = neg ? cur.filter((d) => !vals.includes(d)) : [...new Set([...cur, ...vals])];
          x.dirty();
        },
      }),
    ),
    {
      modes: CONF,
      toks: [kw('policy-map', 'Configure QoS Policy Map'), word('name', 'policy-map name')],
      run: (x) => {
        const n = String(x.args.name);
        x.cfg.qos.policyMaps[n] ??= { classes: [] };
        x.dirty();
        x.setMode('config-pmap', { ctxName: n });
      },
    },
    {
      modes: CONF,
      toks: [NO(), kw('policy-map', 'Configure QoS Policy Map'), word('name', 'policy-map name')],
      run: (x) => {
        delete x.cfg.qos.policyMaps[String(x.args.name)];
        x.dirty();
      },
    },
    // IOS accepts "class X" in policy-map class mode too: it moves to class X.
    {
      modes: ['config-pmap', 'config-pmap-c'],
      toks: [kw('class', 'policy criteria'), word('name', 'class-map name')],
      run: (x) => {
        const n = String(x.args.name);
        if (n !== 'class-default' && !x.cfg.qos.classMaps[n]) return `% class-map ${n} not configured`;
        const pm = x.cfg.qos.policyMaps[x.session.ctxName!];
        if (!pm.classes.some((c) => c.name === n)) pm.classes.push({ name: n });
        x.dirty();
        x.setMode('config-pmap-c', { ctxName: x.session.ctxName, pmapClass: n });
      },
    },
    {
      modes: ['config-pmap'],
      toks: [NO(), kw('class', 'policy criteria'), word('name', 'class-map name')],
      run: (x) => {
        const pm = x.cfg.qos.policyMaps[x.session.ctxName!];
        pm.classes = pm.classes.filter((c) => c.name !== String(x.args.name));
        x.dirty();
      },
    },
    ...(
      [
        ['priority', 'Strict Scheduling Priority for this Class', 'priorityPercent'],
        ['bandwidth', 'Bandwidth', 'bandwidthPercent'],
      ] as const
    ).flatMap(([k, help, field]): Cmd[] => [
      {
        modes: ['config-pmap-c'],
        toks: [kw(k, help), kw('percent', '% of total bandwidth'), num('p', 1, 100, '<1-100> percentage')],
        run: (x) => {
          const c = pmapClass(x);
          const other = field === 'priorityPercent' ? 'bandwidthPercent' : 'priorityPercent';
          if (c[other] !== undefined) return `% Cannot configure both priority and bandwidth in class ${c.name}`;
          c[field] = Number(x.args.p);
          const pm = x.cfg.qos.policyMaps[x.session.ctxName!];
          const total = pm.classes.reduce((a, b) => a + (b.priorityPercent ?? 0) + (b.bandwidthPercent ?? 0), 0);
          x.dirty();
          if (total > 100) return `% Warning: total guaranteed bandwidth is ${total}% (more than 100%)`;
        },
      },
      {
        modes: ['config-pmap-c'],
        toks: [NO(), kw(k, help)],
        run: (x) => {
          delete pmapClass(x)[field];
          x.dirty();
        },
      },
    ]),
    {
      modes: ['config-pmap-c'],
      toks: [kw('set', 'Set QoS values'), kw('dscp', 'Set DSCP in IP(v4) and IPv6 packets'), word('v', 'DSCP value (ef, af31, 46…)')],
      run: (x) => {
        const v = parseDscp(String(x.args.v));
        if (v === null) return '% Invalid DSCP value';
        pmapClass(x).setDscp = v;
        x.dirty();
      },
    },
    ...(['imposition', 'topmost'] as const).flatMap((k): Cmd[] => [
      {
        modes: ['config-pmap-c'],
        toks: [
          kw('set', 'Set QoS values'),
          kw('mpls', 'Set MPLS specific values'),
          kw('experimental', 'Set MPLS experimental value'),
          kw(k, k === 'imposition' ? 'Set experimental value at tag imposition' : 'Set experimental value on topmost label'),
          num('v', 0, 7, '<0-7> Experimental value'),
        ],
        run: (x) => {
          pmapClass(x)[k === 'imposition' ? 'setExpImposition' : 'setExpTopmost'] = Number(x.args.v);
          x.dirty();
        },
      },
      {
        modes: ['config-pmap-c'],
        toks: [
          NO(),
          kw('set', 'Set QoS values'),
          kw('mpls', 'Set MPLS specific values'),
          kw('experimental', 'Set MPLS experimental value'),
          kw(k, 'EXP set point'),
        ],
        run: (x) => {
          delete pmapClass(x)[k === 'imposition' ? 'setExpImposition' : 'setExpTopmost'];
          x.dirty();
        },
      },
    ]),
    {
      modes: ['config-pmap-c'],
      toks: [NO(), kw('set', 'Set QoS values'), kw('dscp', 'Set DSCP')],
      run: (x) => {
        delete pmapClass(x).setDscp;
        x.dirty();
      },
    },
    ...(['input', 'output'] as const).flatMap((d): Cmd[] => [
      {
        modes: IFM,
        toks: [
          kw('service-policy', 'Configure CPL Service Policy'),
          kw(d, `Assign policy-map to the ${d} of an interface`),
          word('name', 'policy-map name'),
        ],
        run: (x) => {
          const e = needL3If(x);
          if (e) return e;
          const n = String(x.args.name);
          if (!x.cfg.qos.policyMaps[n]) return `% policy map ${n} not configured`;
          if (d === 'input') ifCfg(x).servicePolicyIn = n;
          else ifCfg(x).servicePolicyOut = n;
          x.dirty();
        },
      },
      {
        modes: IFM,
        toks: [NO(), kw('service-policy', 'Configure CPL Service Policy'), kw(d, `${d} policy`), word('name', 'policy-map name')],
        run: (x) => {
          if (d === 'input') delete ifCfg(x).servicePolicyIn;
          else delete ifCfg(x).servicePolicyOut;
          x.dirty();
        },
      },
    ]),
    {
      modes: EXEC,
      toks: [kw('show', 'Show running system information'), kw('class-map', 'Show QoS Class Map')],
      run: (x) => F3.showClassMaps(x.cfg),
    },
    {
      modes: EXEC,
      toks: [kw('show', 'Show running system information'), kw('policy-map', 'Show QoS Policy Map')],
      run: (x) => F3.showPolicyMaps(x.cfg),
    },
    {
      modes: EXEC,
      toks: [
        kw('show', 'Show running system information'),
        kw('policy-map', 'Show QoS Policy Map'),
        kw('interface', 'Show Qos Policy Map Interface'),
        iface(),
      ],
      run: (x) => F3.showPolicyInterface(x.ctx.sim, x.device, String(x.args.if)),
    },

    // ===================================================================== show (OSPF, ACL, logging)
    {
      modes: EXEC,
      toks: [
        kw('show', 'Show running system information'),
        kw('ip', 'IP information'),
        kw('ospf', 'OSPF information'),
        kw('neighbor', 'Neighbor list'),
      ],
      run: (x) => F3.showOspfNeighbor(x.ctx.sim, x.device),
    },
    {
      modes: EXEC,
      toks: [
        kw('show', 'Show running system information'),
        kw('ip', 'IP information'),
        kw('ospf', 'OSPF information'),
        kw('interface', 'Interface information'),
        kw('brief', 'Brief summary of OSPF interfaces'),
      ],
      run: (x) => F3.showOspfIntBrief(x.ctx.sim, x.device),
    },
    {
      modes: EXEC,
      toks: [
        kw('show', 'Show running system information'),
        kw('ip', 'IP information'),
        kw('ospf', 'OSPF information'),
        kw('interface', 'Interface information'),
      ],
      run: (x) => F3.showOspfInterface(x.ctx.sim, x.device),
    },
    {
      modes: EXEC,
      toks: [
        kw('show', 'Show running system information'),
        kw('ip', 'IP information'),
        kw('ospf', 'OSPF information'),
        kw('interface', 'Interface information'),
        iface(),
      ],
      run: (x) => F3.showOspfInterface(x.ctx.sim, x.device, String(x.args.if)),
    },
    {
      modes: EXEC,
      toks: [
        kw('show', 'Show running system information'),
        kw('ip', 'IP information'),
        kw('ospf', 'OSPF information'),
        kw('database', 'Database summary'),
      ],
      run: (x) => F3.showOspfDatabase(x.ctx.sim, x.device),
    },
    {
      modes: EXEC,
      toks: [
        kw('show', 'Show running system information'),
        kw('ip', 'IP information'),
        kw('protocols', 'IP routing protocol process parameters and statistics'),
      ],
      run: (x) => F3.showIpProtocols(x.ctx.sim, x.device, x.cfg),
    },
    {
      modes: EXEC,
      toks: [kw('show', 'Show running system information'), kw('access-lists', 'List access lists')],
      run: (x) => F3.showAccessLists(x.ctx.sim, x.device, x.cfg),
    },
    {
      modes: EXEC,
      toks: [kw('show', 'Show running system information'), kw('access-lists', 'List access lists'), word('name', 'ACL name or number')],
      run: (x) => F3.showAccessLists(x.ctx.sim, x.device, x.cfg, String(x.args.name)),
    },
    {
      modes: EXEC,
      toks: [kw('show', 'Show running system information'), kw('logging', 'Show the contents of logging buffers')],
      run: (x) => F3.showLogging(x.ctx.sim, x.device),
    },
  ];
}

function excluded(x: Exec, neg: boolean): string | void {
  const a = String(x.args.a);
  const b = x.args.b !== undefined ? String(x.args.b) : a;
  if (parseIpv4(b)! < parseIpv4(a)!) return '% Low address must be lower than high address';
  const ex: NetConfig['dhcp']['excluded'] = x.cfg.dhcp.excluded.filter((r) => !(r.from === a && r.to === b));
  if (!neg) ex.push({ from: a, to: b });
  x.cfg.dhcp.excluded = ex;
  x.dirty();
}

function pmapClass(x: Exec) {
  const pm = x.cfg.qos.policyMaps[x.session.ctxName!];
  return pm.classes.find((c) => c.name === x.session.pmapClass)!;
}
