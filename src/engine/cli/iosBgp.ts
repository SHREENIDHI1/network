import { longIfName, roleOf, type BgpConfig, type BgpNeighborConfig, type VrfConfig } from '../config/netConfig';
import { validRdRt } from '../bgp/bgp';
import { maskToPrefix, parseIpv4 } from '../ip/ipv4';
import * as B from './formatBgp';
import * as F from './format';
import { CONF, EXEC, IFM, ifCfg, iface, ip, kw, line, mask, num, pingCmd, word, type Cmd, type CliMode, type Exec, type Tok } from './ios';

/**
 * VRF, BGP and MP-BGP VPNv4 commands (P5), IOS-XE style. On NEON profiles
 * this is the simulator's generic syntax, not official NEON syntax.
 */

const NO = () => kw('no', 'Negate a command or set its defaults');
const VRF: CliMode[] = ['config-vrf'];
const VRF_ANY: CliMode[] = ['config-vrf', 'config-vrf-af'];
const BGP: CliMode[] = ['config-router-bgp'];
const AF: CliMode[] = ['config-router-af'];
const routerRole = (x: Exec) => ['router', 'l3switch'].includes(roleOf(x.device.kind));
const showKw = () => kw('show', 'Show running system information');
const nbr = () => kw('neighbor', 'Specify a neighbor router');
const nip = () => ip('n', 'Neighbor address');

function vrfOf(x: Exec): VrfConfig {
  return x.cfg.vrfs[x.session.ctxName!];
}
function bgp(x: Exec): BgpConfig {
  return x.cfg.bgp!;
}
/** The global neighbor being configured; error text if it does not exist yet. */
function neighbor(x: Exec): BgpNeighborConfig | string {
  const n = bgp(x).neighbors[String(x.args.n)];
  return n ?? '% Specify remote-as or peer-group commands first';
}
/** Current address family: 'ipv4' (also router mode), 'vpnv4' or 'vrf:NAME'. */
const afOf = (x: Exec) => (x.session.mode === 'config-router-af' ? (x.session.bgpAf ?? 'ipv4') : 'ipv4');
const vrfAf = (x: Exec) => {
  const a = afOf(x);
  return a.startsWith('vrf:') ? a.slice(4) : undefined;
};

function enterVrf(x: Exec): string | void {
  if (!routerRole(x)) return x.invalid();
  const n = String(x.args.name);
  x.cfg.vrfs[n] ??= { importRts: [], exportRts: [] };
  x.dirty();
  x.setMode('config-vrf', { ctxName: n });
}

function removeVrf(x: Exec): string | void {
  const n = String(x.args.name);
  if (!x.cfg.vrfs[n]) return `% VRF ${n} does not exist`;
  delete x.cfg.vrfs[n];
  const removed: string[] = [];
  for (const [ifn, ic] of Object.entries(x.cfg.interfaces))
    if (ic.vrf === n) {
      delete ic.vrf;
      delete ic.ip;
      removed.push(longIfName(ifn));
    }
  x.cfg.staticRoutes = x.cfg.staticRoutes.filter((r) => r.vrf !== n);
  if (x.cfg.bgp) delete x.cfg.bgp.vrfs[n];
  x.dirty();
  if (removed.length) return removed.map((i) => `% Interface ${i} IPv4 disabled and address(es) removed due to deletion of VRF ${n}`).join('\n');
}

function setRt(x: Exec, dir: string, remove: boolean): string | void {
  const rt = String(x.args.rt);
  if (!validRdRt(rt)) return '% Invalid route target: use ASN:nn or A.B.C.D:nn';
  const v = vrfOf(x);
  const apply = (list: string[]) => (remove ? list.filter((r) => r !== rt) : list.includes(rt) ? list : [...list, rt]);
  if (dir === 'export' || dir === 'both') v.exportRts = apply(v.exportRts);
  if (dir === 'import' || dir === 'both') v.importRts = apply(v.importRts);
  x.dirty();
}

function setIfVrf(x: Exec): string | void {
  const n = String(x.args.name);
  if (!x.cfg.vrfs[n]) return `% VRF ${n} not configured.`;
  const ic = ifCfg(x);
  const had = !!ic.ip;
  ic.vrf = n;
  delete ic.ip;
  delete ic.mplsIp;
  x.dirty();
  if (had) return `% Interface ${longIfName(x.session.iface!)} IPv4 disabled and address(es) removed due to enabling VRF ${n}`;
}

function vrfRoute(x: Exec, remove: boolean): string | void {
  const vrf = String(x.args.vrf);
  if (!x.cfg.vrfs[vrf]) return `% VRF ${vrf} does not exist`;
  const prefix = String(x.args.prefix);
  const m = String(x.args.mask);
  const len = maskToPrefix(m);
  const net = parseIpv4(prefix);
  if (len === null || net === null) return '% Inconsistent address and mask';
  if (len < 32 && (net & ~(len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0)) >>> 0) return '% Inconsistent address and mask';
  const nextHop = x.args.nh !== undefined ? String(x.args.nh) : undefined;
  const exitInterface = x.args.exit !== undefined ? String(x.args.exit) : undefined;
  const same = (r: (typeof x.cfg.staticRoutes)[number]) =>
    r.vrf === vrf &&
    r.prefix === prefix &&
    r.mask === m &&
    (r.nextHop ?? '') === (nextHop ?? '') &&
    (r.exitInterface ?? '') === (exitInterface ?? '');
  if (remove) {
    const before = x.cfg.staticRoutes.length;
    x.cfg.staticRoutes = x.cfg.staticRoutes.filter((r) => !same(r));
    if (x.cfg.staticRoutes.length === before) return '%No matching route to delete';
  } else if (!x.cfg.staticRoutes.some(same)) x.cfg.staticRoutes.push({ prefix, mask: m, nextHop, exitInterface, vrf });
  x.dirty();
}

function enterBgp(x: Exec): string | void {
  if (!routerRole(x)) return x.invalid();
  const asn = Number(x.args.asn);
  if (x.cfg.bgp && x.cfg.bgp.asn !== asn) return `% BGP is already running; AS is ${x.cfg.bgp.asn}`;
  if (!x.cfg.bgp) {
    x.cfg.bgp = { asn, noDefaultIpv4: false, neighbors: {}, networks: [], redistributeConnected: false, redistributeStatic: false, vrfs: {} };
    x.dirty();
  }
  x.setMode('config-router-bgp');
  if (roleOf(x.device.kind) === 'l3switch' && !x.cfg.ipRouting) return '% IP routing not enabled ("ip routing") — BGP will not run until it is.';
}

/** network / redistribute in the current context (global or VRF address family). */
function ctx(x: Exec) {
  const v = vrfAf(x);
  if (!v) return bgp(x);
  bgp(x).vrfs[v] ??= { neighbors: {}, networks: [], redistributeConnected: false, redistributeStatic: false };
  return bgp(x).vrfs[v];
}

function network(x: Exec, remove: boolean): string | void {
  const prefix = String(x.args.net);
  const m = String(x.args.mask);
  if (maskToPrefix(m) === null) return '% Invalid mask';
  const c = ctx(x);
  if (afOf(x) === 'vpnv4') return x.invalid();
  c.networks = remove
    ? c.networks.filter((n) => !(n.prefix === prefix && n.mask === m))
    : c.networks.some((n) => n.prefix === prefix && n.mask === m)
      ? c.networks
      : [...c.networks, { prefix, mask: m }];
  x.dirty();
}

/** Neighbor flag in the current address family. */
function afFlag(x: Exec, flag: 'activate' | 'rrClient' | 'nextHopSelf', on: boolean): string | void {
  const v = vrfAf(x);
  if (v) {
    const n = bgp(x).vrfs[v]?.neighbors[String(x.args.n)];
    if (!n) return '% Specify remote-as or peer-group commands first';
    if (flag !== 'activate') return x.invalid();
    n.activate = on;
    x.dirty();
    return;
  }
  const n = neighbor(x);
  if (typeof n === 'string') return n;
  const vpn = afOf(x) === 'vpnv4';
  if (flag === 'activate') {
    if (vpn) n.vpnv4 = on;
    else n.ipv4 = on;
  } else if (flag === 'rrClient') {
    if (vpn) n.rrClientVpnv4 = on;
    else n.rrClient = on;
  } else n.nextHopSelf = on;
  x.dirty();
}

const fec = (): Tok[] => [ip('net', 'Network number'), kw('mask', 'Network mask'), mask('mask', 'Network mask')];

export function bgpCmds(): Cmd[] {
  const rtDir = ['export', 'import', 'both'] as const;
  return [
    // ------------------------------------------------------------------ VRF
    { modes: CONF, toks: [kw('vrf', 'VRF commands'), kw('definition', 'VRF definition'), word('name', 'VRF name')], run: enterVrf },
    {
      modes: CONF,
      toks: [kw('ip', 'Global IP configuration subcommands'), kw('vrf', 'Configure an IP VPN Routing/Forwarding instance'), word('name', 'VRF name')],
      run: enterVrf,
    },
    { modes: CONF, toks: [NO(), kw('vrf', 'VRF commands'), kw('definition', 'VRF definition'), word('name', 'VRF name')], run: removeVrf },
    {
      modes: CONF,
      toks: [
        NO(),
        kw('ip', 'Global IP configuration subcommands'),
        kw('vrf', 'Configure an IP VPN Routing/Forwarding instance'),
        word('name', 'VRF name'),
      ],
      run: removeVrf,
    },
    {
      modes: VRF,
      toks: [kw('rd', 'Specify Route Distinguisher'), word('rd', 'ASN:nn or IP-address:nn')],
      run: (x) => {
        const rd = String(x.args.rd);
        if (!validRdRt(rd)) return '% Invalid RD: use ASN:nn or A.B.C.D:nn';
        const v = vrfOf(x);
        if (v.rd && v.rd !== rd) return `% Do "no rd ${v.rd}" first`;
        v.rd = rd;
        x.dirty();
      },
    },
    {
      modes: VRF,
      toks: [NO(), kw('rd', 'Specify Route Distinguisher')],
      run: (x) => {
        delete vrfOf(x).rd;
        x.dirty();
      },
    },
    {
      modes: VRF,
      toks: [NO(), kw('rd', 'Specify Route Distinguisher'), word('rd', 'ASN:nn or IP-address:nn')],
      run: (x) => {
        delete vrfOf(x).rd;
        x.dirty();
      },
    },
    {
      modes: VRF,
      toks: [kw('description', 'VRF specific description'), line('d', 'Up to 80 characters describing this VRF')],
      run: (x) => {
        vrfOf(x).description = String(x.args.d);
        x.dirty();
      },
    },
    ...rtDir.flatMap((d): Cmd[] => [
      {
        modes: VRF_ANY,
        toks: [
          kw('route-target', 'Specify Target VPN Extended Communities'),
          kw(d, `${d} Target-VPN community`),
          word('rt', 'ASN:nn or IP-address:nn'),
        ],
        run: (x) => setRt(x, d, false),
      },
      {
        modes: VRF_ANY,
        toks: [
          NO(),
          kw('route-target', 'Specify Target VPN Extended Communities'),
          kw(d, `${d} Target-VPN community`),
          word('rt', 'ASN:nn or IP-address:nn'),
        ],
        run: (x) => setRt(x, d, true),
      },
    ]),
    ...[[], [kw('unicast', 'Address Family modifier')]].map(
      (extra): Cmd => ({
        modes: VRF,
        toks: [kw('address-family', 'Enter Address Family command mode'), kw('ipv4', 'Address family'), ...extra],
        run: (x) => x.setMode('config-vrf-af', { ctxName: x.session.ctxName }),
      }),
    ),
    {
      modes: ['config-vrf-af'],
      toks: [kw('exit-address-family', 'Exit from Address Family configuration mode')],
      run: (x) => x.setMode('config-vrf', { ctxName: x.session.ctxName }),
    },
    // Interface membership
    ...[[], [kw('ip', 'Interface Internet Protocol config commands')]].flatMap((lead): Cmd[] => [
      {
        modes: IFM,
        toks: [
          ...lead,
          kw('vrf', 'VPN Routing/Forwarding parameters on the interface'),
          kw('forwarding', 'Configure forwarding table'),
          word('name', 'VRF name'),
        ],
        run: setIfVrf,
      },
      {
        modes: IFM,
        toks: [NO(), ...lead, kw('vrf', 'VPN Routing/Forwarding parameters on the interface'), kw('forwarding', 'Configure forwarding table')],
        run: (x) => {
          const ic = ifCfg(x);
          const v = ic.vrf;
          if (!v) return;
          delete ic.vrf;
          const had = !!ic.ip;
          delete ic.ip;
          x.dirty();
          if (had) return `% Interface ${longIfName(x.session.iface!)} IPv4 disabled and address(es) removed due to disabling VRF ${v}`;
        },
      },
    ]),
    // ip route vrf
    ...([false, true] as const).flatMap((remove): Cmd[] => {
      const base: Tok[] = [
        ...(remove ? [NO()] : []),
        kw('ip', 'Global IP configuration subcommands'),
        kw('route', 'Establish static routes'),
        kw('vrf', 'Configure static route for a VPN Routing/Forwarding instance'),
        word('vrf', 'VRF name'),
        ip('prefix', 'Destination prefix'),
        mask('mask', 'Destination prefix mask'),
      ];
      return [
        { modes: CONF, toks: [...base, ip('nh', "Forwarding router's address")], run: (x) => vrfRoute(x, remove) },
        { modes: CONF, toks: [...base, iface('exit', 'Outgoing interface')], run: (x) => vrfRoute(x, remove) },
        {
          modes: CONF,
          toks: [...base, iface('exit', 'Outgoing interface'), ip('nh', "Forwarding router's address")],
          run: (x) => vrfRoute(x, remove),
        },
      ];
    }),

    // ------------------------------------------------------------------ BGP
    {
      modes: CONF,
      toks: [
        kw('router', 'Enable a routing process'),
        kw('bgp', 'Border Gateway Protocol (BGP)'),
        num('asn', 1, 4294967295, '<1-4294967295> Autonomous system number'),
      ],
      run: enterBgp,
    },
    {
      modes: CONF,
      toks: [
        NO(),
        kw('router', 'Enable a routing process'),
        kw('bgp', 'Border Gateway Protocol (BGP)'),
        num('asn', 1, 4294967295, '<1-4294967295> Autonomous system number'),
      ],
      run: (x) => {
        if (x.cfg.bgp?.asn !== Number(x.args.asn)) return '% BGP not running with this AS number';
        delete x.cfg.bgp;
        x.dirty();
      },
    },
    {
      modes: BGP,
      toks: [
        kw('bgp', 'BGP specific commands'),
        kw('router-id', 'Override configured router identifier'),
        ip('rid', 'Manually configured router identifier'),
      ],
      run: (x) => {
        bgp(x).routerId = String(x.args.rid);
        x.dirty();
      },
    },
    {
      modes: BGP,
      toks: [kw('bgp', 'BGP specific commands'), kw('log-neighbor-changes', 'Log neighbor up/down and reset reason')],
      run: () => undefined,
    },
    ...([true, false] as const).map(
      (on): Cmd => ({
        modes: BGP,
        toks: [
          ...(on ? [] : [NO()]),
          kw('bgp', 'BGP specific commands'),
          kw('default', 'Configure BGP defaults'),
          kw('ipv4-unicast', 'Activate ipv4-unicast for a peer by default'),
        ],
        run: (x) => {
          bgp(x).noDefaultIpv4 = !on;
          x.dirty();
        },
      }),
    ),
    {
      modes: [...BGP, ...AF],
      toks: [nbr(), nip(), kw('remote-as', 'Specify a BGP neighbor'), num('as', 1, 4294967295, '<1-4294967295> AS of remote neighbor')],
      run: (x) => {
        const v = vrfAf(x);
        const asn = Number(x.args.as);
        if (v) {
          ctx(x);
          bgp(x).vrfs[v].neighbors[String(x.args.n)] = { remoteAs: asn, activate: true };
        } else if (x.session.mode === 'config-router-af' && afOf(x) === 'vpnv4') return x.invalid();
        else {
          const ex = bgp(x).neighbors[String(x.args.n)];
          bgp(x).neighbors[String(x.args.n)] = { ...(ex ?? {}), remoteAs: asn };
        }
        x.dirty();
      },
    },
    {
      modes: [...BGP, ...AF],
      toks: [NO(), nbr(), nip()],
      run: (x) => {
        const v = vrfAf(x);
        if (v) delete bgp(x).vrfs[v]?.neighbors[String(x.args.n)];
        else delete bgp(x).neighbors[String(x.args.n)];
        x.dirty();
      },
    },
    {
      modes: BGP,
      toks: [nbr(), nip(), kw('update-source', 'Source of routing updates'), iface('src', 'Interface')],
      run: (x) => {
        const n = neighbor(x);
        if (typeof n === 'string') return n;
        n.updateSource = String(x.args.src);
        x.dirty();
      },
    },
    {
      modes: BGP,
      toks: [NO(), nbr(), nip(), kw('update-source', 'Source of routing updates')],
      run: (x) => {
        const n = neighbor(x);
        if (typeof n === 'string') return n;
        delete n.updateSource;
        x.dirty();
      },
    },
    {
      modes: BGP,
      toks: [nbr(), nip(), kw('description', 'Neighbor specific description'), line('d', 'Up to 80 characters describing this neighbor')],
      run: (x) => {
        const n = neighbor(x);
        if (typeof n === 'string') return n;
        n.description = String(x.args.d);
        x.dirty();
      },
    },
    ...[[], [num('hops', 1, 255, '<1-255> maximum hop count')]].map(
      (extra): Cmd => ({
        modes: BGP,
        toks: [nbr(), nip(), kw('ebgp-multihop', 'Allow EBGP neighbors not on directly connected networks'), ...extra],
        run: (x) => {
          const n = neighbor(x);
          if (typeof n === 'string') return n;
          n.ebgpMultihop = typeof x.args.hops === 'number' ? x.args.hops : 255;
          x.dirty();
        },
      }),
    ),
    ...([true, false] as const).map(
      (on): Cmd => ({
        modes: BGP,
        toks: [...(on ? [] : [NO()]), nbr(), nip(), kw('shutdown', 'Administratively shut down this neighbor')],
        run: (x) => {
          const n = neighbor(x);
          if (typeof n === 'string') return n;
          n.shutdown = on || undefined;
          x.dirty();
        },
      }),
    ),
    ...([true, false] as const).flatMap((on): Cmd[] =>
      (
        [
          ['activate', 'Enable the Address Family for this Neighbor', 'activate'],
          ['route-reflector-client', 'Configure a neighbor as Route Reflector client', 'rrClient'],
          ['next-hop-self', 'Disable the next hop calculation for this neighbor', 'nextHopSelf'],
        ] as const
      ).map(
        ([w, help, flag]): Cmd => ({
          modes: [...BGP, ...AF],
          toks: [...(on ? [] : [NO()]), nbr(), nip(), kw(w, help)],
          run: (x) => afFlag(x, flag, on),
        }),
      ),
    ),
    ...[[], ...['extended', 'both', 'standard'].map((w) => [kw(w, `Send ${w} community attribute`)])].map(
      (extra): Cmd => ({
        modes: [...BGP, ...AF],
        toks: [nbr(), nip(), kw('send-community', 'Send Community attribute to this neighbor'), ...extra],
        run: (x) => {
          if (vrfAf(x)) return;
          const n = neighbor(x);
          if (typeof n === 'string') return n;
        },
      }),
    ),
    { modes: [...BGP, ...AF], toks: [kw('network', 'Specify a network to announce via BGP'), ...fec()], run: (x) => network(x, false) },
    { modes: [...BGP, ...AF], toks: [NO(), kw('network', 'Specify a network to announce via BGP'), ...fec()], run: (x) => network(x, true) },
    ...([true, false] as const).flatMap((on): Cmd[] =>
      (['connected', 'static'] as const).map(
        (what): Cmd => ({
          modes: [...BGP, ...AF],
          toks: [
            ...(on ? [] : [NO()]),
            kw('redistribute', 'Redistribute information from another routing protocol'),
            kw(what, `${what === 'connected' ? 'Connected' : 'Static'} routes`),
          ],
          run: (x) => {
            if (afOf(x) === 'vpnv4') return x.invalid();
            const c = ctx(x);
            if (what === 'connected') c.redistributeConnected = on;
            else c.redistributeStatic = on;
            x.dirty();
          },
        }),
      ),
    ),
    ...[[], [kw('unicast', 'Address Family modifier')]].flatMap((extra): Cmd[] => [
      {
        modes: [...BGP, ...AF],
        toks: [kw('address-family', 'Enter Address Family command mode'), kw('ipv4', 'Address family'), ...extra],
        run: (x) => x.setMode('config-router-af', { bgpAf: 'ipv4' }),
      },
      {
        modes: [...BGP, ...AF],
        toks: [kw('address-family', 'Enter Address Family command mode'), kw('vpnv4', 'Address family'), ...extra],
        run: (x) => x.setMode('config-router-af', { bgpAf: 'vpnv4' }),
      },
    ]),
    {
      modes: [...BGP, ...AF],
      toks: [
        kw('address-family', 'Enter Address Family command mode'),
        kw('ipv4', 'Address family'),
        kw('vrf', 'Specify parameters for a VPN Routing/Forwarding instance'),
        word('vrf', 'VRF name'),
      ],
      run: (x) => {
        const v = String(x.args.vrf);
        if (!x.cfg.vrfs[v]) return `% VRF ${v} does not exist`;
        if (!x.cfg.vrfs[v].rd) return `%VRF ${v} does not have an RD configured.`;
        x.setMode('config-router-af', { bgpAf: `vrf:${v}` });
        ctx(x);
        x.dirty();
      },
    },
    { modes: AF, toks: [kw('exit-address-family', 'Exit from Address Family configuration mode')], run: (x) => x.setMode('config-router-bgp') },

    // ------------------------------------------------------------------ show
    ...[
      [kw('ip', 'IP information'), kw('bgp', 'BGP information')],
      [kw('bgp', 'BGP information'), kw('ipv4', 'Address family'), kw('unicast', 'Address Family modifier')],
    ].flatMap((pre): Cmd[] => [
      {
        modes: EXEC,
        toks: [showKw(), ...pre, kw('summary', 'Summary of BGP neighbor status')],
        run: (x) => B.showBgpSummary(x.ctx.sim, x.device, 'ipv4'),
      },
      { modes: EXEC, toks: [showKw(), ...pre], run: (x) => B.showIpBgp(x.ctx.sim, x.device) },
    ]),
    ...[
      [kw('ip', 'IP information'), kw('bgp', 'BGP information'), kw('vpnv4', 'Display VPNv4 NLRI specific information')],
      [kw('bgp', 'BGP information'), kw('vpnv4', 'Address family'), kw('unicast', 'Address Family modifier')],
    ].flatMap((pre): Cmd[] => [
      {
        modes: EXEC,
        toks: [showKw(), ...pre, kw('all', 'Display information about all VPN NLRIs'), kw('summary', 'Summary of BGP neighbor status')],
        run: (x) => B.showBgpSummary(x.ctx.sim, x.device, 'vpnv4'),
      },
      {
        modes: EXEC,
        toks: [showKw(), ...pre, kw('all', 'Display information about all VPN NLRIs')],
        run: (x) => B.showVpnv4(x.ctx.sim, x.device, x.cfg),
      },
      {
        modes: EXEC,
        toks: [showKw(), ...pre, kw('all', 'Display information about all VPN NLRIs'), kw('labels', 'Display BGP labels for prefixes')],
        run: (x) => B.showVpnv4(x.ctx.sim, x.device, x.cfg, { labels: true }),
      },
      {
        modes: EXEC,
        toks: [showKw(), ...pre, kw('vrf', 'Display information about a VRF'), word('vrf', 'VRF name')],
        run: (x) => B.showVpnv4(x.ctx.sim, x.device, x.cfg, { vrf: String(x.args.vrf) }),
      },
    ]),
    {
      modes: EXEC,
      toks: [
        showKw(),
        kw('ip', 'IP information'),
        kw('route', 'IP routing table'),
        kw('vrf', 'Display routes from a VPN Routing/Forwarding instance'),
        word('vrf', 'VRF name'),
      ],
      run: (x) => F.showIpRoute(x.ctx.sim, x.device, undefined, String(x.args.vrf)),
    },
    { modes: EXEC, toks: [showKw(), kw('vrf', 'VPN Routing/Forwarding instance information')], run: (x) => B.showVrf(x.ctx.sim, x.device, x.cfg) },
    {
      modes: EXEC,
      toks: [showKw(), kw('ip', 'IP information'), kw('vrf', 'VPN Routing/Forwarding instance information')],
      run: (x) => B.showVrf(x.ctx.sim, x.device, x.cfg),
    },
    ...[[kw('vrf', 'VRF information')], [kw('ip', 'IP information'), kw('vrf', 'VRF information')]].map(
      (pre): Cmd => ({
        modes: EXEC,
        toks: [showKw(), ...pre, kw('detail', 'Detailed VRF information'), word('vrf', 'VRF name')],
        run: (x) => B.showVrfDetail(x.ctx.sim, x.device, x.cfg, String(x.args.vrf)),
      }),
    ),

    // --------------------------------------------------------- ping / trace
    {
      modes: EXEC,
      toks: [kw('ping', 'Send echo messages'), kw('vrf', 'VRF name'), word('vrf', 'VRF name'), ip('dst', 'Ping destination address')],
      run: (x) => pingCmd(x, 'ping', String(x.args.vrf)),
    },
    {
      modes: EXEC,
      toks: [
        kw('ping', 'Send echo messages'),
        kw('vrf', 'VRF name'),
        word('vrf', 'VRF name'),
        ip('dst', 'Ping destination address'),
        kw('repeat', 'specify repeat count'),
        num('repeat', 1, 2147483647, '<1-2147483647> Repeat count'),
      ],
      run: (x) => pingCmd(x, 'ping', String(x.args.vrf)),
    },
    {
      modes: EXEC,
      toks: [
        kw('traceroute', 'Trace route to destination'),
        kw('vrf', 'VRF name'),
        word('vrf', 'VRF name'),
        ip('dst', 'Trace route to destination address'),
      ],
      run: (x) => pingCmd(x, 'traceroute', String(x.args.vrf)),
    },
  ];
}
