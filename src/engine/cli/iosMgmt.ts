import { roleOf, type MgmtConfig } from '../config/netConfig';
import { formatIpv4, parseIpv4 } from '../ip/ipv4';
import type { Sim } from '../sim';
import * as F from './format';
import { CONF, EXEC, PRIV, ip, kw, line, num, word, type Cmd, type CliMode, type Exec } from './ios';

/**
 * Management-plane commands (P3): DNS, NTP, syslog, SNMP traps, SSH/Telnet
 * vty access. The CLI only changes configuration; the protocols themselves
 * run as packets in the simulator (see Sim.resolveName / ntpPoll / remoteLogin).
 */

const NO = () => kw('no', 'Negate a command or set its defaults');
const LINE: CliMode[] = ['config-line'];
const cliDevice = (x: Exec) => roleOf(x.device.kind) !== 'host' && roleOf(x.device.kind) !== 'hub' && roleOf(x.device.kind) !== 'opaque';
const m = (x: Exec): MgmtConfig => x.cfg.mgmt;
const set = (x: Exec, fn: (c: MgmtConfig) => void): void => {
  fn(m(x));
  x.dirty();
};
const addUnique = (list: string[], v: string) => (list.includes(v) ? list : [...list, v]);

/** Runs an application session to completion in Realtime mode. */
function finish(x: Exec, id: number): { done: boolean; result: string; address?: number; ok: boolean } {
  const sim = x.ctx.sim;
  if (!x.ctx.simulationMode) sim.runUntilIdle();
  const a = sim.appSession(id)!;
  if (a.status === 'pending') return { done: false, ok: false, result: 'Queued (Simulation mode): press Step or Play, then run the command again.' };
  return { done: true, ok: a.status === 'ok', result: a.result ?? '', address: a.address };
}

function pingName(x: Exec, kind: 'ping' | 'traceroute'): string {
  const name = String(x.args.host);
  const asIp = parseIpv4(name);
  let dst = asIp;
  const lines: string[] = [];
  if (dst === null) {
    lines.push(`Translating "${name}"...domain server (${x.ctx.sim.nameServersOf(x.device.id).map(formatIpv4).join(', ') || 'none'})`);
    const r = finish(x, x.ctx.sim.resolveName(x.device.id, name));
    if (!r.done) return r.result;
    if (!r.ok || r.address === undefined) return [...lines, r.result.startsWith('%') ? r.result : '% Unrecognized host or address, or protocol not running.'].join('\n');
    dst = r.address;
  }
  const sim = x.ctx.sim;
  const sid = kind === 'ping' ? sim.ping(x.device.id, dst) : sim.traceroute(x.device.id, dst);
  if (x.ctx.simulationMode) return [...lines, `${kind} queued (Simulation mode).`].join('\n');
  sim.runUntilIdle();
  const s = sim.session(sid)!;
  return [...lines, kind === 'ping' ? F.iosPingOutput(s) : F.iosTraceOutput(s)].join('\n');
}

function connect(x: Exec, proto: 'ssh' | 'telnet'): string {
  const target = String(x.args.host);
  let dst = parseIpv4(target);
  if (dst === null) {
    const r = finish(x, x.ctx.sim.resolveName(x.device.id, target));
    if (!r.done) return r.result;
    if (!r.ok || r.address === undefined) return '% Unknown command or computer name, or unable to find computer address';
    dst = r.address;
  }
  const user = x.args.user !== undefined ? String(x.args.user) : undefined;
  const r = finish(x, x.ctx.sim.remoteLogin(x.device.id, dst, proto, user));
  if (!r.done) return r.result;
  return `Trying ${formatIpv4(dst)} ... ${r.ok ? 'Open' : ''}\n${r.result}`;
}

export function showNtpStatus(sim: Sim, deviceId: string, cfg: MgmtConfig): string {
  if (cfg.ntpMaster) return `Clock is synchronized, stratum ${cfg.ntpMaster}, reference is 127.127.1.1 (local clock: ntp master)`;
  const st = sim.ntpState.get(deviceId);
  if (!cfg.ntpServers.length) return 'Clock is unsynchronized, stratum 16, no reference clock (no ntp server configured)';
  return st ? `Clock is synchronized, stratum ${st.stratum}, reference is ${formatIpv4(st.server)}` : `Clock is unsynchronized, stratum 16, no reference clock\n(server ${cfg.ntpServers.join(', ')} did not answer)`;
}

export function showNtpAssociations(sim: Sim, deviceId: string, cfg: MgmtConfig): string {
  const st = sim.ntpState.get(deviceId);
  const L = ['  address         ref clock       st   when   poll reach  delay  offset   disp'];
  for (const s of cfg.ntpServers) {
    const synced = st && formatIpv4(st.server) === s;
    L.push(`${synced ? '*~' : ' ~'}${s.padEnd(16)}${synced ? '.GPS.'.padEnd(16) : '.INIT.'.padEnd(16)}${String(synced ? st.stratum - 1 : 16).padStart(2)}      -     64  ${synced ? '377' : '  0'}  0.000   0.000  0.000`);
  }
  L.push(' * sys.peer, # selected, + candidate, - outlyer, x falseticker, ~ configured', 'RailMPLS Lab note: delay/offset/dispersion are not simulated.');
  return L.join('\n');
}

export function mgmtCmds(): Cmd[] {
  const showKw = kw('show', 'Show running system information');
  return [
    // ------------------------------------------------------------------ DNS
    { modes: CONF, toks: [kw('ip', 'Global IP configuration subcommands'), kw('domain-name', 'Define the default domain name'), word('name', 'Default domain name')], run: (x) => set(x, (c) => (c.domainName = String(x.args.name).toLowerCase())) },
    { modes: CONF, toks: [NO(), kw('ip', 'Global IP configuration subcommands'), kw('domain-name', 'Define the default domain name')], run: (x) => set(x, (c) => delete c.domainName) },
    { modes: CONF, toks: [kw('ip', 'Global IP configuration subcommands'), kw('domain-lookup', 'Enable IP Domain Name System hostname translation')], run: (x) => set(x, (c) => (c.domainLookup = true)) },
    { modes: CONF, toks: [NO(), kw('ip', 'Global IP configuration subcommands'), kw('domain-lookup', 'Enable IP Domain Name System hostname translation')], run: (x) => set(x, (c) => (c.domainLookup = false)) },
    { modes: CONF, toks: [kw('ip', 'Global IP configuration subcommands'), kw('name-server', 'Specify address of name server to use'), ip('ns', 'Domain server IP address')], run: (x) => set(x, (c) => (c.nameServers = addUnique(c.nameServers, String(x.args.ns)))) },
    { modes: CONF, toks: [NO(), kw('ip', 'Global IP configuration subcommands'), kw('name-server', 'Specify address of name server to use'), ip('ns', 'Domain server IP address')], run: (x) => set(x, (c) => (c.nameServers = c.nameServers.filter((n) => n !== String(x.args.ns)))) },
    { modes: CONF, toks: [kw('ip', 'Global IP configuration subcommands'), kw('host', 'Add an entry to the ip hostname table'), word('name', 'Name of host'), ip('addr', 'Host IP address')], run: (x) => {
      const n = String(x.args.name).toLowerCase();
      if (!/^[a-z][a-z0-9.-]*$/.test(n)) return '% Invalid host name';
      set(x, (c) => (c.hosts = { ...c.hosts, [n]: String(x.args.addr) }));
    } },
    { modes: CONF, toks: [NO(), kw('ip', 'Global IP configuration subcommands'), kw('host', 'Add an entry to the ip hostname table'), word('name', 'Name of host')], run: (x) => set(x, (c) => {
      const h = { ...c.hosts };
      delete h[String(x.args.name).toLowerCase()];
      c.hosts = h;
    }) },
    { modes: CONF, toks: [kw('ip', 'Global IP configuration subcommands'), kw('dns', 'Configure DNS server for a view'), kw('server', 'Enable DNS server')], run: (x) => set(x, (c) => (c.dnsServer = true)) },
    { modes: CONF, toks: [NO(), kw('ip', 'Global IP configuration subcommands'), kw('dns', 'Configure DNS server for a view'), kw('server', 'Enable DNS server')], run: (x) => set(x, (c) => (c.dnsServer = false)) },
    { modes: EXEC, toks: [showKw, kw('hosts', 'IP domain-name, lookup style, nameservers, and host table')], run: (x) => {
      const c = m(x);
      return [
        `Default domain is ${c.domainName ?? 'not set'}`,
        `Name/address lookup uses ${c.domainLookup ? 'domain service' : 'static mappings'}`,
        `Name servers are ${c.nameServers.join(', ') || 'not configured'}`,
        '',
        `${'Host'.padEnd(24)}Address`,
        ...Object.entries(c.hosts).map(([h, a]) => `${h.padEnd(24)}${a}`),
      ].join('\n');
    } },
    { modes: EXEC, toks: [kw('ping', 'Send echo messages'), word('host', 'Ping destination address or hostname')], run: (x) => pingName(x, 'ping') },
    { modes: EXEC, toks: [kw('traceroute', 'Trace route to destination'), word('host', 'Trace route to destination address or hostname')], run: (x) => pingName(x, 'traceroute') },

    // -------------------------------------------------------- SSH / Telnet
    { modes: CONF, toks: [kw('crypto', 'Encryption module'), kw('key', 'Long term key operations'), kw('generate', 'Generate new keys'), kw('rsa', 'Generate RSA keys'), kw('modulus', 'Provide number of modulus bits on the command line'), num('bits', 360, 4096, '<360-4096> size of the key modulus')], run: (x) => genKeys(x, Number(x.args.bits)) },
    { modes: CONF, toks: [kw('crypto', 'Encryption module'), kw('key', 'Long term key operations'), kw('generate', 'Generate new keys'), kw('rsa', 'Generate RSA keys')], run: (x) => genKeys(x, 1024) },
    { modes: CONF, toks: [kw('crypto', 'Encryption module'), kw('key', 'Long term key operations'), kw('zeroize', 'Remove keys'), kw('rsa', 'Remove RSA keys')], run: (x) => set(x, (c) => delete c.rsaModulus) },
    { modes: CONF, toks: [kw('ip', 'Global IP configuration subcommands'), kw('ssh', 'Configure ssh options'), kw('version', 'Specify protocol version to be supported'), num('v', 1, 2, '<1-2> Protocol version')], run: (x) => set(x, (c) => (c.sshVersion = Number(x.args.v) as 1 | 2)) },
    ...(['secret', 'password'] as const).flatMap((k): Cmd[] => [
      { modes: CONF, toks: [kw('username', 'Establish User Name Authentication'), word('user', 'User name'), kw(k, k === 'secret' ? 'Specify the secret for the user' : 'Specify the password for the user'), line('pw', 'The secret/password')], run: (x) => addUser(x, 1) },
      { modes: CONF, toks: [kw('username', 'Establish User Name Authentication'), word('user', 'User name'), kw('privilege', 'Set user privilege level'), num('priv', 0, 15, '<0-15> User privilege level'), kw(k, 'Specify the secret for the user'), line('pw', 'The secret/password')], run: (x) => addUser(x, Number(x.args.priv)) },
    ]),
    { modes: CONF, toks: [NO(), kw('username', 'Establish User Name Authentication'), word('user', 'User name')], run: (x) => set(x, (c) => {
      const u = { ...c.users };
      delete u[String(x.args.user)];
      c.users = u;
    }) },
    { modes: CONF, toks: [kw('line', 'Configure a terminal line'), kw('vty', 'Virtual terminal'), num('from', 0, 15, '<0-15> First Line number'), num('to', 0, 15, '<0-15> Last Line number')], run: (x) => {
      if (!cliDevice(x)) return x.invalid();
      x.setMode('config-line');
    } },
    { modes: CONF, toks: [kw('line', 'Configure a terminal line'), kw('console', 'Primary terminal line'), num('n', 0, 0, '<0-0> First Line number')], run: (x) => {
      x.setMode('config-line', { ctxName: 'console' });
      return '% RailMPLS Lab: console line settings are accepted but not simulated (the console is always open).';
    } },
    ...(['ssh', 'telnet', 'all', 'none'] as const).map(
      (t): Cmd => ({ modes: LINE, toks: [kw('transport', 'Define transport protocols for line'), kw('input', 'Define which protocols to use when connecting to the terminal server'), kw(t, `${t} protocol`)], run: (x) => vty(x, (v) => (v.transport = t)) }),
    ),
    { modes: LINE, toks: [kw('transport', 'Define transport protocols for line'), kw('input', 'Define which protocols to use'), kw('telnet', 'TCP/IP Telnet protocol'), kw('ssh', 'TCP/IP SSH protocol')], run: (x) => vty(x, (v) => (v.transport = 'all')) },
    { modes: LINE, toks: [kw('transport', 'Define transport protocols for line'), kw('input', 'Define which protocols to use'), kw('ssh', 'TCP/IP SSH protocol'), kw('telnet', 'TCP/IP Telnet protocol')], run: (x) => vty(x, (v) => (v.transport = 'all')) },
    { modes: LINE, toks: [kw('login', 'Enable password checking')], run: (x) => vty(x, (v) => (v.login = 'line')) },
    { modes: LINE, toks: [kw('login', 'Enable password checking'), kw('local', 'Local password checking')], run: (x) => vty(x, (v) => (v.login = 'local')) },
    { modes: LINE, toks: [NO(), kw('login', 'Enable password checking')], run: (x) => vty(x, (v) => (v.login = 'none')) },
    { modes: LINE, toks: [kw('password', 'Set a password'), line('pw', 'The password')], run: (x) => vty(x, (v) => (v.passwordSet = true)) },
    { modes: LINE, toks: [NO(), kw('password', 'Set a password')], run: (x) => vty(x, (v) => (v.passwordSet = false)) },
    { modes: LINE, toks: [kw('access-class', 'Filter connections based on an IP access list'), word('acl', 'IP access list'), kw('in', 'Filter incoming connections')], run: (x) => vty(x, (v) => (v.accessClass = String(x.args.acl))) },
    { modes: LINE, toks: [NO(), kw('access-class', 'Filter connections based on an IP access list'), word('acl', 'IP access list'), kw('in', 'Filter incoming connections')], run: (x) => vty(x, (v) => delete v.accessClass) },
    { modes: EXEC, toks: [kw('telnet', 'Open a telnet connection'), word('host', 'IP address or hostname of a remote system')], run: (x) => connect(x, 'telnet') },
    { modes: EXEC, toks: [kw('ssh', 'Open a secure shell client connection'), kw('-l', 'Log in using this user name'), word('user', 'Login name'), word('host', 'IP address or hostname of a remote system')], run: (x) => connect(x, 'ssh') },
    { modes: EXEC, toks: [showKw, kw('ip', 'IP information'), kw('ssh', 'Information on SSH')], run: (x) => {
      const c = m(x);
      const on = !!c.rsaModulus && !!c.domainName;
      return `SSH ${on ? `Enabled - version ${c.sshVersion === 1 ? '1.5' : c.sshVersion === 2 ? '2.0' : '1.99'}` : 'Disabled - version 1.99'}\n${on ? `Authentication timeout: 120 secs; Authentication retries: 3\nMinimum expected Diffie Hellman key size : ${c.rsaModulus} bits` : '%Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).'}`;
    } },
    { modes: EXEC, toks: [showKw, kw('line', 'TTY line information'), kw('vty', 'Virtual terminal'), num('n', 0, 15, '<0-15> Line number')], run: (x) => {
      const v = m(x).vty;
      return [`Line ${x.args.n} (vty)`, `  Allowed input transports are ${v.transport === 'all' ? 'telnet ssh' : v.transport}.`, `  Login: ${v.login === 'local' ? 'local usernames' : v.login === 'line' ? (v.passwordSet ? 'line password' : 'line password (NOT SET — logins refused)') : 'none (no authentication)'}`, `  Access-class in: ${v.accessClass ?? 'not set'}`].join('\n');
    } },

    // ------------------------------------------------------------------ NTP
    { modes: CONF, toks: [kw('ntp', 'Configure NTP'), kw('server', 'Configure NTP server'), ip('srv', 'IP address of peer')], run: (x) => {
      set(x, (c) => (c.ntpServers = addUnique(c.ntpServers, String(x.args.srv))));
    } },
    { modes: CONF, toks: [NO(), kw('ntp', 'Configure NTP'), kw('server', 'Configure NTP server'), ip('srv', 'IP address of peer')], run: (x) => set(x, (c) => (c.ntpServers = c.ntpServers.filter((s) => s !== String(x.args.srv)))) },
    { modes: CONF, toks: [kw('ntp', 'Configure NTP'), kw('master', 'Act as NTP master clock')], run: (x) => set(x, (c) => (c.ntpMaster = 8)) },
    { modes: CONF, toks: [kw('ntp', 'Configure NTP'), kw('master', 'Act as NTP master clock'), num('st', 1, 15, '<1-15> Stratum number')], run: (x) => set(x, (c) => (c.ntpMaster = Number(x.args.st))) },
    { modes: CONF, toks: [NO(), kw('ntp', 'Configure NTP'), kw('master', 'Act as NTP master clock')], run: (x) => set(x, (c) => delete c.ntpMaster) },
    { modes: EXEC, toks: [showKw, kw('ntp', 'Network time protocol'), kw('status', 'NTP status')], run: (x) => {
      const id = x.ctx.sim.ntpPoll(x.device.id);
      if (id !== undefined) finish(x, id);
      return showNtpStatus(x.ctx.sim, x.device.id, m(x));
    } },
    { modes: EXEC, toks: [showKw, kw('ntp', 'Network time protocol'), kw('associations', 'NTP associations')], run: (x) => {
      const id = x.ctx.sim.ntpPoll(x.device.id);
      if (id !== undefined) finish(x, id);
      return showNtpAssociations(x.ctx.sim, x.device.id, m(x));
    } },

    // ------------------------------------------------------- Syslog / SNMP
    ...[[kw('host', 'Set syslog server IP address and parameters')], []].flatMap((extra): Cmd[] => [
      { modes: CONF, toks: [kw('logging', 'Modify message logging facilities'), ...extra, ip('h', 'IP address of the logging host')], run: (x) => set(x, (c) => (c.loggingHosts = addUnique(c.loggingHosts, String(x.args.h)))) },
      { modes: CONF, toks: [NO(), kw('logging', 'Modify message logging facilities'), ...extra, ip('h', 'IP address of the logging host')], run: (x) => set(x, (c) => (c.loggingHosts = c.loggingHosts.filter((h) => h !== String(x.args.h)))) },
    ]),
    { modes: CONF, toks: [kw('snmp-server', 'Modify SNMP engine parameters'), kw('community', 'Enable SNMP; set community string and access privs'), word('c', 'SNMP community string'), kw('RO', 'Read-only access with this community string')], run: (x) => set(x, (c) => (c.snmpCommunities = { ...c.snmpCommunities, [String(x.args.c)]: 'ro' })) },
    { modes: CONF, toks: [kw('snmp-server', 'Modify SNMP engine parameters'), kw('community', 'Enable SNMP; set community string and access privs'), word('c', 'SNMP community string'), kw('RW', 'Read-write access with this community string')], run: (x) => set(x, (c) => (c.snmpCommunities = { ...c.snmpCommunities, [String(x.args.c)]: 'rw' })) },
    { modes: CONF, toks: [NO(), kw('snmp-server', 'Modify SNMP engine parameters'), kw('community', 'Enable SNMP; set community string and access privs'), word('c', 'SNMP community string')], run: (x) => set(x, (c) => {
      const n = { ...c.snmpCommunities };
      delete n[String(x.args.c)];
      c.snmpCommunities = n;
    }) },
    ...[[], [kw('version', 'SNMP version to use for notification messages'), kw('2c', 'Use SNMPv2c')]].map(
      (extra): Cmd => ({ modes: CONF, toks: [kw('snmp-server', 'Modify SNMP engine parameters'), kw('host', 'Specify hosts to receive SNMP notifications'), ip('h', 'IP address of SNMP notification host'), ...extra, word('c', 'SNMPv1/v2c community string')], run: (x) => set(x, (c) => {
        c.snmpTrapHosts = [...c.snmpTrapHosts.filter((t) => t.ip !== String(x.args.h)), { ip: String(x.args.h), community: String(x.args.c) }];
      }) }),
    ),
    { modes: CONF, toks: [NO(), kw('snmp-server', 'Modify SNMP engine parameters'), kw('host', 'Specify hosts to receive SNMP notifications'), ip('h', 'IP address of SNMP notification host')], run: (x) => set(x, (c) => (c.snmpTrapHosts = c.snmpTrapHosts.filter((t) => t.ip !== String(x.args.h)))) },
    { modes: CONF, toks: [kw('snmp-server', 'Modify SNMP engine parameters'), kw('enable', 'Enable SNMP Traps or Informs'), kw('traps', 'Enable SNMP Traps')], run: (x) => set(x, (c) => (c.snmpTraps = true)) },
    { modes: CONF, toks: [NO(), kw('snmp-server', 'Modify SNMP engine parameters'), kw('enable', 'Enable SNMP Traps or Informs'), kw('traps', 'Enable SNMP Traps')], run: (x) => set(x, (c) => (c.snmpTraps = false)) },
    { modes: PRIV, toks: [showKw, kw('snmp', 'snmp statistics'), kw('community', 'show snmp communities')], run: (x) => {
      const c = m(x).snmpCommunities;
      return Object.keys(c).length ? Object.entries(c).map(([n, a]) => `Community name: ${n}\nCommunity Index: ${n}\nCommunity access: ${a === 'ro' ? 'read-only' : 'read-write'}\n`).join('\n') : '% SNMP agent not enabled';
    } },
  ];
}

function genKeys(x: Exec, bits: number): string | void {
  const c = m(x);
  if (!c.domainName) return '% Please define a domain-name first.';
  set(x, (cc) => (cc.rsaModulus = bits));
  return `The name for the keys will be: ${x.device.name}.${c.domainName}\n% The key modulus size is ${bits} bits\n% Generating ${bits} bit RSA keys, keys will be non-exportable...\n[OK]${bits < 768 ? '\n% Note: SSH version 2 needs keys of at least 768 bits.' : ''}`;
}

function addUser(x: Exec, privilege: number): string | void {
  const u = String(x.args.user);
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,31}$/.test(u)) return '% Invalid user name';
  set(x, (c) => (c.users = { ...c.users, [u]: { privilege } }));
}

function vty(x: Exec, fn: (v: MgmtConfig['vty']) => void): string | void {
  if (x.session.ctxName === 'console') return;
  set(x, (c) => fn(c.vty));
}
