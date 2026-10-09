import { LIMITATIONS } from '../model/limitations';
import { Modal } from './Modal';

export function LimitationsPanel({ onClose }: { onClose: () => void }) {
  const areas = [...new Set(LIMITATIONS.map((l) => l.area))];
  return (
    <Modal title="Model Limitations" onClose={onClose} wide>
      <p className="mb-3 text-sm text-slate-300">
        RailMPLS Lab is an <b>educational</b> simulator. Every simplification it makes is listed here so you know exactly
        where the model differs from real equipment. <span className="text-emerald-300">Active</span> items apply to what is
        built now; <span className="text-slate-400">Planned</span> items describe how upcoming phases will simplify.
      </p>
      {areas.map((area) => (
        <section key={area} className="mb-4">
          <h3 className="rn-label mb-1.5">{area}</h3>
          <ul className="space-y-1.5">
            {LIMITATIONS.filter((l) => l.area === area).map((l, i) => (
              <li key={i} className="flex gap-2 text-sm leading-snug">
                <span
                  className={`mt-0.5 h-fit shrink-0 rounded px-1.5 text-[10px] font-semibold uppercase ${
                    l.status === 'active' ? 'bg-emerald-900/70 text-emerald-300' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {l.status === 'active' ? 'Active' : `Planned · P${l.phase}`}
                </span>
                <span className="text-slate-300">{l.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Modal>
  );
}
