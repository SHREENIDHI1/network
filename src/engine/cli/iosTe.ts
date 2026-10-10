import { roleOf, type TeTunnelConfig } from '../config/netConfig';
import * as T from './formatTe';
import { CONF, EXEC, IFM, PRIV, iface, ifCfg, ip, kw, line, num, word, type Cmd, type CliMode, type Exec } from './ios';

/**
 * MPLS Traffic Engineering / RSVP-TE / FRR commands (P7), IOS style. On NEON
 * profiles this is the simulator's generic syntax, not official NEON syntax.
 */

const NO = () => kw('no', 'Negate a command or set its defaults');
const ROUTER: CliMode[] = ['config-router'];
const TUN: CliMode[] = ['config-tunnel'];
const EXPL: CliMode[] = ['config-expl-path'];
const routerRole = (x: Exec) => roleOf(x.device.kind) === 'router';
const mplsKw = () => kw('mpls', 'Configure MPLS parameters');
const teKw = () => kw('traffic-eng', 'Configure Traffic Engineering parameters');
const showKw = () => kw('show', 'Show running system information');
const tunKw = () => kw('tunnel', 'protocol-over-protocol tunneling');

const tunnel = (x: Exec): TeTunnelConfig => x.cfg.teTunnels[x.session.ctxName!];

/** "interface TunnelN": TE tunnel interface (also used by the CEM interface dispatcher). */
export function enterTunnel(x: Exec, nameText: string): string | void {
  const m = /^tu(?:n(?:n(?:e(?:l)?)?)?)?(\d+)$/i.exec(nameText);
  if (!m) return x.invalid();
  if (!routerRole(x)) return x.invalid();
  const n = `Tunnel${Number(m[1])}`;
  x.cfg.teTunnels[n] ??= { mode: 'gre', bandwidthKbps: 0, pathOptions: [], autoroute: false, frr: false };
  x.dirty();
  x.setMode('config-tunnel', { ctxName: n });
}

function setTun(x: Exec, f: (t: TeTunnelConfig) => string | void): string | void {
  const r = f(tunnel(x));
  x.dirty();
  return r;
}

export function teCmds(): Cmd[] {
  return [
    // ------------------------------------------------------------- global
    ...[true, false].map(
      (on): Cmd => ({
        modes: CONF,
        toks: [...(on ? [] : [NO()]), mplsKw(), teKw(), kw('tunnels', 'Enable MPLS TE tunnels')],
        run: (x) => {
          if (!routerRole(x)) return x.invalid();
          if (on) x.cfg.mpls.teTunnels = true;
          else delete x.cfg.mpls.teTunnels;
          x.dirty();
        },
      }),
    ),
    // ---------------------------------------------------------- interface
    ...[true, false].map(
      (on): Cmd => ({
        modes: IFM,
        toks: [...(on ? [] : [NO()]), mplsKw(), teKw(), kw('tunnels', 'Enable MPLS TE tunnels on this interface')],
        run: (x) => {
          if (!routerRole(x)) return x.invalid();
          if (on) ifCfg(x).teEnabled = true;
          else delete ifCfg(x).teEnabled;
          x.dirty();
        },
      }),
    ),
    {
      modes: IFM,
      toks: [
        kw('ip', 'Interface Internet Protocol config commands'),
        kw('rsvp', 'RSVP Interface Commands'),
        kw('bandwidth', 'RSVP reservable bandwidth (kbps)'),
      ],
      run: (x) => {
        if (!routerRole(x)) return x.invalid();
        ifCfg(x).rsvpBandwidth = 'default';
        x.dirty();
      },
    },
    {
      modes: IFM,
      toks: [
        kw('ip', 'Interface Internet Protocol config commands'),
        kw('rsvp', 'RSVP Interface Commands'),
        kw('bandwidth', 'RSVP reservable bandwidth (kbps)'),
        num('kbps', 1, 100_000_000, '<1-100000000> Reservable bandwidth (kbit/s)'),
      ],
      run: (x) => {
        if (!routerRole(x)) return x.invalid();
        ifCfg(x).rsvpBandwidth = Number(x.args.kbps);
        x.dirty();
      },
    },
    {
      modes: IFM,
      toks: [
        NO(),
        kw('ip', 'Interface Internet Protocol config commands'),
        kw('rsvp', 'RSVP Interface Commands'),
        kw('bandwidth', 'RSVP reservable bandwidth'),
      ],
      run: (x) => {
        delete ifCfg(x).rsvpBandwidth;
        x.dirty();
      },
    },
    {
      modes: IFM,
      toks: [mplsKw(), teKw(), kw('backup-path', 'Configure an MPLS TE backup for this interface'), word('tun', 'Backup tunnel, e.g. Tunnel2')],
      run: (x) => {
        const m = /^tu(?:n(?:n(?:e(?:l)?)?)?)?(\d+)$/i.exec(String(x.args.tun));
        if (!m) return '% Invalid tunnel interface';
        ifCfg(x).teBackupPath = `Tunnel${Number(m[1])}`;
        x.dirty();
      },
    },
    {
      modes: IFM,
      toks: [NO(), mplsKw(), teKw(), kw('backup-path', 'Configure an MPLS TE backup for this interface')],
      run: (x) => {
        delete ifCfg(x).teBackupPath;
        x.dirty();
      },
    },
    // -------------------------------------------------------- router ospf
    {
      modes: ROUTER,
      toks: [mplsKw(), teKw(), kw('router-id', 'Traffic Engineering stable IP address for system'), iface()],
      run: (x) => {
        x.cfg.ospf!.teRouterId = String(x.args.if);
        x.dirty();
      },
    },
    {
      modes: ROUTER,
      toks: [
        mplsKw(),
        teKw(),
        kw('area', 'Configure an OSPF area to run MPLS Traffic Engineering'),
        num('a', 0, 4294967295, '<0-4294967295> OSPF area ID'),
      ],
      run: (x) => {
        const a = Number(x.args.a);
        const o = x.cfg.ospf!;
        o.teAreas = [...new Set([...(o.teAreas ?? []), a])];
        x.dirty();
      },
    },
    {
      modes: ROUTER,
      toks: [
        NO(),
        mplsKw(),
        teKw(),
        kw('area', 'Configure an OSPF area to run MPLS Traffic Engineering'),
        num('a', 0, 4294967295, '<0-4294967295> OSPF area ID'),
      ],
      run: (x) => {
        const o = x.cfg.ospf!;
        o.teAreas = (o.teAreas ?? []).filter((a) => a !== Number(x.args.a));
        x.dirty();
      },
    },
    {
      modes: ROUTER,
      toks: [NO(), mplsKw(), teKw(), kw('router-id', 'Traffic Engineering stable IP address for system')],
      run: (x) => {
        delete x.cfg.ospf!.teRouterId;
        x.dirty();
      },
    },
    // ------------------------------------------------------ explicit path
    {
      modes: CONF,
      toks: [
        kw('ip', 'Global IP configuration subcommands'),
        kw('explicit-path', 'Configure explicit-path'),
        kw('name', 'Specify explicit-path by name'),
        word('name', 'Explicit-path name'),
        kw('enable', 'Enable this path'),
      ],
      run: (x) => {
        if (!routerRole(x)) return x.invalid();
        const n = String(x.args.name);
        x.cfg.explicitPaths[n] ??= { entries: [] };
        x.dirty();
        x.setMode('config-expl-path', { ctxName: n });
      },
    },
    {
      modes: CONF,
      toks: [
        NO(),
        kw('ip', 'Global IP configuration subcommands'),
        kw('explicit-path', 'Configure explicit-path'),
        kw('name', 'Specify explicit-path by name'),
        word('name', 'Explicit-path name'),
      ],
      run: (x) => {
        delete x.cfg.explicitPaths[String(x.args.name)];
        x.dirty();
      },
    },
    ...(['next-address', 'exclude-address'] as const).flatMap((k): Cmd[] => {
      const add = (x: Exec): string | void => {
        const p = x.cfg.explicitPaths[x.session.ctxName!];
        const kind = k === 'next-address' ? 'next' : 'exclude';
        if (p.entries.some((e) => e.kind !== kind)) return '% Cannot mix next-address and exclude-address entries in one explicit path';
        p.entries.push({ kind, address: String(x.args.a) });
        x.dirty();
        return `Explicit Path name ${x.session.ctxName}:\n${T.explicitPathLines(p).join('\n')}`;
      };
      return [
        {
          modes: EXPL,
          toks: [
            kw(k, k === 'next-address' ? 'Specify the next address in the path' : 'Exclude an address from subsequent partial path segments'),
            ip('a', 'IP address'),
          ],
          run: add,
        },
        ...(k === 'next-address'
          ? [{ modes: EXPL, toks: [kw(k, 'Specify the next address in the path'), kw('strict', 'Strict hop'), ip('a', 'IP address')], run: add }]
          : []),
      ];
    }),
    {
      modes: EXPL,
      toks: [NO(), kw('index', 'Specify the entry index'), num('i', 1, 65535, '<1-65535> Entry index')],
      run: (x) => {
        const p = x.cfg.explicitPaths[x.session.ctxName!];
        const i = Number(x.args.i) - 1;
        if (i >= p.entries.length) return '% Entry index not found';
        p.entries.splice(i, 1);
        x.dirty();
      },
    },
    // -------------------------------------------------- tunnel interface
    {
      modes: TUN,
      toks: [kw('ip', 'Interface Internet Protocol config commands'), kw('unnumbered', 'Enable IP processing without an explicit address'), iface()],
      run: (x) => setTun(x, (t) => void (t.unnumbered = String(x.args.if))),
    },
    {
      modes: TUN,
      toks: [tunKw(), kw('mode', 'tunnel encapsulation method'), mplsKw(), teKw()],
      run: (x) => setTun(x, (t) => void (t.mode = 'mpls-te')),
    },
    { modes: TUN, toks: [NO(), tunKw(), kw('mode', 'tunnel encapsulation method')], run: (x) => setTun(x, (t) => void (t.mode = 'gre')) },
    {
      modes: TUN,
      toks: [tunKw(), kw('destination', 'destination of tunnel'), ip('d', 'IP address of the tunnel tail')],
      run: (x) => setTun(x, (t) => void (t.destination = String(x.args.d))),
    },
    { modes: TUN, toks: [NO(), tunKw(), kw('destination', 'destination of tunnel')], run: (x) => setTun(x, (t) => void delete t.destination) },
    {
      modes: TUN,
      toks: [
        tunKw(),
        mplsKw(),
        teKw(),
        kw('bandwidth', 'Specify tunnel bandwidth requirement'),
        num('kbps', 0, 100_000_000, '<0-100000000> bandwidth requirement in kbps'),
      ],
      run: (x) => setTun(x, (t) => void (t.bandwidthKbps = Number(x.args.kbps))),
    },
    {
      modes: TUN,
      toks: [
        tunKw(),
        mplsKw(),
        teKw(),
        kw('path-option', 'Primary or fallback path setup option'),
        num('pref', 1, 1000, '<1-1000> preference'),
        kw('dynamic', 'setup based on dynamically calculated path'),
      ],
      run: (x) =>
        setTun(x, (t) => {
          t.pathOptions = [...t.pathOptions.filter((o) => o.pref !== Number(x.args.pref)), { pref: Number(x.args.pref), kind: 'dynamic' }];
        }),
    },
    {
      modes: TUN,
      toks: [
        tunKw(),
        mplsKw(),
        teKw(),
        kw('path-option', 'Primary or fallback path setup option'),
        num('pref', 1, 1000, '<1-1000> preference'),
        kw('explicit', 'setup based on preconfigured path'),
        kw('name', 'Specify explicit path by name'),
        word('name', 'Explicit path name'),
      ],
      run: (x) =>
        setTun(x, (t) => {
          t.pathOptions = [
            ...t.pathOptions.filter((o) => o.pref !== Number(x.args.pref)),
            { pref: Number(x.args.pref), kind: 'explicit', name: String(x.args.name) },
          ];
        }),
    },
    {
      modes: TUN,
      toks: [
        NO(),
        tunKw(),
        mplsKw(),
        teKw(),
        kw('path-option', 'Primary or fallback path setup option'),
        num('pref', 1, 1000, '<1-1000> preference'),
      ],
      run: (x) => setTun(x, (t) => void (t.pathOptions = t.pathOptions.filter((o) => o.pref !== Number(x.args.pref)))),
    },
    ...[true, false].flatMap((on): Cmd[] => [
      {
        modes: TUN,
        toks: [
          ...(on ? [] : [NO()]),
          tunKw(),
          mplsKw(),
          teKw(),
          kw('autoroute', 'define parameters for automatic routing'),
          kw('announce', 'announce tunnel to IGP'),
        ],
        run: (x) => setTun(x, (t) => void (t.autoroute = on)),
      },
      {
        modes: TUN,
        toks: [...(on ? [] : [NO()]), tunKw(), mplsKw(), teKw(), kw('fast-reroute', 'Specify MPLS tunnel can be fast rerouted')],
        run: (x) => setTun(x, (t) => void (t.frr = on)),
      },
      {
        modes: TUN,
        toks: [...(on ? [] : [NO()]), kw('shutdown', 'Shutdown the selected interface')],
        run: (x) => setTun(x, (t) => void (on ? (t.shutdown = true) : delete t.shutdown)),
      },
    ]),
    {
      modes: TUN,
      toks: [kw('description', 'Interface specific description'), line('d', 'Up to 240 characters')],
      run: (x) => setTun(x, (t) => void (t.description = String(x.args.d))),
    },
    {
      modes: CONF,
      toks: [NO(), kw('interface', 'Select an interface to configure'), word('name', 'Tunnel interface, e.g. Tunnel1')],
      run: (x) => {
        const m = /^tu(?:n(?:n(?:e(?:l)?)?)?)?(\d+)$/i.exec(String(x.args.name));
        if (!m) return x.invalid();
        delete x.cfg.teTunnels[`Tunnel${Number(m[1])}`];
        x.dirty();
      },
    },
    // --------------------------------------------------------------- exec
    {
      modes: PRIV,
      toks: [mplsKw(), teKw(), kw('reoptimize', 'Reoptimize MPLS TE tunnels')],
      run: (x) => {
        const n = x.ctx.sim.teReoptimize(x.device.id);
        return n ? '' : '% No MPLS TE tunnel headed on this router';
      },
    },
    {
      modes: EXEC,
      toks: [showKw(), mplsKw(), teKw(), kw('tunnels', 'MPLS TE tunnel status'), kw('brief', 'Brief summary of tunnel status')],
      run: (x) => T.showTeBrief(x.ctx.sim, x.device),
    },
    { modes: EXEC, toks: [showKw(), mplsKw(), teKw(), kw('tunnels', 'MPLS TE tunnel status')], run: (x) => T.showTeTunnels(x.ctx.sim, x.device) },
    {
      modes: EXEC,
      toks: [showKw(), mplsKw(), teKw(), kw('tunnels', 'MPLS TE tunnel status'), word('tun', 'Tunnel interface, e.g. Tunnel1')],
      run: (x) => {
        const m = /^tu(?:n(?:n(?:e(?:l)?)?)?)?(\d+)$/i.exec(String(x.args.tun));
        return m ? T.showTeTunnels(x.ctx.sim, x.device, `Tunnel${Number(m[1])}`) : x.invalid();
      },
    },
    {
      modes: EXEC,
      toks: [showKw(), mplsKw(), teKw(), kw('fast-reroute', 'FRR information'), kw('database', 'FRR database')],
      run: (x) => T.showFrrDatabase(x.ctx.sim, x.device),
    },
    {
      modes: EXEC,
      toks: [showKw(), kw('ip', 'IP information'), kw('rsvp', 'RSVP information'), kw('interface', 'RSVP interface information')],
      run: (x) => T.showRsvpInterface(x.ctx.sim, x.device),
    },
    {
      modes: EXEC,
      toks: [showKw(), kw('ip', 'IP information'), kw('explicit-paths', 'Show IP explicit paths')],
      run: (x) => T.showExplicitPaths(x.cfg),
    },
  ];
}
