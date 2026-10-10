import { useState } from 'react';
import { pwCoreMtu, TDM_PW_OVERHEAD_BYTES, tdmPw } from '../../lessons/widgetMath6';

/** P6 widgets: core MTU needed by an Ethernet pseudowire, TDM pseudowire packetisation. */

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-violet-900 bg-slate-900/80 p-3 text-sm">{children}</div>
);

export function PwMtuWidget() {
  const [ipMtu, setIpMtu] = useState(1500);
  const [vlanTagged, setTagged] = useState(false);
  const [labels, setLabels] = useState(2);
  const [controlWord, setCw] = useState(false);
  const r = pwCoreMtu({ ipMtu, vlanTagged, labels, controlWord });
  return (
    <Box>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="flex flex-col text-slate-400">
          Customer IP MTU
          <input type="number" className="rn-input w-24 font-mono" value={ipMtu} onChange={(e) => setIpMtu(Number(e.target.value))} />
        </label>
        <label className="flex flex-col text-slate-400">
          Labels
          <input
            type="number"
            min={1}
            max={4}
            className="rn-input w-16 font-mono"
            value={labels}
            onChange={(e) => setLabels(Number(e.target.value))}
          />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={vlanTagged} onChange={(e) => setTagged(e.target.checked)} /> customer frame has an 802.1Q tag
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={controlWord} onChange={(e) => setCw(e.target.checked)} /> control word
        </label>
      </div>
      {typeof r === 'string' ? (
        <p className="mt-2 text-amber-300">{r}</p>
      ) : (
        <p className="mt-2 text-xs">
          Customer frame <span className="font-mono text-sky-300">{r.inner}</span> B + MPLS{' '}
          <span className="font-mono text-violet-300">{r.mpls}</span> B = core links need an MTU of at least{' '}
          <span className="font-mono text-emerald-300">{r.total}</span> bytes. A 1500-byte core drops the large frames silently — small pings still
          work.
        </p>
      )}
    </Box>
  );
}

export function TdmPwWidget() {
  const [mode, setMode] = useState<'unframed' | 'ts'>('ts');
  const [ts, setTs] = useState(4);
  const [fpp, setFpp] = useState(8);
  const r = tdmPw({ timeslots: mode === 'unframed' ? 'unframed' : ts, framesPerPacket: fpp });
  return (
    <Box>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="flex flex-col text-slate-400">
          Type
          <select className="rn-input w-48" value={mode} onChange={(e) => setMode(e.target.value as 'unframed' | 'ts')}>
            <option value="ts">CESoPSN (timeslots)</option>
            <option value="unframed">SAToP (whole E1, unframed)</option>
          </select>
        </label>
        {mode === 'ts' && (
          <label className="flex flex-col text-slate-400">
            Timeslots
            <input type="number" min={1} max={31} className="rn-input w-20 font-mono" value={ts} onChange={(e) => setTs(Number(e.target.value))} />
          </label>
        )}
        <label className="flex flex-col text-slate-400">
          E1 frames per packet
          <input type="number" min={1} max={64} className="rn-input w-20 font-mono" value={fpp} onChange={(e) => setFpp(Number(e.target.value))} />
        </label>
      </div>
      {typeof r === 'string' ? (
        <p className="mt-2 text-amber-300">{r}</p>
      ) : (
        <ul className="mt-2 space-y-0.5 text-xs">
          <li>
            Payload per packet: <span className="font-mono text-sky-300">{r.payloadBytes} B</span> · {r.packetsPerSecond.toLocaleString('en-IN')}{' '}
            packets/s · packetisation delay <span className="font-mono text-amber-300">{r.packetizationMs} ms</span>
          </li>
          <li>
            Circuit rate {r.payloadKbps} kbit/s → on the wire about{' '}
            <span className="font-mono text-emerald-300">{Math.round(r.wireKbps)} kbit/s</span> ({TDM_PW_OVERHEAD_BYTES} B of Ethernet + labels +
            control word per packet; preamble/IFG not counted).
          </li>
          <li className="text-slate-500">
            Fewer frames per packet = less delay but more packets and more overhead. Lab LB8.1 uses these circuit types.
          </li>
        </ul>
      )}
    </Box>
  );
}
