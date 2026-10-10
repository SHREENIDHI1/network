import { useMemo, useState } from 'react';
import { computeBudget, SYSTEM_MARGIN_DB } from '../../engine/physical/opticalBudget';
import { defaultSpliceCount, fibreLossDbPerKm, OPTIC_PROFILES } from '../../model/linkRules';
import type { OpticalParams } from '../../model/types';
import type { WidgetId } from '../../lessons/types';
import {
  encapStages,
  formatDuration,
  parseOctet,
  propagationMs,
  subtractSteps,
  toBin8,
  toHex2,
  transferSeconds,
  type RateUnit,
  type SizeUnit,
} from '../../lessons/widgetMath';
import { spans } from '../../topologies/data/jodhpur';
import { MacLearning, RootElection, SubnetCalc, VlanTag, VlsmPlanner } from './widgets2';
import { AclEvalWidget, HsrpWidget, LpmWidget, QueueSimWidget, SpfWidget } from './widgets3';
import { LabelHeaderWidget, LspWalkWidget } from './widgets4';

export function Widget({ id }: { id: WidgetId }) {
  switch (id) {
    case 'bandwidth-calc':
      return <BandwidthCalc />;
    case 'encapsulation':
      return <EncapStepper />;
    case 'optical-budget':
      return <OpticalBudgetWidget />;
    case 'binary-converter':
      return <BinaryConverter />;
    case 'mac-learning':
      return <MacLearning />;
    case 'subnet-calc':
      return <SubnetCalc />;
    case 'vlsm-planner':
      return <VlsmPlanner />;
    case 'vlan-tag':
      return <VlanTag />;
    case 'root-election':
      return <RootElection />;
    case 'lpm':
      return <LpmWidget />;
    case 'spf':
      return <SpfWidget />;
    case 'acl-eval':
      return <AclEvalWidget />;
    case 'hsrp':
      return <HsrpWidget />;
    case 'queue-sim':
      return <QueueSimWidget />;
    case 'label-header':
      return <LabelHeaderWidget />;
    case 'lsp-walk':
      return <LspWalkWidget />;
  }
}

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-sky-900 bg-slate-900/80 p-3 text-sm">{children}</div>
);

function BandwidthCalc() {
  const [size, setSize] = useState(100);
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>('MB');
  const [rate, setRate] = useState(1);
  const [rateUnit, setRateUnit] = useState<RateUnit>('Gbps');
  const [km, setKm] = useState(104.11);
  const t = transferSeconds(size, sizeUnit, rate, rateUnit);
  return (
    <Box>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="flex items-center gap-1">
          <span className="w-16 text-slate-400">File</span>
          <input type="number" min={0} className="rn-input" value={size} onChange={(e) => setSize(Math.max(0, +e.target.value))} />
          <select className="rn-input w-20" value={sizeUnit} onChange={(e) => setSizeUnit(e.target.value as SizeUnit)}>
            {['KB', 'MB', 'GB'].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="w-16 text-slate-400">Link</span>
          <input type="number" min={0} className="rn-input" value={rate} onChange={(e) => setRate(Math.max(0, +e.target.value))} />
          <select className="rn-input w-24" value={rateUnit} onChange={(e) => setRateUnit(e.target.value as RateUnit)}>
            {['kbps', 'Mbps', 'Gbps'].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="w-16 text-slate-400">Fibre km</span>
          <input type="number" min={0} className="rn-input" value={km} onChange={(e) => setKm(Math.max(0, +e.target.value))} />
        </label>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-1 text-slate-300">
        <dt className="text-slate-400">Transfer time (bandwidth)</dt>
        <dd className="font-mono">{formatDuration(t)}</dd>
        <dt className="text-slate-400">Propagation delay (latency, one-way)</dt>
        <dd className="font-mono">{formatDuration(propagationMs(km) / 1000)}</dd>
      </dl>
      <p className="mt-2 text-xs text-slate-500">
        Ideal maths: protocol overhead, queueing aur retransmission ignore kiye gaye hain. Light in fibre ≈ 4.9 µs/km.
      </p>
    </Box>
  );
}

function EncapStepper() {
  const [mpls, setMpls] = useState(false);
  const [step, setStep] = useState(0);
  const stages = encapStages(mpls);
  const shown = stages.slice(0, step + 1);
  const total = shown.reduce((a, s) => a + s.bytes, 0);
  const colours = ['bg-emerald-800', 'bg-sky-800', 'bg-indigo-800', 'bg-amber-700', 'bg-rose-800', 'bg-slate-600'];
  return (
    <Box>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" className="rn-btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          ◀ Back
        </button>
        <button type="button" className="rn-btn-primary" disabled={step >= stages.length - 1} onClick={() => setStep((s) => s + 1)}>
          Step ▶
        </button>
        <label className="ml-2 flex items-center gap-1 text-slate-300">
          <input
            type="checkbox"
            checked={mpls}
            onChange={(e) => {
              setMpls(e.target.checked);
              setStep(0);
            }}
          />
          MPLS core (add label)
        </label>
        <span className="ml-auto text-xs text-slate-400">Headers so far: {total} B</span>
      </div>
      <div className="flex flex-wrap items-stretch font-mono text-xs">
        {[...shown].reverse().map((s, i) => (
          <div key={s.layer} className={`${colours[(shown.length - 1 - i) % colours.length]} border-r border-slate-950 px-2 py-2 text-white`}>
            {s.header}
            {s.bytes ? ` (${s.bytes} B)` : ''}
          </div>
        ))}
        <div className="bg-emerald-950 px-2 py-2 text-emerald-200">payload</div>
      </div>
      <p className="mt-2 text-slate-300">
        <b>{stages[step].layer}</b> → PDU: {stages[step].pdu}. {stages[step].detail}
      </p>
    </Box>
  );
}

function OpticalBudgetWidget() {
  const known = useMemo(() => spans().filter((s) => s.km !== null && s.km > 0), []);
  const presets = useMemo(
    () => [
      { label: 'JU–MTD (S1 end-to-end)', km: 104.11 },
      ...known.map((s) => ({
        label: `${s.section}: ${s.a}–${s.b}`,
        km: s.km!,
      })),
    ],
    [known],
  );
  const [km, setKm] = useState(104.11);
  const [profile, setProfile] = useState('1000BASE-ZX');
  const [connectors, setConnectors] = useState(2);
  const p = OPTIC_PROFILES.find((o) => o.id === profile)!;
  const params: OpticalParams = {
    profile: p.id,
    wavelengthNm: p.wavelengthNm,
    lossDbPerKm: fibreLossDbPerKm(p.wavelengthNm),
    connectors,
    connectorLossDb: 0.5,
    splices: defaultSpliceCount(km),
    spliceLossDb: 0.1,
    extraLossDb: 0,
    txPowerDbm: p.txPowerDbm,
    rxSensitivityDbm: p.rxSensitivityDbm,
    rxOverloadDbm: p.rxOverloadDbm,
  };
  const r = computeBudget(km, params);
  const tone = {
    ok: 'text-emerald-300',
    marginal: 'text-yellow-300',
    los: 'text-red-400',
    overload: 'text-orange-300',
  }[r.status];
  const label = {
    ok: 'OK',
    marginal: `MARGINAL (< ${SYSTEM_MARGIN_DB} dB spare)`,
    los: 'LOS — receiver gets too little light',
    overload: 'OVERLOAD — add attenuator',
  }[r.status];
  return (
    <Box>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-400">Jodhpur span (track chainage)</span>
          <select className="rn-input" onChange={(e) => setKm(+e.target.value)} defaultValue={104.11}>
            {presets.map((s) => (
              <option key={s.label} value={s.km}>
                {s.label} — {s.km} km
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-400">Length (km)</span>
          <input type="number" min={0} step={0.1} className="rn-input" value={km} onChange={(e) => setKm(Math.max(0, +e.target.value))} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-400">Optic</span>
          <select className="rn-input" value={profile} onChange={(e) => setProfile(e.target.value)}>
            {OPTIC_PROFILES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-slate-400">Connectors (0.5 dB each)</span>
          <input
            type="number"
            min={0}
            max={20}
            className="rn-input"
            value={connectors}
            onChange={(e) => setConnectors(Math.max(0, Math.min(20, +e.target.value)))}
          />
        </label>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-xs text-slate-300">
        <dt className="text-slate-400">
          Fibre {params.lossDbPerKm} dB/km × {km} km
        </dt>
        <dd>{r.breakdown.fibreLossDb} dB</dd>
        <dt className="text-slate-400">Splices {params.splices} × 0.1 dB</dt>
        <dd>{r.breakdown.spliceLossDb} dB</dd>
        <dt className="text-slate-400">Connectors</dt>
        <dd>{r.breakdown.connectorLossDb} dB</dd>
        <dt className="text-slate-400">Total loss</dt>
        <dd>{r.breakdown.totalLossDb} dB</dd>
        <dt className="text-slate-400">Tx {p.txPowerDbm} dBm → Rx</dt>
        <dd>
          {r.rxPowerDbm} dBm (sensitivity {p.rxSensitivityDbm})
        </dd>
        <dt className="text-slate-400">Margin</dt>
        <dd>{r.marginDb} dB</dd>
        <dt className="text-slate-400">Max reach (with {SYSTEM_MARGIN_DB} dB kept)</dt>
        <dd>{r.maxReachKm} km</dd>
      </dl>
      <p className={`mt-2 font-semibold ${tone}`}>{label}</p>
      <p className="mt-1 text-xs text-slate-500">
        Optic source: {p.source}. Km from the track map chainage — assumes OFC runs along the track; not the real RailTel/NWR route.
      </p>
    </Box>
  );
}

function BinaryConverter() {
  const [n, setN] = useState(192);
  const [drafts, setDrafts] = useState<{
    dec?: string;
    bin?: string;
    hex?: string;
  }>({});
  const field = (key: 'dec' | 'bin' | 'hex', base: 2 | 10 | 16, value: string) => (
    <label className="flex flex-col gap-0.5">
      <span className="text-slate-400">{key === 'dec' ? 'Decimal' : key === 'bin' ? 'Binary' : 'Hex'}</span>
      <input
        className={`rn-input font-mono ${drafts[key] !== undefined && parseOctet(drafts[key]!, base) === null ? 'border-red-600' : ''}`}
        value={drafts[key] ?? value}
        onChange={(e) => {
          const v = parseOctet(e.target.value, base);
          if (v !== null) {
            setN(v);
            setDrafts({ [key]: e.target.value });
          } else setDrafts({ [key]: e.target.value });
        }}
        onBlur={() => setDrafts({})}
      />
    </label>
  );
  return (
    <Box>
      <div className="grid grid-cols-3 gap-2">
        {field('dec', 10, String(n))}
        {field('bin', 2, toBin8(n))}
        {field('hex', 16, toHex2(n))}
      </div>
      <div className="mt-3 flex gap-1">
        {subtractSteps(n).map((s, i) => (
          <button
            key={s.place}
            type="button"
            title={`Toggle bit ${7 - i} (${s.place})`}
            className={`flex w-12 flex-col items-center rounded border py-1 font-mono ${s.bit ? 'border-sky-500 bg-sky-900 text-white' : 'border-slate-700 bg-slate-800 text-slate-500'}`}
            onClick={() => {
              setDrafts({});
              setN(n ^ s.place);
            }}
          >
            <span className="text-[10px]">{s.place}</span>
            <span className="text-lg">{s.bit}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 font-mono text-xs text-slate-400">
        {n} ={' '}
        {subtractSteps(n)
          .filter((s) => s.bit)
          .map((s) => s.place)
          .join(' + ') || '0'}
      </p>
    </Box>
  );
}
