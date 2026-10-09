import type { Device } from '../../model/types';
import { getNetConfig } from '../config/netConfig';
import { windowsMac } from '../core/mac';
import { formatIpv4, inSubnet, maskToPrefix, networkOf, parseIpv4, prefixToMask, validateHostAddress } from '../ip/ipv4';
import { portKey } from '../physical/linkState';
import type { Sim } from '../sim';
import { windowsPingOutput, windowsTraceOutput } from './format';

/**
 * Windows-style command prompt for end hosts (PC, UTS/PRS, FOIS, servers…).
 * IP settings are made in the host's "IP Configuration" form, as on a real
 * PC; the prompt is for checking and testing.
 */

export const HOST_PROMPT = 'C:\\>';

export interface HostContext {
  sim: Sim;
  simulationMode: boolean;
}

const HELP = [
  'Available commands:',
  '  ipconfig            Show IP configuration of each adapter',
  '  ipconfig /all       Also show physical (MAC) addresses',
  '  ping <ip> [-n N]    Send ICMP echo requests (default 4)',
  '  tracert <ip>        Trace the route to a host',
  '  arp -a              Show the ARP cache',
  '  arp -d              Clear the ARP cache',
  '  cls                 Clear the screen',
  '',
  'Set IP address / mask / gateway in the device panel (IP Configuration).',
].join('\n');

export function execHost(input: string, device: Device, ctx: HostContext): string {
  const words = input.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const cmd = words[0].toLowerCase();
  const sim = ctx.sim;

  if (cmd === 'help' || cmd === '?') return HELP;

  if (cmd === 'ipconfig') {
    const all = words[1]?.toLowerCase() === '/all';
    const cfg = getNetConfig(device);
    const out: string[] = ['', 'Windows IP Configuration', ''];
    for (const i of sim.interfaces(device.id).filter((x) => x.kind === 'port')) {
      out.push(`Ethernet adapter ${i.name}:`, '');
      const up = sim.phys.ports.get(portKey(device.id, i.port!))?.operUp;
      if (!up) {
        out.push('   Media State . . . . . . . . . . . : Media disconnected');
      } else {
        out.push('   Connection-specific DNS Suffix  . :');
        if (all) out.push(`   Physical Address. . . . . . . . . : ${windowsMac(i.mac).toUpperCase()}`);
        out.push(`   IPv4 Address. . . . . . . . . . . : ${i.ip !== undefined ? formatIpv4(i.ip) : '0.0.0.0'}`);
        out.push(`   Subnet Mask . . . . . . . . . . . : ${i.prefixLen !== undefined ? prefixToMask(i.prefixLen) : '0.0.0.0'}`);
        out.push(`   Default Gateway . . . . . . . . . : ${cfg.defaultGateway ?? ''}`);
      }
      out.push('');
    }
    return out.join('\n');
  }

  if (cmd === 'ping' || cmd === 'tracert') {
    const target = words[1];
    const dst = target ? parseIpv4(target) : null;
    if (dst === null) return target ? `Ping request could not find host ${target}. Please check the name and try again.` : 'Usage: ping <ip address> [-n count]';
    let count = 4;
    const n = words.indexOf('-n');
    if (cmd === 'ping' && n > 0) {
      const v = Number(words[n + 1]);
      if (!Number.isInteger(v) || v < 1 || v > 100) return 'Bad value for option -n, valid range is from 1 to 100.';
      count = v;
    }
    const sid = cmd === 'ping' ? sim.ping(device.id, dst, { count, timeoutMs: 4000, sizeBytes: 32 }) : sim.traceroute(device.id, dst, { timeoutMs: 4000 });
    if (ctx.simulationMode) return `${cmd} queued (Simulation mode): press Step or Play, then read the Packet Inspector.`;
    sim.runUntilIdle();
    const s = sim.session(sid)!;
    return cmd === 'ping' ? windowsPingOutput(s) : windowsTraceOutput(s);
  }

  if (cmd === 'arp') {
    const opt = words[1]?.toLowerCase();
    if (opt === '-d') {
      sim.clearArp(device.id);
      return '';
    }
    if (opt !== '-a' && opt !== '-g') return 'Usage: arp -a | arp -d';
    const entries = sim.arpTable(device.id);
    const out: string[] = [];
    for (const i of sim.interfaces(device.id).filter((x) => x.ip !== undefined)) {
      const mine = entries.filter((e) => e.iface === i.name);
      out.push('', `Interface: ${formatIpv4(i.ip!)} --- ${i.name}`, '  Internet Address      Physical Address      Type');
      for (const e of mine) out.push(`  ${formatIpv4(e.ip).padEnd(22)}${windowsMac(e.mac).padEnd(22)}dynamic`);
    }
    return out.length ? out.join('\n') : 'No ARP Entries Found.';
  }

  return `'${words[0]}' is not recognized as an internal or external command,\noperable program or batch file. Type "help" for the list.`;
}

/** Validation used by the host IP form. Returns an error message or null. */
export function validateHostForm(address: string, mask: string, gateway: string): string | null {
  if (!address && !mask && !gateway) return null;
  const err = validateHostAddress(address, mask);
  if (err) return err.replace(/^% /, '');
  if (!gateway) return null;
  const gw = parseIpv4(gateway);
  if (gw === null) return 'Invalid default gateway.';
  const len = maskToPrefix(mask)!;
  if (!inSubnet(gw, networkOf(parseIpv4(address)!, len), len)) return 'Default gateway is not on the same subnet as the IP address.';
  if (gw === parseIpv4(address)) return 'Default gateway cannot be the host\'s own address.';
  return null;
}
