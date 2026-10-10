import { roleOf } from '../config/netConfig';
import { networkOf, parseIpv4 } from '../ip/ipv4';
import * as M from './formatMpls';
import { CONF, EXEC, IFM, ifCfg, iface, ip, kw, num, word, type Cmd, type CliMode, type Exec } from './ios';

/**
 * MPLS / LDP commands (P4), generic SP CLI (IOS-XE style). On NEON profiles
 * this is the simulator's generic syntax, not official NEON syntax.
 */

const NO = () => kw('no', 'Negate a command or set its defaults');
const ROUTER: CliMode[] = ['config-router'];
const routerRole = (x: Exec) => ['router', 'l3switch'].includes(roleOf(x.device.kind));
const mplsKw = () => kw('mpls', 'Configure MPLS parameters');
const ldpKw = () => kw('ldp', 'Label Distribution Protocol');
const showKw = () => kw('show', 'Show running system information');

/** "A.B.C.D/len" → network + length, or an error string. */
function parseFec(text: string): { network: number; prefixLen: number } | string {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(text);
  const n = m ? parseIpv4(m[1]) : null;
  const len = m ? Number(m[2]) : NaN;
  if (!m || n === null || len > 32) return '% Invalid prefix: use A.B.C.D/length, e.g. 10.0.0.3/32';
  return { network: networkOf(n, len), prefixLen: len };
}

function runLsp(x: Exec, kind: 'ping' | 'trace', repeat?: number): string {
  const fec = parseFec(String(x.args.fec));
  if (typeof fec === 'string') return fec;
  const sim = x.ctx.sim;
  const id =
    kind === 'ping' ? sim.lspPing(x.device.id, fec.network, fec.prefixLen, { count: repeat }) : sim.lspTrace(x.device.id, fec.network, fec.prefixLen);
  if (x.ctx.simulationMode)
    return `MPLS ${kind === 'ping' ? 'ping' : 'traceroute'} queued (Simulation mode): press Step or Play, then read the Packet Inspector.`;
  sim.runUntilIdle();
  const s = sim.lspSession(id)!;
  return kind === 'ping' ? M.lspPingOutput(s) : M.lspTraceOutput(sim, s);
}

export function mplsCmds(): Cmd[] {
  return [
    // ------------------------------------------------------------ interface
    {
      modes: IFM,
      toks: [mplsKw(), kw('ip', 'Configure dynamic MPLS forwarding for IP')],
      run: (x) => {
        if (!routerRole(x)) return x.invalid();
        ifCfg(x).mplsIp = true;
        x.dirty();
      },
    },
    {
      modes: IFM,
      toks: [NO(), mplsKw(), kw('ip', 'Configure dynamic MPLS forwarding for IP')],
      run: (x) => {
        delete ifCfg(x).mplsIp;
        x.dirty();
      },
    },
    // --------------------------------------------------------------- global
    { modes: CONF, toks: [mplsKw(), kw('ip', 'Dynamic MPLS forwarding for IP')], run: () => undefined },
    {
      modes: CONF,
      toks: [
        mplsKw(),
        kw('label', 'Label properties'),
        kw('protocol', 'Set platform default label distribution protocol'),
        kw('ldp', 'Use LDP (default)'),
      ],
      run: () => undefined,
    },
    ...[[], [kw('force', 'Forcibly change the LDP router id')]].flatMap((extra): Cmd[] => [
      {
        modes: CONF,
        toks: [
          mplsKw(),
          ldpKw(),
          kw('router-id', 'Select interface schema for LDP Router ID'),
          iface('if', 'Interface whose address is the LDP router-ID'),
          ...extra,
        ],
        run: (x) => {
          x.cfg.mpls.ldpRouterId = String(x.args.if);
          x.dirty();
        },
      },
    ]),
    {
      modes: CONF,
      toks: [NO(), mplsKw(), ldpKw(), kw('router-id', 'Select interface schema for LDP Router ID')],
      run: (x) => {
        delete x.cfg.mpls.ldpRouterId;
        x.dirty();
      },
    },
    ...[true, false].flatMap((on): Cmd[] => [
      {
        modes: CONF,
        toks: [...(on ? [] : [NO()]), mplsKw(), ldpKw(), kw('explicit-null', 'Advertise Explicit Null label in place of Implicit Null')],
        run: (x) => {
          x.cfg.mpls.explicitNull = on;
          x.dirty();
        },
      },
      {
        modes: CONF,
        toks: [
          ...(on ? [] : [NO()]),
          mplsKw(),
          kw('ip', 'Dynamic MPLS forwarding for IP'),
          kw('propagate-ttl', 'Propagate IP TTL into the label stack'),
        ],
        run: (x) => {
          x.cfg.mpls.propagateTtl = on;
          x.dirty();
        },
      },
      // ---------------------------------------------------- router ospf
      {
        modes: ROUTER,
        toks: [...(on ? [] : [NO()]), mplsKw(), ldpKw(), kw('sync', 'Configure LDP-IGP Synchronization')],
        run: (x) => {
          x.cfg.ospf!.ldpSync = on;
          x.dirty();
        },
      },
      {
        modes: ROUTER,
        toks: [...(on ? [] : [NO()]), mplsKw(), ldpKw(), kw('autoconfig', 'Configure LDP automatic configuration')],
        run: (x) => {
          x.cfg.ospf!.ldpAutoconfig = on;
          x.dirty();
        },
      },
    ]),
    // ----------------------------------------------------------------- show
    {
      modes: EXEC,
      toks: [showKw(), mplsKw(), kw('interfaces', 'Per-interface MPLS forwarding information')],
      run: (x) => M.showMplsInterfaces(x.ctx.sim, x.device, x.cfg),
    },
    ...['neighbor', 'neighbors'].map(
      (w): Cmd => ({ modes: EXEC, toks: [showKw(), mplsKw(), ldpKw(), kw(w, 'LDP neighbors')], run: (x) => M.showLdpNeighbor(x.ctx.sim, x.device) }),
    ),
    {
      modes: EXEC,
      toks: [showKw(), mplsKw(), ldpKw(), kw('discovery', 'Discovered neighbors')],
      run: (x) => M.showLdpDiscovery(x.ctx.sim, x.device),
    },
    {
      modes: EXEC,
      toks: [showKw(), mplsKw(), ldpKw(), kw('bindings', 'LDP Label Information Base (LIB) information')],
      run: (x) => M.showLdpBindings(x.ctx.sim, x.device),
    },
    {
      modes: EXEC,
      toks: [
        showKw(),
        mplsKw(),
        ldpKw(),
        kw('bindings', 'LDP Label Information Base (LIB) information'),
        ip('net', 'Destination prefix'),
        num('len', 0, 32, '<0-32> Prefix length'),
      ],
      run: (x) => {
        const n = parseIpv4(String(x.args.net))!;
        const len = Number(x.args.len);
        return M.showLdpBindings(x.ctx.sim, x.device, { network: networkOf(n, len), prefixLen: len });
      },
    },
    {
      modes: EXEC,
      toks: [showKw(), mplsKw(), ldpKw(), kw('igp', 'IGP information'), kw('sync', 'LDP-IGP Synchronization information')],
      run: (x) => M.showLdpIgpSync(x.ctx.sim, x.device, x.cfg),
    },
    {
      modes: EXEC,
      toks: [showKw(), mplsKw(), kw('forwarding-table', 'Show the Label Forwarding Information Base (LFIB)')],
      run: (x) => M.showMplsForwarding(x.ctx.sim, x.device),
    },
    {
      modes: EXEC,
      toks: [showKw(), mplsKw(), kw('forwarding-table', 'Show the Label Forwarding Information Base (LFIB)'), ip('net', 'Destination prefix')],
      run: (x) => M.showMplsForwarding(x.ctx.sim, x.device, parseIpv4(String(x.args.net))!),
    },
    // ------------------------------------------------------ LSP ping / trace
    {
      modes: EXEC,
      toks: [kw('ping', 'Send echo messages'), mplsKw(), kw('ipv4', 'Target is an IPv4 LDP FEC'), word('fec', 'A.B.C.D/length of the FEC')],
      run: (x) => runLsp(x, 'ping'),
    },
    {
      modes: EXEC,
      toks: [
        kw('ping', 'Send echo messages'),
        mplsKw(),
        kw('ipv4', 'Target is an IPv4 LDP FEC'),
        word('fec', 'A.B.C.D/length of the FEC'),
        kw('repeat', 'Repeat count'),
        num('n', 1, 1000, '<1-1000> Repeat count'),
      ],
      run: (x) => runLsp(x, 'ping', Number(x.args.n)),
    },
    {
      modes: EXEC,
      toks: [
        kw('traceroute', 'Trace route to destination'),
        mplsKw(),
        kw('ipv4', 'Target is an IPv4 LDP FEC'),
        word('fec', 'A.B.C.D/length of the FEC'),
      ],
      run: (x) => runLsp(x, 'trace'),
    },
  ];
}
