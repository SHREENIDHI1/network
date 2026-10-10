import { ChevronLeft, ChevronRight, Crosshair } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FrameView, TraceStep } from '../../engine/sim';
import { useSimStore } from '../../store/simStore';
import { useTopologyStore } from '../../store/topologyStore';

/**
 * Packet inspector: pick a flow (one ping probe, one ARP exchange…), step
 * through it hop by hop, and see the headers plus which table decided.
 */

const ACTION_STYLE: Record<string, string> = {
  drop: 'text-red-400',
  deliver: 'text-emerald-300',
  reply: 'text-emerald-300',
  forward: 'text-sky-300',
  flood: 'text-amber-300',
  learn: 'text-violet-300',
  send: 'text-sky-300',
  queue: 'text-yellow-300',
  receive: 'text-slate-300',
};

export default function PacketInspector() {
  const sim = useSimStore((s) => s.sim);
  const version = useSimStore((s) => s.version);
  const selectedFlowId = useSimStore((s) => s.selectedFlowId);
  const selectedStepSeq = useSimStore((s) => s.selectedStepSeq);
  const { selectFlow, selectStep } = useSimStore.getState();
  const [hideArp, setHideArp] = useState(false);
  const devices = useTopologyStore((s) => s.topology.devices);
  const names = useMemo(() => new Map(devices.map((d) => [d.id, d.name])), [devices]);

  const flows = useMemo(
    () => [...sim.flows.values()].filter((f) => !hideArp || !f.label.startsWith('ARP')).reverse(),
    // version: engine state changed (new flows/steps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim, hideArp, version],
  );
  const flow = selectedFlowId !== undefined ? sim.flows.get(selectedFlowId) : flows[0];
  const steps = flow?.steps ?? [];
  const idx = Math.max(
    0,
    steps.findIndex((s) => s.seq === selectedStepSeq),
  );
  const step: TraceStep | undefined = steps[idx];
  const children = flow ? [...sim.flows.values()].filter((f) => f.parentId === flow.id) : [];

  if (!sim.flows.size) {
    return (
      <p className="p-3 text-sm text-slate-400">
        No packets yet. Open a CLI and run <code className="text-sky-300">ping</code> or <code className="text-sky-300">traceroute</code>. In
        Simulation mode, use Step / Play and watch each hop here.
      </p>
    );
  }

  const go = (d: number) => {
    const n = steps[Math.min(steps.length - 1, Math.max(0, idx + d))];
    if (n) selectStep(n.seq);
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_1fr_320px] text-xs">
      <div className="flex min-h-0 flex-col border-r border-slate-800">
        <label className="flex items-center gap-1.5 border-b border-slate-800 px-2 py-1 text-slate-400">
          <input type="checkbox" checked={hideArp} onChange={(e) => setHideArp(e.target.checked)} /> Hide ARP flows
        </label>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {flows.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => selectFlow(f.id)}
                className={`block w-full truncate px-2 py-1 text-left hover:bg-slate-800 ${flow?.id === f.id ? 'bg-slate-800 text-sky-300' : 'text-slate-300'}`}
                title={f.label}
              >
                <span className="text-slate-500">#{f.id}</span> {f.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-slate-800 px-2 py-1">
          <span className="truncate font-medium text-slate-200">{flow?.label}</span>
          <span className="ml-auto text-slate-500">
            hop {steps.length ? idx + 1 : 0}/{steps.length}
          </span>
          <button type="button" className="rn-btn px-1.5 py-0.5" onClick={() => go(-1)} aria-label="Previous step">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="rn-btn px-1.5 py-0.5" onClick={() => go(1)} aria-label="Next step">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-950 text-left text-slate-500">
              <tr>
                <th className="px-2 py-0.5 font-medium">t (ms)</th>
                <th className="px-1 font-medium">Device</th>
                <th className="px-1 font-medium">Port/If</th>
                <th className="px-1 font-medium">Action</th>
                <th className="px-1 font-medium">Decided by</th>
                <th className="px-1 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s, i) => (
                <tr
                  key={s.seq}
                  onClick={() => selectStep(s.seq)}
                  className={`cursor-pointer border-t border-slate-800/60 hover:bg-slate-800/60 ${i === idx ? 'bg-slate-800' : ''}`}
                >
                  <td className="px-2 py-0.5 font-mono text-slate-400">{s.time.toFixed(3)}</td>
                  <td className="px-1 text-slate-200">{names.get(s.deviceId) ?? s.deviceId}</td>
                  <td className="px-1 font-mono text-slate-400">{s.iface ?? s.portId ?? ''}</td>
                  <td className={`px-1 font-semibold uppercase ${ACTION_STYLE[s.action] ?? ''}`}>{s.action}</td>
                  <td className="px-1 text-slate-300">{s.table ?? ''}</td>
                  <td className="px-1 text-slate-300">{s.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {children.length > 0 && (
            <div className="border-t border-slate-800 px-2 py-1 text-slate-400">
              Related:{' '}
              {children.map((c) => (
                <button key={c.id} type="button" className="mr-2 text-sky-400 hover:underline" onClick={() => selectFlow(c.id)}>
                  #{c.id} {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto border-l border-slate-800 p-2">
        {step ? <StepDetail step={step} deviceName={names.get(step.deviceId) ?? ''} /> : <p className="text-slate-500">Select a hop.</p>}
      </div>
    </div>
  );
}

function StepDetail({ step, deviceName }: { step: TraceStep; deviceName: string }) {
  const f = step.frame;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-100">{deviceName}</span>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 text-sky-400 hover:underline"
          onClick={() => useTopologyStore.getState().select({ type: 'device', id: step.deviceId })}
        >
          <Crosshair className="h-3.5 w-3.5" /> show on canvas
        </button>
      </div>
      <p className="text-slate-300">{step.detail}</p>
      {step.table && (
        <p>
          <span className="rn-label inline">Decided by</span> <span className="text-amber-300">{step.table}</span>
        </p>
      )}
      {f ? <Headers f={f} /> : <p className="text-slate-500">No frame at this step (internal decision).</p>}
    </div>
  );
}

function Headers({ f }: { f: FrameView }) {
  const row = (k: string, v: string | number | undefined) => (
    <tr key={k}>
      <td className="pr-2 text-slate-500">{k}</td>
      <td className="font-mono text-slate-200">{v ?? '—'}</td>
    </tr>
  );
  return (
    <div className="space-y-2">
      <section>
        <h4 className="rn-label">Ethernet II</h4>
        <table>
          <tbody>
            {row('Destination', f.dstMac)}
            {row('Source', f.srcMac)}
            {row('EtherType', f.etherType)}
          </tbody>
        </table>
      </section>
      <section>
        <h4 className="rn-label">802.1Q</h4>
        {f.vlanTag !== undefined ? (
          <table>
            <tbody>
              {row('TPID', '0x8100')}
              {row('VLAN ID', f.vlanTag)}
              {row('PCP', '0')}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-500">Untagged on this hop</p>
        )}
      </section>
      <section>
        <h4 className="rn-label">MPLS label stack</h4>
        {f.mpls?.length ? (
          <table>
            <thead>
              <tr className="text-slate-500">
                <td className="pr-3">Label</td>
                <td className="pr-3">TC (EXP)</td>
                <td className="pr-3">S</td>
                <td>TTL</td>
              </tr>
            </thead>
            <tbody>
              {f.mpls.map((l, i) => (
                <tr key={i} className="font-mono text-violet-200">
                  <td className="pr-3">{l.label}</td>
                  <td className="pr-3">{l.tc}</td>
                  <td className="pr-3">{i === f.mpls!.length - 1 ? 1 : 0}</td>
                  <td>{l.ttl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-slate-500">None — plain IP on this hop</p>
        )}
      </section>
      {f.pw && (
        <section>
          <h4 className="rn-label">Pseudowire payload: customer Ethernet</h4>
          <table>
            <tbody>
              {row('Destination', f.pw.dstMac)}
              {row('Source', f.pw.srcMac)}
              {f.pw.vlanTag !== undefined && row('802.1Q VLAN', f.pw.vlanTag)}
              {row('EtherType', f.pw.etherType)}
            </tbody>
          </table>
        </section>
      )}
      {f.arp && (
        <section>
          <h4 className="rn-label">ARP</h4>
          <table>
            <tbody>
              {row('Opcode', f.arp.op)}
              {row('Sender MAC', f.arp.senderMac)}
              {row('Sender IP', f.arp.senderIp)}
              {row('Target MAC', f.arp.targetMac)}
              {row('Target IP', f.arp.targetIp)}
            </tbody>
          </table>
        </section>
      )}
      {f.ip && (
        <section>
          <h4 className="rn-label">IPv4</h4>
          <table>
            <tbody>
              {row('Source', f.ip.src)}
              {row('Destination', f.ip.dst)}
              {row('TTL', f.ip.ttl)}
              {row('Protocol', f.ip.protocol)}
              {row('Total length', `${f.ip.sizeBytes} bytes`)}
            </tbody>
          </table>
          <h4 className="rn-label mt-2">{f.ip.protocol.split(' ')[0]}</h4>
          <p className="font-mono text-slate-200">{f.ip.icmp}</p>
        </section>
      )}
    </div>
  );
}
