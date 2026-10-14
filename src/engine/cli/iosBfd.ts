import { formatIpv4 } from '../ip/ipv4';
import { longIfName, roleOf } from '../config/netConfig';
import type { Device } from '../../model/types';
import type { Sim } from '../sim';
import { EXEC, IFM, ifCfg, kw, num, type Cmd, type CliMode } from './ios';

/**
 * BFD commands (v1.1), IOS-XE style: interface timers, OSPF registration and
 * "show bfd neighbors [details]". On NEON profiles this is the simulator's
 * generic syntax.
 */

const NO = () => kw('no', 'Negate a command or set its defaults');
const ROUTER: CliMode[] = ['config-router'];
const bfdKw = () => kw('bfd', 'BFD configuration commands');

export function showBfd(sim: Sim, device: Device, details: boolean): string {
  const mine = sim.bfd.sessions.filter((s) => s.deviceId === device.id);
  if (!mine.length)
    return 'No BFD sessions. (Configure "bfd interval … min_rx … multiplier …" on the interface and "bfd all-interfaces" or "ip ospf bfd".)';
  const name = (id: string) => sim.device(id)?.name ?? id;
  const L = [
    'IPv4 Sessions',
    `${'NeighAddr'.padEnd(17)}${'LD/RD'.padEnd(9)}${'State'.padEnd(7)}${'Int'.padEnd(11)}${'Detect(ms)'.padEnd(12)}Neighbor`,
  ];
  for (const s of mine)
    L.push(
      `${formatIpv4(s.neighborIp).padEnd(17)}${`${s.localDisc}/${s.remoteDisc}`.padEnd(9)}${s.state.padEnd(7)}${s.iface.padEnd(11)}${String(s.state === 'Up' ? s.detectMs : '-').padEnd(12)}${name(s.neighborDeviceId)}`,
    );
  if (details)
    for (const s of mine) {
      L.push(
        '',
        `Neighbor ${formatIpv4(s.neighborIp)} on ${longIfName(s.iface)} — session ${s.state}`,
        `  Local discriminator ${s.localDisc}, remote discriminator ${s.remoteDisc || '-'}`,
        `  Negotiated transmit interval ${s.state === 'Up' ? `${s.txMs} ms` : '-'}, receive interval ${s.state === 'Up' ? `${s.rxMs} ms` : '-'}, local multiplier ${s.multiplier || '-'}`,
        `  Detection time ${s.state === 'Up' ? `${s.detectMs} ms` : '-'} (remote multiplier × agreed receive interval)`,
        `  Registered protocols: ${s.clients.join(', ')}`,
      );
      if (s.reason) L.push(`  Down because: ${s.reason}`);
    }
  L.push('', '(RailMPLS Lab: BFD timers are negotiated and the detection time computed; control packets are not simulated.)');
  return L.join('\n');
}

export function bfdCmds(): Cmd[] {
  const router = (k: string) => roleOf(k as never) === 'router' || roleOf(k as never) === 'l3switch';
  return [
    {
      modes: IFM,
      toks: [
        bfdKw(),
        kw('interval', 'Transmit interval between BFD packets'),
        num('tx', 50, 9999, '<50-9999> Milliseconds'),
        kw('min_rx', 'Minimum receive interval capability'),
        num('rx', 50, 9999, '<50-9999> Milliseconds'),
        kw('multiplier', 'Multiplier value used to compute holddown'),
        num('m', 3, 50, '<3-50> value used to multiply the interval'),
      ],
      run: (x) => {
        if (!router(x.device.kind)) return x.invalid();
        ifCfg(x).bfd = { intervalMs: Number(x.args.tx), minRxMs: Number(x.args.rx), multiplier: Number(x.args.m) };
        x.dirty();
      },
    },
    {
      modes: IFM,
      toks: [NO(), bfdKw(), kw('interval', 'Transmit interval between BFD packets')],
      run: (x) => {
        delete ifCfg(x).bfd;
        x.dirty();
      },
    },
    ...[true, false].flatMap((on): Cmd[] => [
      {
        modes: IFM,
        toks: [...(on ? [] : [NO()]), kw('ip', 'Interface Internet Protocol config commands'), kw('ospf', 'OSPF interface commands'), bfdKw()],
        run: (x) => {
          if (on) ifCfg(x).ospfBfd = true;
          else delete ifCfg(x).ospfBfd;
          x.dirty();
        },
      },
      {
        modes: ROUTER,
        toks: [...(on ? [] : [NO()]), bfdKw(), kw('all-interfaces', 'Enable BFD on all OSPF interfaces')],
        run: (x) => {
          if (!x.cfg.ospf) return x.invalid();
          if (on) x.cfg.ospf.bfdAllInterfaces = true;
          else delete x.cfg.ospf.bfdAllInterfaces;
          x.dirty();
        },
      },
    ]),
    {
      modes: EXEC,
      toks: [kw('show', 'Show running system information'), bfdKw(), kw('neighbors', 'BFD neighbors')],
      run: (x) => showBfd(x.ctx.sim, x.device, false),
    },
    {
      modes: EXEC,
      toks: [kw('show', 'Show running system information'), bfdKw(), kw('neighbors', 'BFD neighbors'), kw('details', 'Detailed session information')],
      run: (x) => showBfd(x.ctx.sim, x.device, true),
    },
  ];
}
