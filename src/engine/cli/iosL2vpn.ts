import { getTemplate } from '../../model/catalog';
import { isSubinterface, longIfName, parentOf, roleOf } from '../config/netConfig';
import { parseTimeslots } from '../l2vpn/pw';
import { parseIpv4 } from '../ip/ipv4';
import * as L from './formatL2vpn';
import * as M from './formatMpls';
import { CONF, EXEC, IFM, ifCfg, ip, kw, num, word, type Cmd, type CliMode, type Exec } from './ios';

/**
 * L2VPN commands (P6): VPWS "xconnect", VPLS "l2 vfi … manual" and TDM
 * pseudowires on logical E1 controllers ("controller E1" → "cem-group",
 * "interface CEM" → "cem N" → "xconnect"), IOS / IOS-XE style. On NEON
 * profiles this is the simulator's generic syntax, not official NEON syntax.
 */

const NO = () => kw('no', 'Negate a command or set its defaults');
const VFI: CliMode[] = ['config-vfi'];
const CTRL: CliMode[] = ['config-controller'];
const CEMIF: CliMode[] = ['config-cem-if'];
const CEMXC: CliMode[] = ['config-if-cem'];
const routerRole = (x: Exec) => roleOf(x.device.kind) === 'router';
/** E1 controllers this device kind has (from its hardware profile, e.g. NEON LER E1-0/2/0–15), even when networking-only mode hides the E1 ports. */
function e1Slots(kind: string): string[] {
  return (getTemplate(kind as never)?.buildPorts() ?? []).filter((p) => p.kind === 'e1' && /^E1-\d+\/\d+\/\d+$/.test(p.id)).map((p) => p.id.slice(3));
}
const MAX_VC = 4294967295;
const showKw = () => kw('show', 'Show running system information');
const encap = () => [kw('encapsulation', 'Data encapsulation method'), kw('mpls', 'Use MPLS encapsulation')];
const vcIdTok = () => num('vc', 1, MAX_VC, '<1-4294967295> Enter VC ID value');

/** "0/2/0" → canonical controller key, or null. */
function controllerKey(text: string): string | null {
  const m = /^(\d+)\/(\d+)\/(\d+)$/.exec(text);
  return m ? `${Number(m[1])}/${Number(m[2])}/${Number(m[3])}` : null;
}

function setXconnect(x: Exec): string | void {
  if (!routerRole(x)) return x.invalid();
  const name = x.session.iface!;
  const ic = ifCfg(x);
  if (ic.ip) return '% Interface has an IP address configured — remove it first ("no ip address") before xconnect.';
  if (ic.vrf) return `% Interface is in VRF ${ic.vrf} — remove "vrf forwarding" before xconnect.`;
  if (isSubinterface(name) && !ic.encapsulation) return '% Configure "encapsulation dot1Q <vlan>" on the subinterface first.';
  if (
    Object.entries(x.cfg.interfaces).some(
      ([n, c]) =>
        n !== name && c.xconnect && 'peer' in c.xconnect && c.xconnect.peer === String(x.args.peer) && c.xconnect.vcId === Number(x.args.vc),
    )
  )
    return `% VC ID ${x.args.vc} to ${x.args.peer} is already used by another attachment circuit.`;
  if (isSubinterface(name) && x.cfg.interfaces[parentOf(name)]?.xconnect) return `% ${longIfName(parentOf(name))} already has a port-mode xconnect.`;
  ic.xconnect = { peer: String(x.args.peer), vcId: Number(x.args.vc) };
  delete ic.mplsIp;
  x.dirty();
}

function setXconnectVfi(x: Exec): string | void {
  if (!routerRole(x)) return x.invalid();
  const n = String(x.args.vfi);
  if (!x.cfg.vfis[n]) return `% VFI ${n} does not exist — create it with "l2 vfi ${n} manual".`;
  const ic = ifCfg(x);
  if (ic.ip) return '% Interface has an IP address configured — remove it first ("no ip address") before xconnect.';
  ic.xconnect = { vfi: n };
  delete ic.mplsIp;
  x.dirty();
}

function enterController(x: Exec): string | void {
  const slots = e1Slots(x.device.kind);
  if (!slots.length) return '% This device has no E1 controllers (circuit emulation needs a router with E1 interfaces, e.g. a NEON LER/LSR).';
  const k = controllerKey(String(x.args.slot));
  if (!k || !slots.includes(k)) return `% Invalid controller: this device has E1 ${slots[0]} – ${slots[slots.length - 1]}`;
  x.cfg.e1Controllers[k] ??= { cemGroups: {}, xconnects: {} };
  x.dirty();
  x.setMode('config-controller', { ctxName: k });
}

function cemGroup(x: Exec, unframed: boolean): string | void {
  const c = x.cfg.e1Controllers[x.session.ctxName!];
  const g = String(x.args.g);
  let ts: number[] = [];
  if (!unframed) {
    const p = parseTimeslots(String(x.args.ts));
    if (!p) return '% Invalid timeslot list: use 1-31, e.g. 1-4 or 1,3,5-8 (timeslot 0 carries framing)';
    ts = p;
    for (const [og, o] of Object.entries(c.cemGroups))
      if (og !== g && (o.unframed || o.timeslots.some((t) => ts.includes(t)))) return `% Timeslots overlap with cem-group ${og}.`;
  } else if (Object.keys(c.cemGroups).some((og) => og !== g)) return '% An unframed cem-group uses the whole E1 — remove the other cem-groups first.';
  c.cemGroups[g] = { unframed, timeslots: ts };
  x.dirty();
}

function enterCemIf(x: Exec): string | void {
  const m = /^cem(\d+\/\d+\/\d+)$/i.exec(String(x.args.name));
  if (!m) return x.invalid();
  const k = controllerKey(m[1]);
  if (!k || !x.cfg.e1Controllers[k]) return `% Interface CEM${m[1]} does not exist — configure "controller E1 ${m[1]}" with a cem-group first.`;
  x.setMode('config-cem-if', { ctxName: k });
}

function pwPing(x: Exec): string {
  const peer = parseIpv4(String(x.args.peer));
  if (peer === null) return '% Invalid peer address';
  const sim = x.ctx.sim;
  const repeat = typeof x.args.repeat === 'number' ? x.args.repeat : undefined;
  const id = sim.pwPing(x.device.id, peer, Number(x.args.vc), { count: repeat });
  if (x.ctx.simulationMode) return 'MPLS ping queued (Simulation mode): press Step or Play, then read the Packet Inspector.';
  sim.runUntilIdle();
  return M.lspPingOutput(sim.lspSession(id)!);
}

export function l2vpnCmds(): Cmd[] {
  return [
    // ----------------------------------------------------------- VPWS / AC
    {
      modes: IFM,
      toks: [kw('xconnect', 'Xconnect commands'), ip('peer', 'IP address of peer'), vcIdTok(), ...encap()],
      run: setXconnect,
    },
    { modes: IFM, toks: [kw('xconnect', 'Xconnect commands'), kw('vfi', 'Xconnect to a VFI'), word('vfi', 'VFI name')], run: setXconnectVfi },
    {
      modes: IFM,
      toks: [NO(), kw('xconnect', 'Xconnect commands')],
      run: (x) => {
        delete ifCfg(x).xconnect;
        x.dirty();
      },
    },
    {
      modes: IFM,
      toks: [kw('mtu', 'Set the interface Maximum Transmission Unit (MTU)'), num('mtu', 64, 9216, '<64-9216> MTU size in bytes')],
      run: (x) => {
        if (!routerRole(x)) return x.invalid();
        if (isSubinterface(x.session.iface!)) return '% Set the MTU on the main interface.';
        const v = Number(x.args.mtu);
        if (v === 1500) delete ifCfg(x).l2Mtu;
        else ifCfg(x).l2Mtu = v;
        x.dirty();
      },
    },
    {
      modes: IFM,
      toks: [NO(), kw('mtu', 'Set the interface Maximum Transmission Unit (MTU)')],
      run: (x) => {
        delete ifCfg(x).l2Mtu;
        x.dirty();
      },
    },
    // ---------------------------------------------------------------- VPLS
    {
      modes: CONF,
      toks: [
        kw('l2', 'Layer 2 VPN configuration'),
        kw('vfi', 'Configure a VFI'),
        word('name', 'VFI name'),
        kw('manual', 'Manually configure the VFI'),
      ],
      run: (x) => {
        if (!routerRole(x)) return x.invalid();
        const n = String(x.args.name);
        x.cfg.vfis[n] ??= { neighbors: [] };
        x.dirty();
        x.setMode('config-vfi', { ctxName: n });
      },
    },
    {
      modes: CONF,
      toks: [NO(), kw('l2', 'Layer 2 VPN configuration'), kw('vfi', 'Configure a VFI'), word('name', 'VFI name')],
      run: (x) => {
        const n = String(x.args.name);
        if (!x.cfg.vfis[n]) return `% VFI ${n} does not exist`;
        delete x.cfg.vfis[n];
        for (const ic of Object.values(x.cfg.interfaces)) if (ic.xconnect && 'vfi' in ic.xconnect && ic.xconnect.vfi === n) delete ic.xconnect;
        x.dirty();
      },
    },
    {
      modes: VFI,
      toks: [kw('vpn', 'Configure VPN'), kw('id', 'VPN ID'), num('id', 1, MAX_VC, '<1-4294967295> VPN ID value')],
      run: (x) => {
        x.cfg.vfis[x.session.ctxName!].vpnId = Number(x.args.id);
        x.dirty();
      },
    },
    {
      modes: VFI,
      toks: [kw('neighbor', 'Add a pseudowire neighbor'), ip('peer', 'IP address of the peer'), ...encap()],
      run: (x) => {
        const v = x.cfg.vfis[x.session.ctxName!];
        if (v.vpnId === undefined) return '% Configure "vpn id" first.';
        const p = String(x.args.peer);
        if (!v.neighbors.includes(p)) v.neighbors.push(p);
        x.dirty();
      },
    },
    {
      modes: VFI,
      toks: [NO(), kw('neighbor', 'Remove a pseudowire neighbor'), ip('peer', 'IP address of the peer')],
      run: (x) => {
        const v = x.cfg.vfis[x.session.ctxName!];
        v.neighbors = v.neighbors.filter((n) => n !== String(x.args.peer));
        x.dirty();
      },
    },
    // ------------------------------------------------------ E1 / CEM (TDM)
    {
      modes: CONF,
      toks: [kw('controller', 'Configure controller'), kw('E1', 'E1 controller'), word('slot', 'slot/subslot/port, e.g. 0/2/0')],
      run: enterController,
    },
    {
      modes: CTRL,
      toks: [
        kw('cem-group', 'Configure a circuit emulation group'),
        num('g', 0, 31, '<0-31> CEM group number'),
        kw('unframed', 'Use the whole E1 (SAToP)'),
      ],
      run: (x) => cemGroup(x, true),
    },
    {
      modes: CTRL,
      toks: [
        kw('cem-group', 'Configure a circuit emulation group'),
        num('g', 0, 31, '<0-31> CEM group number'),
        kw('timeslots', 'List of timeslots (CESoPSN)'),
        word('ts', 'Timeslots 1-31, e.g. 1-4 or 1,3,5-8'),
      ],
      run: (x) => cemGroup(x, false),
    },
    {
      modes: CTRL,
      toks: [NO(), kw('cem-group', 'Configure a circuit emulation group'), num('g', 0, 31, '<0-31> CEM group number')],
      run: (x) => {
        const c = x.cfg.e1Controllers[x.session.ctxName!];
        delete c.cemGroups[String(x.args.g)];
        delete c.xconnects[String(x.args.g)];
        x.dirty();
      },
    },
    {
      modes: CTRL,
      toks: [kw('shutdown', 'Shut down the controller')],
      run: (x) => {
        x.cfg.e1Controllers[x.session.ctxName!].shutdown = true;
        x.dirty();
      },
    },
    {
      modes: CTRL,
      toks: [NO(), kw('shutdown', 'Shut down the controller')],
      run: (x) => {
        delete x.cfg.e1Controllers[x.session.ctxName!].shutdown;
        x.dirty();
      },
    },
    {
      modes: ['config', 'config-controller', 'config-cem-if', 'config-if-cem', 'config-if', 'config-subif', 'config-vfi'],
      toks: [kw('interface', 'Select an interface to configure'), word('name', 'CEM interface, e.g. CEM0/2/0')],
      run: enterCemIf,
    },
    {
      modes: CEMIF,
      toks: [kw('cem', 'Configure a CEM group'), num('g', 0, 31, '<0-31> CEM group number')],
      run: (x) => {
        const c = x.cfg.e1Controllers[x.session.ctxName!];
        if (!c.cemGroups[String(x.args.g)]) return `% cem-group ${x.args.g} is not configured on controller E1 ${x.session.ctxName}`;
        x.setMode('config-if-cem', { ctxName: x.session.ctxName, cemGroup: Number(x.args.g) });
      },
    },
    {
      modes: CEMIF,
      toks: [NO(), kw('ip', 'Interface Internet Protocol config commands'), kw('address', 'Set the IP address of an interface')],
      run: () => undefined,
    },
    {
      modes: CEMXC,
      toks: [kw('xconnect', 'Xconnect commands'), ip('peer', 'IP address of peer'), vcIdTok(), ...encap()],
      run: (x) => {
        const c = x.cfg.e1Controllers[x.session.ctxName!];
        c.xconnects[String(x.session.cemGroup)] = { peer: String(x.args.peer), vcId: Number(x.args.vc) };
        x.dirty();
      },
    },
    {
      modes: CEMXC,
      toks: [NO(), kw('xconnect', 'Xconnect commands')],
      run: (x) => {
        delete x.cfg.e1Controllers[x.session.ctxName!].xconnects[String(x.session.cemGroup)];
        x.dirty();
      },
    },
    // ---------------------------------------------------------------- show
    {
      modes: EXEC,
      toks: [showKw(), kw('mpls', 'MPLS information'), kw('l2transport', 'MPLS Transport information'), kw('vc', 'Show VC information')],
      run: (x) => L.showL2transportVc(x.ctx.sim, x.device),
    },
    {
      modes: EXEC,
      toks: [
        showKw(),
        kw('mpls', 'MPLS information'),
        kw('l2transport', 'MPLS Transport information'),
        kw('vc', 'Show VC information'),
        kw('detail', 'Detailed information'),
      ],
      run: (x) => L.showL2transportVcDetail(x.ctx.sim, x.device),
    },
    {
      modes: EXEC,
      toks: [showKw(), kw('mpls', 'MPLS information'), kw('l2transport', 'MPLS Transport information'), kw('vc', 'Show VC information'), vcIdTok()],
      run: (x) => L.showL2transportVcDetail(x.ctx.sim, x.device, Number(x.args.vc)),
    },
    { modes: EXEC, toks: [showKw(), kw('vfi', 'VFI information')], run: (x) => L.showVfi(x.ctx.sim, x.device) },
    {
      modes: EXEC,
      toks: [showKw(), kw('vfi', 'VFI information'), word('name', 'VFI name')],
      run: (x) => L.showVfi(x.ctx.sim, x.device, String(x.args.name)),
    },
    {
      modes: EXEC,
      toks: [showKw(), kw('controllers', 'Interface controller status'), kw('E1', 'E1 controller'), word('slot', 'slot/subslot/port')],
      run: (x) => {
        const k = controllerKey(String(x.args.slot));
        return k ? L.showControllerE1(x.ctx.sim, x.device, k) : '% Invalid controller';
      },
    },
    {
      modes: EXEC,
      toks: [
        kw('ping', 'Send echo messages'),
        kw('mpls', 'Ping an MPLS LSP'),
        kw('pseudowire', 'Target is a pseudowire'),
        ip('peer', 'Peer address'),
        vcIdTok(),
      ],
      run: pwPing,
    },
    {
      modes: EXEC,
      toks: [
        kw('ping', 'Send echo messages'),
        kw('mpls', 'Ping an MPLS LSP'),
        kw('pseudowire', 'Target is a pseudowire'),
        ip('peer', 'Peer address'),
        vcIdTok(),
        kw('repeat', 'Repeat count'),
        num('repeat', 1, 100, '<1-100> Repeat count'),
      ],
      run: pwPing,
    },
  ];
}
