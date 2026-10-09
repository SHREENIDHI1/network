import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useMemo, useRef } from 'react';
import { HOST_PROMPT, execHost } from '../../engine/cli/host';
import { completeIos, execIos, helpIos, newSession, prompt, type CliSession } from '../../engine/cli/ios';
import { roleOf } from '../../engine/config/netConfig';
import { visibleTopology } from '../../model/networkingMode';
import { useSimStore } from '../../store/simStore';
import { useTopologyStore } from '../../store/topologyStore';

/**
 * Per-device terminal. IOS-like CLI for switches/routers, Windows-style
 * prompt for hosts. Session state and scrollback survive switching devices
 * and closing the dock (kept in memory for this browser tab).
 */

interface TermState {
  session?: CliSession;
  scrollback: string;
  history: string[];
}

const states = new Map<string, TermState>();

function stateFor(deviceId: string): TermState {
  let s = states.get(deviceId);
  if (!s) {
    s = { scrollback: '', history: [] };
    states.set(deviceId, s);
  }
  return s;
}

export default function CliPanel() {
  const deviceId = useSimStore((s) => s.cliDeviceId);
  const topology = useTopologyStore((s) => s.topology);
  const devices = useMemo(() => visibleTopology(topology).devices.filter((d) => roleOf(d.kind) !== 'opaque'), [topology]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-800 px-2 py-1 text-xs">
        <label htmlFor="cli-dev" className="text-slate-400">
          Device
        </label>
        <select id="cli-dev" className="rn-input w-56 py-0.5 text-xs" value={deviceId ?? ''} onChange={(e) => useSimStore.getState().openCli(e.target.value)}>
          <option value="" disabled>
            Select a device…
          </option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <span className="text-slate-500">Type “?” for help · Tab completes · ↑/↓ history · paste multi-line configs</span>
      </div>
      <div className="min-h-0 flex-1">{deviceId && devices.some((d) => d.id === deviceId) ? <Term key={deviceId} deviceId={deviceId} /> : <Empty />}</div>
    </div>
  );
}

function Empty() {
  return <p className="p-3 text-sm text-slate-500">Select a switch, router or host to open its console (or use “Open CLI” in the device panel).</p>;
}

function Term({ deviceId }: { deviceId: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      convertEol: true,
      cursorBlink: true,
      scrollback: 5000,
      theme: { background: '#020617', foreground: '#e2e8f0', cursor: '#38bdf8' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // element hidden; ignore
      }
    });
    ro.observe(el);

    const st = stateFor(deviceId);
    const device = () => useTopologyStore.getState().topology.devices.find((d) => d.id === deviceId);
    const isHost = () => {
      const d = device();
      return !!d && roleOf(d.kind) === 'host';
    };
    st.session ??= newSession(deviceId);
    let input = '';
    let histIdx = st.history.length;

    const write = (s: string) => {
      st.scrollback += s;
      if (st.scrollback.length > 200_000) st.scrollback = st.scrollback.slice(-150_000);
      term.write(s);
    };
    const currentPrompt = () => (isHost() ? HOST_PROMPT : prompt(st.session!, useTopologyStore.getState().topology));
    const showPrompt = () => write(currentPrompt());
    const redrawInput = (next: string) => {
      write('\b \b'.repeat(input.length));
      input = next;
      write(input);
    };

    const run = (line: string) => {
      const d = device();
      if (!d) return;
      const { sim, mode } = useSimStore.getState();
      const simulationMode = mode === 'simulation';
      if (/^\s*(cls|clear)\s*$/i.test(line)) {
        term.clear();
        st.scrollback = '';
        return;
      }
      let out: string;
      if (isHost()) out = execHost(line, d, { sim, simulationMode });
      else {
        const r = execIos(line, st.session!, { topology: useTopologyStore.getState().topology, sim, simulationMode });
        st.session = r.session;
        if (r.topology) useTopologyStore.getState().applyTopology(r.topology);
        out = r.output;
      }
      if (out) write(`${out}\n`);
    };

    if (st.scrollback) term.write(st.scrollback);
    else {
      const d = device();
      write(isHost() ? `RailNet Sim command prompt — ${d?.name}\nType "help" for commands.\n\n` : `RailNet Sim IOS-like CLI (subset) — ${d?.name}\nPress RETURN to get started. Type ? for help.\n\n`);
      showPrompt();
    }

    const sub = term.onData((data) => {
      // Paste of several lines: run each line as if typed.
      if (data.length > 1 && /[\r\n]/.test(data)) {
        const lines = (input + data).split(/\r\n|\r|\n/);
        const rest = lines.pop() ?? '';
        input = '';
        for (const l of lines) {
          write(`${l.slice(0)}\n`);
          if (l.trim()) st.history.push(l);
          run(l);
          showPrompt();
        }
        input = rest;
        write(rest);
        histIdx = st.history.length;
        return;
      }
      switch (data) {
        case '\r': {
          write('\n');
          const line = input;
          input = '';
          if (line.trim()) {
            st.history.push(line);
            if (st.history.length > 200) st.history.shift();
          }
          histIdx = st.history.length;
          run(line);
          showPrompt();
          return;
        }
        case '\x7f':
        case '\b':
          if (input.length) {
            input = input.slice(0, -1);
            write('\b \b');
          }
          return;
        case '\x03': // Ctrl-C
          write('^C\n');
          input = '';
          showPrompt();
          return;
        case '\x1a': // Ctrl-Z: back to privileged EXEC
          if (!isHost() && st.session && st.session.mode.startsWith('config')) st.session = { deviceId, mode: 'priv' };
          write('^Z\n');
          input = '';
          showPrompt();
          return;
        case '\t': {
          if (isHost()) return;
          const c = completeIos(input, st.session!, useTopologyStore.getState().topology);
          if (c) redrawInput(c);
          return;
        }
        case '\x1b[A':
          if (histIdx > 0) {
            histIdx--;
            redrawInput(st.history[histIdx]);
          }
          return;
        case '\x1b[B':
          if (histIdx < st.history.length) {
            histIdx++;
            redrawInput(st.history[histIdx] ?? '');
          }
          return;
      }
      if (data === '?' && !isHost()) {
        write('?\n');
        write(`${helpIos(input, st.session!, useTopologyStore.getState().topology)}\n`);
        showPrompt();
        write(input);
        return;
      }
      if (data.startsWith('\x1b')) return; // other escape sequences (←/→) ignored
      const printable = data.replace(/[\x00-\x1f]/g, '');
      input += printable;
      write(printable);
    });

    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        // ignore
      }
      term.focus();
    });

    return () => {
      sub.dispose();
      ro.disconnect();
      term.dispose();
    };
  }, [deviceId]);

  return <div ref={host} className="h-full w-full bg-[#020617] p-1" />;
}
