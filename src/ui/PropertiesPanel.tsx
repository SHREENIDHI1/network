import { Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { computeBudget, SYSTEM_MARGIN_DB, type OpticalStatus } from '../engine/physical/opticalBudget';
import { getTemplate } from '../model/catalog';
import { applyOpticProfile, defaultSpliceCount, getLinkKindInfo, OPTIC_PROFILES } from '../model/linkRules';
import { ENABLE_LEGACY_TDM } from '../config/features';
import { visibleTopology } from '../model/networkingMode';
import { linkOnPort } from '../model/topologyOps';
import type { Device, Link, OpticalParams, Topology } from '../model/types';
import { useTopologyStore } from '../store/topologyStore';
import { DEVICE_ICONS } from './icons';
import { DeviceSimSection, LinkSimSection } from './sim/LivePanels';

// ---------------------------------------------------------------------------
// Small field helpers: commit on blur / Enter so half-typed values never
// reach the store (which validates every change).
// ---------------------------------------------------------------------------

function TextField(props: { label: string; value: string; onCommit: (v: string) => void; placeholder?: string; maxLength?: number }) {
  const [v, setV] = useState(props.value);
  useEffect(() => setV(props.value), [props.value]);
  return (
    <label className="block">
      <span className="rn-label">{props.label}</span>
      <input
        className="rn-input"
        value={v}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== props.value && props.onCommit(v)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

function NumberField(props: { label: string; value: number; onCommit: (v: number) => void; step?: number; min?: number; unit?: string }) {
  const [v, setV] = useState(String(props.value));
  useEffect(() => setV(String(props.value)), [props.value]);
  const commit = () => {
    const n = Number(v);
    if (v.trim() === '' || !Number.isFinite(n) || (props.min !== undefined && n < props.min)) {
      setV(String(props.value));
      return;
    }
    if (n !== props.value) props.onCommit(n);
  };
  return (
    <label className="block">
      <span className="rn-label">
        {props.label}
        {props.unit && <span className="normal-case text-slate-500"> ({props.unit})</span>}
      </span>
      <input
        className="rn-input"
        type="number"
        step={props.step ?? 'any'}
        min={props.min}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-slate-800 px-3 py-3">
      <h3 className="rn-label mb-2">{title}</h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------

export function PropertiesPanel() {
  const topology = useTopologyStore((s) => s.topology);
  const selection = useTopologyStore((s) => s.selection);

  let body: ReactNode;
  if (selection?.type === 'device') {
    const d = topology.devices.find((x) => x.id === selection.id);
    body = d ? <DeviceProps device={d} topology={topology} /> : null;
  } else if (selection?.type === 'link') {
    const l = topology.links.find((x) => x.id === selection.id);
    body = l ? <LinkProps link={l} topology={topology} /> : null;
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-950">
      {body ?? <TopologyProps topology={topology} />}
    </aside>
  );
}

// ---------------------------------------------------------------------------

function TopologyProps({ topology }: { topology: Topology }) {
  const rename = useTopologyStore((s) => s.renameTopology);
  const shown = visibleTopology(topology);
  const counts = { legacy: 0, lan: 0, mpls: 0 };
  for (const d of shown.devices) counts[getTemplate(d.kind).category] += 1;
  const opticalIssues = shown.links.filter(
    (l) => l.kind === 'ofc' && l.optical && computeBudget(l.lengthKm, l.optical).status !== 'ok',
  ).length;

  return (
    <>
      <Section title="Topology">
        <div className="space-y-2">
          <TextField label="Name" value={topology.meta.name} maxLength={200} onCommit={(v) => v.trim() && rename(v.trim())} />
          <label className="block">
            <span className="rn-label">Description</span>
            <DescriptionField value={topology.meta.description ?? ''} onCommit={(v) => rename(topology.meta.name, v)} />
          </label>
        </div>
      </Section>
      <Section title="Summary">
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-slate-400">Devices</dt>
          <dd>{shown.devices.length}</dd>
          {ENABLE_LEGACY_TDM && (
            <>
              <dt className="text-amber-400">Legacy</dt>
              <dd>{counts.legacy}</dd>
            </>
          )}
          <dt className="text-sky-400">LAN / IP</dt>
          <dd>{counts.lan}</dd>
          <dt className="text-fuchsia-400">IP-MPLS</dt>
          <dd>{counts.mpls}</dd>
          <dt className="text-slate-400">Links</dt>
          <dd>{shown.links.length}</dd>
          {(shown.hiddenDevices > 0 || shown.hiddenLinks > 0) && (
            <>
              <dt className="text-slate-500">Hidden legacy TDM</dt>
              <dd className="text-slate-500">
                {shown.hiddenDevices} dev / {shown.hiddenLinks} links
              </dd>
            </>
          )}
          <dt className="text-slate-400">Optical issues</dt>
          <dd className={opticalIssues ? 'text-red-400' : ''}>{opticalIssues}</dd>
        </dl>
      </Section>
      <Section title="How to use">
        <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-400">
          <li>Drag devices from the palette (or click them).</li>
          <li>Hover a device and drag from a blue handle to another device to create a link. Only physically valid port pairs are offered.</li>
          <li>Click a device or link to edit it here. Select + Delete key removes it.</li>
          <li>Save / Open uses a JSON file on your computer. Work is also autosaved in this browser.</li>
        </ul>
      </Section>
    </>
  );
}

function DescriptionField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <textarea
      className="rn-input min-h-[80px] resize-y"
      value={v}
      maxLength={4000}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
    />
  );
}

// ---------------------------------------------------------------------------

function DeviceProps({ device, topology }: { device: Device; topology: Topology }) {
  const update = useTopologyStore((s) => s.updateDevice);
  const remove = useTopologyStore((s) => s.removeDevice);
  const select = useTopologyStore((s) => s.select);
  const t = getTemplate(device.kind);
  const Icon = DEVICE_ICONS[t.icon];

  return (
    <>
      <Section title="Device">
        <div className="mb-3 flex items-start gap-2">
          <Icon className="mt-0.5 h-6 w-6 shrink-0 text-slate-300" />
          <div>
            <div className="text-sm font-semibold">{t.label}</div>
            <p className="text-xs leading-snug text-slate-400">{t.description}</p>
          </div>
        </div>
        <div className="space-y-2">
          <TextField label="Name / hostname" value={device.name} maxLength={64} onCommit={(v) => v.trim() && update(device.id, { name: v.trim() })} />
          <TextField
            label="Station code"
            value={device.station ?? ''}
            placeholder="e.g. JU, MTD"
            maxLength={16}
            onCommit={(v) => update(device.id, { station: v.trim().toUpperCase() || undefined })}
          />
          <label className="block">
            <span className="rn-label">Notes</span>
            <DescriptionField value={device.notes ?? ''} onCommit={(v) => update(device.id, { notes: v || undefined })} />
          </label>
        </div>
      </Section>
      <DeviceSimSection device={device} />
      <Section title={`Ports (${device.ports.length})`}>
        <table className="w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="pb-1 font-medium">Port</th>
              <th className="pb-1 font-medium">Type</th>
              <th className="pb-1 font-medium">Connected to</th>
            </tr>
          </thead>
          <tbody>
            {device.ports.map((p) => {
              const l = linkOnPort(topology, device.id, p.id);
              const farEnd = l ? (l.a.deviceId === device.id ? l.b : l.a) : undefined;
              const farDev = farEnd ? topology.devices.find((d) => d.id === farEnd.deviceId) : undefined;
              const type = p.vfRole ?? (p.stmLevel ? `STM-${p.stmLevel}` : p.lambdaNm ? `${p.lambdaNm}nm` : p.kind.toUpperCase());
              return (
                <tr key={p.id} className="border-t border-slate-800/70">
                  <td className="py-0.5 font-mono text-slate-200">{p.name}</td>
                  <td className="py-0.5 text-slate-400">{type}</td>
                  <td className="py-0.5">
                    {l && farDev ? (
                      <button type="button" className="text-left text-sky-400 hover:underline" onClick={() => select({ type: 'link', id: l.id })}>
                        {farDev.name} {farEnd!.portId}
                      </button>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <div className="p-3">
        <button type="button" className="rn-btn-danger" onClick={() => remove(device.id)}>
          <Trash2 className="h-4 w-4" /> Delete device
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

const lossText = (db: number) => (db === 0 ? '0.00 dB' : `−${db.toFixed(2)} dB`);

const STATUS_STYLE: Record<OpticalStatus, { cls: string; text: string }> = {
  ok: { cls: 'bg-emerald-900/60 text-emerald-300 border-emerald-700', text: 'OK' },
  marginal: { cls: 'bg-yellow-900/50 text-yellow-300 border-yellow-700', text: `MARGINAL (< ${SYSTEM_MARGIN_DB} dB margin)` },
  los: { cls: 'bg-red-900/60 text-red-300 border-red-700', text: 'LOS — Rx below sensitivity' },
  overload: { cls: 'bg-orange-900/60 text-orange-300 border-orange-700', text: 'OVERLOAD — add attenuator' },
};

function LinkProps({ link, topology }: { link: Link; topology: Topology }) {
  const update = useTopologyStore((s) => s.updateLink);
  const remove = useTopologyStore((s) => s.removeLink);
  const select = useTopologyStore((s) => s.select);
  const info = getLinkKindInfo(link.kind);
  const da = topology.devices.find((d) => d.id === link.a.deviceId);
  const db = topology.devices.find((d) => d.id === link.b.deviceId);

  /** Changing length keeps the splice count in step unless the user customised it. */
  const setLength = (lengthKm: number) => {
    const o = link.optical;
    if (o && o.splices === defaultSpliceCount(link.lengthKm)) {
      update(link.id, { lengthKm, optical: { ...o, splices: defaultSpliceCount(lengthKm) } });
    } else {
      update(link.id, { lengthKm });
    }
  };

  const setOptical = (patch: Partial<OpticalParams>) => {
    if (!link.optical) return;
    const touchesOptic = ['txPowerDbm', 'rxSensitivityDbm', 'rxOverloadDbm', 'wavelengthNm'].some((k) => k in patch);
    update(link.id, { optical: { ...link.optical, ...patch, profile: touchesOptic ? 'custom' : link.optical.profile } });
  };

  return (
    <>
      <Section title="Link">
        <div className="mb-2 text-sm font-semibold">{info.label}</div>
        <p className="mb-3 text-xs leading-snug text-slate-400">{info.description}</p>
        <div className="mb-3 space-y-1 text-sm">
          {[
            { d: da, end: link.a },
            { d: db, end: link.b },
          ].map(({ d, end }, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-4 text-xs text-slate-500">{i === 0 ? 'A' : 'B'}</span>
              <button type="button" className="text-sky-400 hover:underline" onClick={() => d && select({ type: 'device', id: d.id })}>
                {d?.name ?? '?'}
              </button>
              <span className="font-mono text-xs text-slate-300">{end.portId}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <TextField label="Label / circuit" value={link.label ?? ''} maxLength={200} placeholder="e.g. JU–MTD OFC" onCommit={(v) => update(link.id, { label: v.trim() || undefined })} />
          <NumberField label="Length" unit="km" min={0} value={link.lengthKm} onCommit={(v) => setLength(v)} />
          {link.kind === 'ofc' && (
            <label className="block">
              <span className="rn-label">Fibre cores</span>
              <select className="rn-input" value={link.cores ?? 2} onChange={(e) => update(link.id, { cores: Number(e.target.value) as 1 | 2 })}>
                <option value={2}>2-core (Tx/Rx pair)</option>
                <option value={1}>Single core (BiDi optics)</option>
              </select>
            </label>
          )}
        </div>
      </Section>

      <LinkSimSection link={link} />

      {link.optical && <OpticalSection link={link} optical={link.optical} setOptical={setOptical} update={update} />}

      <div className="p-3">
        <button type="button" className="rn-btn-danger" onClick={() => remove(link.id)}>
          <Trash2 className="h-4 w-4" /> Delete link
        </button>
      </div>
    </>
  );
}

function OpticalSection({
  link,
  optical,
  setOptical,
  update,
}: {
  link: Link;
  optical: OpticalParams;
  setOptical: (p: Partial<OpticalParams>) => void;
  update: (id: string, patch: { optical: OpticalParams }) => boolean;
}) {
  const b = computeBudget(link.lengthKm, optical);
  const st = STATUS_STYLE[b.status];
  const profile = OPTIC_PROFILES.find((p) => p.id === optical.profile);

  return (
    <>
      <Section title="Optical budget">
        <div className={`mb-3 rounded border px-2 py-1.5 text-sm font-semibold ${st.cls}`}>{st.text}</div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-xs">
          <dt className="text-slate-400">Tx power</dt>
          <dd className="text-right font-mono">{optical.txPowerDbm.toFixed(2)} dBm</dd>
          <dt className="text-slate-400">Fibre ({link.lengthKm} km × {optical.lossDbPerKm} dB/km)</dt>
          <dd className="text-right font-mono">{lossText(b.breakdown.fibreLossDb)}</dd>
          <dt className="text-slate-400">Connectors ({optical.connectors} × {optical.connectorLossDb})</dt>
          <dd className="text-right font-mono">{lossText(b.breakdown.connectorLossDb)}</dd>
          <dt className="text-slate-400">Splices ({optical.splices} × {optical.spliceLossDb})</dt>
          <dd className="text-right font-mono">{lossText(b.breakdown.spliceLossDb)}</dd>
          <dt className="text-slate-400">Extra (CWDM filters etc.)</dt>
          <dd className="text-right font-mono">{lossText(b.breakdown.extraLossDb)}</dd>
          <dt className="border-t border-slate-800 pt-0.5 font-semibold text-slate-200">Rx power</dt>
          <dd className="border-t border-slate-800 pt-0.5 text-right font-mono font-semibold">{b.rxPowerDbm.toFixed(2)} dBm</dd>
          <dt className="text-slate-400">Rx sensitivity</dt>
          <dd className="text-right font-mono">{optical.rxSensitivityDbm.toFixed(2)} dBm</dd>
          <dt className="text-slate-400">Margin</dt>
          <dd className={`text-right font-mono ${b.marginDb < 0 ? 'text-red-400' : b.marginDb < SYSTEM_MARGIN_DB ? 'text-yellow-300' : 'text-emerald-300'}`}>
            {b.marginDb.toFixed(2)} dB
          </dd>
          <dt className="text-slate-400">Max reach (keeping {SYSTEM_MARGIN_DB} dB spare)</dt>
          <dd className="text-right font-mono">{b.maxReachKm.toFixed(1)} km</dd>
        </dl>
      </Section>
      <Section title="Optics & fibre plant">
        <div className="space-y-2">
          <label className="block">
            <span className="rn-label">Optic profile</span>
            <select
              className="rn-input"
              value={profile ? optical.profile : 'custom'}
              onChange={(e) => update(link.id, { optical: applyOpticProfile(optical, e.target.value) })}
            >
              {OPTIC_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom values</option>
            </select>
            {profile && <span className="mt-0.5 block text-[11px] text-slate-500">Source: {profile.source}</span>}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Tx power" unit="dBm" value={optical.txPowerDbm} onCommit={(v) => setOptical({ txPowerDbm: v })} />
            <NumberField label="Rx sensitivity" unit="dBm" value={optical.rxSensitivityDbm} onCommit={(v) => setOptical({ rxSensitivityDbm: v })} />
            <NumberField label="Rx overload" unit="dBm" value={optical.rxOverloadDbm} onCommit={(v) => setOptical({ rxOverloadDbm: v })} />
            <NumberField label="Wavelength" unit="nm" min={0} value={optical.wavelengthNm} onCommit={(v) => setOptical({ wavelengthNm: v })} />
            <NumberField label="Fibre loss" unit="dB/km" min={0} value={optical.lossDbPerKm} onCommit={(v) => setOptical({ lossDbPerKm: v })} />
            <NumberField label="Extra loss" unit="dB" min={0} value={optical.extraLossDb} onCommit={(v) => setOptical({ extraLossDb: v })} />
            <NumberField label="Connectors" min={0} step={1} value={optical.connectors} onCommit={(v) => setOptical({ connectors: Math.round(v) })} />
            <NumberField label="Loss / conn." unit="dB" min={0} value={optical.connectorLossDb} onCommit={(v) => setOptical({ connectorLossDb: v })} />
            <NumberField label="Splices" min={0} step={1} value={optical.splices} onCommit={(v) => setOptical({ splices: Math.round(v) })} />
            <NumberField label="Loss / splice" unit="dB" min={0} value={optical.spliceLossDb} onCommit={(v) => setOptical({ spliceLossDb: v })} />
          </div>
        </div>
      </Section>
    </>
  );
}
