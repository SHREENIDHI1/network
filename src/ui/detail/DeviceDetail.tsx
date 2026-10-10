import { hostname, ipPlan, siteRole } from '../../topologies/jodhpur/plan';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FAMILY_DOCS } from '../../equipment/families';
import { capabilities, configGuide, familyOf, verifyGuide } from '../../equipment/guide';
import { kindDoc } from '../../equipment/kinds';
import type { Bi, GuideStep } from '../../equipment/types';
import { getTemplate } from '../../model/catalog';
import { createDevice } from '../../model/topologyOps';
import type { Device } from '../../model/types';
import { getProfile } from '../../profiles/profiles';
import { useDetail, type Lang } from '../../store/detailStore';
import { useTopologyStore } from '../../store/topologyStore';
import { boardsOf, sectionsOf, station } from '../../topologies/data/jodhpur';
import { DEVICE_ICONS } from '../icons';
import { Modal } from '../Modal';
import { DeviceSimSection } from '../sim/LivePanels';

const TABS = [
  'Overview',
  'Hardware',
  'Capabilities',
  'How it forwards',
  'Config guide',
  'Verify & troubleshoot',
  'Maintenance & safety',
  'Station info',
  'LIVE',
] as const;
type Tab = (typeof TABS)[number];

/** Equipment detail panel (static tabs + LIVE). Opened from the properties panel, palette ⓘ or double-click. */
export default function DeviceDetail() {
  const target = useDetail((s) => s.target);
  const close = useDetail((s) => s.close);
  const lang = useDetail((s) => s.lang);
  const setLang = useDetail((s) => s.setLang);
  const placed = useTopologyStore((s) => (target?.deviceId ? s.topology.devices.find((d) => d.id === target.deviceId) : undefined));
  const [tab, setTab] = useState<Tab>('Overview');

  // A palette preview uses a fresh device of that kind so ports and guides are real.
  const device: Device | undefined = useMemo(() => placed ?? (target ? createDevice([], target.kind, { x: 0, y: 0 }) : undefined), [placed, target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const i = TABS.indexOf(tab);
      if (e.key === 'ArrowRight') setTab(TABS[(i + 1) % TABS.length]);
      if (e.key === 'ArrowLeft') setTab(TABS[(i + TABS.length - 1) % TABS.length]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab]);

  if (!target || !device) return null;
  const doc = kindDoc(device.kind);
  const t = getTemplate(device.kind);
  const Icon = DEVICE_ICONS[t.icon];

  return (
    <Modal title={placed ? `${placed.name} — ${t.label}` : t.label} onClose={close} wide>
      <div className="mb-3 flex items-start gap-3">
        <Icon className="mt-1 h-8 w-8 shrink-0 text-slate-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-200">{doc ? doc.oneLiner[lang] : t.description}</p>
          {!placed && (
            <p className="mt-0.5 text-xs text-slate-500">Preview from the palette — place the device on the canvas for Station info and LIVE data.</p>
          )}
        </div>
        <div role="group" aria-label="Language" className="flex shrink-0 rounded border border-slate-700 text-xs">
          {(['en', 'hi'] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
              className={`px-2 py-0.5 ${lang === l ? 'bg-sky-700 text-white' : 'text-slate-300'}`}
            >
              {l === 'en' ? 'EN' : 'Hinglish'}
            </button>
          ))}
        </div>
      </div>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1 border-b border-slate-800 pb-2">
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => setTab(x)}
            className={`rounded px-2 py-0.5 text-xs ${tab === x ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="text-sm leading-relaxed text-slate-300">
        <TabBody tab={tab} device={device} placed={!!placed} lang={lang} />
      </div>
      <p className="mt-4 text-[11px] text-slate-500">← / → switch tabs · Esc closes · Educational simulator, not a real router OS.</p>
    </Modal>
  );
}

function TabBody({ tab, device, placed, lang }: { tab: Tab; device: Device; placed: boolean; lang: Lang }) {
  const doc = kindDoc(device.kind);
  const fam = FAMILY_DOCS[familyOf(device)];
  const L = (b: Bi) => b[lang];
  switch (tab) {
    case 'Overview':
      return doc ? (
        <>
          <p>{L(doc.overview)}</p>
          <H>{lang === 'en' ? 'Railway use' : 'Railway mein use'}</H>
          <p>{L(doc.railwayUse)}</p>
        </>
      ) : (
        <p>No documentation for this device.</p>
      );
    case 'Hardware':
      return <Hardware device={device} />;
    case 'Capabilities':
      return (
        <table className="w-full text-xs">
          <tbody>
            {capabilities(device).map((c) => (
              <tr key={c.what} className="border-t border-slate-800">
                <td className="py-1 pr-2">{c.what}</td>
                <td className="py-1 pr-2">
                  <span
                    className={`rounded px-1.5 text-[10px] font-semibold uppercase ${
                      c.status === 'simulated'
                        ? 'bg-emerald-900/70 text-emerald-300'
                        : c.status === 'planned'
                          ? 'bg-sky-900/70 text-sky-300'
                          : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {c.status === 'not-modelled' ? 'not modelled' : c.status}
                  </span>
                </td>
                <td className="py-1 text-slate-500">{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'How it forwards':
      return (
        <ol className="ml-5 list-decimal space-y-1">
          {fam.forwarding.map((f, i) => (
            <li key={i}>{L(f)}</li>
          ))}
        </ol>
      );
    case 'Config guide':
      return <Guide steps={configGuide(device)} lang={lang} />;
    case 'Verify & troubleshoot':
      return (
        <>
          <Guide steps={verifyGuide(device)} lang={lang} />
          {fam.troubleshoot.length > 0 && (
            <>
              <H>{lang === 'en' ? 'Common faults' : 'Aam faults'}</H>
              <ul className="space-y-1.5">
                {fam.troubleshoot.map((t, i) => (
                  <li key={i}>
                    <b className="text-slate-100">{L(t.symptom)}</b> — {L(t.check)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      );
    case 'Maintenance & safety':
      return (
        <>
          {fam.safety.map((s, i) => (
            <p key={i} className="mb-2 rounded border border-red-800 bg-red-950/40 px-3 py-1.5 text-red-100">
              {L(s)}
            </p>
          ))}
          <ul className="ml-5 list-disc space-y-1">
            {fam.maintenance.map((m, i) => (
              <li key={i}>{L(m)}</li>
            ))}
          </ul>
          {!fam.safety.length && !fam.maintenance.length && <p>—</p>}
        </>
      );
    case 'Station info':
      return <StationInfo device={device} placed={placed} lang={lang} />;
    case 'LIVE':
      return placed ? <Live device={device} /> : <p>Place this device on the canvas to see live state.</p>;
  }
}

const H = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</h3>
);

function Hardware({ device }: { device: Device }) {
  const profile = getProfile(device.kind);
  const groups = new Map<string, number>();
  for (const p of device.ports) {
    const key = `${p.kind.toUpperCase()}${p.speedsGbps ? ` ${p.speedsGbps.join('/')}G` : ''}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return (
    <>
      <H>Ports in the simulator</H>
      <p className="font-mono text-xs">
        {[...groups].map(([k, n]) => `${n} × ${k}`).join(' · ')}
        {device.ports.length > 0 && ` (${device.ports[0].name} … ${device.ports[device.ports.length - 1].name})`}
      </p>
      {profile?.ports.some((g) => g.kind === 'e1') && !device.ports.some((p) => p.kind === 'e1') && (
        <p className="mt-1 text-xs text-slate-500">E1 (TDM) ports are hidden in networking-only mode; they are listed in the specs below.</p>
      )}
      {profile ? (
        <>
          <H>Profile specs</H>
          {!profile.specsVerified && (
            <p className="mb-1 text-yellow-300">Unverified: values are generic placeholders, not checked against a datasheet.</p>
          )}
          {profile.genericPortLayout && <p className="mb-1 text-yellow-300">Port layout is generic, not the vendor’s real layout.</p>}
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="pb-1">Parameter</th>
                <th className="pb-1">Value</th>
                <th className="pb-1">Source</th>
              </tr>
            </thead>
            <tbody>
              {profile.specs.map((s) => (
                <tr key={s.param} className="border-t border-slate-800">
                  <td className="py-0.5 pr-2">{s.param}</td>
                  <td className="py-0.5 pr-2 text-slate-100">{s.value}</td>
                  <td className="py-0.5 text-slate-500">{s.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-amber-300">{profile.cliBanner}</p>
        </>
      ) : (
        <p className="mt-2 text-xs text-slate-500">Generic device: power, CPU, memory and environmental specs are not modelled.</p>
      )}
    </>
  );
}

function Guide({ steps, lang }: { steps: GuideStep[]; lang: Lang }) {
  return (
    <ol className="ml-5 list-decimal space-y-2">
      {steps.map((s, i) => (
        <li key={i}>
          <span>{s.say[lang]}</span>
          {s.where !== 'ui' && (
            <span className="ml-1 text-[10px] uppercase text-slate-500">({s.where === 'ios' ? 'IOS-like CLI' : 'host prompt'})</span>
          )}
          {s.cli && <pre className="mt-1 overflow-x-auto rounded bg-slate-950 px-2 py-1 font-mono text-xs text-emerald-200">{s.cli.join('\n')}</pre>}
        </li>
      ))}
    </ol>
  );
}

function StationInfo({ device, placed, lang }: { device: Device; placed: boolean; lang: Lang }) {
  if (!placed) return <p>Place the device and set its station code (e.g. JU, MTD) in the properties panel.</p>;
  if (!device.station)
    return (
      <p>
        {lang === 'en'
          ? 'No station code set. Add one (e.g. MTD) in the properties panel.'
          : 'Station code set nahi. Properties panel mein daalo (jaise MTD).'}
      </p>
    );
  const st = station(device.station);
  if (!st) return <p>Station code “{device.station}” is not in the Jodhpur division data.</p>;
  return (
    <>
      <p>
        <b className="text-slate-100">
          {st.name} ({st.code})
        </b>
        {st.isJunction && ' · Junction'}
        {st.isDivisionBoundary && ' · Division boundary'}
        {st.isHalt && ' · Halt'}
        {st.confidence === 'check' && <span className="ml-2 rounded bg-yellow-900 px-1 text-[10px] uppercase text-yellow-200">check</span>}
      </p>
      {st.note && <p className="text-xs text-slate-500">{st.note}</p>}
      <H>Sections</H>
      <ul className="ml-5 list-disc">
        {sectionsOf(st.code).map((s) => {
          const stop = s.stops.find((p) => p.code === st.code)!;
          return (
            <li key={s.id}>
              {s.id} {s.name} — km {stop.km ?? 'unknown'}
              {stop.confidence === 'check' && ' (check)'}
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs">Control boards: {boardsOf(st.code).join(', ') || 'unknown (check)'}</p>
      <p className="mt-3 text-xs text-slate-500">
        Track map data, not the real OFC/telecom route. Design role in the Jodhpur topologies: {siteRole(st.code)} ({hostname(st.code)}), Loopback0{' '}
        {ipPlan().loopbacks.get(st.code) ?? '—'}/32.
      </p>
    </>
  );
}

function Live({ device }: { device: Device }) {
  return (
    <div className="rounded border border-slate-800">
      <DeviceSimSection device={device} />
    </div>
  );
}
