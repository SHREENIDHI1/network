import { effectivePort, isBridgeRole, portChannelId, roleOf, type InterfaceConfig } from '../config/netConfig';
import * as F from './format';
import { EXEC, ifCfg, kw, num, type Cmd, type Exec } from './ios';

/**
 * Layer 2 additions for P2: EtherChannel (channel-group / port-channel) and
 * duplex. Returned by a function so ios.ts can append them after its own
 * grammar helpers are initialised (circular-import ordering).
 */

const NO = () => kw('no', 'Negate a command or set its defaults');

/** Layer 2 fields a member inherits from its port-channel (IOS copies them). */
export const BUNDLE_FIELDS = ['switchport', 'mode', 'accessVlan', 'trunkAllowed', 'nativeVlan'] as const;

export function copyBundleFields(from: InterfaceConfig | undefined, to: InterfaceConfig): void {
  for (const f of BUNDLE_FIELDS) {
    const v = from?.[f];
    if (v === undefined) delete to[f];
    else (to as Record<string, unknown>)[f] = structuredClone(v);
  }
}

/** After a change on interface Port-channelN, push its Layer 2 settings to every member (IOS behaviour). */
export function propagatePortChannel(x: Pick<Exec, 'cfg' | 'device'>, poName: string): void {
  const id = portChannelId(poName);
  if (id === null) return;
  for (const p of x.device.ports) {
    const ic = x.cfg.interfaces[p.id];
    if (ic?.channelGroup?.id === id) copyBundleFields(x.cfg.interfaces[poName], ic);
  }
}

function physicalSwitchport(x: Exec): string | undefined {
  const role = roleOf(x.device.kind);
  const n = x.session.iface!;
  if (!isBridgeRole(role) || !x.device.ports.some((p) => p.id === n)) return x.invalid();
  if (!effectivePort(role, x.cfg.interfaces[n]).switchport)
    return '% Command rejected: routed port-channels are not simulated. Use "switchport" first.';
  return undefined;
}

function channelGroup(x: Exec, mode: 'on' | 'active' | 'passive'): string | void {
  const e = physicalSwitchport(x);
  if (e) return e;
  const id = Number(x.args.grp);
  const ic = ifCfg(x);
  if (ic.channelGroup && ic.channelGroup.id !== id)
    return `% Interface is already part of channel-group ${ic.channelGroup.id}. Remove it first with "no channel-group".`;
  const po = `Po${id}`;
  let out: string | undefined;
  if (!x.cfg.interfaces[po]) {
    // A new port-channel takes the member's current Layer 2 settings.
    x.cfg.interfaces[po] = {};
    copyBundleFields(ic, x.cfg.interfaces[po]);
    out = `Creating a port-channel interface Port-channel ${id}`;
  } else {
    copyBundleFields(x.cfg.interfaces[po], ic);
  }
  ic.channelGroup = { id, mode };
  x.dirty();
  return out;
}

const DUPLEX = { auto: 'Enable AUTO duplex configuration', full: 'Force full duplex operation', half: 'Force half-duplex operation' } as const;

function setDuplex(x: Exec, d: keyof typeof DUPLEX | undefined): string | void {
  const n = x.session.iface!;
  const port = x.device.ports.find((p) => p.id === n);
  if (!port) return x.invalid();
  if (port.kind !== 'rj45' && port.kind !== 'combo') return '% Command rejected: SFP/fibre ports always run full duplex in this simulator.';
  const ic = ifCfg(x);
  if (d === undefined || d === 'auto') delete ic.duplex;
  else ic.duplex = d;
  x.dirty();
}

export function l2Cmds(): Cmd[] {
  const cg = kw('channel-group', 'Etherchannel/port bundling configuration');
  const grp = num('grp', 1, 64, '<1-64> Channel group number');
  const modeKw = kw('mode', 'Etherchannel Mode of the interface');
  return [
    { modes: ['config-if'], toks: [cg, grp, modeKw, kw('active', 'Enable LACP unconditionally')], run: (x) => channelGroup(x, 'active') },
    {
      modes: ['config-if'],
      toks: [cg, grp, modeKw, kw('passive', 'Enable LACP only if a LACP device is detected')],
      run: (x) => channelGroup(x, 'passive'),
    },
    { modes: ['config-if'], toks: [cg, grp, modeKw, kw('on', 'Enable Etherchannel only')], run: (x) => channelGroup(x, 'on') },
    {
      modes: ['config-if'],
      toks: [NO(), cg],
      run: (x) => {
        const e = physicalSwitchport(x);
        if (e) return e;
        delete ifCfg(x).channelGroup;
        x.dirty();
      },
    },
    {
      modes: ['config'],
      toks: [
        NO(),
        kw('interface', 'Select an interface to configure'),
        kw('port-channel', 'Ethernet Channel of interfaces'),
        num('po', 1, 64, '<1-64> Port-channel interface number'),
      ],
      run: (x) => {
        const po = `Po${Number(x.args.po)}`;
        if (!x.cfg.interfaces[po]) return '% Interface does not exist';
        delete x.cfg.interfaces[po];
        for (const ic of Object.values(x.cfg.interfaces)) if (ic.channelGroup?.id === Number(x.args.po)) delete ic.channelGroup;
        x.dirty();
      },
    },
    ...(Object.keys(DUPLEX) as Array<keyof typeof DUPLEX>).map(
      (d): Cmd => ({ modes: ['config-if'], toks: [kw('duplex', 'Configure duplex operation.'), kw(d, DUPLEX[d])], run: (x) => setDuplex(x, d) }),
    ),
    { modes: ['config-if'], toks: [NO(), kw('duplex', 'Configure duplex operation.')], run: (x) => setDuplex(x, undefined) },
    {
      modes: EXEC,
      toks: [
        kw('show', 'Show running system information'),
        kw('etherchannel', 'EtherChannel information'),
        kw('summary', 'One-line summary per channel-group'),
      ],
      run: (x) => (isBridgeRole(roleOf(x.device.kind)) ? F.showEtherchannelSummary(x.ctx.sim, x.device) : x.invalid()),
    },
  ];
}
