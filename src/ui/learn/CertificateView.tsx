import { Printer, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { certificateInfo, type DashboardSummary } from '../../lessons/dashboard';

const NAME_KEY = 'railmpls-lab:certificate-name';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(v: string): void {
  try {
    localStorage.setItem(NAME_KEY, v);
  } catch {
    /* private window: the name is just not remembered */
  }
}

/**
 * Printable training record (v1.1): a full "certificate" only when every lesson
 * and lab is done. Rendered in a portal so print CSS can hide the app behind it.
 */
export function CertificateView({ summary, onClose }: { summary: DashboardSummary; onClose: () => void }) {
  const [name, setName] = useState(loadName);
  const c = certificateInfo(summary);
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded border border-slate-300 px-3 py-2 text-center">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
  return createPortal(
    <div className="rn-cert-overlay fixed inset-0 z-50 overflow-auto bg-slate-950/80 p-4" role="dialog" aria-label="Training certificate">
      <div className="rn-no-print mx-auto mb-3 flex max-w-3xl flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1">
          <span className="rn-label">Name on the record</span>
          <input
            className="rn-input"
            value={name}
            placeholder="Your name and designation"
            onChange={(e) => {
              setName(e.target.value);
              saveName(e.target.value);
            }}
          />
        </label>
        <button type="button" className="rn-btn-primary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / save as PDF
        </button>
        <button type="button" className="rn-btn" onClick={onClose}>
          <X className="h-4 w-4" /> Close
        </button>
      </div>

      <section className="rn-cert mx-auto max-w-3xl rounded-lg border-4 border-double border-slate-700 bg-white px-8 py-10 text-slate-900 shadow-xl">
        <p className="text-center text-xs uppercase tracking-[0.3em] text-slate-500">RailMPLS Lab · Networking &amp; IP-MPLS training simulator</p>
        <h2 className="mt-3 text-center font-serif text-3xl font-semibold">{c.title}</h2>
        <p className="mt-6 text-center text-sm text-slate-600">This records that</p>
        <p className="mt-1 text-center font-serif text-2xl font-semibold">{name.trim() || '______________________'}</p>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-700">
          {c.complete
            ? 'has completed every lesson and every hands-on lab of the RailMPLS Lab curriculum — Part A (networking foundations) and Part B (IP-MPLS: LDP, L3VPN, pseudowires, QoS, RSVP-TE, BFD, Segment Routing, NMS) on the Jodhpur division teaching network.'
            : 'has made the following progress in the RailMPLS Lab curriculum — Part A (networking foundations) and Part B (IP-MPLS) on the Jodhpur division teaching network.'}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Lessons" value={`${summary.lessons.done}/${summary.lessons.total}`} />
          <Stat label="Labs" value={`${summary.labs.completed}/${summary.labs.total}`} />
          <Stat label="Fault drills" value={`${summary.labs.breakFixDone}`} />
          <Stat label="Lab points" value={`${c.pointsPct}%`} />
        </div>
        {c.labsDone.length > 0 && (
          <p className="mt-4 text-center font-mono text-[11px] leading-relaxed text-slate-600">Labs completed: {c.labsDone.join(' · ')}</p>
        )}
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4 text-sm">
          <div>
            <p className="text-slate-500">Date</p>
            <p className="font-medium">{date}</p>
          </div>
          <div className="text-right">
            <p className="text-slate-500">RailMPLS Lab created by</p>
            <p className="font-medium">Shreenidhi Sharma · JE (Tele), NWR</p>
          </div>
        </div>
        <p className="mt-8 border-t border-slate-300 pt-3 text-center text-[11px] text-slate-500">
          RailMPLS Lab training record only — not an official Indian Railways, RDSO or IRISET certificate. Scores come from this browser&apos;s saved
          progress and are not verified.
        </p>
      </section>
    </div>,
    document.body,
  );
}
