import type { Device } from '../../model/types';
import { longIfName } from '../config/netConfig';
import { formatIpv4 } from '../ip/ipv4';
import { tsText, type PwEndpoint } from '../l2vpn/pw';
import type { Sim } from '../sim';

/**
 * show output for pseudowires (P6). Only computed state is shown: creation
 * times, status-change times and VC packet counters are not simulated ("-").
 */

const pad = (s: string | number, n: number) => String(s).padEnd(n);

/** IOS abbreviates interface names in this table ("Gi0/3/0", "CE0/4/0"). */
function shortAc(e: PwEndpoint): string {
  if (e.vfi) return `VFI ${e.vfi}`;
  if (e.controller) return `CE${e.controller}`;
  return e.ac.replace(/^GigabitEthernet/, 'Gi').replace(/^TenGigabitEthernet/, 'Te');
}

function circuit(e: PwEndpoint): string {
  if (e.vfi) return 'VFI';
  if (e.type === 'Eth VLAN') return `Eth VLAN ${e.vlan}`;
  return e.type;
}

const mine = (sim: Sim, device: Device) => sim.pw.endpoints.filter((e) => e.deviceId === device.id);

export function showL2transportVc(sim: Sim, device: Device): string {
  const es = mine(sim, device);
  if (!es.length) return '';
  const L = [
    `${pad('Local intf', 15)}${pad('Local circuit', 27)}${pad('Dest address', 16)}${pad('VC ID', 11)}Status`,
    `${'-'.repeat(13)}  ${'-'.repeat(26)} ${'-'.repeat(15)} ${'-'.repeat(10)} ${'-'.repeat(10)}`,
  ];
  for (const e of es) L.push(`${pad(shortAc(e), 15)}${pad(circuit(e), 27)}${pad(formatIpv4(e.peer), 16)}${pad(e.vcId, 11)}${e.status}`);
  const down = es.filter((e) => e.status !== 'UP');
  if (down.length) L.push('', 'RailMPLS Lab note — why VCs are down:', ...down.map((e) => `  ${shortAc(e)} → ${formatIpv4(e.peer)} VC ${e.vcId}: ${e.reason}`));
  return L.join('\n');
}

export function showL2transportVcDetail(sim: Sim, device: Device, vcId?: number): string {
  const es = mine(sim, device).filter((e) => vcId === undefined || e.vcId === vcId);
  if (!es.length) return '';
  const name = (id?: string) => (id ? (sim.device(id)?.name ?? id) : '?');
  const out: string[] = [];
  for (const e of es) {
    const acState = e.acUp ? 'up' : 'down';
    const head = e.vfi
      ? `Local interface: VFI ${e.vfi} vfi ${acState}`
      : e.controller
        ? `Local interface: CEM${e.controller} ${acState}, line protocol ${acState}, ${e.type === 'SATOP E1' ? 'SATOP E1' : `CESoPSN Basic (timeslots ${tsText(e.timeslots)})`} ${acState}`
        : `Local interface: ${longIfName(e.ac)} ${acState}, line protocol ${acState}, ${circuit(e)} ${acState}`;
    const t = e.transport;
    out.push(
      head,
      `  Destination address: ${formatIpv4(e.peer)}, VC ID: ${e.vcId}, VC status: ${e.status.toLowerCase()}`,
      `    Output interface: ${t ? `${longIfName(t.iface)}, imposed label stack {${[...(t.label !== undefined ? [t.label] : []), e.remote?.localLabel ?? '-'].join(' ')}}` : 'none, imposed label stack {}'}`,
      '  Create time: -, last status change time: -',
      `  Signaling protocol: LDP, peer ${formatIpv4(e.peer)}:0 ${e.remote ? 'up' : 'down'}`,
      `    MPLS VC labels: local ${e.localLabel}, remote ${e.remote?.localLabel ?? 'unassigned'}`,
      ...(e.type === 'Ethernet' || e.type === 'Eth VLAN' ? [`    MTU: local ${e.mtu}, remote ${e.remote?.mtu ?? 'unknown'}`] : []),
      `    Remote PE: ${name(e.remoteDeviceId)}`,
      '  VC statistics: (packet/byte counters are not simulated)',
    );
    if (e.status !== 'UP') out.push(`  RailMPLS Lab note: ${e.reason}`);
    out.push('');
  }
  return out.join('\n').trimEnd();
}

export function showVfi(sim: Sim, device: Device, only?: string): string {
  const cfg = sim.config(device.id)!;
  const names = Object.keys(cfg.vfis).filter((n) => !only || n === only);
  if (!names.length) return only ? `% VFI ${only} does not exist` : '';
  const L: string[] = ['Legend: RT=Route-target, S=Split-horizon, Y=Yes, N=No', ''];
  for (const n of names) {
    const v = cfg.vfis[n];
    const pws = sim.pw.endpoints.filter((e) => e.deviceId === device.id && e.vfi === n);
    const acs = sim.pw.vfiAcs.get(`${device.id}|${n}`) ?? [];
    const up = pws.some((p) => p.status === 'UP');
    L.push(
      `VFI name: ${n}, state: ${up ? 'up' : 'down'}, type: multipoint, signaling: LDP`,
      `  VPN ID: ${v.vpnId ?? '<not set>'}`,
      `  Local attachment circuits:`,
      ...(acs.length ? acs.map((a) => `    ${longIfName(a)}`) : ['    (none — use "xconnect vfi ' + n + '" on an interface)']),
      '  Neighbors connected via pseudowires:',
      `  ${pad('Peer Address', 17)}${pad('VC ID', 11)}${pad('S', 3)}Status`,
      ...pws.map((p) => `  ${pad(formatIpv4(p.peer), 17)}${pad(p.vcId, 11)}${pad('Y', 3)}${p.status}`),
      '',
    );
    const down = pws.filter((p) => p.status !== 'UP');
    if (down.length) L.push('  RailMPLS Lab note:', ...down.map((p) => `    ${formatIpv4(p.peer)}: ${p.reason}`), '');
  }
  return L.join('\n').trimEnd();
}

export function showControllerE1(sim: Sim, device: Device, key: string): string {
  const c = sim.config(device.id)!.e1Controllers[key];
  if (!c) return `% Controller E1 ${key} is not configured`;
  const L = [`E1 ${key} is ${c.shutdown ? 'administratively down' : 'up'}.`, '  Logical E1 controller (networking-only mode: no E1 cable or framer is simulated)'];
  for (const [g, grp] of Object.entries(c.cemGroups)) {
    const xc = c.xconnects[g];
    L.push(`  cem-group ${g}: ${grp.unframed ? 'unframed (SAToP, 2.048 Mbit/s)' : `timeslots ${tsText(grp.timeslots)} (CESoPSN, ${grp.timeslots.length * 64} kbit/s)`}${xc ? `, xconnect ${xc.peer} VC ${xc.vcId}` : ', no xconnect'}`);
  }
  L.push('  (RailMPLS Lab: line coding, framing alarms and error counters are not simulated in networking-only mode.)');
  return L.join('\n');
}
