import { useEffect, useMemo, useState } from 'react';
import { compatibleOptions, getLinkKindInfo } from '../model/linkRules';
import { isLegacyLinkKind } from '../model/networkingMode';
import { ENABLE_LEGACY_TDM } from '../config/features';
import type { LinkKind, Port } from '../model/types';
import { useTopologyStore } from '../store/topologyStore';
import { Modal } from './Modal';

function portLabel(p: Port): string {
  const extra = p.vfRole ? ` (${p.vfRole})` : p.stmLevel ? ` (STM-${p.stmLevel})` : p.lambdaNm ? ` (${p.lambdaNm} nm)` : p.speedsGbps ? ` (${p.speedsGbps.join('/')}G)` : '';
  return `${p.name}${extra}`;
}

/**
 * Opens after the user drags a connection between two devices. Offers only
 * link types and port pairs that are physically valid and still free.
 */
export function LinkDialog() {
  const pending = useTopologyStore((s) => s.pendingConnection);
  const devices = useTopologyStore((s) => s.topology.devices);
  const links = useTopologyStore((s) => s.topology.links);
  const cancel = useTopologyStore((s) => s.cancelConnection);
  const addLink = useTopologyStore((s) => s.addLink);

  const da = devices.find((d) => d.id === pending?.aDeviceId);
  const db = devices.find((d) => d.id === pending?.bDeviceId);

  const options = useMemo(
    () => (da && db ? compatibleOptions(da, db, links).filter((o) => ENABLE_LEGACY_TDM || !isLegacyLinkKind(o.kind)) : []),
    [da, db, links],
  );

  const [kind, setKind] = useState<LinkKind | ''>('');
  const [portA, setPortA] = useState('');
  const [portB, setPortB] = useState('');
  const [lengthKm, setLengthKm] = useState('');
  const [cores, setCores] = useState<1 | 2>(2);

  const current = options.find((o) => o.kind === kind);
  const aChoices = useMemo(() => {
    if (!current) return [];
    const seen = new Map<string, Port>();
    for (const [pa] of current.pairs) seen.set(pa.id, pa);
    return [...seen.values()];
  }, [current]);
  const bChoices = useMemo(() => (current ? current.pairs.filter(([pa]) => pa.id === portA).map(([, pb]) => pb) : []), [current, portA]);

  /** Selects a link type and resets ports/length to its first valid pair. */
  const chooseKind = (k: LinkKind | '') => {
    setKind(k);
    const opt = options.find((o) => o.kind === k);
    setPortA(opt ? opt.pairs[0][0].id : '');
    setPortB(opt ? opt.pairs[0][1].id : '');
    setLengthKm(opt ? String(getLinkKindInfo(opt.kind).defaultLengthKm) : '');
  };

  const choosePortA = (id: string) => {
    setPortA(id);
    const firstB = current?.pairs.find(([pa]) => pa.id === id)?.[1];
    if (firstB && !current?.pairs.some(([pa, pb]) => pa.id === id && pb.id === portB)) setPortB(firstB.id);
  };

  // Reset every choice when the dialog opens for a new pair of devices.
  useEffect(() => {
    if (!pending) return;
    chooseKind(options[0]?.kind ?? '');
    setCores(2);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pending || !da || !db) return null;

  const create = () => {
    if (!kind) return;
    const len = Number(lengthKm);
    addLink({
      kind,
      a: { deviceId: da.id, portId: portA },
      b: { deviceId: db.id, portId: portB },
      lengthKm: Number.isFinite(len) ? len : undefined,
      cores: kind === 'ofc' ? cores : undefined,
    });
  };

  return (
    <Modal
      title={`Connect ${da.name} ↔ ${db.name}`}
      onClose={cancel}
      footer={
        <>
          <button type="button" className="rn-btn" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="rn-btn-primary" disabled={!kind || !portA || !portB} onClick={create}>
            Create link
          </button>
        </>
      }
    >
      {options.length === 0 ? (
        <div className="space-y-2 text-sm text-slate-300">
          <p>
            No physically valid connection exists between free ports of <b>{da.name}</b> and <b>{db.name}</b>.
          </p>
          <p className="text-slate-400">
            Examples: a PC has only an RJ45 port, so it cannot take an SFP patch; a 10G SFP patch needs 10G-capable SFP
            ports on both ends; Cat6 is limited to 100 m. All matching ports may also already be in use.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="rn-label" htmlFor="ld-kind">
              Link type
            </label>
            <select id="ld-kind" className="rn-input" value={kind} onChange={(e) => chooseKind(e.target.value as LinkKind)}>
              {options.map((o) => (
                <option key={o.kind} value={o.kind}>
                  {getLinkKindInfo(o.kind).label}
                </option>
              ))}
            </select>
            {kind && <p className="mt-1 text-xs text-slate-400">{getLinkKindInfo(kind).description}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="rn-label" htmlFor="ld-a">
                {da.name} port
              </label>
              <select id="ld-a" className="rn-input" value={portA} onChange={(e) => choosePortA(e.target.value)}>
                {aChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {portLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="rn-label" htmlFor="ld-b">
                {db.name} port
              </label>
              <select id="ld-b" className="rn-input" value={portB} onChange={(e) => setPortB(e.target.value)}>
                {bChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {portLabel(p)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="rn-label" htmlFor="ld-len">
                Length (km)
              </label>
              <input
                id="ld-len"
                className="rn-input"
                type="number"
                min={0}
                step="any"
                value={lengthKm}
                onChange={(e) => setLengthKm(e.target.value)}
              />
            </div>
            {kind === 'ofc' && (
              <div>
                <label className="rn-label" htmlFor="ld-cores">
                  Fibre cores
                </label>
                <select id="ld-cores" className="rn-input" value={cores} onChange={(e) => setCores(Number(e.target.value) as 1 | 2)}>
                  <option value={2}>2-core (Tx/Rx pair)</option>
                  <option value={1}>Single core (BiDi optics)</option>
                </select>
              </div>
            )}
          </div>
          {kind === 'ofc' && (
            <p className="text-xs text-slate-400">
              Optics default to the port type (e.g. L-1.1 for STM-1). Edit the optical budget in the properties panel after
              creating the link.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
