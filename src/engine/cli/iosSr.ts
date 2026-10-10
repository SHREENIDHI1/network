import { roleOf } from '../config/netConfig';
import { formatIpv4, networkOf, parseIpv4 } from '../ip/ipv4';
import { CONF, kw, num, word, type Cmd, type CliMode, type Exec } from './ios';

/**
 * Segment Routing (SR-MPLS with OSPF) and TI-LFA commands (P9), IOS-XE
 * style. On NEON profiles this is the simulator's generic syntax.
 */

const NO = () => kw('no', 'Negate a command or set its defaults');
const SR: CliMode[] = ['config-srmpls'];
const CONN: CliMode[] = ['config-srmpls-conn'];
const AF: CliMode[] = ['config-srmpls-conn-af'];
const ROUTER: CliMode[] = ['config-router'];
const srKw = () => kw('segment-routing', 'Segment Routing');
const mplsKw = () => kw('mpls', 'Segment Routing with MPLS data plane');
const frrKw = () => kw('fast-reroute', 'Specify IP Fast Reroute');
const ppKw = () => kw('per-prefix', 'Per-prefix computation');

const sr = (x: Exec) => (x.cfg.sr ??= { enabled: false, srgbBase: 16000, srgbEnd: 23999, prefixSids: [] });

export function srCmds(): Cmd[] {
  return [
    {
      modes: CONF,
      toks: [srKw(), mplsKw()],
      run: (x) => {
        if (roleOf(x.device.kind) !== 'router') return x.invalid();
        sr(x).enabled = true;
        x.dirty();
        x.setMode('config-srmpls');
      },
    },
    {
      modes: CONF,
      toks: [NO(), srKw(), mplsKw()],
      run: (x) => {
        delete x.cfg.sr;
        x.dirty();
      },
    },
    {
      modes: SR,
      toks: [
        kw('global-block', 'Segment Routing global block'),
        num('a', 16, 1048575, '<16-1048575> SRGB start'),
        num('b', 16, 1048575, '<16-1048575> SRGB end'),
      ],
      run: (x) => {
        const a = Number(x.args.a);
        const b = Number(x.args.b);
        if (b < a) return '% SRGB end must be greater than its start';
        Object.assign(sr(x), { srgbBase: a, srgbEnd: b });
        x.dirty();
      },
    },
    { modes: SR, toks: [kw('connected-prefix-sid-map', 'Segment Routing prefix SID map')], run: (x) => x.setMode('config-srmpls-conn') },
    {
      modes: CONN,
      toks: [kw('address-family', 'Address family'), kw('ipv4', 'IPv4 address family')],
      run: (x) => x.setMode('config-srmpls-conn-af'),
    },
    { modes: AF, toks: [kw('exit-address-family', 'Exit from address-family')], run: (x) => x.setMode('config-srmpls-conn') },
    {
      modes: AF,
      toks: [
        word('pfx', 'A.B.C.D/len prefix'),
        kw('index', 'SID index'),
        num('i', 0, 1048575, '<0-1048575> SID index'),
        kw('range', 'Range'),
        num('r', 1, 1, '<1-1> range'),
      ],
      run: (x) => {
        const m = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(String(x.args.pfx));
        const ip = m ? parseIpv4(m[1]) : null;
        const len = m ? Number(m[2]) : NaN;
        if (!m || ip === null || len > 32) return '% Invalid prefix: use A.B.C.D/length';
        const pfx = `${formatIpv4(networkOf(ip, len))}/${len}`;
        const s = sr(x);
        s.prefixSids = [...s.prefixSids.filter((p) => p.prefix !== pfx), { prefix: pfx, index: Number(x.args.i) }];
        x.dirty();
      },
    },
    {
      modes: AF,
      toks: [NO(), word('pfx', 'A.B.C.D/len prefix')],
      run: (x) => {
        const s = sr(x);
        s.prefixSids = s.prefixSids.filter((p) => p.prefix !== String(x.args.pfx));
        x.dirty();
      },
    },
    // ------------------------------------------------------- router ospf
    ...[true, false].flatMap((on): Cmd[] => [
      {
        modes: ROUTER,
        toks: [...(on ? [] : [NO()]), srKw(), mplsKw()],
        run: (x) => {
          if (on) x.cfg.ospf!.segmentRouting = true;
          else delete x.cfg.ospf!.segmentRouting;
          x.dirty();
        },
      },
      {
        modes: ROUTER,
        toks: [
          ...(on ? [] : [NO()]),
          frrKw(),
          ppKw(),
          kw('enable', 'Enable IP Fast Reroute'),
          kw('prefix-priority', 'Priority of prefixes to be protected'),
          kw('low', 'Low and high priority prefixes'),
        ],
        run: (x) => {
          if (on) x.cfg.ospf!.frrPerPrefix = true;
          else delete x.cfg.ospf!.frrPerPrefix;
          x.dirty();
        },
      },
      {
        modes: ROUTER,
        toks: [...(on ? [] : [NO()]), frrKw(), ppKw(), kw('ti-lfa', 'Topology Independent LFA')],
        run: (x) => {
          if (on) x.cfg.ospf!.tiLfa = true;
          else delete x.cfg.ospf!.tiLfa;
          x.dirty();
        },
      },
    ]),
  ];
}
